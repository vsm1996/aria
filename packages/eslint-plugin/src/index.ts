import type { ESLint } from 'eslint';
import ariaSyntaxNormalize from './rules/aria-syntax-normalize';
import noRedundantRole from './rules/no-redundant-role';
import noUnsupportedAria from './rules/no-unsupported-aria';

const plugin: ESLint.Plugin = {
  meta: {
    name: 'aria-a11y',
    version: '0.0.0',
  },
  rules: {
    'aria-syntax-normalize': ariaSyntaxNormalize,
    'no-redundant-role': noRedundantRole,
    'no-unsupported-aria': noUnsupportedAria,
  },
  configs: {},
};

// Recommended config: all format-tier rules as 'error' so they gate CI.
(plugin.configs as Record<string, ESLint.ConfigData>)['recommended'] = {
  plugins: ['aria-a11y'],
  rules: {
    'aria-a11y/aria-syntax-normalize': 'error',
    'aria-a11y/no-redundant-role': 'error',
    'aria-a11y/no-unsupported-aria': 'error',
  },
};

export default plugin;
