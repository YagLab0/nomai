import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Picks an option in a HeroUI Select (by its label, or its trigger) and waits
 * for its popover to finish closing: a click that lands while it animates out
 * is swallowed as an "interact outside" and never reaches its target.
 */
export async function pickOption(page: Page, trigger: string | Locator, option: string) {
  await (typeof trigger === 'string' ? page.getByLabel(trigger) : trigger).click();
  await page.getByRole('option', { name: option }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}

/**
 * Stubs the wizard's place geocoder (Nominatim) so specs never hit the
 * network. Register before typing in the search field.
 */
export async function stubGeocoder(page: Page) {
  await page.route('**/nominatim.openstreetmap.org/**', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q')?.toLowerCase() ?? '';
    const row = (name: string, state: string, lat: number, lng: number) => ({
      lat: String(lat),
      lon: String(lng),
      display_name: `${name}, ${state}, Argentina`,
      address: { village: name, state, country_code: 'ar' },
    });
    const rows = q.includes('traful')
      ? [row('Villa Traful', 'Neuquén', -40.65, -71.4)]
      : q.includes('tilcara') || q.includes('til')
        ? [row('Tilcara', 'Jujuy', -23.5776, -65.3966)]
        : [row('Cafayate', 'Salta', -26.0731, -65.9761)];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(rows) });
  });
}

/**
 * Searches a place in the wizard's Ubicación step and picks it: the map
 * unlocks and the address field appears. Returns the picked name.
 */
export async function pickPlace(page: Page, query = 'tilcara', option = 'Tilcara'): Promise<string> {
  await stubGeocoder(page);
  await page.getByLabel('Ciudad o pueblo').fill(query);
  await page.getByRole('option', { name: new RegExp(option) }).click();
  await expect(page.getByLabel('Dirección')).toBeVisible();
  return option;
}

/**
 * Picks a place and drops the pin at the center of the unlocked map.
 * Returns the picked place name — that is what the Lodging stores as its town.
 */
export async function pinOnMap(page: Page): Promise<string> {
  const town = await pickPlace(page);
  const map = page.locator('.leaflet-container');
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await expect(page.getByTestId('pin-coords')).toBeVisible();
  return town;
}
