import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

if (process.env.PFT_E2E_RUN !== '1' || !process.env.PFT_E2E_BASE_URL)
  throw new Error('Run through npm run test:e2e');
test.skip(process.env.PFT_AI_LIVE === '1', 'Deterministic session recovery scenarios');
test.use({ extraHTTPHeaders: { 'X-Forwarded-For': '127.0.0.43' } });
const storageKey = 'pft.ai-chat.v1';

async function setup(page: Page, request: APIRequestContext) {
  const email = `ai-session-${randomUUID()}@example.com`;
  const base = process.env.VITE_API_BASE_URL!;
  const registration = await request.post(`${base}/auth/register`, {
    data: { firstName: 'Session', lastName: 'Test', email, password: 'browser-test-password' },
  });
  expect(registration.ok()).toBe(true);
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
  await login(page, email);
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
  return {
    email,
    userId: session.user.id as string,
    accountId: (await account.json()).item.id as string,
  };
}
async function login(page: Page, email: string) {
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL('**/app');
}
async function reopen(page: Page) {
  await page.reload();
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
}

test('tab session restores edits, receipts and composer without new operations and clears on logout', async ({
  page,
  request,
}, testInfo) => {
  const { email, userId, accountId } = await setup(page, request);
  const dialog = page.getByRole('dialog');
  let interpretations = 0;
  let confirmations = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/interpret')) interpretations++;
    if (req.url().endsWith('/confirm')) confirmations++;
  });
  await dialog.getByLabel('Describe tu transacción').fill('Gasté 35 mil en almuerzo');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Registrar', exact: true })).toBeEnabled();
  await dialog.getByLabel('Valor', { exact: true }).fill('36000');
  await dialog.getByLabel('Descripción', { exact: true }).fill('Almuerzo editado');
  await reopen(page);
  await expect(dialog.getByLabel('Valor', { exact: true })).toHaveValue(/36[.,]000/);
  await expect(dialog.getByLabel('Descripción', { exact: true })).toHaveValue('Almuerzo editado');
  await expect(dialog.getByRole('button', { name: 'Registrar', exact: true })).toBeEnabled();
  expect(interpretations).toBe(1);
  expect(confirmations).toBe(0);
  await dialog.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(dialog.getByText('Transacción registrada.', { exact: true })).toBeVisible();
  await reopen(page);
  await expect(dialog.getByText('Almuerzo editado', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Bancolombia ·', { exact: false })).toBeVisible();
  const details = dialog.getByRole('button', { name: 'Ver detalle', exact: true });
  // Measure both elements in one frame so the drawer's entry animation cancels out.
  const centerOffset = await details.evaluate((element) => {
    const action = element.getBoundingClientRect();
    const receipt = element
      .closest('.mantine-Card-root')!
      .querySelector('.mantine-Alert-root')!
      .getBoundingClientRect();
    return Math.abs(action.x + action.width / 2 - receipt.x - receipt.width / 2);
  });
  expect(centerOffset).toBeLessThan(1);
  expect(interpretations).toBe(1);
  expect(confirmations).toBe(1);
  await dialog.getByLabel('Describe tu transacción').fill('Compré un café por 7500 pesos');
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Registrar', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog.getByLabel('Describe tu transacción')).toBeVisible();
  await dialog.getByLabel('Describe tu transacción').fill('Mensaje todavía sin enviar');
  await reopen(page);
  await expect(
    dialog.getByText('Registro cancelado. No se guardó ninguna transacción.', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Describe tu transacción')).toHaveValue(
    'Mensaje todavía sin enviar',
  );
  expect(interpretations).toBe(2);
  expect(confirmations).toBe(1);
  await expect(dialog.getByLabel('Describe tu transacción')).toBeFocused();
  const prisma = new PrismaClient();
  try {
    expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(46_400_000n);
  } finally {
    await prisma.$disconnect();
  }
  await page.screenshot({ path: testInfo.outputPath('ai-session-restored.png'), fullPage: true });
  await testInfo.attach('ai-session-restored.png', {
    path: testInfo.outputPath('ai-session-restored.png'),
    contentType: 'image/png',
  });
  const peer = await page.context().newPage();
  try {
    await peer.goto('/app/transactions');
    await peer.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
    await expect(
      peer.getByRole('dialog').getByText('Almuerzo editado', { exact: true }),
    ).toHaveCount(0);
    await expect(peer.getByLabel('Describe tu transacción')).toHaveValue('');
  } finally {
    await peer.close();
  }
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('link', { name: 'Cuentas', exact: true }).click();
  await page.reload(); // Logout must clear the chat even when its lazy route was never reopened.
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Cerrar sesión', exact: true }).click();
  await page.waitForURL('**/login');
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
  await login(page, email);
  await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
  await expect(dialog.getByText('Almuerzo editado', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Describe tu transacción')).toHaveValue('');
});

test('reload during interpretation preserves the message as interrupted without automatic retry', async ({
  page,
  request,
}) => {
  await setup(page, request);
  const dialog = page.getByRole('dialog');
  let interpretations = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/interpret')) interpretations++;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/ai-transactions/interpret', async (route) => {
    await gate;
    await route.abort().catch(() => {});
  });
  try {
    await dialog.getByLabel('Describe tu transacción').fill('Gasté 35 mil en almuerzo');
    await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
    await expect(
      dialog.getByText('Estamos preparando tus registros…', { exact: true }),
    ).toBeVisible();
    await reopen(page);
    await expect(dialog.getByText('Gasté 35 mil en almuerzo', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        'La solicitud se interrumpió. Puedes intentar de nuevo cuando quieras continuar.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Registrar', exact: true })).toHaveCount(0);
    expect(interpretations).toBe(1);
    await dialog.getByRole('button', { name: 'Editar mensaje', exact: true }).click();
    await expect(dialog.getByLabel('Describe tu transacción')).toHaveValue(
      'Gasté 35 mil en almuerzo',
    );
    expect(interpretations).toBe(1);
  } finally {
    release();
  }
});
