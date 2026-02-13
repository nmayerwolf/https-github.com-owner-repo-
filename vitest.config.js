import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      include: ['src/engine/**/*.js', 'src/store/**/*.js', 'src/store/**/*.jsx'],
      exclude: ['src/store/watchlistStore.js'],
      thresholds: {
        lines: 75,
        functions: 72,
        statements: 75,
        branches: 65
      }
    }
  }
});
