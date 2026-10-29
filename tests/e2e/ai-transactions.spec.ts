import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

if (process.env.PFT_E2E_RUN !== '1' || !process.env.PFT_E2E_BASE_URL) {
  throw new Error('Run through npm run test:e2e');
}

test('local AI requires review, uses defaults, preserves session history and cancels safely @ai-live', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(process.env.PFT_AI_LIVE === '1' ? 240_000 : 60_000);
  const email = `ai-browser-${randomUUID()}@example.com`;
  const base = process.env.VITE_API_BASE_URL!;
  const registration = await request.post(`${base}/auth/register`, {
    data: {
      firstName: 'AI',
      lastName: 'Browser',
      email,
      password: 'browser-test-password',
    },
  });
  expect(registration.ok()).toBe(true);
  const session = await registration.json();
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const account = await request.post(`${base}/accounts`, {
    headers,
    data: { name: 'Bancolombia', availableBalance: 50_000_000 },
  });
  const accountId = (await account.json()).item.id;
  await request.post(`${base}/accounts`, { headers, data: { name: 'Efectivo' } });
  await request.post(`${base}/categories`, {
    headers,
    data: { name: 'Alimentación', type: 'expense' },
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  if (process.env.PFT_AI_LIVE === '1') {
    await expect
      .poll(
        async () => {
          const response = await request.get(`${process.env.OLLAMA_BASE_URL}/api/ps`);
          return (await response.json()).models.map((model: { name: string }) => model.name);
        },
        { timeout: 120_000, message: 'The backend preloads the configured model' },
      )
      .toContain(process.env.OLLAMA_MODEL);
  }
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL('**/app');
  await page.getByRole('link', { name: 'Cuentas', exact: true }).click();
  const card = page
    .locator('.mantine-Card-root')
    .filter({ has: page.getByRole('heading', { name: 'Bancolombia', exact: true }) });
  await card.getByRole('button', { name: 'actions' }).click();
  await page.getByRole('menuitem', { name: 'Usar como cuenta predeterminada' }).click();
  await expect(card.getByText('Cuenta predeterminada', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Describe tu transacción').fill('Gasté 35 mil en almuerzo');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  const confirm = dialog.getByRole('button', { name: 'Registrar', exact: true });
  await expect(confirm).toBeEnabled({ timeout: 130_000 });
  await expect(dialog.getByLabel('Cuenta', { exact: true })).toHaveValue('Bancolombia');
  await expect(dialog.getByText('Selección inicial:', { exact: false })).toHaveCount(0);
  const prisma = new PrismaClient();
  try {
    const userId = session.user.id;
    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(50_000_000n);
    await page.screenshot({ path: testInfo.outputPath('ai-review-es.png'), fullPage: true });
    // Editing the proposal uses the same MoneyInput convention as the manual form.
    await dialog.getByLabel('Valor', { exact: true }).fill('36000');
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/confirm'));
    await confirm.click();
    const response = await responsePromise;
    expect(response.status(), await response.text()).toBe(201);
    const confirmed = await response.json();
    await expect(dialog.getByText(/Transacción registrada/)).toBeVisible();
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(46_400_000n);
    const replay = await request.post(response.url(), {
      headers,
      data: response.request().postDataJSON(),
    });
    expect(replay.status()).toBe(200);
    expect((await replay.json()).item.id).toBe(confirmed.item.id);
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
    await expect(dialog.getByText(/Transacción registrada/)).toBeVisible();
    await dialog.getByLabel('Describe tu transacción').fill('Compré un café por 7500 pesos');
    await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(confirm).toBeEnabled({ timeout: 130_000 });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(
      dialog.getByText('Registro cancelado. No se guardó ninguna transacción.'),
    ).toBeVisible();
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(46_400_000n);
    await page.screenshot({ path: testInfo.outputPath('ai-confirmed-es.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await page.getByRole('menuitem', { name: 'English', exact: true }).click();
    await page.getByRole('button', { name: 'Register with AI', exact: true }).click();
    await expect(dialog.getByText(/Transaction registered/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('ai-confirmed-en.png'), fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await prisma.$disconnect();
  }
  for (const name of ['ai-review-es.png', 'ai-confirmed-es.png', 'ai-confirmed-en.png']) {
    await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
  }
  if (process.env.PFT_AI_LIVE === '1') {
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await page.waitForURL('**/login');
    await expect
      .poll(
        async () => {
          const response = await request.get(`${process.env.OLLAMA_BASE_URL}/api/ps`);
          return (await response.json()).models.map((model: { name: string }) => model.name);
        },
        {
          timeout: 60_000,
          message: 'Signing out leaves the model resident for the running Docker session',
        },
      )
      .toContain(process.env.OLLAMA_MODEL);
    await testInfo.attach('model-lifecycle.json', {
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL,
        residentBeforeSignInAndAfterSignOut: true,
      }),
      contentType: 'application/json',
    });
  }
});
