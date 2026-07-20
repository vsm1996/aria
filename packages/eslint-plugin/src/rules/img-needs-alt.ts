import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { resolveComponentSemantic, resolveNameProp } from '@aria/config';
import { emit } from '../util/emit';
import { configForRule } from '../util/load-config';
import {
  getAttrState,
  hasSpreadAttribute,
  intrinsicTag,
  isAriaHidden,
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
  //
  // The config path (a declared image-equivalent component) emits basis
  // 'declared' instead — the component's image-ness is config ground truth,
  // not native HTML — but it is still report-only, since Aria still cannot
  // author the name. (Declared basis does not imply an auto-fix; it means
  // known semantics, which here remain unfixable-by-machine.)
  tier: 'lint',
  basis: 'native',
  description:
    'Flag an <img> (or a declared image-equivalent component) that has no accessible name and no decorative signal.',
  specBasis:
    'WCAG 2.1 SC 1.1.1 (Non-text Content): images must have a text alternative. An empty alt="" or role="presentation"/"none" is the valid way to mark an image decorative.',
};

/** Is the attribute present in any form (literal, dynamic, or shorthand)? */
function isPresent(node: JSXOpeningElementNode, name: string, hasSpread: boolean): boolean {
  return getAttrState(node, name, hasSpread).presence !== 'absent';
}

/**
 * Does this usage carry a name, a decorative signal, or a "not exposed as an
 * image" signal — anything that makes the missing name a non-issue? Shared by
 * the intrinsic `<img>` path (nameProp = 'alt') and the declared-component
 * path (nameProp = the component's declared accessible-name prop). Evaluated
 * conservatively: a present, dynamic, or spread-supplied signal all silence.
 */
function hasNameOrDecorativeSignal(
  node: JSXOpeningElementNode,
  hasSpread: boolean,
  nameProp: string,
): boolean {
  // A spread could carry any of the signals below.
  if (hasSpread) return true;

  // Accessible-name mechanisms (any form counts): the name prop itself
  // (empty = decorative, non-empty = a name, dynamic = unevaluable), or ARIA.
  if (isPresent(node, nameProp, hasSpread)) return true;
  if (isPresent(node, 'aria-label', hasSpread)) return true;
  if (isPresent(node, 'aria-labelledby', hasSpread)) return true;

  // Role override: presentation/none are decorative; a dynamic role could be
  // either; any other explicit role means it is no longer exposed as an image
  // (alt is then out of scope). Only an absent role or explicit role="img"
  // stays in scope.
  const roleState = getAttrState(node, 'role', hasSpread);
  if (roleState.presence === 'unknown') return true;
  if (roleState.presence === 'present') {
    if (roleState.value === null) return true; // non-string role value — cannot judge
    if (roleState.value.trim().toLowerCase() !== 'img') return true;
  }

  // aria-hidden removes the element from the accessibility tree, so it needs
  // no name (shared with control-needs-name via isAriaHidden).
  if (isAriaHidden(node, hasSpread)) return true;

  return false;
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
      componentImgNeedsAlt:
        '<{{component}}> is declared as an image (componentSemantics) but has no accessible name: its "{{prop}}" prop is absent and there is no decorative signal (img-needs-alt; WCAG 2.1 SC 1.1.1). Set {{prop}} to a description, or {{prop}}="" if it is decorative. Aria cannot write the text for you.',
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

        // Intrinsic <img>: the accessible-name prop is always `alt`.
        if (intrinsicTag(node) === 'img') {
          const hasSpread = hasSpreadAttribute(node);
          if (!hasNameOrDecorativeSignal(node, hasSpread, 'alt')) {
            emit(context, { node: esNode, messageId: 'imgNeedsAlt', basis: 'native' });
          }
          return;
        }

        // Config bridge: a component declared as an image-equivalent. Its
        // accessible-name prop comes from config (resolveNameProp: an explicit
        // `nameProp`, else `alt` for a `role: 'img'` entry). No matching
        // config, or a non-image declaration, stays silent.
        if (node.name.type !== 'JSXIdentifier' || node.name.name === undefined) return;
        const name = node.name.name;
        const isComponent = name[0] !== undefined && name[0] !== name[0].toLowerCase();
        if (!isComponent) return; // other intrinsic tags are not this rule's concern

        const semantic = resolveComponentSemantic(config, name);
        if (semantic === undefined || semantic.role !== 'img') return;
        const nameProp = resolveNameProp(semantic);
        if (nameProp === undefined) return; // defensive: role 'img' always yields one

        const hasSpread = hasSpreadAttribute(node);
        if (!hasNameOrDecorativeSignal(node, hasSpread, nameProp)) {
          emit(context, {
            node: esNode,
            messageId: 'componentImgNeedsAlt',
            data: { component: name, prop: nameProp },
            basis: 'declared',
          });
        }
      },
    };
  },
};

export default imgNeedsAlt;
