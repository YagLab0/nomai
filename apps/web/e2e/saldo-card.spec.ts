import { expect, test, type Page } from '@playwright/test';

/**
 * Stubs the web balance route (/api/wallet) like the geocoder stub: `respond`
 * decides each request, so a retry can flip from wallet_unavailable to real
 * balances.
 */
async function stubWallet(page: Page, respond: () => { status: number; body: unknown }) {
  await page.route('**/api/wallet', (route) => {
    const { status, body } = respond();
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

/** The API's wFIAT balance list (mainnet shape): every country token, zeros
 * included — the card decides which to show. */
function balances(amounts: Partial<Record<'ARS' | 'BRL' | 'CLP' | 'COP' | 'MXN' | 'PEN', string>> = {}) {
  return [
    { token: 'wars', currency: 'ARS', country: 'AR', amount: amounts.ARS ?? '0' },
    { token: 'wbrl', currency: 'BRL', country: 'BR', amount: amounts.BRL ?? '0' },
    { token: 'wclp', currency: 'CLP', country: 'CL', amount: amounts.CLP ?? '0' },
    { token: 'wcop', currency: 'COP', country: 'CO', amount: amounts.COP ?? '0' },
    { token: 'wmxn', currency: 'MXN', country: 'MX', amount: amounts.MXN ?? '0' },
    { token: 'wpen', currency: 'PEN', country: 'PE', amount: amounts.PEN ?? '0' },
  ];
}

const walletOk = (country_code: string | null, amounts = {}) => ({
  ok: true,
  country_code,
  network: 'celo',
  balances: balances(amounts),
});

const retryMessage = 'No pudimos preparar tu cuenta, probá de nuevo';
const unavailableMessage = 'La carga todavía no está disponible';

test('wallet_unavailable shows the retry message and no balance', async ({ page }) => {
  await stubWallet(page, () => ({ status: 503, body: { error: 'wallet_unavailable' } }));
  await page.goto('/app');

  await expect(page.getByText(retryMessage)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  // Neither a real-looking balance nor the demo one may appear.
  await expect(page.getByTestId('saldo-balance')).toHaveCount(0);
});

test('retrying after wallet_unavailable shows the balance in its own fiat', async ({ page }) => {
  let unavailable = true;
  await stubWallet(page, () =>
    unavailable
      ? { status: 503, body: { error: 'wallet_unavailable' } }
      : { status: 200, body: walletOk('AR', { ARS: '95000' }) },
  );
  await page.goto('/app');
  await expect(page.getByText(retryMessage)).toBeVisible();

  unavailable = false;
  await page.getByRole('button', { name: 'Reintentar' }).click();

  await expect(page.getByTestId('saldo-balance')).toHaveText(['$ 95.000 ARS']);
  await expect(page.getByText(retryMessage)).toHaveCount(0);
});

test("the Traveler's country wFIAT shows even at zero", async ({ page }) => {
  await stubWallet(page, () => ({ status: 200, body: walletOk('BR') }));
  await page.goto('/app');

  await expect(page.getByTestId('saldo-balance')).toHaveText(['R$ 0 BRL']);
});

test('any other wFIAT with a positive balance shows too', async ({ page }) => {
  await stubWallet(page, () => ({
    status: 200,
    body: walletOk('AR', { BRL: '500', PEN: '1.5' }),
  }));
  await page.goto('/app');

  await expect(page.getByTestId('saldo-balance')).toHaveText(['$ 0 ARS', 'R$ 500 BRL', 'S/ 1.50 PEN']);
});

test('currency_unavailable shows the funding message and no balance', async ({ page }) => {
  await stubWallet(page, () => ({ status: 404, body: { error: 'currency_unavailable' } }));
  await page.goto('/app');

  await expect(page.getByText(unavailableMessage)).toBeVisible();
  await expect(page.getByTestId('saldo-balance')).toHaveCount(0);
  // Retrying cannot help — there is no wFIAT on this network.
  await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
});

test('a balance read without a country still answers', async ({ page }) => {
  await stubWallet(page, () => ({ status: 200, body: walletOk(null, { MXN: '1200' }) }));
  await page.goto('/app');

  await expect(page.getByTestId('saldo-balance')).toHaveText(['MX$ 1,200 MXN']);
});

test('demo mode without Supabase falls back to the mock balance', async ({ page }) => {
  // Unstubbed: the route answers 401 without Supabase env and the card shows
  // the demo balance — the only place it may.
  await page.goto('/app');
  await expect(page.getByTestId('saldo-balance')).toHaveText('R$ 1.920 BRL');
});
