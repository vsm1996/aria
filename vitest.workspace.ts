import { defineWorkspace } from 'vitest/config';

// Each package is its own Vitest project. With no per-package config, the
// default test glob (**/*.{test,spec}.ts) applies, so colocated *.test.ts
// files are picked up automatically.
export default defineWorkspace(['packages/*']);
