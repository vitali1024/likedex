import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
