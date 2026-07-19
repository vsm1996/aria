import { Linter, RuleTester } from 'eslint';
import { describe, expect, it } from 'vitest';
import ariaSyntaxNormalize from './aria-syntax-normalize';
import { invalid, valid } from './aria-syntax-normalize.fixtures';

/**
 * The canonical suite for aria-syntax-normalize. The cases live in
 * aria-syntax-normalize.fixtures.ts, shared with the oxlint parity harness
 * (scripts/oxlint-parity.mjs) so both hosts provably run the same inputs.
 */

const languageOptions = {
  ecmaVersion: 2022,
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

const tester = new RuleTester({ languageOptions });

describe('aria-syntax-normalize', () => {
  it('passes RuleTester', () => {
    tester.run('aria-syntax-normalize', ariaSyntaxNormalize, {
      valid: [...valid],
      invalid: invalid.map(({ code, errors, output }) => ({ code, errors, output })),
    });
  });

  // Meaning-preservation, in this rule's strongest checkable form: the ONLY
  // thing a fix may change is character case. Byte-for-byte, output must
  // equal input under case folding — nothing added, removed, or reordered.
  it('fixes change case and nothing else', () => {
    const linter = new Linter();
    const config = {
      plugins: { aria: { rules: { 'syntax-normalize': ariaSyntaxNormalize } } },
      rules: { 'aria/syntax-normalize': 'error' },
      languageOptions,
    } as const;
    for (const { code } of invalid) {
      const { output } = linter.verifyAndFix(code, config);
      expect(output.toLowerCase()).toBe(code.toLowerCase());
    }
  });

  // Idempotence: the converged output must be completely silent.
  it('is idempotent', () => {
    const linter = new Linter();
    const config = {
      plugins: { aria: { rules: { 'syntax-normalize': ariaSyntaxNormalize } } },
      rules: { 'aria/syntax-normalize': 'error' },
      languageOptions,
    } as const;
    for (const { code } of invalid) {
      const { output } = linter.verifyAndFix(code, config);
      expect(linter.verify(output, config)).toEqual([]);
    }
  });
});
