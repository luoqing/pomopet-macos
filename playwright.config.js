import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui', timeout: 30_000, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1200, height: 900 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview:test', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
  reporter: [['line']]
});
