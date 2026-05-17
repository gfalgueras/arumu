import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import os from 'os';

export default defineConfig({
  test: {
    environment: 'node',
    poolOptions: { forks: { maxForks: Math.max(1, os.cpus().length - 1) } },
    testTimeout: 60_000,
    hookTimeout: 180_000,
    include: ['tests/**/*.test.ts'],
    pool: 'forks', // isolate processes — avoids native-module issues across test files
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
