import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import controlNeedsName from './control-needs-name';
import { invalid, ruleOptions, valid } from './control-needs-name.fixtures';

/**
 * The canonical suite for control-needs-name. Most cases live in the shared
 * fixtures module (also run by the oxlint parity harness). Cases that would
 * trip OTHER rules in the parity harness — an aria-labelledby left
 * intentionally unresolved (idref-resolves' concern) — are kept here as
 * single-rule RuleTester cases.
 */

const languageOptions = {
  ecmaVersion: 2022,
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

const tester = new RuleTester({ languageOptions });

describe('control-needs-name', () => {
  it('passes RuleTester (shared fixtures)', () => {
    tester.run('control-needs-name', controlNeedsName, {
      valid: valid.map((code) => ({ code, options: ruleOptions })),
      invalid: invalid.map((fixture) => ({ ...fixture, options: ruleOptions })),
    });
  });

  it('an unresolved aria-labelledby supplies no name, so the control is still flagged', () => {
    tester.run('control-needs-name', controlNeedsName, {
      valid: [],
      invalid: [
        {
          // "ghost" resolves to no in-file id and there is no dynamic id, so
          // labelledby provides no name — the button is nameless.
          code: '<button aria-labelledby="ghost"><svg /></button>',
          errors: [{ messageId: 'controlNeedsName', data: { element: 'button', role: 'button' } }],
          output: null,
        },
      ],
    });
  });
});
