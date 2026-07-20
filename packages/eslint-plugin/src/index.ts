import type { ESLint } from 'eslint';
import ariaSyntaxNormalize from './rules/aria-syntax-normalize';
import interactiveRoleRequired from './rules/interactive-role-required';
import noRedundantRole from './rules/no-redundant-role';
import noUnsupportedAria from './rules/no-unsupported-aria';

const plugin: ESLint.Plugin = {
  meta: {
    name: 'aria-a11y',
    version: '0.0.0',
  },
  rules: {
    'aria-syntax-normalize': ariaSyntaxNormalize,
    'interactive-role-required': interactiveRoleRequired,
    'no-redundant-role': noRedundantRole,
    'no-unsupported-aria': noUnsupportedAria,
  },
  configs: {},
};

// Recommended config: format-tier rules as 'error' so they gate CI;
// lint-tier rules as 'warn' — located diagnostics, human judgment.
(plugin.configs as Record<string, ESLint.ConfigData>)['recommended'] = {
  plugins: ['aria-a11y'],
  rules: {
    'aria-a11y/aria-syntax-normalize': 'error',
    'aria-a11y/interactive-role-required': 'warn',
    'aria-a11y/no-redundant-role': 'error',
    'aria-a11y/no-unsupported-aria': 'error',
  },
};

export default plugin;
