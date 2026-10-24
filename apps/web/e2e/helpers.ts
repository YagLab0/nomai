import { expect, type Page } from '@playwright/test';

/**
 * Picks an option in a HeroUI Select and waits for its popover to finish
 * closing: a click that lands while it animates out is swallowed as an
 * "interact outside" and never reaches its target.
 */
export async function pickOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).click();
  await page.getByRole('option', { name: option }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}
