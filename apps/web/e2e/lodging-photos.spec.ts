import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

import { pinOnMap } from './helpers';

const image = (name: string) => path.join(__dirname, '..', 'public', 'images', `${name}.webp`);
const PHOTOS = ['tilcara-patio', 'tilcara-pucara', 'humahuaca-valle', 'cafayate-vinedos', 'salta-catedral', 'colonia-faro'];

/** Walks the wizard up to "Fotos y precio". */
async function openPhotosStep(page: Page, name: string) {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();
  await page.getByLabel('Nombre del alojamiento').fill(name);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Ubicación' })).toBeVisible();
  await pinOnMap(page);
  await page.getByLabel('Dirección').fill('Belgrano 450');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Detalles' })).toBeVisible();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('heading', { name: 'Fotos y precio' })).toBeVisible();
}

const previews = (page: Page) => page.getByRole('list', { name: 'Fotos elegidas' }).getByRole('listitem');

test('an Owner adds, removes and publishes compressed photos; the first is the cover', async ({ page }) => {
  await openPhotosStep(page, 'Posada con Fotos');

  await page.getByLabel('Agregar fotos').setInputFiles([image(PHOTOS[0]), image(PHOTOS[1]), image(PHOTOS[2])]);
  await expect(previews(page)).toHaveCount(3);
  await expect(previews(page).first().getByText('Portada')).toBeVisible();

  // Removing the cover promotes the next photo.
  await page.getByRole('button', { name: 'Quitar foto 1' }).click();
  await expect(previews(page)).toHaveCount(2);
  await expect(previews(page).first().getByText('Portada')).toBeVisible();

  // Never more than five.
  await page.getByLabel('Agregar fotos').setInputFiles(PHOTOS.slice(2).map(image));
  await expect(previews(page)).toHaveCount(5);
  await expect(page.getByText('Hasta 5 fotos: dejamos las primeras.')).toBeVisible();
  await expect(page.getByLabel('Agregar fotos')).toBeDisabled();

  await page.getByLabel(/Precio por noche/).fill('70000');
  await page.getByRole('button', { name: 'Publicar' }).click();

  // The panel card shows the cover and survives a reload.
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Posada con Fotos' }) });
  await expect(card.getByRole('img', { name: 'Foto de Posada con Fotos' })).toBeVisible();
  await page.reload();
  await expect(card.getByRole('img', { name: 'Foto de Posada con Fotos' })).toBeVisible();

  // The ficha's gallery holds all five, recompressed as JPEG at about 800px.
  await page.goto('/lodgings/posada-con-fotos');
  await expect(page.getByRole('button', { name: /Ver foto/ })).toHaveCount(5);
  const cover = page.getByRole('img', { name: 'Posada con Fotos, foto 1' });
  await expect(cover).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
  const size = await cover.evaluate((img: HTMLImageElement) => Math.max(img.naturalWidth, img.naturalHeight));
  expect(size).toBeLessThanOrEqual(800);
  expect(size).toBeGreaterThan(600);
});

test('a full browser storage fails the save clearly and keeps everything typed', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('nomai.catalog')) throw new DOMException('quota', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await openPhotosStep(page, 'Posada Sin Lugar');
  await page.getByLabel('Agregar fotos').setInputFiles([image(PHOTOS[0])]);
  await expect(previews(page)).toHaveCount(1);
  await page.getByLabel(/Precio por noche/).fill('70000');
  await page.getByRole('button', { name: 'Publicar' }).click();

  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No hay más espacio en este navegador');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(previews(page)).toHaveCount(1);
  await expect(page.getByLabel(/Precio por noche/)).toHaveValue('70000');
  await page.getByRole('button', { name: 'Atrás' }).click();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Nombre del alojamiento')).toHaveValue('Posada Sin Lugar');
});

test('without photos the card falls back to the illustration', async ({ page }) => {
  await openPhotosStep(page, 'Posada Sin Fotos');
  await page.getByLabel(/Precio por noche/).fill('70000');
  await page.getByRole('button', { name: 'Publicar' }).click();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Posada Sin Fotos' }) });
  await expect(card).toBeVisible();
  await expect(card.getByRole('img')).toHaveCount(0);
  await expect(card.locator('svg').first()).toBeVisible();
});
