import { defineConfig } from '@playwright/test';

// E2E_PORT overrides the target port when a different dev server should be
// reused (default: the shared dev server on :3000).
const port = process.env.E2E_PORT ?? '3000';
const apiPort = process.env.E2E_API_PORT ?? '3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  // Dev-mode Next compiles serially; six parallel workers starve navigations
  // during cold compile. Three is enough once routes are warm.
  workers: 3,
  use: { baseURL: `http://localhost:${port}` },
  webServer: [
    {
      // The marketplace, storefront and ficha read the listings API through
      // the /api/listings proxy; the mock datasource needs no env.
      command: `pnpm --dir ../api dev`,
      url: `http://localhost:${apiPort}/listings/search`,
      reuseExistingServer: true,
    },
    {
      command: `pnpm dev -p ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: true,
    },
  ],
});
