import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { emit } from '../util/emit';

export const ruleMeta: AriaRuleMeta = {
  id: 'idref-resolves',
  // DELIBERATE basis/tier decoupling — the first rule where they diverge.
  //
  // basis 'native': whether a literal idref resolves against the file's
  // literal `id`s is a FACT read straight off the source, not a guess. That is
  // why the diagnostic can state it plainly and why, if a repair were ever
  // auto-applied, it would be gate-eligible.
  //
  // tier 'lint' (NOT the 'format' that tierForBasis('native') returns): the
  // rule is report-only and advisory, for two reasons. (1) There is no single
  // safe repair — delete the reference? fix a typo? add the missing id
  // elsewhere? — so it never auto-fixes. (2) "Not found in THIS file" is not
  // conclusively a bug: an idref may legitimately point at an id defined in
  // another file or injected at runtime, which an in-file check cannot see.
  // Failing CI on that would be a false positive on correct code — the one
  // thing the format tier must never do. So this is surfaced as a warning a
  // human confirms, not a build-breaking error. The plan anticipates exactly
  // this by listing idref-resolves as `native` in the lint tier.
  tier: 'lint',
  basis: 'native',
  description:
    'Flag aria-labelledby / aria-describedby / aria-controls references to an id not present in the file.',
  specBasis:
    'WAI-ARIA 1.2 §7: IDREF/IDREF_LIST properties (aria-labelledby, aria-describedby, aria-controls) MUST reference elements that exist. This checks resolution within the current file only.',
};

const IDREF_ATTRIBUTES = new Set(['aria-labelledby', 'aria-describedby', 'aria-controls']);

// Minimal JSX attribute shapes this rule reads (the host union omits JSX).
interface AttrValueLiteral {
  type: 'Literal';
  value: unknown;
}
interface AttrValueExpressionContainer {
  type: 'JSXExpressionContainer';
  expression: { type: string; value?: unknown };
}
interface JSXAttributeNode {
  type: 'JSXAttribute';
  name: { type: string; name?: string };
  value: AttrValueLiteral | AttrValueExpressionContainer | { type: string } | null;
}

/**
 * Marker for an expression we cannot evaluate (`id={computed}`). A unique
 * symbol, NOT a sentinel string — a literal value could itself be any string.
 */
const DYNAMIC = Symbol('dynamic');

/**
 * The statically-known string value of an attribute, or a marker:
 *  - a string        : a literal value (`id="x"` or `id={'x'}`);
 *  - DYNAMIC         : an expression we cannot evaluate (`id={computed}`);
 *  - null            : absent, boolean shorthand, or a non-string literal.
 */
function staticStringValue(
  value: JSXAttributeNode['value'],
): string | typeof DYNAMIC | null {
  if (value === null) return null;
  if (value.type === 'Literal') {
    const v = (value as AttrValueLiteral).value;
    return typeof v === 'string' ? v : null;
  }
  if (value.type === 'JSXExpressionContainer') {
    const expression = (value as AttrValueExpressionContainer).expression;
    if (expression.type === 'Literal' && typeof expression.value === 'string') {
      return expression.value;
    }
    return DYNAMIC;
  }
  return DYNAMIC;
}

export const idrefResolves: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: ruleMeta.description },
    // No `fixable` / `hasSuggestions`: report-only. There is no single safe
    // repair for a broken reference, so the rule never proposes one.
    messages: {
      unresolvedIdref:
        '{{attribute}} references id "{{id}}", but no element in this file has id="{{id}}" (idref-resolves; WAI-ARIA 1.2 §7). Check for a typo or a missing id. In-file check only — an id defined in another file or injected at runtime is not seen.',
    },
    schema: [],
  },

  create(context) {
    // Ids are global to the DOM, and a reference may point forward, so we
    // collect the whole file before resolving anything on Program:exit.
    const definedIds = new Set<string>();
    let hasDynamicId = false;
    const references: { node: JSXAttributeNode; attribute: string; ids: string[] }[] = [];

    return {
      JSXAttribute(esNode: Rule.Node) {
        const node = esNode as unknown as JSXAttributeNode;
        if (node.name.type !== 'JSXIdentifier' || node.name.name === undefined) return;
        const attrName = node.name.name;

        if (attrName === 'id') {
          const value = staticStringValue(node.value);
          if (value === DYNAMIC) hasDynamicId = true;
          else if (value !== null) definedIds.add(value);
          return;
        }

        if (IDREF_ATTRIBUTES.has(attrName)) {
          const value = staticStringValue(node.value);
          // Dynamic or non-string values cannot be checked — stay silent.
          if (typeof value !== 'string') return;
          const ids = value.split(/\s+/).filter((token) => token.length > 0);
          if (ids.length > 0) references.push({ node, attribute: attrName, ids });
        }
      },

      'Program:exit'() {
        // A dynamic id anywhere could resolve to any literal reference at
        // runtime, so we cannot prove ANY literal reference is unresolved.
        // Fail safe: stay silent for the whole file. (False negatives are
        // acceptable here; a false positive on correct code is not.)
        if (hasDynamicId) return;

        for (const reference of references) {
          for (const id of reference.ids) {
            // idref matching is case-sensitive, like getElementById — so a
            // case mismatch is a genuine non-resolution, reported like any other.
            if (definedIds.has(id)) continue;
            emit(context, {
              node: reference.node as unknown as Rule.Node,
              messageId: 'unresolvedIdref',
              data: { attribute: reference.attribute, id },
              basis: 'native',
            });
          }
        }
      },
    };
  },
};

export default idrefResolves;
