import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-v15.js',
        chunkFileNames: 'assets/chunk-[name]-[hash].js',
        assetFileNames: (asset) => asset.name?.endsWith('.css') ? 'assets/app-v15.css' : 'assets/[name][extname]'
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
});
