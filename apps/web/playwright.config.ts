import { defineConfig } from '@playwright/test';

// E2E_PORT overrides the target port when a different dev server should be
// reused (default: the shared dev server on :3000).
const port = process.env.E2E_PORT ?? '3000';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
