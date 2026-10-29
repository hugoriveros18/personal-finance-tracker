import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

if (process.env.PFT_E2E_RUN !== '1' || !process.env.PFT_E2E_BASE_URL)
  throw new Error('Run through npm run test:e2e');
test.skip(process.env.PFT_AI_LIVE === '1', 'Deterministic provider fixture scenarios');

async function setup(page: Page, request: APIRequestContext) {
  const base = process.env.VITE_API_BASE_URL!;
  const email = `ai-ux-${randomUUID()}@example.com`;
  const registration = await request.post(`${base}/auth/register`, {
    data: { firstName: 'UX', lastName: 'Test', email, password: 'browser-test-password' },
  });
  const session = await registration.json();
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const account = await request.post(`${base}/accounts`, {
    headers,
    data: { name: 'Bancolombia', availableBalance: 50_000_000 },
  });
  await request.post(`${base}/categories`, {
    headers,
    data: { name: 'Alimentación', type: 'expense' },
  });
  await page.goto('/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL('**/app');
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  const burger = page.locator('.mantine-Burger-root');
  if (mobile) await burger.click();
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.waitForURL('**/app/transactions');
  if (mobile) await burger.click();
  await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Describe tu transacción')).toBeFocused();
  return {
    userId: session.user.id as string,
    accountId: (await account.json()).item.id as string,
    dialog,
  };
}

test('interpretation errors offer retry, editing and the existing manual form without financial writes', async ({
  page,
  request,
}) => {
  const { userId, dialog } = await setup(page, request);
  await dialog.getByLabel('Describe tu transacción').fill('Proveedor inválido');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(
    'No pudimos interpretar el mensaje. Puedes editarlo o registrar la transacción manualmente.',
  );
  await dialog.getByRole('button', { name: 'Intentar de nuevo', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Intentar de nuevo', exact: true }),
  ).toBeEnabled();
  await expect(dialog.getByText('Proveedor inválido', { exact: true })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Editar mensaje', exact: true }).click();
  await expect(dialog.getByLabel('Describe tu transacción')).toHaveValue('Proveedor inválido');
  await expect(dialog.getByLabel('Describe tu transacción')).toBeFocused();
  await dialog.getByRole('button', { name: 'Registrar manualmente', exact: true }).click();
  const manual = page.getByRole('dialog', { name: 'Nueva transacción', exact: true });
  await expect(manual).toBeVisible();
  await expect(manual.getByLabel('Valor', { exact: true })).toBeEnabled();
  await manual.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const prisma = new PrismaClient();
  try {
    expect(await prisma.transaction.count({ where: { userId } })).toBe(0);
  } finally {
    await prisma.$disconnect();
  }
});

test('an uncertain save freezes its values and retries the same confirmed draft without duplicates', async ({
  page,
  request,
}, testInfo) => {
  const { userId, accountId, dialog } = await setup(page, request);
  let interpretations = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/interpret')) interpretations++;
  });
  await dialog.getByLabel('Describe tu transacción').fill('Gasté 35 mil en almuerzo');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  const confirm = dialog.getByRole('button', { name: 'Registrar' });
  await expect(confirm).toBeEnabled();
  await dialog.getByLabel('Valor', { exact: true }).fill('36000');
  const confirmations: { url: string; body: unknown }[] = [];
  await page.route('**/ai-transactions/*/confirm', async (route) => {
    confirmations.push({ url: route.request().url(), body: route.request().postDataJSON() });
    const response = await route.fetch();
    if (confirmations.length === 1)
      await route.abort('failed'); // The server already committed.
    else await route.fulfill({ response });
  });
  await confirm.click();
  await expect(dialog.getByRole('button', { name: 'Reintentar registro' })).toBeVisible();
  await expect(dialog.getByLabel('Valor', { exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Reintentar registro' })).toBeVisible();
  await expect(dialog.getByLabel('Valor', { exact: true })).toHaveValue(/36[.,]000/);
  await expect(dialog.getByLabel('Valor', { exact: true })).toBeDisabled();
  expect(confirmations).toHaveLength(1); // Reload never resubmits the saved operation.
  await page.screenshot({ path: testInfo.outputPath('ai-save-uncertain.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Reintentar registro' }).click();
  await expect(dialog.getByText('Transacción registrada.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Bancolombia ·', { exact: false })).toBeVisible();
  expect(confirmations).toHaveLength(2);
  expect(confirmations[0]).toEqual(confirmations[1]);
  expect(interpretations).toBe(1);
  const prisma = new PrismaClient();
  try {
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(46_400_000n);
  } finally {
    await prisma.$disconnect();
  }
  await testInfo.attach('ai-save-uncertain.png', {
    path: testInfo.outputPath('ai-save-uncertain.png'),
    contentType: 'image/png',
  });
});

test('mobile chat keeps its header and writing area visible and respects reading older messages', async ({
  page,
  request,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 740 });
  const { dialog } = await setup(page, request);
  let interpretations = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/interpret')) interpretations++;
  });
  await dialog.getByRole('button', { name: 'Compré un café por 7500 pesos', exact: true }).click();
  await expect(dialog.getByLabel('Describe tu transacción')).toHaveValue(
    'Compré un café por 7500 pesos',
  );
  expect(interpretations).toBe(0);
  for (let index = 1; index <= 3; index++) {
    await dialog.getByLabel('Describe tu transacción').fill('Compré un café por 7500 pesos');
    await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Registrar' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog.getByLabel('Describe tu transacción')).toBeFocused();
  }
  let resume!: () => void;
  const responsePaused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let reached!: () => void;
  const serverResponded = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route('**/ai-transactions/interpret', async (route) => {
    const response = await route.fetch();
    reached();
    await responsePaused;
    await route.fulfill({ response });
  });
  await dialog.getByLabel('Describe tu transacción').fill('Gasté 35 mil en almuerzo');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  await serverResponded;
  const history = dialog.locator('.mantine-ScrollArea-viewport');
  await history.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(
    dialog.getByText('Compré un café por 7500 pesos', { exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => history.evaluate((element) => element.scrollTop)).toBe(0);
  // Allow the browser to deliver the scroll event before completing the pending response.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  resume();
  await expect(dialog.getByRole('button', { name: 'Ver lo más reciente' })).toBeVisible();
  expect(await history.evaluate((element) => element.scrollTop)).toBeLessThan(20);
  const header = dialog.getByRole('heading', { name: 'Registrar una transacción', exact: true });
  expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await dialog.getByRole('button', { name: 'Ver lo más reciente' }).click();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const input = dialog.getByLabel('Describe tu transacción');
  const bounds = (await input.boundingBox())!;
  expect(bounds.y).toBeGreaterThan(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(740);
  expect((await header.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect(input).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('ai-chat-mobile.png'), fullPage: true });
  await testInfo.attach('ai-chat-mobile.png', {
    path: testInfo.outputPath('ai-chat-mobile.png'),
    contentType: 'image/png',
  });
});
