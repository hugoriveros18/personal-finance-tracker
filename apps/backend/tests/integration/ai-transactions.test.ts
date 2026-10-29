import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import type { Organization } from '../../src/modules/ai-transactions/schemas.js';
import type { Extraction } from '../../src/modules/ai-transactions/schemas.js';
import type { InterpretationContext } from '../../src/modules/ai-transactions/provider.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let headers: { authorization: string };
let accountId: string;
let categoryId: string;
let incomeId: string;
let userId: string;
const output: Extraction = {
  intent: 'transaction',
  type: 'expense',
  amountText: '35 mil',
  description: 'Almuerzo',
  dateText: null,
  accountMentioned: true,
  accountName: 'Bancolombia',
  categoryName: 'Alimentación',
};
const provider = {
  organize: vi.fn<(message: string) => Promise<Organization>>(),
  interpret: vi.fn<(message: string, context: InterpretationContext) => Promise<Extraction>>(),
  warmup: vi.fn(async () => {}),
  unload: vi.fn(async () => {}),
};

async function post(path: string, payload: unknown, auth = headers) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/${path}`,
    headers: auth,
    payload: payload as Record<string, unknown>,
  });
}
async function register() {
  const response = await post('auth/register', {
    firstName: 'AI',
    lastName: 'Test',
    email: `${randomUUID()}@example.com`,
    password: 'test-password',
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ accessToken: string; user: { id: string } }>();
}
async function create(resource: string, payload: unknown) {
  const response = await post(resource, payload);
  expect(response.statusCode, response.body).toBe(201);
  return response.json().item.id as string;
}
async function interpret(message = 'Gasté 35 mil en almuerzo desde Bancolombia') {
  const response = await post('ai-transactions/interpret', { message });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().draft as {
    id: string;
    proposal: { amount: number; date: string; accountId: string | null; categoryId: string | null };
  };
}
function payload(date: string) {
  return {
    type: 'expense',
    amount: 3_500_000,
    description: 'Almuerzo',
    date,
    accountId,
    categoryId,
  };
}
async function balance() {
  return (await app.inject({ url: `/api/v1/accounts/${accountId}`, headers })).json().item
    .availableBalance;
}

beforeEach(async () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.PFT_INTEGRATION_RUN !== '1' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/pft_test'
  ) {
    throw new Error('Use npm run test:integration with a disposable database');
  }
  provider.organize.mockReset();
  provider.interpret.mockReset().mockResolvedValue({ ...output });
  provider.warmup.mockClear();
  provider.unload.mockClear();
  app = await buildApp({ logger: false, aiProvider: provider });
  await app.ready();
  const session = await register();
  userId = session.user.id;
  headers = { authorization: `Bearer ${session.accessToken}` };
  accountId = await create('accounts', { name: 'Bancolombia', availableBalance: 50_000_000 });
  categoryId = await create('categories', { name: 'Alimentación', type: 'expense' });
  incomeId = await create('categories', { name: 'Salario', type: 'income' });
});
afterEach(async () => {
  await app?.close();
});

describe('Local AI financial workflow', () => {
  it('preloads with the backend and releases only on shutdown without financial writes', async () => {
    await app.close();
    config.OLLAMA_MODEL_LIFECYCLE = 'application';
    try {
      app = await buildApp({ logger: false, aiProvider: provider });
      await app.ready();
      await vi.waitFor(() => expect(provider.warmup).toHaveBeenCalledTimes(1));
      expect((await app.inject({ url: '/api/v1/ai-transactions/capabilities' })).statusCode).toBe(
        401,
      );
      expect(provider.unload).not.toHaveBeenCalled();
      expect(await balance()).toBe(50_000_000);
      expect(await app.prisma.aiTransactionDraft.count({ where: { userId } })).toBe(0);
      expect(await app.prisma.transaction.count({ where: { userId } })).toBe(0);
      await app.close();
      expect(provider.unload).toHaveBeenCalledTimes(1);
    } finally {
      config.OLLAMA_MODEL_LIFECYCLE = 'request';
    }
  });
  it('does not preload on startup when the experiment is disabled', async () => {
    await app.close();
    config.OLLAMA_MODEL_LIFECYCLE = 'application';
    config.AI_TRANSACTIONS_ENABLED = false;
    try {
      app = await buildApp({ logger: false, aiProvider: provider });
      await app.ready();
      expect(provider.warmup).not.toHaveBeenCalled();
      await app.close();
      expect(provider.unload).not.toHaveBeenCalled();
    } finally {
      config.OLLAMA_MODEL_LIFECYCLE = 'request';
      config.AI_TRANSACTIONS_ENABLED = true;
    }
  });
  it('interprets without writing finances and sends only the authenticated user context', async () => {
    const draft = await interpret();
    expect(draft.proposal).toMatchObject({ accountId, categoryId, amount: 3_500_000 });
    expect(await balance()).toBe(50_000_000);
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(0);
    const context = provider.interpret.mock.calls[0]![1];
    expect(context.accounts).toEqual([{ name: 'Bancolombia' }]);
    expect(JSON.stringify(context)).not.toMatch(/userId|accountId|availableBalance|email/);
    expect(context.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('resolves a named month with the server reference year when the model omits the date', async () => {
    const draft = await interpret('Gasté 35 mil en almuerzo el 26 de Octubre desde Bancolombia');
    const context = provider.interpret.mock.calls[0]![1];
    expect(draft.proposal.date).toBe(`${context.today.slice(0, 4)}-10-26`);
    expect(await balance()).toBe(50_000_000);
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(0);
  });
  it('confirms once, replays after restart, rejects different payloads and never recreates a deleted result', async () => {
    const draft = await interpret();
    const input = payload(draft.proposal.date);
    const first = await post(`ai-transactions/${draft.id}/confirm`, input);
    expect(first.statusCode, first.body).toBe(201);
    expect(await balance()).toBe(46_500_000);
    const transactionId = first.json().item.id;
    await app.close();
    app = await buildApp({ logger: false, aiProvider: provider });
    await app.ready();
    const second = await post(`ai-transactions/${draft.id}/confirm`, input);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ replayed: true, item: { id: transactionId } });
    expect(await balance()).toBe(46_500_000);
    expect(
      (await post(`ai-transactions/${draft.id}/confirm`, { ...input, amount: 1 })).statusCode,
    ).toBe(409);
    await app.inject({ method: 'DELETE', url: `/api/v1/transactions/${transactionId}`, headers });
    expect((await post(`ai-transactions/${draft.id}/confirm`, input)).statusCode).toBe(409);
    expect(await balance()).toBe(50_000_000);
  });
  it('prevents duplicates from concurrent confirmations', async () => {
    const draft = await interpret();
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date)),
      ),
    );
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 200, 201]);
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(1);
    expect(await balance()).toBe(46_500_000);
  });
  it('serializes cancellation against confirmation without partial financial effects', async () => {
    const draft = await interpret();
    const [confirmation, cancellation] = await Promise.all([
      post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date)),
      post(`ai-transactions/${draft.id}/cancel`, {}),
    ]);
    const state = await app.prisma.aiTransactionDraft.findUniqueOrThrow({
      where: { id: draft.id },
    });
    if (state.status === 'confirmed') {
      expect(confirmation.statusCode).toBe(201);
      expect(cancellation.statusCode).toBe(409);
      expect(await balance()).toBe(46_500_000);
    } else {
      expect(state.status).toBe('cancelled');
      expect(confirmation.statusCode).toBe(409);
      expect(cancellation.statusCode).toBe(204);
      expect(await balance()).toBe(50_000_000);
    }
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(
      state.status === 'confirmed' ? 1 : 0,
    );
  });
  it('revalidates entities deleted after interpretation', async () => {
    const draft = await interpret();
    await app.inject({ method: 'DELETE', url: `/api/v1/categories/${categoryId}`, headers });
    expect(
      (await post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date))).statusCode,
    ).toBe(404);
    expect(await balance()).toBe(50_000_000);
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(0);
  });
  it('records income and applies the established balance delta', async () => {
    provider.interpret.mockResolvedValue({
      ...output,
      type: 'income',
      categoryName: 'Salario',
      amountText: '2500000',
    });
    const draft = await interpret('Recibí 2500000 de salario desde Bancolombia');
    const response = await post(`ai-transactions/${draft.id}/confirm`, {
      ...payload(draft.proposal.date),
      type: 'income',
      categoryId: incomeId,
      amount: 250_000_000,
    });
    expect(response.statusCode, response.body).toBe(201);
    expect(await balance()).toBe(300_000_000);
  });
  it('records a credit purchase with zero available funds, increasing only liabilities and replaying once', async () => {
    const cardId = await create('accounts', { name: 'Nu' });
    provider.interpret.mockResolvedValue({
      ...output,
      type: 'liability',
      accountName: 'Nu',
      description: null,
    });
    const draft = await interpret('Compré almuerzo por 35 mil con tarjeta de crédito de Nu');
    expect(draft.proposal).toMatchObject({
      type: 'liability',
      categoryId,
      accountId: cardId,
      description: 'Alimentación',
    });
    const input = { ...payload(draft.proposal.date), type: 'liability', accountId: cardId };
    const first = await post(`ai-transactions/${draft.id}/confirm`, input);
    expect(first.statusCode, first.body).toBe(201);
    const second = await post(`ai-transactions/${draft.id}/confirm`, input);
    expect(second.statusCode).toBe(200);
    const account = (await app.inject({ url: `/api/v1/accounts/${cardId}`, headers })).json().item;
    expect(account).toMatchObject({
      availableBalance: 0,
      savingsBalance: 0,
      liabilitiesBalance: 3_500_000,
      total: 0,
    });
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(1);
    expect(await balance()).toBe(50_000_000);
  });
  it('uses defaults for omitted fields but does not hide an unknown account or category', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/accounts/default',
      headers,
      payload: { accountId },
    });
    provider.interpret.mockResolvedValue({
      ...output,
      accountMentioned: false,
      accountName: null,
      amountText: null,
      categoryName: null,
    });
    const draft = await interpret('Compré almuerzo');
    expect(draft.proposal).toMatchObject({
      accountId,
      categoryId: null,
      amount: null,
      accountSource: 'default',
      dateSource: 'today',
    });
    provider.interpret.mockResolvedValue({
      ...output,
      accountName: 'Missing bank',
      categoryName: 'Invented',
    });
    expect((await interpret('Gasté 35 mil desde Missing bank')).proposal).toMatchObject({
      accountId: null,
      categoryId: null,
    });
  });
  it('cancels without changing balances and rejects subsequent confirmation', async () => {
    const draft = await interpret();
    expect((await post(`ai-transactions/${draft.id}/cancel`, {})).statusCode).toBe(204);
    expect((await post(`ai-transactions/${draft.id}/cancel`, {})).statusCode).toBe(204);
    expect(
      (await post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date))).statusCode,
    ).toBe(409);
    expect(await balance()).toBe(50_000_000);
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(0);
  });
  it('rejects expired drafts and invalid final data without financial writes', async () => {
    const draft = await interpret();
    for (const patch of [
      { amount: -1 },
      { amount: 0 },
      { amount: 1.5 },
      { amount: 1_000_000_000_000 },
      { date: '2026-02-30' },
      { description: ' ' },
      { type: 'transfer' },
      { unexpected: true },
    ]) {
      const result = await post(`ai-transactions/${draft.id}/confirm`, {
        ...payload(draft.proposal.date),
        ...patch,
      });
      expect(result.statusCode, result.body).toBe(422);
    }
    await app.prisma.aiTransactionDraft.update({
      where: { id: draft.id },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (await post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date))).statusCode,
    ).toBe(409);
    expect(await balance()).toBe(50_000_000);
  });
  it('rechecks ownership and category compatibility on confirmation and default selection', async () => {
    const draft = await interpret();
    const other = await register();
    const otherAuth = { authorization: `Bearer ${other.accessToken}` };
    const foreignAccount = (await post('accounts', { name: 'Foreign' }, otherAuth)).json().item.id;
    const foreignCategory = (
      await post('categories', { name: 'Foreign', type: 'expense' }, otherAuth)
    ).json().item.id;
    for (const patch of [
      { accountId: foreignAccount },
      { categoryId: foreignCategory },
      { accountId: randomUUID() },
      { categoryId: randomUUID() },
      { categoryId: incomeId },
    ]) {
      expect(
        (
          await post(`ai-transactions/${draft.id}/confirm`, {
            ...payload(draft.proposal.date),
            ...patch,
          })
        ).statusCode,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(
      (await post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date), otherAuth))
        .statusCode,
    ).toBe(404);
    expect((await post(`ai-transactions/${draft.id}/cancel`, {}, otherAuth)).statusCode).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/accounts/default',
          headers,
          payload: { accountId: foreignAccount },
        })
      ).statusCode,
    ).toBe(404);
    expect(await balance()).toBe(50_000_000);
  });
  it('rolls back the consumed status if the account has insufficient funds', async () => {
    const draft = await interpret();
    const response = await post(`ai-transactions/${draft.id}/confirm`, {
      ...payload(draft.proposal.date),
      amount: 60_000_000,
    });
    expect(response.statusCode, response.body).toBe(422);
    expect(
      (await app.prisma.aiTransactionDraft.findUniqueOrThrow({ where: { id: draft.id } })).status,
    ).toBe('pending');
    expect(await balance()).toBe(50_000_000);
  });
  it('rejects excluded intent and invalid provider data without creating drafts', async () => {
    for (const message of [
      'Transferí 10000 a otra cuenta',
      'Pagué 100000 a mi tarjeta de crédito',
    ]) {
      expect((await post('ai-transactions/interpret', { message })).statusCode).toBe(422);
    }
    expect(provider.interpret).not.toHaveBeenCalled();
    provider.interpret.mockResolvedValue({ ...output, intent: 'multiple' });
    expect((await post('ai-transactions/interpret', { message: 'Dos compras' })).statusCode).toBe(
      422,
    );
    provider.interpret.mockResolvedValue({ ...output, type: 'transfer' } as unknown as Extraction);
    expect((await post('ai-transactions/interpret', { message: 'Algo' })).statusCode).toBe(502);
    expect(await app.prisma.aiTransactionDraft.count({ where: { userId } })).toBe(0);
  });
  it('protects all endpoints and exposes the disabled capability without contacting Ollama', async () => {
    expect((await app.inject({ url: '/api/v1/ai-transactions/capabilities' })).statusCode).toBe(
      401,
    );
    config.AI_TRANSACTIONS_ENABLED = false;
    try {
      expect(
        (await app.inject({ url: '/api/v1/ai-transactions/capabilities', headers })).json(),
      ).toEqual({ enabled: false, maxMessageLength: config.AI_TRANSACTIONS_MAX_MESSAGE_LENGTH });
      expect((await post('ai-transactions/interpret', { message: 'Algo' })).statusCode).toBe(404);
      expect(provider.warmup).not.toHaveBeenCalled();
      expect(provider.interpret).not.toHaveBeenCalled();
    } finally {
      config.AI_TRANSACTIONS_ENABLED = true;
    }
  });
  it('exports/restores the default account, cancels pending drafts on import, and accepts old backups', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/v1/accounts/default',
      headers,
      payload: { accountId },
    });
    const draft = await interpret();
    const backup = (await app.inject({ url: '/api/v1/export', headers })).json();
    expect(backup.user.defaultAccountExportId).toBe(backup.accounts[0].exportId);
    const importBackup = async (data: unknown) => {
      const boundary = 'ai-backup-boundary';
      return app.inject({
        method: 'POST',
        url: '/api/v1/import',
        headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--\r\n`,
      });
    };
    expect((await importBackup(backup)).statusCode).toBe(200);
    const restored = (await app.inject({ url: '/api/v1/accounts/default', headers })).json()
      .accountId;
    expect(restored).not.toBe(accountId);
    expect(await app.prisma.account.findFirst({ where: { id: restored, userId } })).not.toBeNull();
    expect(
      (await post(`ai-transactions/${draft.id}/confirm`, payload(draft.proposal.date))).statusCode,
    ).toBe(409);
    delete backup.user.defaultAccountExportId;
    expect((await importBackup(backup)).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/v1/accounts/default', headers })).json().accountId,
    ).toBeNull();
    const id = (await app.inject({ url: '/api/v1/accounts', headers })).json().items[0].id;
    await app.inject({
      method: 'PUT',
      url: '/api/v1/accounts/default',
      headers,
      payload: { accountId: id },
    });
    await app.inject({ method: 'DELETE', url: `/api/v1/accounts/${id}`, headers });
    expect(
      (await app.inject({ url: '/api/v1/accounts/default', headers })).json().accountId,
    ).toBeNull();
  });
});

const shared = {
  dateText: null,
  accountText: null,
  categoryText: null,
  paymentText: null,
  uncertainFields: [],
};
async function organizeBatch(
  message: string,
  items: Organization['items'],
  requestId = randomUUID(),
) {
  provider.organize.mockResolvedValue({ items, notes: [] });
  const response = await post('ai-transactions/interpret', { message, requestId });
  expect(response.statusCode, response.body).toBe(200);
  return { batch: response.json().batch, response, requestId };
}

describe('Free-form collection preparation and confirmation', () => {
  it('keeps the single-message form contract while reusing the same draft on retry', async () => {
    const message = 'Gasté 35 mil desde Bancolombia';
    const requestId = randomUUID();
    provider.organize.mockResolvedValue({
      items: [{ text: message, kind: 'transaction', context: shared }],
      notes: [],
    });
    const one = await post('ai-transactions/interpret', { message, requestId });
    const two = await post('ai-transactions/interpret', { message, requestId });
    expect(one.statusCode, one.body).toBe(200);
    expect(two.json().draft.id).toBe(one.json().draft.id);
    expect(provider.organize).not.toHaveBeenCalled();
    expect(provider.interpret).toHaveBeenCalledTimes(1);
    expect(await balance()).toBe(50_000_000);
  });
  it('inherits shared dates and categories, prepares once concurrently and confirms each row once', async () => {
    const text = 'Gasté 35 mil desde Bancolombia';
    const message = `Hoy:\nAlimentación:\n- ${text}\n20/10/2026:\n- ${text}`;
    const { batch, requestId } = await organizeBatch(message, [
      {
        text,
        kind: 'transaction',
        context: { ...shared, dateText: 'Hoy', categoryText: 'Alimentación' },
      },
      { text, kind: 'transaction', context: { ...shared, dateText: '20/10/2026' } },
    ]);
    const replay = await post('ai-transactions/interpret', { message, requestId });
    expect(replay.json().batch.items.map((item: { id: string }) => item.id)).toEqual(
      batch.items.map((item: { id: string }) => item.id),
    );
    const path = `ai-transactions/batches/${batch.id}/items/${batch.items[1].id}/interpret`;
    const [first, concurrent] = await Promise.all([post(path, {}), post(path, {})]);
    expect(first.statusCode, first.body).toBe(200);
    expect(concurrent.statusCode, concurrent.body).toBe(200);
    expect(first.json().draft.id).toBe(concurrent.json().draft.id);
    expect(first.json().draft.proposal).toMatchObject({
      amount: 3_500_000,
      date: '2026-10-20',
      accountId,
      categoryId,
    });
    expect(await balance()).toBe(50_000_000);
    const input = payload('2026-10-20');
    const confirmed = await post(`ai-transactions/${first.json().draft.id}/confirm`, input);
    expect(confirmed.statusCode, confirmed.body).toBe(201);
    expect((await post(`ai-transactions/${first.json().draft.id}/confirm`, input)).statusCode).toBe(
      200,
    );
    const preparedAgain = await post(path, {});
    expect(preparedAgain.json().result.id).toBe(confirmed.json().item.id);
    expect(await balance()).toBe(46_500_000);
    expect(await app.prisma.transaction.count({ where: { userId } })).toBe(1);
  });
  it('keeps ambiguous shared fields empty despite default accounts and model guesses', async () => {
    await app.prisma.user.update({ where: { id: userId }, data: { defaultAccountId: accountId } });
    const text = 'Gasté 35 mil';
    const message = `Hoy o ayer, con una de mis cuentas: ${text}; otro gasto`;
    const { batch } = await organizeBatch(message, [
      {
        text,
        kind: 'transaction',
        context: { ...shared, dateText: 'Hoy o ayer', uncertainFields: ['date', 'account'] },
      },
      { text: 'otro gasto', kind: 'unclear', context: shared },
    ]);
    const response = await post(
      `ai-transactions/batches/${batch.id}/items/${batch.items[0].id}/interpret`,
      {},
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().draft.proposal).toMatchObject({ accountId: null, date: null });
    const unclear = await post(
      `ai-transactions/batches/${batch.id}/items/${batch.items[1].id}/interpret`,
      {},
    );
    expect(unclear.json().draft.proposal).toMatchObject({
      type: null,
      amount: null,
      date: null,
      accountId: null,
      categoryId: null,
    });
    expect(await balance()).toBe(50_000_000);
  });
  it('cancels prepared and unprepared rows durably without changing balances', async () => {
    const text = 'Gasté 35 mil desde Bancolombia';
    const { batch } = await organizeBatch(`${text}; ${text}`, [
      { text, kind: 'transaction', context: shared },
      { text, kind: 'transaction', context: shared },
    ]);
    const base = (index: number) =>
      `ai-transactions/batches/${batch.id}/items/${batch.items[index].id}`;
    const prepared = await post(`${base(0)}/interpret`, {});
    for (const index of [0, 1]) {
      expect((await post(`${base(index)}/cancel`, {})).statusCode).toBe(204);
      expect((await post(`${base(index)}/cancel`, {})).statusCode).toBe(204);
      expect((await post(`${base(index)}/interpret`, {})).statusCode).toBe(409);
    }
    expect(
      (await post(`ai-transactions/${prepared.json().draft.id}/confirm`, payload('2026-10-28')))
        .statusCode,
    ).toBe(409);
    expect(await balance()).toBe(50_000_000);
  });
  it('rejects fabricated context, changed request content and access by another user', async () => {
    provider.organize.mockResolvedValue({
      items: [
        {
          text: 'Gasté 35 mil',
          kind: 'transaction',
          context: { ...shared, accountText: 'imaginary' },
        },
      ],
      notes: [],
    });
    expect(
      (
        await post('ai-transactions/interpret', {
          message: 'Hoy:\nGasté 35 mil',
          requestId: randomUUID(),
        })
      ).statusCode,
    ).toBe(502);
    const { batch, requestId } = await organizeBatch('café; almuerzo', [
      { text: 'café', kind: 'transaction', context: shared },
      { text: 'almuerzo', kind: 'transaction', context: shared },
    ]);
    expect(
      (await post('ai-transactions/interpret', { message: 'changed', requestId })).statusCode,
    ).toBe(409);
    const other = await register();
    const path = `ai-transactions/batches/${batch.id}/items/${batch.items[0].id}`;
    expect(
      (await post(`${path}/interpret`, {}, { authorization: `Bearer ${other.accessToken}` }))
        .statusCode,
    ).toBe(404);
    expect(
      (await post(`${path}/cancel`, {}, { authorization: `Bearer ${other.accessToken}` }))
        .statusCode,
    ).toBe(404);
  });
});

it('publishes and enforces the message limit before calling either model stage', async () => {
  const caps = await app.inject({ url: '/api/v1/ai-transactions/capabilities', headers });
  expect(caps.json().maxMessageLength).toBe(config.AI_TRANSACTIONS_MAX_MESSAGE_LENGTH);
  const response = await post('ai-transactions/interpret', {
    message: 'a'.repeat(config.AI_TRANSACTIONS_MAX_MESSAGE_LENGTH + 1),
    requestId: randomUUID(),
  });
  expect(response.statusCode).toBe(422);
  expect(provider.organize).not.toHaveBeenCalled();
  expect(provider.interpret).not.toHaveBeenCalled();
  expect(await app.prisma.aiTransactionDraft.count({ where: { userId } })).toBe(0);
});
