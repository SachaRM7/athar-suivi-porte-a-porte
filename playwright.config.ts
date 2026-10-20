import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  // Chaque test de carte charge le paquet PMTiles local (42 Mo) avant de rendre la
  // première tuile. 60 s suffisaient tant que la machine ne portait rien d'autre.
  timeout: 90_000,
  workers: 1,
  use: {
    ...devices['Pixel 5'],
    baseURL: 'http://127.0.0.1:5274',
    // Un poste ou une CI qui fournit son propre Chromium le désigne ici, plutôt que de
    // télécharger celui de la version Playwright installée.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
      : {})
  },
  webServer: {
    command: `npx vite preview --port 5274 --strictPort --host 127.0.0.1 --outDir ${process.env.ATHAR_PREVIEW_DIR ?? 'dist'}`,
    url: 'http://127.0.0.1:5274',
    reuseExistingServer: true,
    timeout: 30_000
  }
});
