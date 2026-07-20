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
  id: 'img-needs-alt',
  // Native basis, lint tier — a DELIBERATE decoupling, like idref-resolves,
  // but for a different reason.
  //
  // basis 'native': "this <img> is exposed as an image and has no accessible
  // name and no decorative signal" is a FACT read straight off the element,
  // not a guess. And unlike idref-resolves there is NO cross-file ambiguity:
  // an image's accessible name can only come from its own attributes (alt,
  // aria-label) or a locally-present aria-labelledby — never silently from
  // another file — so a plain nameless <img> is a clear-cut WCAG 1.1.1
  // violation, not a "maybe fine elsewhere" case.
  //
  // tier 'lint' (NOT the 'format' tierForBasis('native') returns): the only
  // repair is authoring alt text, and inventing asserted content is a hard
  // non-goal (see the plan's Non-Goals: "Aria will not invent label text, alt
  // copy, or descriptions"). So the rule is permanently report-only — it flags
  // the gap and hands the words to a human. It is lint-tier because it is
  // unfixable-by-machine, not because it is uncertain. Surfaced as `warn`,
  // matching the plan's listing of img-needs-alt as native in the lint tier.
  tier: 'lint',
  basis: 'native',
  description:
    'Flag an <img> exposed as an image that has no accessible name and no decorative signal.',
  specBasis:
    'WCAG 2.1 SC 1.1.1 (Non-text Content): images must have a text alternative. An empty alt="" or role="presentation"/"none" is the valid way to mark an image decorative.',
};

/** Is the attribute present in any form (literal, dynamic, or shorthand)? */
function isPresent(node: JSXOpeningElementNode, name: string, hasSpread: boolean): boolean {
  return getAttrState(node, name, hasSpread).presence !== 'absent';
}

export const imgNeedsAlt: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: ruleMeta.description },
    // No `fixable` / `hasSuggestions`: report-only. Aria cannot author the
    // alt text, and there is no other safe repair, so it proposes none.
    messages: {
      imgNeedsAlt:
        '<img> has no alt attribute and no accessible name or decorative signal, so assistive technology cannot convey it (img-needs-alt; WCAG 2.1 SC 1.1.1). Add alt text describing the image, alt="" if it is purely decorative, or role="presentation". Aria cannot write the text for you.',
    },
    schema: [],
  },

  create(context) {
    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;

        // Intrinsic <img> only. Components (e.g. <Image />) render opaque
        // internals — silent by default, and the config bridge cannot resolve
        // their alt-equivalent prop yet (schema gap; see docs/rule-registry.md).
        if (intrinsicTag(node) !== 'img') return;

        const hasSpread = hasSpreadAttribute(node);
        // A spread could supply alt or any decorative/name signal we can't see.
        if (hasSpread) return;

        // Any accessible-name mechanism present → the author addressed naming.
        // `alt` in ANY form counts: alt="" is a deliberate decorative marker,
        // alt="text" is a name, alt={expr} is unevaluable (don't guess).
        if (isPresent(node, 'alt', hasSpread)) return;
        if (isPresent(node, 'aria-label', hasSpread)) return;
        if (isPresent(node, 'aria-labelledby', hasSpread)) return;

        // Role override: presentation/none are decorative (silent); a dynamic
        // role could be either (silent); any other explicit role means the
        // element is no longer exposed as an image, so alt is not this rule's
        // concern (silent). Only an implicit img, or an explicit role="img",
        // remains in scope.
        const roleState = getAttrState(node, 'role', hasSpread);
        if (roleState.presence === 'unknown') return;
        if (roleState.presence === 'present') {
          if (roleState.value === null) return; // non-string role value — cannot judge
          if (roleState.value.trim().toLowerCase() !== 'img') return;
        }

        // aria-hidden removes the element from the accessibility tree, so it
        // needs no name — UNLESS it is explicitly "false". A dynamic value
        // could be true, so stay silent on it.
        const hiddenState = getAttrState(node, 'aria-hidden', hasSpread);
        if (hiddenState.presence === 'unknown') return;
        if (hiddenState.presence === 'present') {
          // Boolean shorthand (`aria-hidden`) or "true" → hidden. Only literal
          // "false" leaves the image exposed.
          if (hiddenState.value === null || hiddenState.value.trim().toLowerCase() !== 'false') {
            return;
          }
        }

        // An image exposed as an image with no name and no decorative signal.
        emit(context, {
          node: esNode,
          messageId: 'imgNeedsAlt',
          basis: 'native',
        });
      },
    };
  },
};

export default imgNeedsAlt;
