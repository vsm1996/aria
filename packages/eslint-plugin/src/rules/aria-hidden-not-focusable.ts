import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { emit } from '../util/emit';
import {
  getAttrState,
  hasSpreadAttribute,
  intrinsicTag,
  type JSXOpeningElementNode,
} from '../util/resolve-role';

export const ruleMeta: AriaRuleMeta = {
  id: 'aria-hidden-not-focusable',
  // Native basis, lint tier — the SAME decoupling as the other Phase 3 lint
  // rules, but for a THIRD distinct reason. The detection ("aria-hidden=true on
  // a focusable element, or on a subtree containing one") is a mechanical fact
  // → native. It is lint-tier / report-only NOT because it is uncertain
  // (idref-resolves) and NOT because it is unfixable-by-machine
  // (img-needs-alt / control-needs-name), but because MULTIPLE valid,
  // intent-dependent repairs exist and Aria refuses to pick between them:
  // remove the aria-hidden (the element should be perceivable), add
  // tabindex="-1" (it should stay hidden but out of the tab order), or move the
  // focusable content out of the hidden subtree. Which is correct depends on
  // intent the tool cannot see, so it flags and names the options.
  tier: 'lint',
  basis: 'native',
  description:
    'Flag aria-hidden="true" on a focusable element, or on a subtree that contains one (a focusable ghost).',
  specBasis:
    'WAI-ARIA 1.2 (aria-hidden state): an element that is focusable must not have aria-hidden="true"; and all content inside an aria-hidden subtree is removed from the accessibility tree, so a focusable descendant becomes reachable but invisible to assistive tech.',
};

type Tri = 'yes' | 'no' | 'unknown';
const INTEGER = /^-?\d+$/;

// --- minimal JSX child shapes (the host union omits JSX) --------------------
interface JSXElementChild {
  type: 'JSXElement';
  openingElement: JSXOpeningElementNode;
  children: JSXChildNode[];
}
type JSXChildNode = JSXElementChild | { type: string; children?: JSXChildNode[] };

/** Is `aria-hidden` statically true on this element? */
function ariaHiddenTrue(node: JSXOpeningElementNode, hasSpread: boolean): Tri {
  const state = getAttrState(node, 'aria-hidden', hasSpread);
  if (state.presence === 'absent') return 'no';
  if (state.presence === 'unknown') return 'unknown'; // aria-hidden={cond}
  if (state.value === null) return 'yes'; // boolean shorthand `aria-hidden` = true
  return state.value.trim().toLowerCase() === 'true' ? 'yes' : 'no';
}

/**
 * Can this element receive focus? 'yes' = tab-focusable, 'no' = not (including
 * the deliberate tabindex="-1" de-focus pattern), 'unknown' = a dynamic value
 * (or a component) we cannot evaluate. A literal tabindex overrides native
 * focusability: >= 0 focusable, -1 not.
 */
function isFocusable(node: JSXOpeningElementNode): Tri {
  const tag = intrinsicTag(node);
  if (tag === null) return 'unknown'; // component — could render a focusable element
  const hasSpread = hasSpreadAttribute(node);
  // A spread could carry a tabindex that changes focusability either way.
  if (hasSpread) return 'unknown';

  const ti = getAttrState(node, 'tabindex', hasSpread);
  if (ti.presence === 'unknown') return 'unknown'; // tabindex={expr}
  if (ti.presence === 'present') {
    if (ti.value === null) return 'unknown';
    const raw = ti.value.trim();
    if (INTEGER.test(raw)) return Number(raw) >= 0 ? 'yes' : 'no';
    // A non-integer tabindex is ignored by user agents → fall through to native.
  }

  if (tag === 'button' || tag === 'select' || tag === 'textarea') return 'yes';
  if (tag === 'a') {
    const href = getAttrState(node, 'href', hasSpread);
    if (href.presence === 'absent') return 'no';
    if (href.presence === 'unknown') return 'unknown'; // href={maybeUndefined}
    return 'yes';
  }
  if (tag === 'input') {
    const type = getAttrState(node, 'type', hasSpread);
    if (type.presence === 'unknown') return 'unknown';
    if (
      type.presence === 'present' &&
      typeof type.value === 'string' &&
      type.value.trim().toLowerCase() === 'hidden'
    ) {
      return 'no';
    }
    return 'yes';
  }
  return 'no';
}

/** The first definitely-focusable descendant's tag, or a status. */
function scanFocusableDescendant(
  children: JSXChildNode[],
): { status: Tri; tag?: string } {
  let unknown = false;
  let foundTag: string | undefined;

  const walk = (nodes: JSXChildNode[]): boolean => {
    for (const child of nodes) {
      if (child.type === 'JSXElement') {
        const el = child as JSXElementChild;
        const focus = isFocusable(el.openingElement);
        if (focus === 'yes') {
          const name = el.openingElement.name;
          foundTag = name.type === 'JSXIdentifier' ? name.name : undefined;
          return true;
        }
        if (focus === 'unknown') unknown = true;
        if (walk(el.children ?? [])) return true;
      } else if (child.type === 'JSXFragment') {
        if (walk((child as { children?: JSXChildNode[] }).children ?? [])) return true;
      } else if (child.type === 'JSXExpressionContainer') {
        unknown = true; // {expr} could render focusable content
      }
    }
    return false;
  };

  if (walk(children)) return { status: 'yes', tag: foundTag };
  return { status: unknown ? 'unknown' : 'no' };
}

export const ariaHiddenNotFocusable: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: ruleMeta.description },
    // Report-only: multiple valid, intent-dependent repairs exist and Aria
    // refuses to pick, so it proposes no fix or suggestion (see the docblock).
    messages: {
      focusableHidden:
        '<{{element}}> has aria-hidden="true" but is focusable, so keyboard and screen-reader users can still reach it while assistive tech cannot describe it — a focusable ghost (aria-hidden-not-focusable; WAI-ARIA 1.2). Remove aria-hidden if it should be perceivable, or add tabindex="-1" if it should stay hidden and out of the tab order. Aria will not choose.',
      focusableDescendantHidden:
        '<{{element}}> has aria-hidden="true" but its hidden subtree still contains a focusable element (<{{descendant}}>), a focusable ghost (aria-hidden-not-focusable; WAI-ARIA 1.2). Remove aria-hidden, make the descendant non-focusable (tabindex="-1"), or move it out of the hidden subtree. Aria will not choose.',
    },
    schema: [],
  },

  create(context) {
    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;

        // Intrinsic elements only. A component with aria-hidden is deferred:
        // we cannot see whether it renders a focusable element (see the
        // registry). Inside a hidden subtree, a component descendant is handled
        // as 'unknown' by the scan below.
        if (intrinsicTag(node) === null) return;
        const hasSpread = hasSpreadAttribute(node);

        if (ariaHiddenTrue(node, hasSpread) !== 'yes') return;

        const tag = intrinsicTag(node)!;

        // The element itself is focusable → the direct-element bug.
        if (isFocusable(node) === 'yes') {
          emit(context, {
            node: esNode,
            messageId: 'focusableHidden',
            data: { element: tag },
            basis: 'native',
          });
          return;
        }

        // Otherwise (self not focusable, or self undecidable): a focusable
        // descendant is a bug regardless of the container's own focusability.
        const parent = (node as { parent?: { children?: JSXChildNode[] } }).parent;
        const descendant = scanFocusableDescendant(parent?.children ?? []);
        if (descendant.status === 'yes') {
          emit(context, {
            node: esNode,
            messageId: 'focusableDescendantHidden',
            data: { element: tag, descendant: descendant.tag ?? 'element' },
            basis: 'native',
          });
        }
      },
    };
  },
};

export default ariaHiddenNotFocusable;
