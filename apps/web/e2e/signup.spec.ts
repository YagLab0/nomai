import { expect, test } from '@playwright/test';

// The Agent wallet is created on the Traveler's first wallet action, never at
// signup (ADR-0003). The hosted Supabase signup is stubbed — the spec must not
// create real users — so the confirmation-required response (a user with no
// session) exercises the full submit path.
test('signup asks for email confirmation and never provisions an Agent wallet', async ({ page }) => {
  const provisioning: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('provision')) provisioning.push(request.url());
  });

  await page.route('**/auth/v1/signup**', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        id: '00000000-0000-4000-8000-0000000000aa',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'viajera@example.com',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }),
    });
  });

  await page.goto('/signup');
  await page.getByLabel('Nombre completo').fill('Viajera Prueba');
  await page.getByLabel('Email').fill('viajera@example.com');
  await page.getByLabel('Contraseña').fill('una-clave-segura');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // With Supabase: the email-confirmation message; in demo mode: into the app.
  await expect(
    page.getByText(/revisá tu casilla/).or(page.getByPlaceholder(/Contale a Nomito/)),
  ).toBeVisible();

  // Any provisioning fetch would have fired before the outcome above rendered.
  await page.waitForTimeout(500);
  expect(provisioning).toEqual([]);
});
