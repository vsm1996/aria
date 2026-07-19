import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { aria, roles } from 'aria-query';
import { emit } from '../util/emit';
import {
  effectiveRole,
  intrinsicTag,
  type JSXAttributeNode,
  type JSXOpeningElementNode,
} from '../util/resolve-role';

export const ruleMeta: AriaRuleMeta = {
  id: 'no-unsupported-aria',
  tier: 'format',
  basis: 'native',
  description:
    "Remove aria-* attributes that WAI-ARIA does not support on the element's resolved role.",
  specBasis:
    'WAI-ARIA 1.2 §6.5 / ARIA in HTML: states and properties not supported on a role are ignored by user agents; removing them changes nothing in the accessibility tree.',
};

/**
 * ARIA attributes exempt from this rule on every role.
 *
 * Base: aria-query's own global list — the props of the abstract base role
 * `roletype`, which every concrete role inherits. Extended with the four
 * attributes ARIA 1.2 narrowed from global (1.1) to role-specific: that
 * reclassification is debatable in practice (browsers still map them
 * broadly), and debatable means we do not enforce it by deletion.
 */
const GLOBAL_ARIA: ReadonlySet<string> = new Set([
  ...Object.keys(roles.get('roletype')?.props ?? {}),
  'aria-disabled',
  'aria-invalid',
  'aria-errormessage',
  'aria-haspopup',
]);

// Attribute names aria-query defines at all. An aria-* name outside this set
// (a typo, a made-up attribute) is a signal to the human, not ours to delete.
const KNOWN_ARIA: ReadonlySet<string> = new Set<string>([...aria.keys()]);

// Fail safe: if a future aria-query stops modeling `roletype`, the global
// list above would silently shrink to the four extras and this rule would
// start stripping genuinely-global attributes. Refuse to run instead.
const GLOBALS_RESOLVED = roles.get('roletype') !== undefined;

export const noUnsupportedAria: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: ruleMeta.description },
    fixable: 'code',
    messages: {
      unsupportedAria:
        "'{{attribute}}' is not supported by role '{{role}}' of <{{element}}>: WAI-ARIA defines no such property for the role, so user agents ignore it. Remove it.",
    },
    schema: [],
  },

  create(context) {
    if (!GLOBALS_RESOLVED) return {};

    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;

        const tag = intrinsicTag(node);
        if (tag === null) return;

        // Full-confidence role or nothing: dynamic/spread/multi-token roles,
        // unrecognized or abstract explicit roles, and undecidable implicit
        // roles all resolve to null, and every aria-* stays untouched.
        const role = effectiveRole(node, tag);
        if (role === null) return;
        const definition = roles.get(role as Parameters<typeof roles.get>[0]);
        if (definition === undefined) return;
        const supported = definition.props;

        for (const attr of node.attributes) {
          if (attr.type !== 'JSXAttribute') continue;
          if (attr.name.type !== 'JSXIdentifier' || attr.name.name === undefined) continue;
          const name = attr.name.name;
          if (!name.startsWith('aria-')) continue;
          if (GLOBAL_ARIA.has(name)) continue;
          if (!KNOWN_ARIA.has(name)) continue;
          if (Object.prototype.hasOwnProperty.call(supported, name)) continue;

          // One discrete removal per attribute: the attribute plus the
          // whitespace before it, same mechanics as no-redundant-role.
          const attrNode: JSXAttributeNode = attr;
          const sourceCode = context.sourceCode;
          const tokenBefore = sourceCode.getTokenBefore(
            attrNode as unknown as Parameters<typeof sourceCode.getTokenBefore>[0],
          );
          const start = tokenBefore ? tokenBefore.range[1] : attrNode.range[0];

          emit(context, {
            node: attrNode as unknown as Rule.Node,
            messageId: 'unsupportedAria',
            data: { attribute: name, role, element: tag },
            basis: 'native',
            fix: (fixer) => fixer.removeRange([start, attrNode.range[1]]),
          });
        }
      },
    };
  },
};

export default noUnsupportedAria;
