import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import ariaHiddenNotFocusable from './aria-hidden-not-focusable';
import { invalid, valid } from './aria-hidden-not-focusable.fixtures';

/**
 * The canonical suite for aria-hidden-not-focusable. The cases live in the
 * shared fixtures module (also run by the oxlint parity harness) so both
 * hosts provably run the same inputs.
 */

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe('aria-hidden-not-focusable', () => {
  it('passes RuleTester', () => {
    tester.run('aria-hidden-not-focusable', ariaHiddenNotFocusable, { valid: [...valid], invalid });
  });
});
