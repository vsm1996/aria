import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { aria } from 'aria-query';
import { emit } from '../util/emit';
import {
  hasSpreadAttribute,
  intrinsicTag,
  type JSXAttributeNode,
  type JSXOpeningElementNode,
} from '../util/resolve-role';

export const ruleMeta: AriaRuleMeta = {
  id: 'aria-syntax-normalize',
  tier: 'format',
  basis: 'native',
  description:
    'Normalize ARIA attribute name casing and enumerated value casing to canonical lowercase.',
  specBasis:
    'WAI-ARIA 1.2 §6.1 / HTML: attribute names are case-insensitive and state/property token values are processed case-insensitively; lowercase is the canonical, lossless form.',
};

// Deliberately OUT of scope (see docs/rule-registry.md):
//  - attribute ordering: order is program semantics in JSX once a spread is
//    present, and pure diff churn without one;
//  - role value casing: role token matching is case-sensitive in practice,
//    so normalizing an unmatched role could newly apply it — a tree change;
//  - multi-token tokenlist values (aria-relevant): out of scope, skipped.

type AriaValueType =
  | 'boolean'
  | 'tristate'
  | 'token'
  | 'tokenlist'
  | 'string'
  | 'number'
  | 'integer'
  | 'id'
  | 'idlist';

/** Allowed lowercase tokens for an attribute, or null when not enumerated. */
function allowedTokens(name: string): ReadonlySet<string> | null {
  const definition = aria.get(name as Parameters<typeof aria.get>[0]);
  if (definition === undefined) return null;
  const type = definition.type as AriaValueType;
  if (type === 'boolean') return new Set(['true', 'false']);
  if (type === 'tristate') return new Set(['true', 'false', 'mixed']);
  if (type === 'token') {
    return new Set((definition.values ?? []).map((v) => String(v)));
  }
  // tokenlist (multi-token), string, number, integer, id, idlist: never touch.
  return null;
}

export const ariaSyntaxNormalize: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: ruleMeta.description },
    fixable: 'code',
    messages: {
      attrNameCase:
        "ARIA attribute '{{attribute}}' should be written '{{normalized}}': attribute names are case-insensitive in HTML and canonically lowercase (WAI-ARIA 1.2 §6.1).",
      valueCase:
        "Value '{{value}}' of '{{attribute}}' should be '{{normalized}}': ARIA token values are processed case-insensitively and canonically lowercase (WAI-ARIA 1.2 §6.1).",
    },
    schema: [],
  },

  create(context) {
    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;

        // Intrinsic elements only. On a component, aria-Hidden is a JS prop
        // name and "True" is a JS prop value — rewriting either changes what
        // the component receives.
        if (intrinsicTag(node) === null) return;

        const hasSpread = hasSpreadAttribute(node);
        const literalNames = new Set<string>();
        for (const attr of node.attributes) {
          if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name) {
            literalNames.add(attr.name.name);
          }
        }

        for (const attr of node.attributes) {
          if (attr.type !== 'JSXAttribute') continue;
          if (attr.name.type !== 'JSXIdentifier' || attr.name.name === undefined) continue;
          const name = attr.name.name;
          const lower = name.toLowerCase();
          if (!lower.startsWith('aria-')) continue;
          // Only names aria-query defines are ours; a typo (aria-lable) is a
          // signal to the human, not something to case-fold into hiding.
          if (!aria.has(lower as Parameters<typeof aria.has>[0])) continue;

          const attrNode: JSXAttributeNode = attr;

          // --- name casing ---------------------------------------------
          // Skip when a spread is present (aria-Label and aria-label are
          // different JS keys until they reach the DOM, so the rename could
          // change which value wins) or when the canonical name already
          // exists (rename would create a duplicate attribute).
          if (name !== lower && !hasSpread && !literalNames.has(lower)) {
            emit(context, {
              node: attrNode as unknown as Rule.Node,
              messageId: 'attrNameCase',
              data: { attribute: name, normalized: lower },
              basis: 'native',
              fix: (fixer) => fixer.replaceTextRange(attrNode.name.range, lower),
            });
          }

          // --- enumerated value casing ---------------------------------
          const value = attrNode.value;
          if (value === null || value.type !== 'Literal') continue;
          const raw = (value as { type: 'Literal'; value: unknown }).value;
          if (typeof raw !== 'string') continue;
          const lowerValue = raw.toLowerCase();
          if (raw === lowerValue) continue;
          const allowed = allowedTokens(lower);
          if (allowed === null || !allowed.has(lowerValue)) continue;

          emit(context, {
            node: attrNode as unknown as Rule.Node,
            messageId: 'valueCase',
            data: { attribute: name, value: raw, normalized: lowerValue },
            basis: 'native',
            // Replace only the span between the quotes; quote style stays.
            fix: (fixer) =>
              fixer.replaceTextRange([value.range[0] + 1, value.range[1] - 1], lowerValue),
          });
        }
      },
    };
  },
};

export default ariaSyntaxNormalize;
