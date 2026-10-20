import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/mobile', timeout: 90_000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5284', trace: 'retain-on-failure' },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 5'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}) } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } }
  ],
  webServer: {
    command: `npx vite preview --port 5284 --strictPort --host 127.0.0.1 --outDir ${process.env.ATHAR_PREVIEW_DIR ?? 'dist-lab'}`,
    url: 'http://127.0.0.1:5284', reuseExistingServer: false, timeout: 30_000
  }
});
