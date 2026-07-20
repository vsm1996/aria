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
 * The inferred intrinsic path is the OTHER half: whatever it decides —
 * report-only for ambiguous content, or a confident role="button" suggestion
 * for an icon-only / short-label element — it is inferred basis, so the gate
 * guarantees it can never become an auto-fix. Only the declared component
 * path below writes anything. That contrast is the whole architecture.
 */
describe('graduation contrast (config bridge, end to end)', () => {
  const CONFIG = { componentSemantics: { DeclaredButton: { role: 'button' as const } } };
  const COMPONENT_USAGE = '<DeclaredButton onClick={handleClick} />';

  it('no matching config: nothing declared, nothing guessed, nothing written', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: [{ code: COMPONENT_USAGE, options: [{}] }],
      invalid: [],
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
 * THE GATE HOLDS ON A REAL RULE. Raising the intrinsic path's confidence did
 * not loosen the gate: a confident case emits a role="button" SUGGESTION, and
 * because its basis is inferred, that suggestion can never be auto-applied.
 * RuleTester proves it (a `suggestions` entry with the added-role output, yet
 * `output: null`); `verifyAndFix` re-proves it directly (nothing written); and
 * the oxlint parity harness proves the same on the other host (oxlint never
 * applies suggestions under --fix). Same discipline as the synthetic
 * gate-misuse test below, on a real rule this time.
 */
describe('confident intrinsic suggestion is a suggestion, never a fix', () => {
  const CONFIDENT = '<div onClick={handleClick}>Save</div>';

  it('RuleTester: a suggestion is offered, but no autofix is applied', () => {
    tester.run('interactive-role-required', interactiveRoleRequired, {
      valid: [],
      invalid: [
        {
          code: CONFIDENT,
          errors: [
            {
              messageId: 'inferButtonRole',
              suggestions: [
                {
                  messageId: 'inferButtonRole',
                  output: '<div role="button" onClick={handleClick}>Save</div>',
                },
              ],
            },
          ],
          output: null, // the fix is a suggestion — never auto-applied
        },
      ],
    });
  });

  it('verifyAndFix writes nothing for the confident inferred case', () => {
    const linter = new Linter();
    const config = {
      plugins: { aria: { rules: { r: interactiveRoleRequired } } },
      rules: { 'aria/r': 'error' },
      languageOptions,
    } as const;
    const messages = linter.verify(CONFIDENT, config);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.messageId).toBe('inferButtonRole');
    expect(messages[0]?.fix).toBeUndefined(); // no host fix —
    expect(messages[0]?.suggestions).toHaveLength(1); // — a suggestion instead
    expect(linter.verifyAndFix(CONFIDENT, config).output).toBe(CONFIDENT); // nothing written
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
