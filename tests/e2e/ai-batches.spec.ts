import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

if (process.env.PFT_E2E_RUN !== '1' || !process.env.PFT_E2E_BASE_URL)
  throw new Error('Run through npm run test:e2e');
test.use({ extraHTTPHeaders: { 'X-Forwarded-For': '127.0.0.64' } });

test('grouped free text preserves single registration and recovers a partial collection without duplicates', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    process.env.PFT_AI_LIVE === '1',
    'The deterministic lost-response scenario uses the HTTP fixture',
  );
  const prisma = new PrismaClient();
  const base = process.env.VITE_API_BASE_URL!;
  const password = 'batch-test-password';
  const email = `ai-batch-${randomUUID()}@example.com`;
  const created = await request.post(`${base}/auth/register`, {
    data: { firstName: 'Batch', lastName: 'Test', email, password },
  });
  expect(created.status()).toBe(200);
  const session = await created.json();
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const accountResponse = await request.post(`${base}/accounts`, {
    headers,
    data: { name: 'Nu', availableBalance: 20_000_000 },
  });
  const accountId = (await accountResponse.json()).item.id;
  for (const name of ['Transporte', 'Alimentación'])
    expect(
      (
        await request.post(`${base}/categories`, { headers, data: { name, type: 'expense' } })
      ).status(),
    ).toBe(201);
  let interpretations = 0;
  let preparations = 0;
  page.on('request', (req) => {
    if (req.url().endsWith('/interpret')) {
      if (req.url().includes('/batches/')) preparations++;
      else interpretations++;
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto('/login');
    await page.getByLabel('Correo electrónico', { exact: true }).fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('link', { name: 'Transacciones', exact: true }).click();
    await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const input = dialog.getByLabel('Describe tu transacción');
    await expect(dialog.getByText('0 / 2.000 caracteres', { exact: true })).toBeVisible();
    await input.fill('a'.repeat(2001));
    await expect(input).toHaveValue('a'.repeat(2001));
    await expect(dialog.getByText('2.001 / 2.000 caracteres', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
    expect(interpretations).toBe(0);
    const message =
      'Todo con Nu:\nHoy:\nTransporte:\n- Uber 15000\n- Bus 3200\n20/10/2026:\nAlimentación:\n- Café 7500 pesos\n- Almuerzo 35k\nTotal 60700';
    await dialog.getByLabel('Describe tu transacción').fill(message);
    const interpreted = page.waitForResponse((res) =>
      res.url().endsWith('/ai-transactions/interpret'),
    );
    await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
    const batch = (await (await interpreted).json()).batch;
    expect(batch.items).toHaveLength(4);
    const register = dialog.getByRole('button', { name: 'Registrar seleccionadas (4)' });
    await expect(register).toBeEnabled({ timeout: 30_000 });
    expect(await prisma.transaction.count({ where: { userId: session.user.id } })).toBe(0);
    expect(preparations).toBe(4);
    await expect(dialog.getByText('20/10/2026 · 2', { exact: true })).toBeVisible();
    const drawerSize = await dialog.boundingBox();
    expect(drawerSize!.width).toBeLessThanOrEqual(880);
    const firstRow = dialog.locator(`[data-batch-row="${batch.items[0].id}"]`);
    await firstRow.getByRole('button', { name: /Ver o editar/ }).click();
    const sourceToggle = firstRow.locator('[data-source-toggle]');
    await sourceToggle.click();
    await expect(firstRow.locator('[data-source-text]').last()).toBeVisible();
    await expect
      .poll(async () => {
        const title = await firstRow.locator('[data-record-title]').boundingBox();
        const label = await sourceToggle.locator('span').boundingBox();
        return Math.abs(title!.x - label!.x);
      })
      .toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath('ai-batch-desktop.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('ai-batch-mobile.png'), fullPage: true });
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(
      await dialog
        .getByRole('button', { name: 'Descartar pendientes', exact: true })
        .evaluate((el) =>
          Array.from(el.querySelectorAll('span')).every(
            (span) => span.scrollWidth <= span.clientWidth,
          ),
        ),
    ).toBe(true);
    expect(
      await register.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return box.top >= 0 && box.bottom <= window.innerHeight && Boolean(hit && el.contains(hit));
      }),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await firstRow.getByRole('button', { name: /Ver o editar/ }).click();
    let confirmations = 0;
    let replayUrl = '';
    let replayBody: unknown;
    await page.route('**/ai-transactions/*/confirm', async (route) => {
      confirmations++;
      if (confirmations === 2) {
        replayUrl = route.request().url();
        replayBody = route.request().postDataJSON();
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.abort();
      } else {
        if (confirmations === 3) {
          expect(route.request().url()).toBe(replayUrl);
          expect(route.request().postDataJSON()).toEqual(replayBody);
        }
        await route.continue();
      }
    });
    await register.click();
    await expect(
      dialog.getByRole('button', { name: 'Reintentar registro', exact: true }),
    ).toBeVisible();
    expect(await prisma.transaction.count({ where: { userId: session.user.id } })).toBe(2);
    await page.reload();
    await page.getByRole('button', { name: 'Registrar con IA', exact: true }).click();
    dialog = page.getByRole('dialog');
    const uncertainRow = dialog.locator(`[data-batch-row="${batch.items[1].id}"]`);
    await uncertainRow.getByRole('button', { name: /Ver o editar/ }).click();
    await expect(uncertainRow.getByLabel('Valor', { exact: true })).toBeDisabled();
    await uncertainRow.getByRole('button', { name: 'Reintentar registro', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Registrar seleccionadas (2)' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Registrar seleccionadas (2)' }).click();
    await expect(
      dialog.getByText('0 listas · 0 por completar · 4 registradas', { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Seleccionar listas', exact: true }),
    ).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Quitar selección', exact: true })).toHaveCount(
      0,
    );
    await expect(
      dialog.getByRole('checkbox', { name: 'Mostrar solo las que necesitan atención' }),
    ).toHaveCount(0);
    await expect(dialog.locator('[data-batch-row]')).toHaveCount(4);
    expect(interpretations).toBe(1);
    expect(preparations).toBe(4);
    expect(await prisma.transaction.count({ where: { userId: session.user.id } })).toBe(4);
    const saved = await prisma.transaction.findMany({ where: { userId: session.user.id } });
    expect(saved.map((item) => Number(item.amount)).sort((a, b) => a - b)).toEqual([
      320_000, 750_000, 1_500_000, 3_500_000,
    ]);
    expect(saved.filter((item) => item.date.toISOString().startsWith('2026-10-20'))).toHaveLength(
      2,
    );
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(13_930_000n);
    // A one-transaction message still opens the familiar individual form after the batch.
    await dialog.getByLabel('Describe tu transacción').fill('Compré un café por 7500 pesos con Nu');
    await dialog.getByRole('button', { name: 'Enviar', exact: true }).click();
    const individual = dialog.getByRole('button', { name: 'Registrar', exact: true });
    await expect(individual).toBeEnabled();
    await individual.click();
    await expect(dialog.getByText('Transacción registrada.', { exact: true })).toBeVisible();
    expect(await prisma.transaction.count({ where: { userId: session.user.id } })).toBe(5);
    expect(
      (await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).availableBalance,
    ).toBe(13_180_000n);
    expect(errors).toEqual([]);
  } finally {
    await prisma.$disconnect();
  }
  for (const name of ['ai-batch-desktop.png', 'ai-batch-mobile.png'])
    await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
});
