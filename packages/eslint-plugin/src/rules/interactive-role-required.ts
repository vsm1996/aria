import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { resolveComponentSemantic } from '@aria/config';
import { emit } from '../util/emit';
import { configForRule } from '../util/load-config';
import {
  effectiveRole,
  hasSpreadAttribute,
  type JSXAttributeNode,
  type JSXOpeningElementNode,
} from '../util/resolve-role';

export const ruleMeta: AriaRuleMeta = {
  id: 'interactive-role-required',
  tier: 'lint',
  basis: 'inferred',
  description:
    'A non-semantic element or declared component with a click handler must convey an interactive role.',
  specBasis:
    'WCAG 2.1 SC 4.1.2 (Name, Role, Value): user interface components must expose a role. A generic element with a click handler exposes none.',
};

// The first lint-tier rule: detection is a judgment call, so the default
// basis is 'inferred' and the default surface is a SUGGESTION the human
// approves — never an auto-fix. The one exception is the config bridge:
// when componentSemantics declares the component's role, the basis is
// 'declared' and the same diagnostic carries a real auto-applied fix.
// `emit` derives the fix kind from the basis; this rule never chooses it.
//
// Confidence policy (precedent for every lint rule after it): ONE clearly
// defensible default suggestion — role="button" on a bare generic element —
// or silence. No ranked guesses from weak signals (class names, siblings,
// parent context). An unknown custom component gets silence, not a guess:
// its rendered output is invisible from the call site and may already be a
// native <button>.

/** Expression forms we can confirm are a real click handler. */
const HANDLER_EXPRESSIONS = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'MemberExpression',
  'CallExpression',
]);

function hasConfirmedClickHandler(node: JSXOpeningElementNode): boolean {
  for (const attr of node.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== 'onClick') continue;
    const value = attr.value;
    if (value === null || value.type !== 'JSXExpressionContainer') return false;
    const expression = (value as { expression?: { type?: string; name?: string } }).expression;
    if (expression?.type === 'Identifier') return expression.name !== 'undefined';
    return expression?.type !== undefined && HANDLER_EXPRESSIONS.has(expression.type);
  }
  return false;
}

function hasRoleAttribute(node: JSXOpeningElementNode): boolean {
  return node.attributes.some(
    (a): a is JSXAttributeNode =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'role',
  );
}

export const interactiveRoleRequired: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: ruleMeta.description },
    fixable: 'code',
    hasSuggestions: true,
    messages: {
      missingRole:
        '<{{element}}> has a click handler but no role, so assistive technology cannot tell it is interactive (interactive-role-required; WCAG 2.1 SC 4.1.2). Suggestion: role="button" — or better, a native <button>.',
      declaredRoleMissing:
        "<{{component}}> is declared as role '{{role}}' via componentSemantics, but this usage carries no role attribute (interactive-role-required; basis: declared).",
    },
    schema: [
      {
        type: 'object',
        properties: {
          componentSemantics: { type: 'object' },
          ignore: { type: 'array' },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const config = configForRule(context);

    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;

        if (node.name.type !== 'JSXIdentifier' || node.name.name === undefined) return;
        const name = node.name.name;

        // An explicit role (any value form) means the author addressed it;
        // a spread could carry a role or a handler we cannot see. Silent.
        if (hasRoleAttribute(node)) return;
        if (hasSpreadAttribute(node)) return;
        if (!hasConfirmedClickHandler(node)) return;

        const insertRole = (role: string) => (fixer: Rule.RuleFixer) =>
          fixer.insertTextAfterRange(node.name.range, ` role="${role}"`);

        const isComponent = name[0] !== undefined && name[0] !== name[0].toLowerCase();
        if (isComponent) {
          // The config bridge: a declared semantic turns this from a guess
          // into ground truth — basis 'declared', real auto-applied fix.
          const semantic = resolveComponentSemantic(config, name);
          if (semantic === undefined) return; // unknown component: nothing safe to guess
          emit(context, {
            node: esNode,
            messageId: 'declaredRoleMissing',
            data: { component: name, role: semantic.role },
            basis: 'declared',
            fix: insertRole(semantic.role),
          });
          return;
        }

        // Intrinsic path: only a confidently-resolved 'generic' element
        // (div, span, bare a). Real semantics (heading, link, textbox …)
        // and undecidable roles stay silent.
        if (effectiveRole(node, name) !== 'generic') return;

        emit(context, {
          node: esNode,
          messageId: 'missingRole',
          data: { element: name },
          basis: 'inferred',
          fix: insertRole('button'),
        });
      },
    };
  },
};

export default interactiveRoleRequired;
