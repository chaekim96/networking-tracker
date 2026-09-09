import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['__tests__/**/*.test.ts'] },
  // import.meta.dirname, not __dirname: this config is ESM.
  resolve: { alias: { '@': resolve(import.meta.dirname, '.') } },
});
