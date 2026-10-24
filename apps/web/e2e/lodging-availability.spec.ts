import { expect, test, type Page } from '@playwright/test';

import { pickOption } from './helpers';

const november = (page: Page) => page.getByRole('grid', { name: 'noviembre 2026' });
const day = (page: Page, n: number) => november(page).getByRole('button', { name: new RegExp(`\\b${n} de noviembre`) });
const status = (page: Page) => page.getByTestId('stay-status');

/** Opens Casa de Adobe's ficha once it's interactive: the map only renders after hydration. */
async function openCasaDeAdobe(page: Page) {
  await page.goto('/lodgings/casa-de-adobe');
  await expect(page.locator('.leaflet-container')).toBeVisible();
}

test("Casa de Adobe's calendar shows Lucas's nights as taken and blocks a range across them", async ({ page }) => {
  await openCasaDeAdobe(page);
  await expect(page.getByRole('heading', { name: 'Disponibilidad' })).toBeVisible();

  for (const n of [20, 21, 22]) await expect(day(page, n)).toHaveAccessibleName(/ocupada/);
  for (const n of [19, 23]) await expect(day(page, n)).not.toHaveAccessibleName(/ocupada/);
  // Camila's cancelled Booking (8→11 nov) frees its nights.
  await expect(day(page, 9)).not.toHaveAccessibleName(/ocupada/);

  await expect(status(page)).toHaveText('Elegí la fecha de llegada');
  await day(page, 18).click();
  await expect(status(page)).toHaveText('Elegí la fecha de salida');

  // 25 nov would cross the taken nights: it can't be the check-out.
  await expect(day(page, 25)).toHaveAttribute('aria-disabled', 'true');
  await day(page, 25).click({ force: true });
  await expect(status(page)).toHaveText('Elegí la fecha de salida');

  // Checking out the morning Lucas arrives is fine.
  await day(page, 20).click();
  await expect(status(page)).toHaveText('2 noches · del 18 nov al 20 nov');
  await expect(page.getByTestId('stay-total')).toHaveText('$ 190.000 ARS');

  // The estimate follows the Traveler's currency, like the explorer.
  await pickOption(page, page.getByRole('button', { name: /Ver precios en/ }), 'BRL · R$');
  await expect(page.getByTestId('stay-total')).toHaveText(/^≈ BRL \d/);
});

test('"Reservar con Nomito" carries the Lodging and the dates into the chat', async ({ page }) => {
  await openCasaDeAdobe(page);
  await day(page, 17).click();
  await day(page, 20).click();

  const message = 'Quiero reservar Casa de Adobe, Cafayate, del 17 nov al 20 nov';
  await page.getByRole('link', { name: 'Reservar con Nomito' }).click();
  await expect(page).toHaveURL(/\/signup\?ask=/);
  await expect(page.getByText(message)).toBeVisible();

  // The chat may compile on first visit in dev: allow it a moment.
  await page.getByRole('button', { name: 'Continuar con Google' }).click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 20_000 });
  await expect(page.getByText(message).first()).toBeVisible();
});

test('"Reservar con Nomito" works without dates too', async ({ page }) => {
  await page.goto('/lodgings/cabana-vinas-del-sol');
  await expect(page.getByRole('link', { name: 'Reservar con Nomito' })).toHaveAttribute(
    'href',
    `/signup?ask=${encodeURIComponent('Quiero reservar Cabaña Viñas del Sol, Cafayate')}`,
  );
});

test('the calendar works with the keyboard and fits a 390px screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCasaDeAdobe(page);

  const grid = november(page);
  await grid.scrollIntoViewIfNeeded();
  const box = (await grid.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await day(page, 10).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(day(page, 12)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(day(page, 19)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText('9 noches · del 10 nov al 19 nov');

  // Next month by keyboard.
  await page.getByRole('button', { name: 'Mes siguiente' }).press('Enter');
  await expect(page.getByRole('grid', { name: 'diciembre 2026' })).toBeVisible();
});
