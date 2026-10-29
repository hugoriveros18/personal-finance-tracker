import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

if (process.env.PFT_E2E_RUN !== '1' || !process.env.PFT_E2E_BASE_URL)
  throw new Error('Run through npm run test:e2e');

// This independent client must not consume another scenario's per-IP interpretation quota.
test.use({ extraHTTPHeaders: { 'X-Forwarded-For': '127.0.0.42' } });

test('AI understands dates and compact amounts, reviews credit purchases and aligns account cards @ai-refinements-live', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(process.env.PFT_AI_LIVE === '1' ? 360_000 : 60_000);
  const base = process.env.VITE_API_BASE_URL!;
  const email = `ai-refinements-${randomUUID()}@example.com`;
  const registered = await request.post(`${base}/auth/register`, {
    data: { firstName: 'Refinements', lastName: 'Test', email, password: 'browser-test-password' },
  });
  expect(registered.ok()).toBe(true);
  const session = await registered.json();
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const accountIds: Record<string, string> = {};
  for (const name of ['Bancolombia', 'Davivienda', 'Nu']) {
    const created = await request.post(`${base}/accounts`, {
      headers,
      data: { name, availableBalance: 50_000_000 },
    });
    expect(created.status()).toBe(201);
    accountIds[name] = (await created.json()).item.id;
  }
  for (const [name, type] of [
    ['Alimentación', 'expense'],
    ['Transporte', 'expense'],
    ['Salario', 'income'],
  ]) {
    expect(
      (await request.post(`${base}/categories`, { headers, data: { name, type } })).status(),
    ).toBe(201);
  }
  await request.put(`${base}/accounts/default`, {
    headers,
    data: { accountId: accountIds.Bancolombia },
  });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL('**/app');
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  const open = page.getByRole('button', { name: 'Registrar con IA', exact: true });
  await expect(open.locator('svg')).toBeVisible();
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Registra tus ingresos y gastos con un mensaje')).toBeVisible();
  const send = async (message: string, chooseMissingCategory = false) => {
    await dialog.getByLabel('Describe tu transacción').fill(message);
    const response = page.waitForResponse((res) => res.url().endsWith('/interpret'));
    await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
    const result = await response;
    expect(result.status(), await result.text()).toBe(200);
    const draft = (await result.json()).draft;
    if (chooseMissingCategory && !draft.proposal.categoryId) {
      // A real model may abstain; resolve only through the same existing-entity selector.
      await dialog.getByLabel('Categoría', { exact: true }).click();
      await page.getByRole('option', { name: 'Alimentación', exact: true }).click();
      await testInfo.attach('credit-category-selection.json', {
        body: JSON.stringify({ selectedManually: true }),
        contentType: 'application/json',
      });
    }
    await expect(dialog.getByRole('button', { name: 'Registrar', exact: true })).toBeEnabled();
    return draft;
  };
  const cancel = async () => {
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog.getByLabel('Describe tu transacción')).toBeFocused();
  };
  const prisma = new PrismaClient();
  try {
    const uber = await send(
      'Gaste 15000 de Uber para ir a la casa de mis papas el viernes pasado, page con Nu',
    );
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(
      new Date(),
    );
    const friday = new Date(`${today}T00:00:00Z`);
    friday.setUTCDate(friday.getUTCDate() - ((friday.getUTCDay() + 2) % 7 || 7));
    expect(uber.proposal).toMatchObject({
      date: friday.toISOString().slice(0, 10),
      accountId: accountIds.Nu,
      amount: 1_500_000,
      type: 'expense',
    });
    await expect(dialog.getByLabel('Cuenta', { exact: true })).toHaveValue('Nu');
    await expect(dialog.getByLabel('Categoría', { exact: true })).toHaveValue('Transporte');
    await expect(dialog.getByRole('heading', { name: 'Tu mensaje', level: 3 })).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Revisa tu transacción', level: 3 }),
    ).toBeVisible();
    await expect(dialog.getByText('Selección inicial:', { exact: false })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('ai-review-refined.png'), fullPage: true });
    await cancel();
    await expect(
      dialog.getByText('Registro cancelado. No se guardó ninguna transacción.', { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('ai-cancelled-refined.png'),
      fullPage: true,
    });
    const income = await send('Recibi un salario por 1000000');
    expect(income.proposal).toMatchObject({
      type: 'income',
      amount: 100_000_000,
      description: 'Salario',
    });
    await expect(dialog.getByLabel('Descripción', { exact: true })).toHaveValue('Salario');
    await cancel();
    const compact = await send('Gaste 35k en un almuerzo');
    expect(compact.proposal).toMatchObject({ type: 'expense', amount: 3_500_000 });
    await expect(dialog.getByLabel('Tipo', { exact: true })).toHaveValue('Egreso');
    await cancel();
    expect(await prisma.transaction.count({ where: { userId: session.user.id } })).toBe(0);
    await send('Compré un almuerzo por 35 mil con tarjeta de crédito de Nu', true);
    await expect(dialog.getByLabel('Tipo', { exact: true })).toHaveValue('Pasivo');
    await expect(
      dialog.getByText('Se sumará a los pasivos de esta cuenta. Tu saldo disponible no cambiará.'),
    ).toBeVisible();
    await expect(dialog.getByLabel('Categoría', { exact: true })).toHaveValue('Alimentación');
    await dialog.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(dialog.getByText('Transacción registrada.', { exact: true })).toBeVisible();
    const saved = await prisma.transaction.findMany({ where: { userId: session.user.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      type: 'liability',
      amount: 3_500_000n,
      accountId: accountIds.Nu,
    });
    expect(await prisma.account.findUniqueOrThrow({ where: { id: accountIds.Nu } })).toMatchObject({
      availableBalance: 50_000_000n,
      savingsBalance: 0n,
      liabilitiesBalance: 3_500_000n,
      total: 50_000_000n,
    });
    const details = dialog.getByRole('button', { name: 'Ver detalle', exact: true });
    await details.hover();
    expect(await details.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(await details.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain(
      'underline',
    );
    await page.screenshot({
      path: testInfo.outputPath('ai-credit-registered.png'),
      fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('link', { name: 'Cuentas', exact: true }).click();
    const cards = page
      .locator('.mantine-Card-root')
      .filter({ has: page.getByRole('link', { name: 'Ver detalle', exact: true }) });
    await expect(cards).toHaveCount(3);
    const footers = await cards
      .getByRole('link', { name: 'Ver detalle', exact: true })
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().y));
    expect(Math.max(...footers) - Math.min(...footers)).toBeLessThan(1);
    await expect(cards.getByText('Valor', { exact: true })).toHaveCount(0);
    const bankCard = cards.filter({
      has: page.getByRole('heading', { name: 'Bancolombia', exact: true }),
    });
    const radius = await bankCard.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(
      await bankCard
        .locator('.mantine-Badge-root')
        .evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    ).toBe(radius);
    await page.screenshot({ path: testInfo.outputPath('accounts-aligned.png'), fullPage: true });
  } finally {
    await prisma.$disconnect();
  }
  for (const name of [
    'ai-review-refined.png',
    'ai-cancelled-refined.png',
    'ai-credit-registered.png',
    'accounts-aligned.png',
  ]) {
    await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
  }
});
