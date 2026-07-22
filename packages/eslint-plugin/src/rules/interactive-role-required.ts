import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { resolveComponentSemantic } from '@aria/config';
import { roles } from 'aria-query';
import { emit } from '../util/emit';
import { configForRule } from '../util/load-config';
import {
  effectiveRole,
  hasSpreadAttribute,
  intrinsicTag,
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

// The first lint-tier rule: detection is a judgment call, so the basis is
// 'inferred' and it lives in the lint tier. `emit` derives the host fix kind
// from the basis; this rule never chooses it. Crucially, an inferred-basis
// fix can ONLY ever become a suggestion — the gate makes an inferred auto-fix
// structurally impossible — so even the "confident" cases below are suggestions
// a human approves, never silent writes. That is a property of the gate, not a
// lint-tier convention: raising confidence cannot loosen it.
//
// Confidence policy (precedent for every lint rule after it). The intrinsic
// path inspects the element's CHILDREN, not just the presence of onClick, and
// sorts into three outcomes:
//
//   SUGGEST role="button" (basis inferred → a suggestion, never auto-applied)
//   for button-like children in one of three narrow shapes, nothing else in
//   the subtree (no dynamic {expression} or fragment children):
//     1a. Short-text-only — a single short action-like text child, no element
//         children (e.g. <div onClick>Save</div>). Deliberately narrow: single
//         text child, trimmed, <= 3 words — not a verb dictionary, a label bar.
//     1b. Icon-only — no text anywhere, exactly one non-interactive intrinsic
//         element child (e.g. <svg>, <i>, <img>), no nested interactive element.
//     1c. Icon + short text — one such element child AND one such short text
//         child (e.g. <div onClick><svg/>Save</div>): the most button-like
//         shape of all, a labelled icon button.
//
//   SILENT — report nothing at all:
//     3. Contains a nested interactive element (a native control, an element
//        with a widget role, or another generic-with-onClick). That is a
//        DIFFERENT bug — invalid nesting of interactive elements — and out of
//        scope for this rule. Suggesting a role on the outer element would
//        compound it, so we stay silent on the outer element entirely. Not an
//        oversight: an explicit non-goal (see docs/rule-registry.md).
//
//   REPORT ONLY — flag, no fix, no suggestion (the shipped behavior):
//     4. Multiple / mixed / structural children with no single-action signal
//        (a card-like image+text+nested mix, several children with their own
//        handlers). Menuitem/tab/etc. need parent context this rule cannot
//        see — a candidate for a future rule, not a guess here.
//     5. Empty element, or only whitespace. Nothing to infer from.
//   Also report-only: anything with an UNKNOWN child (a nested component or a
//   dynamic {expression}) whose contents we cannot resolve — we cannot be
//   confident, but the missing role is still a real finding worth flagging.
//
//   Component path — the config bridge is the one place a KNOWN answer exists.
//   `role` is DESCRIPTIVE; injecting it is opt-in via `injectRole: true` (for a
//   component that renders a non-semantic element and needs the role). Then the
//   basis is 'declared' and the diagnostic carries a real auto-applied fix
//   inserting the role. Without `injectRole`, the role stays descriptive and
//   this rule does nothing (a native-rendering component must not get a
//   redundant role stamped on). An unknown component gets silence, not a guess.

/** Expression forms we can confirm are a real click handler. */
const HANDLER_EXPRESSIONS = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'MemberExpression',
  'CallExpression',
]);

// Minimal JSX child shapes this rule reads (the host union omits JSX).
interface JSXTextNode {
  type: 'JSXText';
  value: string;
}
interface JSXExpressionContainerChild {
  type: 'JSXExpressionContainer';
  expression: { type: string };
}
interface JSXFragmentChild {
  type: 'JSXFragment';
  children: JSXChildNode[];
}
interface JSXElementChild {
  type: 'JSXElement';
  openingElement: JSXOpeningElementNode;
  children: JSXChildNode[];
}
type JSXChildNode =
  | JSXTextNode
  | JSXExpressionContainerChild
  | JSXFragmentChild
  | JSXElementChild
  | { type: string };

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

/** A role is interactive iff its ARIA superclass chain includes `widget`. */
function isWidgetRole(role: string): boolean {
  const definition = roles.get(role as Parameters<typeof roles.get>[0]);
  if (definition === undefined) return false;
  return (definition.superClass ?? []).some((chain) => chain.includes('widget'));
}

/**
 * Interactivity of a single child element, positively determined:
 *  - 'interactive'     : a confirmed widget-role element, or a generic element
 *                        that itself carries a confirmed click handler (another
 *                        would-be-flagged case — invalid nesting).
 *  - 'unknown'         : a component or spread element whose semantics we
 *                        cannot see; could be interactive, so not safe to
 *                        treat as confirmed either way.
 *  - 'non-interactive' : a resolvable non-widget element, or a bare visual
 *                        (svg, img) with no handler.
 */
function elementInteractivity(
  el: JSXOpeningElementNode,
): 'interactive' | 'unknown' | 'non-interactive' {
  const tag = intrinsicTag(el);
  if (tag === null) return 'unknown'; // component / member / namespaced
  if (hasSpreadAttribute(el)) return 'unknown'; // spread could add role or handler
  const role = effectiveRole(el, tag);
  if (role !== null && isWidgetRole(role)) return 'interactive';
  if ((role === null || role === 'generic') && hasConfirmedClickHandler(el)) return 'interactive';
  return 'non-interactive';
}

interface SubtreeScan {
  /** A confirmed interactive element exists somewhere in the subtree. */
  interactive: boolean;
  /** A component or dynamic {expression} exists — contents unresolvable. */
  unknown: boolean;
  /** Any non-whitespace text exists anywhere in the subtree. */
  text: boolean;
}

const isWhitespace = (value: string): boolean => value.trim() === '';

const isMeaningfulText = (child: JSXChildNode): boolean =>
  child.type === 'JSXText' && !isWhitespace((child as JSXTextNode).value);

const isDynamicChild = (child: JSXChildNode): boolean =>
  child.type === 'JSXExpressionContainer' &&
  (child as JSXExpressionContainerChild).expression?.type !== 'JSXEmptyExpression';

function scanSubtree(children: JSXChildNode[], scan: SubtreeScan): void {
  for (const child of children) {
    switch (child.type) {
      case 'JSXText':
        if (!isWhitespace((child as JSXTextNode).value)) scan.text = true;
        break;
      case 'JSXElement': {
        const el = child as JSXElementChild;
        const kind = elementInteractivity(el.openingElement);
        if (kind === 'interactive') scan.interactive = true;
        else if (kind === 'unknown') scan.unknown = true;
        scanSubtree(el.children ?? [], scan);
        break;
      }
      case 'JSXFragment':
        scanSubtree((child as JSXFragmentChild).children ?? [], scan);
        break;
      case 'JSXExpressionContainer':
        if (isDynamicChild(child)) scan.unknown = true;
        break;
      default:
        scan.unknown = true; // JSXSpreadChild and anything unmodelled
    }
  }
}

/** A single, short, label-like text node — the narrow bar for case 2. */
function isShortActionLabel(child: JSXChildNode): boolean {
  if (child.type !== 'JSXText') return false;
  const text = (child as JSXTextNode).value.trim();
  return text.length > 0 && text.length <= 40 && text.split(/\s+/).length <= 3;
}

export const interactiveRoleRequired: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: ruleMeta.description },
    // `fixable` for the component path's declared-basis auto-fix;
    // `hasSuggestions` for the intrinsic path's confident, inferred-basis
    // suggestions. The gate keeps the latter a suggestion, never a fix.
    fixable: 'code',
    hasSuggestions: true,
    messages: {
      missingRole:
        '<{{element}}> has a click handler but no role, so assistive technology cannot tell it is interactive (interactive-role-required; WCAG 2.1 SC 4.1.2). The correct role cannot be inferred automatically — it depends on what this element does; assign one that matches its actual behavior (e.g. button, link, menuitem), or use a native interactive element.',
      inferButtonRole:
        '<{{element}}> has a click handler but no role, so assistive technology cannot tell it is interactive (interactive-role-required; WCAG 2.1 SC 4.1.2). Its contents look button-like — add role="button" (a suggestion to verify, never auto-applied), or use a native <button>.',
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
          // The config bridge: a declared semantic turns this from a guess into
          // ground truth. But `role` is DESCRIPTIVE — injecting it is opt-in
          // (Gap C, docs/case-study-renge.md). Only when the component is
          // declared `injectRole: true` — meaning it renders a non-semantic
          // element that genuinely needs the role — do we insert it (basis
          // 'declared', real auto-fix). Otherwise the role informs other rules
          // (control-needs-name, img-needs-alt) but is never stamped onto
          // source: a native-rendering component (icon button → <button>) must
          // not get a redundant role="button" via the config path.
          const semantic = resolveComponentSemantic(config, name);
          if (semantic === undefined) return; // unknown component: nothing safe to guess
          if (semantic.injectRole !== true) return; // descriptive-only: do not inject
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

        // Inspect the children to decide between confident suggestion, total
        // silence, and report-only (see the confidence policy above).
        const parent = node.parent as { type?: string; children?: JSXChildNode[] } | undefined;
        const children = parent?.type === 'JSXElement' ? (parent.children ?? []) : [];

        const scan: SubtreeScan = { interactive: false, unknown: false, text: false };
        scanSubtree(children, scan);

        // Case 3: a confirmed interactive descendant. That is invalid nesting
        // of interactive elements — a different bug, explicitly out of scope.
        // Stay silent on the outer element rather than compound it.
        if (scan.interactive) return;

        const directText = children.filter(isMeaningfulText);
        const directElements = children.filter((c) => c.type === 'JSXElement');
        const directDynamic = children.filter(isDynamicChild);
        const directFragments = children.filter((c) => c.type === 'JSXFragment');
        const meaningful =
          directText.length + directElements.length + directDynamic.length + directFragments.length;

        const reportOnly = () =>
          emit(context, {
            node: esNode,
            messageId: 'missingRole',
            data: { element: name },
            basis: 'inferred',
          });

        // Case 5: empty or whitespace-only — nothing to infer from.
        if (meaningful === 0) return reportOnly();

        // Unknown contents (a nested component or a dynamic {expression}): we
        // cannot be confident, but the missing role is still worth flagging.
        if (scan.unknown) return reportOnly();

        // From here: no interactive descendant, no unknown contents — every
        // element in the subtree is a non-interactive intrinsic element, and
        // every child is text or such an element.

        // Confident role="button" (cases 1 & 2): the direct children are
        // exactly one of these narrow, button-like shapes, and nothing else
        // (no dynamic {expression} or fragment children):
        //   (a) short-text-only : one short action-like text child, no element;
        //   (b) icon-only       : one non-interactive element child, no text
        //                         anywhere in the subtree;
        //   (c) icon + short text: one such element child AND one short
        //                         action-like text child (e.g. <svg/>Save).
        const noDynamicOrFragment = directDynamic.length === 0 && directFragments.length === 0;
        const oneShortText = directText.length === 1 && isShortActionLabel(directText[0]!);
        const oneElement = directElements.length === 1;

        const confident =
          noDynamicOrFragment &&
          ((oneShortText && directElements.length === 0) || // (a)
            (directText.length === 0 && oneElement && !scan.text) || // (b)
            (oneShortText && oneElement)); // (c)

        if (confident) {
          return emit(context, {
            node: esNode,
            messageId: 'inferButtonRole',
            data: { element: name },
            basis: 'inferred',
            fix: insertRole('button'),
          });
        }

        // Cases 4 & 5: multiple / mixed / structural children, or a non-label
        // text body — genuinely ambiguous. Flag it, propose nothing.
        return reportOnly();
      },
    };
  },
};

export default interactiveRoleRequired;
