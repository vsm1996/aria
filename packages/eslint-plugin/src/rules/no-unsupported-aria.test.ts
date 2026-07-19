import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import noUnsupportedAria from './no-unsupported-aria';
import { invalid, valid } from './no-unsupported-aria.fixtures';

/**
 * The canonical suite for no-unsupported-aria. The cases live in
 * no-unsupported-aria.fixtures.ts, shared with the oxlint parity harness
 * (scripts/oxlint-parity.mjs) so both hosts provably run the same inputs.
 */

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('no-unsupported-aria', () => {
  it('passes RuleTester', () => {
    tester.run('no-unsupported-aria', noUnsupportedAria, {
      valid: [...valid],
      // `converged` is the parity harness's contract, not RuleTester's —
      // RuleTester rejects unknown keys, and its `output` is one-pass only.
      invalid: invalid.map(({ code, errors, output }) => ({ code, errors, output })),
    });
  });
});
