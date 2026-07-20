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

  it('exempts aria-hidden controls regardless of focusability (BUG 2)', () => {
    // These are focusable AND aria-hidden — aria-hidden-not-focusable's
    // concern, NOT this rule's. control-needs-name must stay silent (there is
    // no accessible name to require on a hidden element). Proven here in
    // isolation, since a focusable aria-hidden element trips
    // aria-hidden-not-focusable and so can't be a shared parity fixture.
    tester.run('control-needs-name', controlNeedsName, {
      valid: [
        { code: '<button aria-hidden="true"></button>' },
        { code: '<input aria-hidden="true" type="text" />' },
        { code: '<textarea aria-hidden></textarea>' },
        // Boolean-false is not hidden → still required to have a name.
      ],
      invalid: [
        {
          code: '<button aria-hidden="false"><svg /></button>',
          errors: [{ messageId: 'controlNeedsName', data: { element: 'button', role: 'button' } }],
          output: null,
        },
      ],
    });
  });
});
