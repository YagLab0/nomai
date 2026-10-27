import { expect, test, type Page } from '@playwright/test';

/**
 * Stubs the web balance route (/api/wallet) like the geocoder stub: `respond`
 * decides each request, so a retry can flip from wallet_unavailable to a real
 * balance.
 */
async function stubWallet(page: Page, respond: () => { status: number; body: unknown }) {
  await page.route('**/api/wallet', (route) => {
    const { status, body } = respond();
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const retryMessage = 'No pudimos preparar tu cuenta, probá de nuevo';

test('wallet_unavailable shows the retry message and no balance', async ({ page }) => {
  await stubWallet(page, () => ({ status: 503, body: { error: 'wallet_unavailable' } }));
  await page.goto('/app');

  await expect(page.getByText(retryMessage)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  // Neither a real-looking balance nor the demo one may appear.
  await expect(page.getByTestId('saldo-balance')).toHaveCount(0);
});

test('retrying after wallet_unavailable shows the balance in local currency', async ({ page }) => {
  let unavailable = true;
  await stubWallet(page, () =>
    unavailable
      ? { status: 503, body: { error: 'wallet_unavailable' } }
      : { status: 200, body: { balance: 95000, currency: 'ARS', formatted: '$ 95.000 ARS' } },
  );
  await page.goto('/app');
  await expect(page.getByText(retryMessage)).toBeVisible();

  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();

  await expect(page.getByTestId('saldo-balance')).toHaveText('$ 95.000 ARS');
  await expect(page.getByText(retryMessage)).toHaveCount(0);
});

test('demo mode without Supabase falls back to the mock balance', async ({ page }) => {
  // Unstubbed: the route answers 401 without Supabase env and the card shows
  // the demo balance — the only place it may.
  await page.goto('/app');
  await expect(page.getByTestId('saldo-balance')).toHaveText('R$ 1.920 BRL');
});
