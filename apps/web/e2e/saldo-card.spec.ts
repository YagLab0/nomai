import { expect, test, type Page } from '@playwright/test';

import { pickOption } from './helpers';

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

/** The ramp URL the stubbed link route hands back — a fake address that must
 * never reach nomai's DOM. */
const RAMP_URL =
  'https://ramp.ripio.com/?country=AR&chain=42220&token=WARS&amount=95000&address=0x1111111111111111111111111111111111111111';

/**
 * Stubs the funding-link route (POST /api/wallet/funding-link) and captures
 * each request body — what the card sends decides the assertions, the stub
 * decides each response. Also stubs ramp.ripio.com context-wide so the popup
 * the card opens never reaches the network.
 */
async function stubFundingLink(
  page: Page,
  respond: (body: unknown) => { status: number; body: unknown },
): Promise<{ requests: () => unknown[] }> {
  const requests: unknown[] = [];
  await page.route('**/api/wallet/funding-link', (route) => {
    requests.push(route.request().postDataJSON());
    const { status, body } = respond(requests.at(-1));
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page
    .context()
    .route('https://ramp.ripio.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>ramp stub</body></html>' }),
    );
  return { requests: () => requests };
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

// -- "Cargar" Funding flow (issue #40) ---------------------------------------

/** Fills the funding step and submits; resolves to the opened popup. */
async function openRamp(page: Page, amount: string) {
  await page.getByLabel('Monto').fill(amount);
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Continuar a Ripio' }).click(),
  ]);
  return popup;
}

test('first Cargar asks the payer country once and opens Ripio in a new tab', async ({ page }) => {
  const link = await stubFundingLink(page, () => ({ status: 200, body: { ok: true, url: RAMP_URL } }));
  await stubWallet(page, () => ({ status: 200, body: walletOk(null) }));
  await page.goto('/app');

  await page.getByRole('button', { name: 'Cargar' }).click();

  // country_code is null → the payer country is asked this once.
  await pickOption(page, '¿Desde qué país pagás?', 'Argentina');
  // The wFIAT selector lists all six — the default is the country's own.
  await pickOption(page, 'Moneda', 'Reales (BRL)');

  const popup = await openRamp(page, '95.000');
  await expect(popup).toHaveURL(/ramp\.ripio\.com/);
  expect(popup.url()).toContain('token=WARS');
  expect(popup.url()).toContain('address=0x1111111111111111111111111111111111111111');

  // The card sent the typed amount (es-AR "95.000" → 95000), the picked fiat
  // and the payer country — the API is what builds the URL.
  expect(link.requests()).toEqual([{ amount: 95000, currency: 'BRL', country: 'AR' }]);

  // The Agent wallet address lives inside the popup URL only — never in the DOM.
  expect(await page.content()).not.toContain('0x1111111111111111111111111111111111111111');

  // Back on the card: the pending hint and the manual refresh are there.
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();
  await popup.close();
});

test('a stored payer country is never asked again', async ({ page }) => {
  const link = await stubFundingLink(page, () => ({ status: 200, body: { ok: true, url: RAMP_URL } }));
  await stubWallet(page, () => ({ status: 200, body: walletOk('AR') }));
  await page.goto('/app');

  await page.getByRole('button', { name: 'Cargar' }).click();
  await expect(page.getByLabel('¿Desde qué país pagás?')).toHaveCount(0);

  const popup = await openRamp(page, '5000');
  expect(link.requests()).toEqual([{ amount: 5000, currency: 'ARS' }]);
  await popup.close();
});

test('coming back to the tab refreshes the balance; Actualizar does too', async ({ page }) => {
  let funded = false;
  await stubFundingLink(page, () => ({ status: 200, body: { ok: true, url: RAMP_URL } }));
  await stubWallet(page, () => ({
    status: 200,
    body: walletOk('AR', { ARS: funded ? '95000' : '0' }),
  }));
  await page.goto('/app');

  await page.getByRole('button', { name: 'Cargar' }).click();
  const popup = await openRamp(page, '95000');
  await popup.close();

  // The Funding landed while the Traveler was on Ripio: refocus re-reads it.
  funded = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('saldo-balance')).toHaveText(['$ 95.000 ARS']);

  // And the manual button re-reads on demand (e.g. the Funding lags).
  funded = false;
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByTestId('saldo-balance')).toHaveText(['$ 0 ARS']);
});

test('an invalid amount never asks for the link', async ({ page }) => {
  const link = await stubFundingLink(page, () => ({ status: 200, body: { ok: true, url: RAMP_URL } }));
  await stubWallet(page, () => ({ status: 200, body: walletOk('AR') }));
  await page.goto('/app');

  await page.getByRole('button', { name: 'Cargar' }).click();
  await page.getByLabel('Monto').fill('abc');
  await page.getByRole('button', { name: 'Continuar a Ripio' }).click();

  await expect(page.getByText('Ingresá un monto válido.')).toBeVisible();
  expect(link.requests()).toHaveLength(0);
});

test('currency_unavailable shows the funding message', async ({ page }) => {
  await stubFundingLink(page, () => ({ status: 404, body: { error: 'currency_unavailable' } }));
  await stubWallet(page, () => ({ status: 200, body: walletOk('AR') }));
  await page.goto('/app');

  await page.getByRole('button', { name: 'Cargar' }).click();
  await page.getByLabel('Monto').fill('95000');
  await page.getByRole('button', { name: 'Continuar a Ripio' }).click();

  await expect(page.getByText(unavailableMessage)).toBeVisible();
});

test('wallet_unavailable shows the retry message inside the step', async ({ page }) => {
  await stubFundingLink(page, () => ({ status: 503, body: { error: 'wallet_unavailable' } }));
  await stubWallet(page, () => ({ status: 200, body: walletOk('AR') }));
  await page.goto('/app');

  await page.getByRole('button', { name: 'Cargar' }).click();
  await page.getByLabel('Monto').fill('95000');
  await page.getByRole('button', { name: 'Continuar a Ripio' }).click();

  await expect(page.getByText(retryMessage)).toBeVisible();
});

test('the funding flow works at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubFundingLink(page, () => ({ status: 200, body: { ok: true, url: RAMP_URL } }));
  await stubWallet(page, () => ({ status: 200, body: walletOk('AR', { ARS: '12000' }) }));
  await page.goto('/app');

  // On a phone the saldo card lives inside the drawer.
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('button', { name: 'Cargar' }).click();

  const popup = await openRamp(page, '12000');
  await expect(popup).toHaveURL(/ramp\.ripio\.com/);
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeVisible();
  await popup.close();
});
