import { expect, test, type Page } from '@playwright/test';

import { pickPlace, pinOnMap, stubGeocoder } from './helpers';

async function openLocationStep(page: Page) {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();
  await page.getByLabel('Nombre del alojamiento').fill('Posada del Pin');
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

const pinCoords = (page: Page) => page.getByTestId('pin-coords');
const pinTown = (page: Page) => page.getByTestId('pin-town');

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: '390px', width: 390, height: 844 },
]) {
  test(`the map is a poster until a place is searched, then unlocks for the pin (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLocationStep(page);

    // The poster: South America rendered but inert — no zoom, no address, no pin.
    const dialog = page.getByRole('dialog');
    const map = dialog.locator('.leaflet-container');
    await expect(map).toBeVisible();
    await expect(dialog.locator('.leaflet-tile-loaded').first()).toBeVisible();
    const box = await map.boundingBox();
    expect(box!.width).toBeGreaterThan(250);
    expect(box!.height).toBeGreaterThan(180);
    await expect(dialog.locator('.leaflet-control-attribution a[href*="openstreetmap.org"]')).toBeVisible();
    await expect(dialog.locator('.leaflet-control-zoom')).toHaveCount(0);
    await expect(page.getByLabel('Dirección')).toHaveCount(0);
    await expect(pinCoords(page)).toHaveCount(0);

    // Searching a place flies the map there and unlocks it + the address.
    const town = await pickPlace(page);
    await expect(dialog.locator('.leaflet-control-zoom')).toBeVisible();

    // A click drops the pin and the readout names the picked place.
    await map.click({ position: { x: box!.width * 0.5, y: box!.height * 0.5 } });
    await expect(pinTown(page)).toHaveText(town);
    const first = await pinCoords(page).innerText();

    // Dragging the pin updates the coordinates.
    const pin = page.getByRole('button', { name: /Pin del alojamiento/ });
    const pinBox = (await pin.boundingBox())!;
    await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(pinBox.x + pinBox.width / 2 + 40, pinBox.y + pinBox.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    await expect(pinCoords(page)).not.toHaveText(first);

    // "Volver al centro del lugar" returns to a fixed point and keeps the town.
    const reset = page.getByRole('button', { name: 'Volver al centro del lugar' });
    await reset.click();
    await expect(pinCoords(page)).toHaveText('-23.5776, -65.3966');
    await expect(pinTown(page)).toHaveText(town);

    // Keyboard: arrows move the focused pin ~20 m (0.0002°) per press.
    await pin.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await expect(pinCoords(page)).toHaveText('-23.5774, -65.3964');
  });
}

test('the location step requires a place, a pin and the street address', async ({ page }) => {
  await openLocationStep(page);
  await stubGeocoder(page);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Buscá y elegí el lugar donde está.')).toBeVisible();

  await page.getByLabel('Ciudad o pueblo').fill('tilcara');
  await page.getByRole('option', { name: /Tilcara/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Tocá el mapa para marcar el alojamiento.')).toBeVisible();
  await expect(page.getByText('Escribí la dirección, con calle y número.')).toBeVisible();

  const map = page.locator('.leaflet-container');
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Tocá el mapa para marcar el alojamiento.')).toHaveCount(0);
  await expect(page.getByText('Escribí la dirección, con calle y número.')).toBeVisible();
});

test('a place outside the listed towns still creates the Lodging, without a sigla', async ({ page }) => {
  await openLocationStep(page);
  await stubGeocoder(page);
  await page.getByLabel('Ciudad o pueblo').fill('villa traful');
  await page.getByRole('option', { name: /Villa Traful/ }).click();

  const map = page.locator('.leaflet-container');
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect(pinTown(page)).toHaveText('Villa Traful');
  await page.getByLabel('Dirección').fill('Ruta 65 km 2');

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel(/Precio por noche/).fill('80000');
  await page.getByRole('button', { name: 'Publicar' }).click();

  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Posada del Pin', exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('Villa Traful')).toBeVisible();
  await expect(card.getByText(/·/)).toHaveCount(0);
});
