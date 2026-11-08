import { expect, test, type Page } from '@playwright/test';

/**
 * The Owner dashboard as the seeded Owner sees it (owner-views §3/§7): the
 * consolidated calendar, the tabbed Reservas, the sticky section nav and the
 * 375px layout.
 *
 * Needs the Supabase-backed panel — `apps/web/.env.local` with the linked
 * project. Without it `/app/owner` renders the mock catalog panel, which has
 * no calendar: the spec skips instead of failing.
 */
async function loginAsOwner(page: Page) {
  await page.goto('/app/owner');
  if (!new URL(page.url()).pathname.startsWith('/login')) return;
  await page.getByLabel('Email').fill('duena@nomai.dev');
  await page.getByLabel('Contraseña').fill('nomai123');
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
  await page.goto('/app/owner');
}

test('Owner dashboard: calendar, tabs, sticky nav and the 375px layout', async ({ page }) => {
  test.setTimeout(180_000);

  // Stub the availability endpoint: the real one goes through the api and can
  // take a minute on a busy dev machine. One blocked night in the current
  // month keeps the calendar deterministic.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const blockedNight = `${iso(today).slice(0, 8)}06`;
  await page.route('**/api/owners/lodgings/*/nights', (route) =>
    route.fulfill({
      json: { today: iso(today), nights: [{ night: blockedNight, status: 'blocked' }] },
    }),
  );

  await loginAsOwner(page);

  // Without Supabase env the panel is the mock catalog one — no calendar here.
  const isMock = await page
    .getByRole('button', { name: 'Agregar alojamiento' })
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(isMock, 'Needs the Supabase-backed dashboard (apps/web/.env.local)');

  const calendarHeading = page.getByRole('heading', { name: 'Calendario', exact: true });
  await expect(calendarHeading).toBeVisible({ timeout: 60_000 });

  // §7: one row per Lodging, one column per night, and the "Editar
  // disponibilidad" entry point.
  await expect(page.getByRole('table', { name: /^Ocupación de / })).toBeVisible({ timeout: 60_000 });
  // The stubbed blocked night renders striped, with its label for screen readers.
  await expect(page.locator(`[role="cell"][aria-label="${blockedNight} bloqueada"]`).first()).toBeVisible();
  const editAvailability = page.getByRole('button', { name: 'Editar disponibilidad' });
  expect(await editAvailability.count()).toBeGreaterThan(0);

  // The modal reuses OwnerNightsCalendar: its own month grid and the
  // block/unblock actions.
  await editAvailability.first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('grid')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Bloquear/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Reservas: one tab per moment, the panel follows the selected tab.
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toBeVisible();
  const past = page.getByRole('tab', { name: /Pasadas/ });
  await past.click();
  await expect(past).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'reservas-tab-pasadas');

  // ADR-0006 (#79): a funded Booking's card shows its two Escrow stages. The
  // seeded project may hold no funded Booking, so only assert when one exists.
  const stageLines = page.getByTestId('release-stage');
  let sawStage = false;
  for (const tabName of ['Próximas', 'En curso', 'Pasadas', 'Canceladas']) {
    await page.getByRole('tab', { name: new RegExp(tabName) }).click();
    await page.waitForTimeout(200);
    if ((await stageLines.count()) > 0) {
      sawStage = true;
      break;
    }
  }
  if (sawStage) {
    await expect(stageLines.first()).toContainText('·');
    await expect(stageLines.first()).toContainText(
      /en tu Ripio|se libera en las próximas horas|después de la llegada|antes de la llegada|retenido/,
    );
  } else {
    test
      .info()
      .annotations.push({
        type: 'note',
        description: 'No funded Booking in the seed — release-stage assertion skipped',
      });
  }

  // The sticky nav parks below the OwnerShell header instead of covering it,
  // and an anchor lands clear of both.
  await page.getByRole('link', { name: 'Reservas' }).click();
  await expect(page.locator('nav[aria-label="Secciones del panel"]')).toBeInViewport();
  // The anchor scroll is smooth: wait for it to settle before measuring.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const boxes = await page.evaluate(() => {
    const header = document.querySelector('header')!.getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="Secciones del panel"]')!.getBoundingClientRect();
    const heading = document.getElementById('reservas-heading')!.getBoundingClientRect();
    return { headerBottom: header.bottom, navTop: nav.top, navBottom: nav.bottom, headingTop: heading.top };
  });
  expect(boxes.navTop).toBeGreaterThanOrEqual(boxes.headerBottom - 1);
  expect(boxes.headingTop).toBeGreaterThanOrEqual(boxes.navBottom);

  // A 375px phone: no sideways page scroll, and the nav still clears the header.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // The month grid scrolls inside its own box, never the page.
  await calendarHeading.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const mobile = await page.evaluate(() => {
    const header = document.querySelector('header')!.getBoundingClientRect();
    const nav = document.querySelector('nav[aria-label="Secciones del panel"]')!.getBoundingClientRect();
    return { headerBottom: header.bottom, navTop: nav.top };
  });
  expect(mobile.navTop).toBeGreaterThanOrEqual(mobile.headerBottom - 1);
});
