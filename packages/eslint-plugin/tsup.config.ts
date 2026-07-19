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
});
