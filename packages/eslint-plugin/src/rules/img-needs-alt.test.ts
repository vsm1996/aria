import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import imgNeedsAlt from './img-needs-alt';
import { invalid, valid } from './img-needs-alt.fixtures';

/**
 * The canonical suite for img-needs-alt. The cases live in
 * img-needs-alt.fixtures.ts, shared with the oxlint parity harness
 * (scripts/oxlint-parity.mjs) so both hosts provably run the same inputs.
 */

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('img-needs-alt', () => {
  it('passes RuleTester', () => {
    tester.run('img-needs-alt', imgNeedsAlt, { valid: [...valid], invalid });
  });
});
