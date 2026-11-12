// Runs the analysis scripts in scripts/*.script.ts with the app's modules (alias "@"), for example:
//   npx vitest run --config vitest.scripts.config.ts scripts/opening-balances.script.ts
// They are not part of the normal test run.
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: { include: ['scripts/**/*.script.ts'], testTimeout: 120000 },
});
