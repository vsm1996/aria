import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Bundle the workspace packages: their package.json entries point at TS
  // source, which hosts loading the built plugin (oxlint's plugin runtime,
  // plain Node) cannot import.
  noExternal: [/^@aria\//],
  // …but NOT their third-party deps: cosmiconfig is CJS with dynamic
  // require()s that break inside an ESM bundle. It resolves from
  // node_modules at runtime like aria-query does.
  external: ['cosmiconfig'],
});
