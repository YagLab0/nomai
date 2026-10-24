import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { pinOnMap } from './helpers';

const card = (page: Page, name: string) =>
  page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });

async function next(page: Page, heading: string) {
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: heading })).toBeVisible();
}

async function createLodging(page: Page, name: string) {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();
  await page.getByLabel('Nombre del alojamiento').fill(name);
  await next(page, 'Ubicación');
  await pinOnMap(page);
  await page.getByLabel('Dirección').fill('Belgrano 450');
  await next(page, 'Detalles');
  await next(page, 'Fotos y precio');
  await page.getByLabel(/Precio por noche/).fill('70000');
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(card(page, name)).toBeVisible();
}

test('Casa de Adobe has Upcoming Bookings: location locked, delete disabled, price edit persists', async ({ page }) => {
  await page.goto('/app/owner');
  await card(page, 'Casa de Adobe').getByRole('button', { name: 'Editar' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Editar Casa de Adobe' })).toBeVisible();
  await expect(page.getByLabel('Nombre del alojamiento')).toHaveValue('Casa de Adobe');
  await expect(dialog.getByRole('button', { name: 'Eliminar alojamiento' })).toBeDisabled();
  await expect(dialog.getByText('Tenés reservas confirmadas o en curso en este alojamiento: no se puede eliminar.')).toBeVisible();

  await next(page, 'Ubicación');
  await expect(
    dialog.getByText('Tenés reservas confirmadas en este alojamiento: la ubicación no se puede cambiar.'),
  ).toBeVisible();
  await expect(dialog.getByText('Nuestra Señora del Rosario 165')).toBeVisible();
  await expect(page.getByLabel('Dirección')).toHaveCount(0);
  await expect(dialog.getByText(/Tocá el mapa para marcar/)).toHaveCount(0);
  await expect(dialog.locator('.leaflet-marker-draggable')).toHaveCount(0);

  await next(page, 'Detalles');
  await next(page, 'Fotos y precio');
  await expect(page.getByLabel(/Precio por noche/)).toHaveValue('95000');
  await page.getByLabel(/Precio por noche/).fill('99000');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.getByText('Alojamiento actualizado')).toBeVisible();
  await expect(card(page, 'Casa de Adobe').getByText('$ 99.000')).toBeVisible();

  // Persists, and settled Bookings keep what was paid.
  await page.reload();
  await expect(card(page, 'Casa de Adobe').getByText('$ 99.000')).toBeVisible();
  const lucas = page.locator('article').filter({ hasText: 'Lucas' });
  await expect(lucas.getByText('$ 285.000')).toBeVisible();

  await page.goto('/lodgings/casa-de-adobe');
  await expect(page.getByText('$ 99.000')).toBeVisible();
});

test('a newly created Lodging can be deleted, after confirming, from every surface', async ({ page }) => {
  await createLodging(page, 'Posada Efímera');

  await card(page, 'Posada Efímera').getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Eliminar alojamiento' }).click();
  await expect(dialog.getByText(/¿Eliminar Posada Efímera\?/)).toBeVisible();

  // "No" keeps it.
  await dialog.getByRole('button', { name: 'No, conservarlo' }).click();
  await dialog.getByRole('button', { name: 'Eliminar alojamiento' }).click();
  await dialog.getByRole('button', { name: 'Sí, eliminar' }).click();

  await expect(page.getByText('Alojamiento eliminado')).toBeVisible();
  await expect(card(page, 'Posada Efímera')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Casa de Adobe' })).toBeVisible();
  await expect(card(page, 'Posada Efímera')).toHaveCount(0);

  await page.goto('/lodgings');
  await expect(page.getByRole('heading', { name: 'Casa de Adobe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Posada Efímera' })).toHaveCount(0);

  await page.goto('/owners/ramon-guaymas');
  await expect(page.getByRole('heading', { name: 'Casa de Adobe' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Posada Efímera' })).toHaveCount(0);

  await page.goto('/lodgings/posada-efimera');
  await expect(page.getByText('No encontramos este alojamiento')).toBeVisible();
});

test('editing a created Lodging can change its photos', async ({ page }) => {
  await createLodging(page, 'Posada Retratada');
  await expect(card(page, 'Posada Retratada').getByRole('img')).toHaveCount(0);

  await card(page, 'Posada Retratada').getByRole('button', { name: 'Editar' }).click();
  await next(page, 'Ubicación');
  await expect(page.getByLabel('Dirección')).toHaveValue('Belgrano 450');
  await next(page, 'Detalles');
  await next(page, 'Fotos y precio');
  await page
    .getByLabel('Agregar fotos')
    .setInputFiles(path.join(__dirname, '..', 'public', 'images', 'tilcara-patio.webp'));
  await expect(page.getByRole('list', { name: 'Fotos elegidas' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(card(page, 'Posada Retratada').getByRole('img', { name: 'Foto de Posada Retratada' })).toBeVisible();
});
