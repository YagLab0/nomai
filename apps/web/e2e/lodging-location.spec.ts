import { expect, test, type Page } from '@playwright/test';

import { pickOption } from './helpers';

async function openLocationStep(page: Page) {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();
  await page.getByLabel('Nombre del alojamiento').fill('Posada del Pin');
  await page.getByRole('button', { name: 'Siguiente' }).click();
}

const pinCoords = (page: Page) => page.getByTestId('pin-coords');

for (const viewport of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: '390px', width: 390, height: 844 },
]) {
  test(`choosing a town centers the map and the pin can be moved (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openLocationStep(page);

    await pickOption(page, 'Pueblo o ciudad', 'Tilcara');

    // The map measures itself inside the modal and shows the pin at the town center.
    const dialog = page.getByRole('dialog');
    const map = dialog.locator('.leaflet-container');
    await expect(map).toBeVisible();
    await expect(dialog.locator('.leaflet-tile-loaded').first()).toBeVisible();
    const box = await map.boundingBox();
    expect(box!.width).toBeGreaterThan(250);
    expect(box!.height).toBeGreaterThan(180);
    await expect(dialog.locator('.leaflet-control-attribution a[href*="openstreetmap.org"]')).toBeVisible();
    await expect(pinCoords(page)).toHaveText('-23.5776, -65.3966');

    // Dragging the pin updates the coordinates.
    const pin = page.getByRole('button', { name: /Pin del alojamiento/ });
    const pinBox = (await pin.boundingBox())!;
    await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(pinBox.x + pinBox.width / 2 + 40, pinBox.y + pinBox.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    await expect(pinCoords(page)).not.toHaveText('-23.5776, -65.3966');

    // Back to the town center.
    await page.getByRole('button', { name: 'Volver al centro del pueblo' }).click();
    await expect(pinCoords(page)).toHaveText('-23.5776, -65.3966');

    // Keyboard: arrows move the focused pin.
    await pin.focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    await expect(pinCoords(page)).toHaveText('-23.5774, -65.3964');
  });
}

test('the location step requires the street address', async ({ page }) => {
  await openLocationStep(page);
  await pickOption(page, 'Pueblo o ciudad', 'Tilcara');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Escribí la dirección, con calle y número.')).toBeVisible();
  await expect(page.getByLabel('Dirección')).toBeVisible();
});
