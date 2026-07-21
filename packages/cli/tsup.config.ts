import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/runner.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // Everything is external — nothing from the workspace is bundled. The rules
  // live in ONE place: eslint-plugin-aria-a11y is a real runtime dependency,
  // resolved from node_modules at run time, so a published plugin patch reaches
  // the CLI without rebuilding it. (Its own deps — aria-query, cosmiconfig,
  // @aria/config, @aria/core — come with it and never touch the CLI directly.)
  external: ['eslint', 'eslint-plugin-aria-a11y', /^@babel\//],
});
