import { elementRoles, roles } from 'aria-query';

/**
 * Static role resolution shared by every rule that needs to know what role an
 * element actually conveys. One discipline throughout: anything not statically
 * decidable resolves to null / 'unknown', and callers must stay silent on it.
 */

// Minimal structural types for the JSX nodes the rules read. The host's
// `Rule.Node` union does not include JSX, so we model exactly what we consume.
export interface JSXIdentifier {
  type: 'JSXIdentifier';
  name: string;
}

export interface JSXAttributeNode {
  type: 'JSXAttribute';
  name: { type: 'JSXIdentifier' | 'JSXNamespacedName'; name?: string; range: [number, number] };
  value:
    | { type: 'Literal'; value: unknown; range: [number, number] }
    | { type: string; range: [number, number] }
    | null;
  range: [number, number];
}

export interface JSXSpreadAttributeNode {
  type: 'JSXSpreadAttribute';
}

export interface JSXOpeningElementNode {
  type: 'JSXOpeningElement';
  name: { type: string; name?: string; range: [number, number] };
  attributes: (JSXAttributeNode | JSXSpreadAttributeNode)[];
  parent?: unknown;
}

interface JSXElementNode {
  type: 'JSXElement';
  openingElement: JSXOpeningElementNode;
  parent?: unknown;
}

// What we statically know about one attribute on the element.
export type AttrState =
  | { presence: 'absent' }
  | { presence: 'present'; value: string | null } // null = boolean shorthand or non-string literal
  | { presence: 'unknown' }; // dynamic expression or spread in scope

export type Match = 'yes' | 'no' | 'unknown';

/**
 * The intrinsic (lowercase) tag of an opening element, or null for custom
 * components, member expressions, and namespaced names. Only intrinsic
 * elements have implicit roles; components are the Renge bridge's job.
 */
export function intrinsicTag(node: JSXOpeningElementNode): string | null {
  if (node.name.type !== 'JSXIdentifier' || node.name.name === undefined) return null;
  const tag = node.name.name;
  if (tag[0] === undefined || tag[0] !== tag[0].toLowerCase()) return null;
  return tag;
}

export function hasSpreadAttribute(node: JSXOpeningElementNode): boolean {
  return node.attributes.some((a) => a.type === 'JSXSpreadAttribute');
}

export function getAttrState(
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
 * Is this element removed from (or possibly removed from) the accessibility
 * tree by `aria-hidden`? Such an element exposes no name/role to assistive
 * tech, so name/alt rules do not apply to it. Shared by img-needs-alt and
 * control-needs-name so both exempt aria-hidden the same way.
 *
 * True when aria-hidden is present and not literal `"false"` (boolean
 * shorthand counts as true), or dynamic (could be true → exempt conservatively).
 */
export function isAriaHidden(node: JSXOpeningElementNode, hasSpread: boolean): boolean {
  const state = getAttrState(node, 'aria-hidden', hasSpread);
  if (state.presence === 'absent') return false;
  if (state.presence === 'unknown') return true; // dynamic → could be true
  return state.value === null || state.value.trim().toLowerCase() !== 'false';
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

  const parentHasSpread = hasSpreadAttribute(parent);
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
 * or inherently contextual constraint is 'unknown', which keeps the rules
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
 * caller stays silent.
 */
export function implicitRole(node: JSXOpeningElementNode, tag: string): string | null {
  const hasSpread = hasSpreadAttribute(node);

  let best: { conditions: number; roles: string[] } | null = null;
  // Undecidable candidates, by attribute-condition count. One of these can be
  // safely outranked only by a matched entry with MORE attribute conditions
  // (aria-query entries compose most-specific-first).
  let maxUnknownConditions = -1;

  for (const [concept, conceptRoles] of elementRoles.entries()) {
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
      best = { conditions: conditions.length, roles: [...conceptRoles] };
    } else if (conditions.length === best.conditions) {
      // Equally specific candidates that disagree: ambiguous, stay silent.
      if (
        best.roles.length !== 1 ||
        conceptRoles.size !== 1 ||
        best.roles[0] !== [...conceptRoles][0]
      ) {
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

/**
 * The role the element actually conveys, with full confidence, or null.
 *
 * An explicit literal `role` wins when aria-query recognizes it as a concrete
 * (non-abstract) role. Everything short of that certainty is null: a dynamic
 * or spread-supplied role, a multi-token fallback list, an unrecognized or
 * abstract role name (this resolver reports what IS known, it does not
 * second-guess what the author meant). With no explicit role, falls back to
 * the implicit role, including its own undecidable → null discipline.
 */
export function effectiveRole(node: JSXOpeningElementNode, tag: string): string | null {
  const roleState = getAttrState(node, 'role', hasSpreadAttribute(node));
  if (roleState.presence === 'unknown') return null;
  if (roleState.presence === 'present') {
    if (roleState.value === null) return null;
    const role = roleState.value.trim().toLowerCase();
    if (role === '' || /\s/.test(role)) return null;
    const definition = roles.get(role as Parameters<typeof roles.get>[0]);
    if (definition === undefined || definition.abstract) return null;
    return role;
  }
  return implicitRole(node, tag);
}
