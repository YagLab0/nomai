import { expect, test, type Page } from '@playwright/test';

/**
 * E2E of the persistent chat sessions (issue #65): login as the seeded
 * Traveler, send a message, verify the thread persists + survives a reload,
 * then create/switch/rename chats from the rail list.
 *
 * Recorded with video — lands in test-results/<name>/video.webm. The agent's
 * first turn is slow (eve dev boot + model), so timeouts are generous.
 */

test.use({
  viewport: { width: 1440, height: 900 },
  video: { mode: 'on', size: { width: 1440, height: 900 } },
});

test('chat sessions persist, resume on reload, and list in the rail', async ({ page }) => {
  test.setTimeout(900_000);

  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' || t.includes('[nomito]'))
      console.log(`[${m.type()}]`, t.slice(0, 300));
  });

  const rail = page.locator('aside').first();
  const composer = page.getByLabel('Mensaje para Nomito');

  await login(page);

  // First message → draft thread initializes into a row (?chat=<remoteId>).
  await expect(composer).toBeVisible({ timeout: 120_000 });
  await composer.fill('Buscá alojamiento en Salta para 2 huéspedes en noviembre');
  await page.getByRole('button', { name: 'Enviar' }).click();

  await page.waitForURL(/[?&]chat=[^&]+/, { timeout: 120_000 });

  // A titled item appears in the rail (generateTitle fires when the first
  // run settles → the PATCH landed → the row exists).
  const firstItem = rail
    .locator('[class*="group"]')
    .filter({ hasNotText: 'Nuevo chat' });
  await expect(firstItem.first()).toBeVisible({ timeout: 120_000 });

  // The turn's onFinish PATCH must have landed before reloading — it is
  // fire-and-forget, so "Pensando" leaving doesn't guarantee it. Poll the
  // row through the same-origin proxy until the event prefix persisted.
  const chatId = new URL(page.url()).searchParams.get('chat')!;
  await expect
    .poll(
      async () => {
        const res = await page.request.get(`/api/chats/${chatId}`);
        if (!res.ok) return -1;
        const { chat } = (await res.json()) as { chat: { events?: unknown[] } };
        return chat.events?.length ?? -1;
      },
      { timeout: 300_000, intervals: [2_000] },
    )
    .toBeGreaterThan(0);

  // Reload → transcript rehydrates from persisted events and the same
  // thread reopens via ?chat=. Scoped to the messages column: the rail item
  // carries the same generated title and would match spuriously.
  await page.reload();
  await expect(
    page.locator('.max-w-2xl').getByText('Buscá alojamiento en Salta'),
  ).toBeVisible({ timeout: 120_000 });

  // "Nuevo chat" → fresh draft. Wait until the ?chat param is gone — sending
  // while the old remoteId is still in the URL races the thread switch.
  await page.getByRole('button', { name: /nuevo chat/i }).first().click();
  await page.waitForURL(
    (url) => url.pathname === '/app' && !url.searchParams.get('chat'),
    { timeout: 30_000 },
  );
  await expect(composer).toHaveValue('');

  // Second thread → second message → the rail lists both chats.
  await composer.fill('¿Cuántas reservas tengo?');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await page.waitForURL(
    (url) =>
      url.searchParams.has('chat') &&
      url.searchParams.get('chat') !== chatId,
    { timeout: 120_000 },
  );
  await expect(firstItem.nth(1)).toBeVisible({ timeout: 120_000 });

  // Rename the first chat through its "⋯" menu.
  const target = firstItem.first();
  await target.hover();
  await target.getByRole('button', { name: 'Opciones de la conversación' }).click();
  await page.getByText('Renombrar').click();
  await page.getByLabel('Renombrar conversación').fill('Viaje a Salta');
  await page.getByLabel('Renombrar conversación').press('Enter');
  await expect(rail.getByText('Viaje a Salta')).toBeVisible({ timeout: 30_000 });
});

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('viajera@nomai.dev');
  await page.getByLabel('Contraseña').fill('nomai123');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}
