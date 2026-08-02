import { defineConfig } from 'vitest/config';

// Isolated config so shared unit tests don't inherit an unrelated parent
// vite config. Pure-function tests only — no DB, no environment.
export default defineConfig({
  root: __dirname,
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
