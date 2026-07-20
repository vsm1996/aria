import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import idrefResolves from './idref-resolves';
import { invalid, valid } from './idref-resolves.fixtures';

/**
 * The canonical suite for idref-resolves. The cases live in
 * idref-resolves.fixtures.ts, shared with the oxlint parity harness
 * (scripts/oxlint-parity.mjs) so both hosts provably run the same inputs.
 */

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('idref-resolves', () => {
  it('passes RuleTester', () => {
    tester.run('idref-resolves', idrefResolves, { valid: [...valid], invalid });
  });
});
