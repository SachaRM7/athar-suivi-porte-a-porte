import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    ...devices['Pixel 5'],
    baseURL: 'http://127.0.0.1:5274'
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5274',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
