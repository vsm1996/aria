import { Linter, RuleTester } from 'eslint';
import type { Rule } from 'eslint';
import { describe, expect, it } from 'vitest';
import { AriaGateViolation, assertGate } from '@aria/core';
import interactiveRoleRequired from './interactive-role-required';
import { invalid, ruleOptions, valid } from './interactive-role-required.fixtures';
import { emit } from '../util/emit';

const languageOptions = {
  ecmaVersion: 2022,
  parserOptions: { ecmaFeatures: { jsx: true } },
} as const;

const tester = new RuleTester({ languageOptions });

describe('interactive-role-required', () => {
  it('passes RuleTester', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: valid.map((code) => ({ code, options: ruleOptions })),
      invalid: invalid.map(({ code, errors, output }) => ({
        code,
        errors,
        output,
        options: ruleOptions,
      })),
    });
  });
});

/**
 * THE GRADUATION CONTRAST — the end-to-end proof of the architecture.
 *
 * One component usage, tested twice. Without a matching componentSemantics
 * entry the engine has only a guess available and (for an unknown component)
 * deliberately stays SILENT — nothing is reported and nothing is ever
 * written. With the entry, the SAME code produces a declared-basis
 * diagnostic whose fix is genuinely auto-applied: config turned a guess into
 * ground truth and the emitted fix kind flipped with it.
 *
 * The inferred half of the contract — a located diagnostic that surfaces but
 * carries nothing to apply — is proven on the intrinsic element below. That
 * path is REPORT ONLY by design: unlike a config-declared component, the
 * correct role for a bare generic element depends on what it is for (its
 * text, its icon, whether it wraps other interactive elements), which the
 * rule cannot see, so there is no single defensible role to suggest. It lost
 * the role="button" suggestion it originally shipped with precisely because
 * that suggestion implied an intent the rule does not actually know.
 */
describe('graduation contrast (config bridge, end to end)', () => {
  const CONFIG = { componentSemantics: { DeclaredButton: { role: 'button' as const } } };
  const COMPONENT_USAGE = '<DeclaredButton onClick={handleClick} />';
  const INTRINSIC_USAGE = '<div onClick={handleClick}>x</div>';

  it('no matching config: nothing declared, nothing guessed, nothing written', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: [{ code: COMPONENT_USAGE, options: [{}] }],
      invalid: [],
    });
  });

  it('intrinsic element: inferred basis is REPORT ONLY — no fix, no suggestion, nothing auto-applied', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: [],
      invalid: [
        {
          code: INTRINSIC_USAGE,
          options: [{}],
          // No `suggestions` key: RuleTester asserts the diagnostic offers
          // none. `output: null` asserts no autofix was applied either.
          errors: [{ messageId: 'missingRole' }],
          output: null,
        },
      ],
    });
  });

  it('matching config: the SAME usage becomes declared basis with a real, auto-applied fix', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: [],
      invalid: [
        {
          code: COMPONENT_USAGE,
          options: [CONFIG],
          errors: [{ messageId: 'declaredRoleMissing' }],
          output: '<DeclaredButton role="button" onClick={handleClick} />',
        },
      ],
    });
  });
});

/**
 * GATE PROOF — misuse attempt. emit derives the fix kind from the basis, so
 * a rule cannot even ask for an inferred auto-fix; and the core gate throws
 * if anything ever tries to pair them. Both facts asserted here.
 */
describe('the gate refuses an inferred auto-fix', () => {
  it('emit turns an inferred-basis fix into a suggestion, never a host fix', () => {
    const misusedRule: Rule.RuleModule = {
      meta: {
        type: 'suggestion',
        hasSuggestions: true,
        fixable: 'code',
        messages: { m: 'inferred diagnostic' },
        schema: [],
      },
      create(context) {
        return {
          JSXOpeningElement(node: Rule.Node) {
            // A rule author "trying" to auto-fix an inference: the closest
            // possible misuse is passing basis 'inferred' with a fix. emit
            // structurally downgrades it to a suggestion.
            emit(context, {
              node,
              messageId: 'm',
              basis: 'inferred',
              fix: (fixer) => fixer.insertTextAfter(node, '!'),
            });
          },
        };
      },
    };

    const linter = new Linter();
    const config = {
      plugins: { aria: { rules: { misused: misusedRule } } },
      rules: { 'aria/misused': 'error' },
      languageOptions,
    } as const;
    const code = '<div onClick={x}>y</div>';
    const messages = linter.verify(code, config);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.fix).toBeUndefined(); // no host fix —
    expect(messages[0]?.suggestions).toHaveLength(1); // — a suggestion instead
    expect(linter.verifyAndFix(code, config).output).toBe(code); // nothing written
  });

  it('the core gate throws on an inferred auto-fix pairing', () => {
    expect(() => assertGate({ basis: 'inferred', fixKind: 'auto' })).toThrow(AriaGateViolation);
  });
});
