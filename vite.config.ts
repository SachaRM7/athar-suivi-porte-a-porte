import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { offlineBuild } from './scripts/offline-build';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Lot A4 : constante de compilation, pour que Rollup retire les laboratoires du bundle de
  // production. Serveur de développement : toujours présents ; build : seulement en mode lab.
  const technicalRoutes = command === 'serve' || env.VITE_ATHAR_TECHNICAL_ROUTES === 'true';
  return {
    base: process.env.VITE_BASE_PATH ?? '/',
    plugins: [react(), offlineBuild()],
    resolve: technicalRoutes ? {} : {
      alias: [{ find: /^\.\/TechnicalRoutes$/, replacement: fileURLToPath(new URL('./src/app/TechnicalRoutes.disabled.tsx', import.meta.url)) }]
    },
    define: {
      __ATHAR_TECHNICAL_ROUTES__: JSON.stringify(technicalRoutes)
    },
    build: {
      manifest: true,
      rollupOptions: {
        output: {
          entryFileNames: 'assets/app-[hash].js',
          chunkFileNames: 'assets/chunk-[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'worker/**/*.test.ts']
    }
  };
});
