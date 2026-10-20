import { defineConfig } from 'vitest/config';

// npm run test:emulator:run executes callable/legacy-trigger assertions before the
// bulk pagination fixtures. The Functions emulator queues all triggers serially;
// thousands of load documents must not delay unrelated legacy assertions. No test is skipped.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/emulator/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000
  }
});
