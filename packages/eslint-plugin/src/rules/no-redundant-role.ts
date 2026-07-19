import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { elementRoles } from 'aria-query';
import { emit } from '../util/emit';

export const ruleMeta: AriaRuleMeta = {
  id: 'no-redundant-role',
  tier: 'format',
  basis: 'native',
  description:
    "Remove an explicit ARIA role that duplicates the host element's implicit role.",
  specBasis:
    'WAI-ARIA / ARIA in HTML: an explicit role equal to the element’s implicit role is redundant and should be removed (no ARIA is better than redundant ARIA).',
};

// Minimal structural types for the JSX nodes this rule reads. The host's
// `Rule.Node` union does not include JSX, so we model exactly what we consume.
interface JSXIdentifier {
  type: 'JSXIdentifier';
  name: string;
}

interface JSXAttributeNode {
  type: 'JSXAttribute';
  name: { type: 'JSXIdentifier' | 'JSXNamespacedName'; name?: string };
  value:
    | { type: 'Literal'; value: unknown }
    | { type: string }
    | null;
  range: [number, number];
}

interface JSXSpreadAttributeNode {
  type: 'JSXSpreadAttribute';
}

interface JSXOpeningElementNode {
  type: 'JSXOpeningElement';
  name: { type: string; name?: string };
  attributes: (JSXAttributeNode | JSXSpreadAttributeNode)[];
  parent?: unknown;
}

interface JSXElementNode {
  type: 'JSXElement';
  openingElement: JSXOpeningElementNode;
  parent?: unknown;
}

// What we statically know about one attribute on the element.
type AttrState =
  | { presence: 'absent' }
  | { presence: 'present'; value: string | null } // null = boolean shorthand or non-string literal
  | { presence: 'unknown' }; // dynamic expression or spread in scope

type Match = 'yes' | 'no' | 'unknown';

function getAttrState(
  node: JSXOpeningElementNode,
  attrName: string,
  hasSpread: boolean,
): AttrState {
  for (const attr of node.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    if (attr.name.type !== 'JSXIdentifier' || attr.name.name !== attrName) continue;
    if (attr.value === null) return { presence: 'present', value: null };
    if (attr.value.type === 'Literal') {
      const v = (attr.value as { type: 'Literal'; value: unknown }).value;
      return { presence: 'present', value: typeof v === 'string' ? v : null };
    }
    // Dynamic value: present, but its value (and even runtime presence, for
    // `href={maybeUndefined}`) is not statically known.
    return { presence: 'unknown' };
  }
  // A spread could supply the attribute at runtime.
  return hasSpread ? { presence: 'unknown' } : { presence: 'absent' };
}

/**
 * Evaluate one aria-query attribute condition against the element.
 * Conditions come in three forms: an exact `value` match, a `set` constraint
 * (attribute present with a value), and an `undefined` constraint (absent).
 */
function matchCondition(
  state: AttrState,
  condition: { name: string; value?: string | number; constraints?: readonly string[] },
): Match {
  if (state.presence === 'unknown') return 'unknown';

  if (condition.value !== undefined) {
    if (state.presence === 'absent') return 'no';
    if (state.value === null) return 'unknown';
    return state.value === String(condition.value) ? 'yes' : 'no';
  }
  if (condition.constraints?.includes('undefined')) {
    return state.presence === 'absent' ? 'yes' : 'no';
  }
  if (condition.constraints?.includes('set')) {
    if (state.presence === 'absent') return 'no';
    return state.value === '' ? 'no' : 'yes';
  }
  // Bare condition: attribute merely present.
  return state.presence === 'present' ? 'yes' : 'no';
}

/**
 * Walk from an opening element to its nearest enclosing JSX *element*,
 * looking through fragments (fragment children are direct DOM children of the
 * fragment's parent). Returns null when the chain leaves pure JSX — a wrapping
 * expression, a callback (`items.map(...)`), or the top of the file — because
 * the runtime ancestor is then not statically known.
 */
function nearestJSXElementParent(node: JSXOpeningElementNode): JSXOpeningElementNode | null {
  let current = node.parent as { type?: string; parent?: unknown } | undefined;
  // node.parent is the JSXElement this tag opens; start from ITS parent.
  current = current?.parent as { type?: string; parent?: unknown } | undefined;
  while (current) {
    if (current.type === 'JSXElement') {
      return (current as unknown as JSXElementNode).openingElement;
    }
    if (current.type !== 'JSXFragment') return null;
    current = current.parent as { type?: string; parent?: unknown } | undefined;
  }
  return null;
}

/**
 * Is `node` statically a direct child of an intrinsic `<targetTag>` whose
 * list semantics are intact? 'yes' only when the parent is visibly that tag
 * with no spread and no role override (an explicit `role="list"` is fine;
 * `role="presentation"` on a list re-roles its items, so anything else kills
 * the constraint). A component boundary, fragment root, or dynamic wrapper is
 * 'unknown': the runtime parent could still be the target via composition.
 */
function matchDirectDescendantOf(node: JSXOpeningElementNode, targetTag: string): Match {
  const parent = nearestJSXElementParent(node);
  if (parent === null) return 'unknown';
  if (parent.name.type !== 'JSXIdentifier' || parent.name.name === undefined) return 'unknown';
  const parentTag = parent.name.name;
  if (parentTag[0] !== undefined && parentTag[0] !== parentTag[0].toLowerCase()) {
    return 'unknown'; // component boundary
  }
  if (parentTag !== targetTag) return 'no';

  const parentHasSpread = parent.attributes.some((a) => a.type === 'JSXSpreadAttribute');
  const roleState = getAttrState(parent, 'role', parentHasSpread);
  if (roleState.presence === 'unknown') return 'unknown';
  if (roleState.presence === 'present') {
    // role="list" restates the implicit role; anything else re-roles the list
    // and its items, so the descendant constraint no longer grants listitem.
    if (roleState.value === null) return 'unknown';
    return roleState.value.trim().toLowerCase() === 'list' ? 'yes' : 'no';
  }
  return 'yes';
}

const DIRECT_DESCENDANT = /^direct descendant of (\w+)$/;

/**
 * Evaluate one concept-level constraint string from aria-query. These are
 * prose conditions ("direct descendant of ul", "scoped to the body element").
 * Only the ones we can resolve statically return yes/no; every unrecognized
 * or inherently contextual constraint is 'unknown', which keeps the rule
 * silent. New constraint strings in future aria-query versions therefore
 * fail safe by construction.
 */
function matchConceptConstraint(
  node: JSXOpeningElementNode,
  constraint: string,
  hasSpread: boolean,
): Match {
  const direct = DIRECT_DESCENDANT.exec(constraint);
  if (direct && direct[1] !== undefined) {
    return matchDirectDescendantOf(node, direct[1]);
  }
  if (constraint === 'the list attribute is not set') {
    const state = getAttrState(node, 'list', hasSpread);
    if (state.presence === 'unknown') return 'unknown';
    return state.presence === 'absent' ? 'yes' : 'no';
  }
  // 'scoped to the body element', 'ancestor table element has grid role', …:
  // ancestor context we cannot see from a JSX fragment. Undecidable.
  return 'unknown';
}

/**
 * Resolve the implicit role of an intrinsic element from aria-query's
 * element→role truth table, honoring both attribute conditions and
 * concept-level ancestor constraints. Returns null when there is no implicit
 * role or when it cannot be determined statically — uncertainty means the
 * rule stays silent.
 */
function implicitRole(node: JSXOpeningElementNode, tag: string): string | null {
  const hasSpread = node.attributes.some((a) => a.type === 'JSXSpreadAttribute');

  let best: { conditions: number; roles: string[] } | null = null;
  // Undecidable candidates, by attribute-condition count. One of these can be
  // safely outranked only by a matched entry with MORE attribute conditions
  // (aria-query entries compose most-specific-first).
  let maxUnknownConditions = -1;

  for (const [concept, roles] of elementRoles.entries()) {
    if (concept.name !== tag) continue;
    const conditions = concept.attributes ?? [];

    let match: Match = 'yes';

    // A bare <th> maps to columnheader in aria-query, but HTML-AAM makes th's
    // role positional (columnheader / rowheader / cell by table context) — the
    // table under-encodes the condition, so acting on it could change meaning.
    // Treat the unconditioned entry as undecidable; the scope="..." entries
    // below stay decidable.
    if (tag === 'th' && conditions.length === 0 && (concept.constraints ?? []).length === 0) {
      match = 'unknown';
    }

    for (const condition of conditions) {
      if (match === 'no') break;
      const state = getAttrState(node, condition.name, hasSpread);
      const m = matchCondition(state, condition);
      if (m === 'no') match = 'no';
      else if (m === 'unknown') match = 'unknown';
    }

    // Concept-level constraints are alternatives: the entry applies when any
    // one of them holds (e.g. li is listitem in ol OR ul OR menu).
    const conceptConstraints = concept.constraints ?? [];
    if (match !== 'no' && conceptConstraints.length > 0) {
      let group: Match = 'no';
      for (const constraint of conceptConstraints) {
        const m = matchConceptConstraint(node, constraint, hasSpread);
        if (m === 'yes') {
          group = 'yes';
          break;
        }
        if (m === 'unknown') group = 'unknown';
      }
      if (group === 'no') match = 'no';
      else if (group === 'unknown' && match === 'yes') match = 'unknown';
    }

    if (match === 'no') continue;
    if (match === 'unknown') {
      maxUnknownConditions = Math.max(maxUnknownConditions, conditions.length);
      continue;
    }

    // Most attribute conditions wins: <a href> ('link') over bare <a> ('generic').
    if (best === null || conditions.length > best.conditions) {
      best = { conditions: conditions.length, roles: [...roles] };
    } else if (conditions.length === best.conditions) {
      // Equally specific candidates that disagree: ambiguous, stay silent.
      if (best.roles.length !== 1 || roles.size !== 1 || best.roles[0] !== [...roles][0]) {
        return null;
      }
    }
  }

  if (best === null || best.roles.length !== 1) return null;
  // An undecidable entry at (or above) the winner's specificity could name a
  // different role. Do not guess.
  if (maxUnknownConditions >= best.conditions) return null;
  return best.roles[0] ?? null;
}

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
        if (node.name.type !== 'JSXIdentifier') return;
        const tag = (node.name as unknown as JSXIdentifier).name;
        if (tag[0] === undefined || tag[0] !== tag[0].toLowerCase()) return;

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
