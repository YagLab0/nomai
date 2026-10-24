import { expect, test } from '@playwright/test';

test('the ficha shows gallery, facts, blurb, amenities, address, map and the Owner block', async ({ page }) => {
  await page.goto('/lodgings/casa-de-adobe');

  // Gallery: the seeded cover photo.
  await expect(page.getByRole('img', { name: /Habitación con cama de hierro/ })).toBeVisible();

  // Name, kind, town and facts.
  await expect(page.getByRole('heading', { level: 1, name: 'Casa de Adobe' })).toBeVisible();
  await expect(page.getByText('CFY · Cafayate')).toBeVisible();
  await expect(page.getByText(/Casa · Valles Calchaquíes/)).toBeVisible();
  await expect(page.getByText('hasta 4 personas')).toBeVisible();
  await expect(page.getByText('2 dormitorios')).toBeVisible();
  await expect(page.getByText('1 baño')).toBeVisible();

  // Blurb and amenities.
  await expect(page.getByText('Patio con parral, a dos cuadras de la plaza.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Servicios' }).getByText('Cerca de bodegas')).toBeVisible();

  // Exact address (public by design) and the map with the pin + OSM attribution.
  await expect(page.getByText(/Nuestra Señora del Rosario 165/)).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toBeVisible();
  await expect(
    page.locator('.leaflet-control-attribution a[href*="openstreetmap.org"]'),
  ).toBeVisible();

  // Price in the Lodging's local currency, no crypto vocabulary.
  await expect(page.getByText('$ 95.000')).toBeVisible();
  await expect(page.getByText(/ARS/)).toBeVisible();

  // Owner block with the link to the storefront.
  await expect(page.getByText('Ramón Guaymás')).toBeVisible();
  await expect(page.getByText('Dueño verificado')).toBeVisible();
  await expect(page.getByText(/Cobra directo, sin comisión/)).toBeVisible();
  const storefront = page.getByRole('link', { name: /escaparate/ });
  await expect(storefront).toBeVisible();
  await storefront.click();
  await expect(page).toHaveURL(/\/owners\/ramon-guaymas$/);
});

test('a Lodging without coordinates shows only its town, no map', async ({ page }) => {
  await page.goto('/lodgings/posada-el-algarrobo');
  await expect(page.getByRole('heading', { level: 1, name: 'Posada El Algarrobo' })).toBeVisible();
  await expect(page.getByText('Salta, Barrio Güemes')).toBeVisible();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('explorer and storefront cards link to the ficha', async ({ page }) => {
  await page.goto('/lodgings');
  await page.getByRole('link', { name: 'Casa de Adobe' }).first().click();
  await expect(page).toHaveURL(/\/lodgings\/casa-de-adobe$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Casa de Adobe' })).toBeVisible();

  await page.goto('/owners/ramon-guaymas');
  await page.getByRole('link', { name: 'Cabaña Viñas del Sol' }).first().click();
  await expect(page).toHaveURL(/\/lodgings\/cabana-vinas-del-sol$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cabaña Viñas del Sol' })).toBeVisible();
});

test('an unknown id shows not-found', async ({ page }) => {
  await page.goto('/lodgings/no-existe');
  await expect(page.getByText('No encontramos este alojamiento')).toBeVisible();
  await page.getByRole('link', { name: 'Ver todos los alojamientos' }).click();
  await expect(page).toHaveURL(/\/lodgings$/);
});

test('a Lodging created in the panel gets its own ficha', async ({ page }) => {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();
  await page.getByLabel('Nombre del alojamiento').fill('La Posada del E2E');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Pueblo o ciudad').click();
  await page.getByRole('option', { name: 'Humahuaca' }).click();
  await page.getByLabel('Dirección').fill('Tucumán 12');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel(/Precio por noche/).fill('60000');
  await page.getByRole('button', { name: 'Publicar' }).click();

  // Rendered client-side from the catalog; the "Nuevo" chip replaces a rating.
  await page.goto('/lodgings/la-posada-del-e2e');
  await expect(page.getByRole('heading', { level: 1, name: 'La Posada del E2E' })).toBeVisible();
  await expect(page.getByText('Nuevo', { exact: true })).toBeVisible();
  await expect(page.getByText('Tucumán 12, Humahuaca')).toBeVisible();
});

test('the ficha is usable on a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lodgings/casa-de-adobe');
  await expect(page.getByRole('heading', { level: 1, name: 'Casa de Adobe' })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('link', { name: /escaparate/ })).toBeVisible();
});
