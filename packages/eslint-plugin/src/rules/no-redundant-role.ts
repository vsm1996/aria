import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { emit } from '../util/emit';
import {
  implicitRole,
  intrinsicTag,
  type JSXAttributeNode,
  type JSXOpeningElementNode,
} from '../util/resolve-role';

export const ruleMeta: AriaRuleMeta = {
  id: 'no-redundant-role',
  tier: 'format',
  basis: 'native',
  description:
    "Remove an explicit ARIA role that duplicates the host element's implicit role.",
  specBasis:
    'WAI-ARIA / ARIA in HTML: an explicit role equal to the element’s implicit role is redundant and should be removed (no ARIA is better than redundant ARIA).',
};

export const noRedundantRole: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: ruleMeta.description },
    fixable: 'code',
    messages: {
      redundantRole:
        "Role '{{role}}' is redundant: it matches the implicit role of <{{element}}>. Remove it.",
    },
    schema: [],
  },

  create(context) {
    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;

        // Only intrinsic (lowercase) elements have implicit roles. Custom
        // components are the Renge bridge's job, not this rule's.
        const tag = intrinsicTag(node);
        if (tag === null) return;

        // Find a literal `role` attribute. Dynamic values are not statically
        // known and must be left alone.
        const roleAttr = node.attributes.find(
          (a): a is JSXAttributeNode =>
            a.type === 'JSXAttribute' &&
            a.name.type === 'JSXIdentifier' &&
            a.name.name === 'role',
        );
        if (!roleAttr || roleAttr.value === null || roleAttr.value.type !== 'Literal') {
          return;
        }
        const roleValue = (roleAttr.value as { type: 'Literal'; value: unknown }).value;
        if (typeof roleValue !== 'string') return;
        const role = roleValue.trim().toLowerCase();
        // Multiple role tokens involve fallback semantics; out of scope here.
        if (role === '' || /\s/.test(role)) return;

        if (role !== implicitRole(node, tag)) return;

        // Remove the attribute plus the whitespace before it, so
        // `<button role="button">` becomes `<button>`, not `<button >`.
        const sourceCode = context.sourceCode;
        const tokenBefore = sourceCode.getTokenBefore(
          roleAttr as unknown as Parameters<typeof sourceCode.getTokenBefore>[0],
        );
        const start = tokenBefore ? tokenBefore.range[1] : roleAttr.range[0];

        emit(context, {
          node: roleAttr as unknown as Rule.Node,
          messageId: 'redundantRole',
          data: { role, element: tag },
          basis: 'native',
          fix: (fixer) => fixer.removeRange([start, roleAttr.range[1]]),
        });
      },
    };
  },
};

export default noRedundantRole;
