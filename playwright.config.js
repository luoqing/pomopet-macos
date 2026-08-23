import { defineConfig } from '@playwright/test';

const port = Number(process.env.POMOPET_PREVIEW_PORT || 4173);

export default defineConfig({
  testDir: './tests/ui', timeout: 30_000, fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1200, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: `npm run preview:test -- --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
  reporter: [['line']]
});
