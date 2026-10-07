import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// The runner supplies an isolated database and servers. Never use a development URL.
if (process.env.PFT_E2E_RUN !== '1' || !process.env.PFT_E2E_BASE_URL) {
  throw new Error('Run E2E tests through npm run test:e2e or npm run test:e2e:ui');
}

test('unauthenticated visitors are redirected to login', async ({ page }) => {
  await page.goto('/app/accounts');
  await expect(page).toHaveURL(/\/login$/);
});

test('Spanish expense uses English contracts, updates balances and supports persistent English presentation', async ({
  page,
}, testInfo) => {
  const email = `browser-${randomUUID()}@example.com`;
  const errors: string[] = [];
  const requests: { url: string; body: unknown }[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/(accounts|categories|transactions)$/.test(request.url())
    ) {
      requests.push({ url: request.url().split('/api/v1')[1]!, body: request.postDataJSON() });
    }
  });
  await page.goto('/register');
  await page.getByLabel('Nombre', { exact: true }).fill('Browser');
  await page.getByLabel('Apellidos', { exact: true }).fill('Test');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByLabel('Confirmar contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await page.waitForURL('**/app');
  await page.getByRole('link', { name: 'Cuentas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva cuenta', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Checking');
  await dialog.getByLabel('Disponible', { exact: true }).fill('1000,50');
  await dialog.getByLabel('Ahorro', { exact: true }).fill('100');
  await dialog.getByLabel('Pasivos', { exact: true }).fill('50');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('heading', { name: 'Checking', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Categorías', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva categoría', exact: true }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre', { exact: true }).fill('Food');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('heading', { name: 'Food', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva transacción', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Valor', { exact: true }).fill('10,01');
  await dialog.getByLabel('Cuenta', { exact: true }).click();
  await page.getByRole('option', { name: 'Checking', exact: true }).click();
  await dialog.getByLabel('Categoría', { exact: true }).click();
  await page.getByRole('option', { name: 'Food', exact: true }).click();
  await dialog.getByLabel('Descripción', { exact: true }).fill('Browser expense');
  const txResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/transactions'),
  );
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  const tx = await txResponse;
  expect(tx.status(), await tx.text()).toBe(201);
  await page.getByText('Browser expense', { exact: true }).waitFor();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('#root').getByText('Egreso', { exact: true }).waitFor();
  await page.screenshot({ path: testInfo.outputPath('transactions-es.png'), fullPage: true });
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await page.getByRole('menuitem', { name: 'English', exact: true }).click();
  await page.locator('#root').getByText('Expense', { exact: true }).waitFor();
  await page.screenshot({ path: testInfo.outputPath('transactions-en.png'), fullPage: true });
  const preferences = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('pft.preferences') ?? 'null'),
  );
  expect(preferences.state.language).toBe('en');
  await page.reload();
  await page.locator('#root').getByText('Expense', { exact: true }).waitFor();
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await page.getByRole('heading', { name: 'Checking', exact: true }).waitFor();
  // Both the summary and the account card must reflect the expense.
  const displayedBalances = page.getByText('$990,49', { exact: true });
  await expect(displayedBalances).toHaveCount(2);
  await expect(displayedBalances.nth(0)).toBeVisible();
  await expect(displayedBalances.nth(1)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('accounts-en.png'), fullPage: true });

  expect(requests).toEqual([
    {
      url: '/accounts',
      body: {
        name: 'Checking',
        availableBalance: 100050,
        savingsBalance: 10000,
        liabilitiesBalance: 5000,
      },
    },
    { url: '/categories', body: { name: 'Food', type: 'expense' } },
    {
      url: '/transactions',
      body: {
        description: 'Browser expense',
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        type: 'expense',
        amount: 1001,
        accountId: expect.any(String),
        categoryId: expect.any(String),
      },
    },
  ]);
  const prisma = new PrismaClient();
  let balances;
  try {
    balances = await prisma.account.findMany({
      where: { user: { email } },
      select: {
        availableBalance: true,
        savingsBalance: true,
        liabilitiesBalance: true,
        total: true,
      },
    });
    expect(balances).toEqual([
      {
        availableBalance: 99049n,
        savingsBalance: 10000n,
        liabilitiesBalance: 5000n,
        total: 109049n,
      },
    ]);
  } finally {
    await prisma.$disconnect();
  }
  expect(errors).toEqual([]);
  for (const name of ['transactions-es.png', 'transactions-en.png', 'accounts-en.png']) {
    await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
  }
  await testInfo.attach('verification', {
    body: JSON.stringify(
      { requests, balances, pageErrors: errors },
      (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
    contentType: 'application/json',
  });
});
