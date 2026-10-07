import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { exportEnvelopeSchema, type ExportEnvelope } from '../../src/modules/backup/schemas.js';

let app: Awaited<ReturnType<typeof buildApp>>;
let headers: { authorization: string };
let userId: string;

beforeEach(async () => {
  // Only the runner's newly created cluster may be cleared by this suite.
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    process.env.PFT_INTEGRATION_RUN !== '1' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/pft_test'
  ) {
    throw new Error('Run integration tests with npm run test:integration');
  }
  app = await buildApp({ logger: false });
  await app.ready();
  await app.prisma.$executeRawUnsafe('TRUNCATE TABLE "user" CASCADE');
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'test-password',
    },
  });
  expect(response.statusCode).toBe(200);
  const session = response.json<{ accessToken: string; user: { id: string } }>();
  userId = session.user.id;
  headers = { authorization: `Bearer ${session.accessToken}` };
});

afterEach(async () => {
  await app?.close();
});

async function create(resource: string, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/${resource}`,
    headers,
    payload,
  });
  expect(response.statusCode, response.body).toBe(201);
  return response.json<{ item: { id: string } }>().item;
}
async function fixture() {
  const account = await create('accounts', {
    name: 'Checking',
    availableBalance: 100_000,
    savingsBalance: 20_000,
    liabilitiesBalance: 10_000,
  });
  const destination = await create('accounts', { name: 'Other', availableBalance: 10_000 });
  const income = await create('categories', { name: 'Salary', type: 'income' });
  const expense = await create('categories', { name: 'Food', type: 'expense' });
  return { account, destination, income, expense };
}
async function balance(id: string) {
  const response = await app.inject({ url: `/api/v1/accounts/${id}`, headers });
  expect(response.statusCode).toBe(200);
  return response.json<{
    item: {
      availableBalance: number;
      savingsBalance: number;
      liabilitiesBalance: number;
      total: number;
    };
  }>().item;
}
function transaction(accountId: string, categoryId: string, type = 'expense', amount = 1_001) {
  return { description: 'Lunch', date: '2026-10-07', type, amount, accountId, categoryId };
}
async function exportData() {
  const response = await app.inject({ url: '/api/v1/export', headers });
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-disposition']).toContain('attachment');
  return exportEnvelopeSchema.parse(response.json());
}
async function importData(data: ExportEnvelope, query = '') {
  const boundary = 'pft-test-boundary';
  const payload = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="backup.json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--\r\n`;
  return app.inject({
    method: 'POST',
    url: `/api/v1/import${query}`,
    headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload,
  });
}

describe('English HTTP contracts and database invariants', () => {
  it('registers, logs in and updates a bilingual profile with English fields', async () => {
    const profile = await app.inject({ url: '/api/v1/me', headers });
    expect(profile.json().user).toMatchObject({
      firstName: 'Test',
      lastName: 'User',
      preferredLanguage: 'es',
    });
    expect(Object.keys(profile.json().user).sort()).toEqual([
      'avatarPath',
      'email',
      'firstName',
      'id',
      'lastName',
      'preferredLanguage',
      'preferredTheme',
    ]);
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers,
      payload: { firstName: 'Updated', preferredLanguage: 'en' },
    });
    expect(updated.json().user).toMatchObject({ firstName: 'Updated', preferredLanguage: 'en' });
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'test@example.com', password: 'test-password' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.firstName).toBe('Updated');
    expect(login.headers['set-cookie']).toContain('HttpOnly');
  });

  it('returns numeric COP cents and rejects account balance edits', async () => {
    const { account } = await fixture();
    expect(await balance(account.id)).toMatchObject({
      availableBalance: 100_000,
      savingsBalance: 20_000,
      liabilitiesBalance: 10_000,
      total: 120_000,
    });
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${account.id}`,
      headers,
      payload: { name: 'Renamed' },
    });
    expect(renamed.json().item.name).toBe('Renamed');
    const rejected = await app.inject({
      method: 'PATCH',
      url: `/api/v1/accounts/${account.id}`,
      headers,
      payload: { availableBalance: 1 },
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('reverses and reapplies transaction edits across accounts and deletes', async () => {
    const { account, destination, expense } = await fixture();
    const item = await create('transactions', transaction(account.id, expense.id));
    expect((await balance(account.id)).availableBalance).toBe(98_999);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${item.id}`,
      headers,
      payload: { accountId: destination.id, amount: 501 },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect((await balance(account.id)).availableBalance).toBe(100_000);
    expect((await balance(destination.id)).availableBalance).toBe(9_499);
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/transactions/${item.id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);
    expect((await balance(destination.id)).availableBalance).toBe(10_000);
  });

  it('validates English filters, sorting, category types and dashboard totals', async () => {
    const { account, income, expense } = await fixture();
    await create('transactions', transaction(account.id, income.id, 'income', 2_001));
    await create('transactions', transaction(account.id, expense.id, 'expense', 1_001));
    await create('transactions', transaction(account.id, expense.id, 'liability', 501));
    const result = await app.inject({
      url: '/api/v1/transactions?types=income,expense&amountMin=1000&amountMax=3000&sort=-amount',
      headers,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().items.map((item: { amount: number }) => item.amount)).toEqual([
      2_001, 1_001,
    ]);
    expect(result.json().totals).toEqual({ income: 2_001, expense: 1_001, liability: 0 });
    const categories = await app.inject({ url: '/api/v1/categories?type=income', headers });
    expect(categories.json().items).toHaveLength(1);
    const dashboard = await app.inject({
      url: '/api/v1/dashboard?month=2026-10&year=2026',
      headers,
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().monthSummary).toMatchObject({
      income: 2_001,
      expenses: 1_001,
      newLiabilities: 501,
      savingsChange: 0,
    });
    expect(dashboard.json().totals).toMatchObject({
      availableBalanceTotal: 111_000,
      savingsBalanceTotal: 20_000,
      liabilitiesBalanceTotal: 10_501,
    });
    expect(dashboard.json().trendYear.income[9]).toBe(2_001);
    expect(dashboard.json().byCategoryMonth.expense[0]).toMatchObject({
      name: 'Food',
      type: 'expense',
      total: 1_502,
    });
  });

  it('rolls back an invalid transaction edit and returns an English error code', async () => {
    const { account, income, expense } = await fixture();
    const item = await create('transactions', transaction(account.id, expense.id));
    const mismatch = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers,
      payload: transaction(account.id, income.id),
    });
    expect(mismatch.statusCode).toBe(422);
    expect(mismatch.json().error.code).toBe('CATEGORY_TYPE_MISMATCH');
    const rejected = await app.inject({
      method: 'PATCH',
      url: `/api/v1/transactions/${item.id}`,
      headers,
      payload: { amount: 200_000 },
    });
    expect(rejected.statusCode, rejected.body).toBe(422);
    expect(rejected.json().error.code).toBe('WOULD_VIOLATE_INVARIANT');
    expect((await balance(account.id)).availableBalance).toBe(98_999);
    expect(
      (await app.prisma.transaction.findUniqueOrThrow({ where: { id: item.id } })).amount,
    ).toBe(1_001n);
  });

  it('transfers, edits and deletes movements while preserving account totals', async () => {
    const { account, destination } = await fixture();
    const movement = await create('movements', {
      description: 'Transfer',
      date: '2026-10-07',
      flow: 'INTER_AVAILABLE',
      amount: 1_000,
      sourceAccountId: account.id,
      destinationAccountId: destination.id,
    });
    expect((await balance(account.id)).availableBalance).toBe(99_000);
    expect((await balance(destination.id)).availableBalance).toBe(11_000);
    for (const query of [
      `sourceAccountIds=${account.id}`,
      `destinationAccountIds=${destination.id}`,
      `accountIds=${destination.id}&flows=INTER_AVAILABLE&sort=-date`,
    ]) {
      const result = await app.inject({ url: `/api/v1/movements?${query}`, headers });
      expect(result.json().items).toHaveLength(1);
      expect(result.json().totals).toEqual({ totalAmount: 1_000 });
    }
    const invalid = await app.inject({
      method: 'PATCH',
      url: `/api/v1/movements/${movement.id}`,
      headers,
      payload: { flow: 'INTRA_AVAILABLE_TO_SAVINGS' },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe('INVALID_FLOW_SHAPE');
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/movements/${movement.id}`,
      headers,
      payload: {
        flow: 'INTRA_AVAILABLE_TO_SAVINGS',
        destinationAccountId: account.id,
        amount: 2_000,
      },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(await balance(account.id)).toMatchObject({
      availableBalance: 98_000,
      savingsBalance: 22_000,
      total: 120_000,
    });
    expect((await balance(destination.id)).availableBalance).toBe(10_000);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/v1/movements/${movement.id}`, headers }))
        .statusCode,
    ).toBe(204);
    expect(await balance(account.id)).toMatchObject({
      availableBalance: 100_000,
      savingsBalance: 20_000,
    });
  });

  it('reverses liability payment edits and excludes payments from expenses', async () => {
    const { account } = await fixture();
    const payment = await create('liability-payments', {
      description: 'Payment',
      date: '2026-10-07',
      amount: 1_000,
      accountId: account.id,
    });
    expect(await balance(account.id)).toMatchObject({
      availableBalance: 99_000,
      liabilitiesBalance: 9_000,
    });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/liability-payments/${payment.id}`,
          headers,
          payload: { amount: 2_000 },
        })
      ).statusCode,
    ).toBe(200);
    const dashboard = await app.inject({ url: '/api/v1/dashboard?month=2026-10', headers });
    expect(dashboard.json().monthSummary).toMatchObject({
      expenses: 0,
      newLiabilities: 0,
      liabilityPayments: 2_000,
    });
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/liability-payments/${payment.id}`,
          headers,
        })
      ).statusCode,
    ).toBe(204);
    expect(await balance(account.id)).toMatchObject({
      availableBalance: 100_000,
      liabilitiesBalance: 10_000,
    });
  });

  it('isolates accounts, categories and events between users', async () => {
    const { account, expense } = await fixture();
    const other = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.com',
        password: 'test-password',
      },
    });
    const otherHeaders = { authorization: `Bearer ${other.json().accessToken}` };
    expect(
      (await app.inject({ url: `/api/v1/accounts/${account.id}`, headers: otherHeaders }))
        .statusCode,
    ).toBe(404);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: otherHeaders,
      payload: transaction(account.id, expense.id),
    });
    expect(response.statusCode).toBe(404);
    expect((await balance(account.id)).availableBalance).toBe(100_000);
    expect(
      (await app.inject({ url: '/api/v1/accounts', headers: otherHeaders })).json().items,
    ).toEqual([]);
  });

  it('prevents concurrent expenses from spending the same balance twice', async () => {
    const { account, expense } = await fixture();
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: 'POST',
          url: '/api/v1/transactions',
          headers,
          payload: transaction(account.id, expense.id, 'expense', 75_000),
        }),
      ),
    );
    expect(results.filter((response) => response.statusCode === 201)).toHaveLength(1);
    const rejected = results.find((response) => response.statusCode !== 201)!;
    expect([409, 422]).toContain(rejected.statusCode);
    expect(['CONCURRENT_MODIFICATION', 'WOULD_VIOLATE_INVARIANT']).toContain(
      rejected.json().error.code,
    );
    expect(await balance(account.id)).toMatchObject({ availableBalance: 25_000, total: 45_000 });
    expect(await app.prisma.transaction.count({ where: { accountId: account.id } })).toBe(1);
  });

  it('enforces CHECK constraints and category triggers directly in PostgreSQL', async () => {
    const { account, destination, expense } = await fixture();
    await expect(
      app.prisma
        .$executeRaw`UPDATE account SET available_balance = -1 WHERE id = ${account.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      app.prisma.$executeRaw`UPDATE account SET total = 1 WHERE id = ${account.id}::uuid`,
    ).rejects.toThrow();
    const item = await app.prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: expense.id,
        categoryType: 'income',
        description: 'Trigger',
        date: new Date('2026-10-07'),
        type: 'expense',
        amount: 100n,
      },
    });
    expect(item.categoryType).toBe('expense');
    await expect(
      app.prisma.category.update({ where: { id: expense.id }, data: { type: 'income' } }),
    ).rejects.toThrow();
    await expect(
      app.prisma.transaction.update({ where: { id: item.id }, data: { type: 'income' } }),
    ).rejects.toThrow();
    await expect(
      app.prisma.movement.create({
        data: {
          userId,
          description: 'Invalid',
          date: new Date('2026-10-07'),
          flow: 'INTRA_SAVINGS_TO_AVAILABLE',
          amount: 1n,
          sourceAccountId: account.id,
          destinationAccountId: destination.id,
        },
      }),
    ).rejects.toThrow();
    expect((await balance(account.id)).availableBalance).toBe(100_000);
  });
});

describe('English backup format', () => {
  it('exports and restores all event types, fractional amounts and final balances', async () => {
    const { account, destination, income, expense } = await fixture();
    await create('transactions', transaction(account.id, income.id, 'income', 2_001));
    await create('transactions', transaction(account.id, expense.id, 'expense', 1_001));
    await create('transactions', transaction(account.id, expense.id, 'liability', 501));
    for (const [flow, target] of [
      ['INTER_AVAILABLE', destination.id],
      ['INTRA_AVAILABLE_TO_SAVINGS', account.id],
      ['INTRA_SAVINGS_TO_AVAILABLE', account.id],
    ]) {
      await create('movements', {
        description: 'Transfer',
        date: '2026-10-08',
        flow,
        amount: 101,
        sourceAccountId: account.id,
        destinationAccountId: target,
      });
    }
    await create('liability-payments', {
      description: 'Payment',
      date: '2026-10-09',
      amount: 301,
      accountId: account.id,
    });
    const original = await exportData();
    const originalBalance = await balance(account.id);
    expect(original.$schema).toBe('pft-export-v2');
    expect(original.accounts[0]?.initial).toEqual({
      availableBalance: 100_000,
      savingsBalance: 20_000,
      liabilitiesBalance: 10_000,
    });
    expect((await importData(original, '?dryRun=true')).statusCode).toBe(200);
    expect((await importData(original)).statusCode).toBe(200);
    const restored = await exportData();
    expect(restored.accounts).toEqual(original.accounts);
    expect(restored.transactions).toEqual(original.transactions);
    expect(restored.movements).toEqual(original.movements);
    expect(restored.liabilityPayments).toEqual(original.liabilityPayments);
    const newAccount = await app.prisma.account.findFirstOrThrow({
      where: { userId, name: 'Checking' },
    });
    expect(await balance(newAccount.id)).toEqual({
      ...originalBalance,
      id: newAccount.id,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('rejects broken references and merge conflicts without changing existing data', async () => {
    const { account, expense } = await fixture();
    await create('transactions', transaction(account.id, expense.id));
    const original = await exportData();
    const broken = structuredClone(original);
    broken.transactions[0]!.accountExportId = 'missing';
    const result = await importData(broken);
    expect(result.statusCode).toBe(422);
    expect(result.json().error.code).toBe('BROKEN_REFERENCE');
    const conflict = await importData(original, '?mode=merge-fail-on-conflict');
    expect(conflict.statusCode).toBe(409);
    const after = await exportData();
    expect(after.accounts).toEqual(original.accounts);
    expect(after.transactions).toEqual(original.transactions);
  });
});
