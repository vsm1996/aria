import type { ESLint } from 'eslint';
import noRedundantRole from './rules/no-redundant-role';

const plugin: ESLint.Plugin = {
  meta: {
    name: 'aria-a11y',
    version: '0.0.0',
  },
  rules: {
    'no-redundant-role': noRedundantRole,
  },
  configs: {},
};

// Recommended config: all format-tier rules as 'error' so they gate CI.
(plugin.configs as Record<string, ESLint.ConfigData>)['recommended'] = {
  plugins: ['aria-a11y'],
  rules: {
    'aria-a11y/no-redundant-role': 'error',
  },
};

export default plugin;
