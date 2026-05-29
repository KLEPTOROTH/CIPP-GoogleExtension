import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    environment: 'node',
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['dist/**', 'coverage/**', '.next/**', 'node_modules/**', '**/tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
});
