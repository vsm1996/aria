import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The published packages point their `exports` at `dist` only (no `src`
// reference — that src-in-a-published-manifest is exactly what broke 0.1.0).
// For the in-repo test loop we still want the FAST path: resolve
// `eslint-plugin-aria-a11y` to its TypeScript source, no build required. That
// mapping lives HERE, in test config, so it never reaches a published manifest.
//
// A single project (not per-package `projects`) so this one global alias
// applies to every test — the CLI's tests import the plugin by name and must
// resolve it to src.
const pluginSrc = fileURLToPath(new URL('./packages/eslint-plugin/src/index.ts', import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'eslint-plugin-aria-a11y': pluginSrc,
    },
  },
});
