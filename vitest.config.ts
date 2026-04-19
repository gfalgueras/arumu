import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    pool: 'forks', // isolate processes — avoids native-module issues across test files
    sequence: { concurrent: true }, // test files run in parallel (each has its own DB connection)
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
});
