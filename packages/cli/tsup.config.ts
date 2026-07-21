import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/runner.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  // Bundle the workspace packages (their package entries point at TS source,
  // which the built CLI cannot import); keep third-party runtime deps external
  // so they resolve from node_modules.
  noExternal: [/^@aria\//, 'eslint-plugin-aria-a11y'],
  external: ['eslint', 'aria-query', 'cosmiconfig', /^@babel\//],
});
