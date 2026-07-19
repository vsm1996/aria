import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import noRedundantRole from './no-redundant-role';
import { invalid, valid } from './no-redundant-role.fixtures';

/**
 * The canonical suite for no-redundant-role. The cases live in
 * no-redundant-role.fixtures.ts, shared with the oxlint parity harness
 * (scripts/oxlint-parity.mjs) so both hosts provably run the same inputs.
 */

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-redundant-role', () => {
  it('passes RuleTester', () => {
    tester.run('no-redundant-role', noRedundantRole, { valid: [...valid], invalid });
  });
});
