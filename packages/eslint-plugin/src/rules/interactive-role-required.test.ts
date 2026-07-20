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
 * The inferred half of the contract — a suggestion that surfaces but is
 * never auto-applied — is proven on the intrinsic element in the same test,
 * because for unknown components we chose silence over guessing (see the
 * registry's confidence-policy note; the component's rendered output is
 * invisible from the call site).
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

  it('no matching config, intrinsic element: inferred basis surfaces as a suggestion and is NEVER auto-applied', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: [],
      invalid: [
        {
          code: INTRINSIC_USAGE,
          options: [{}],
          errors: [
            {
              messageId: 'missingRole',
              suggestions: [
                {
                  messageId: 'missingRole',
                  output: '<div role="button" onClick={handleClick}>x</div>',
                },
              ],
            },
          ],
          // null = RuleTester asserts NO autofix was applied.
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
