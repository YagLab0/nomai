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
