import type { Rule } from 'eslint';
import type { AriaRuleMeta } from '@aria/core';
import { resolveComponentSemantic, resolveNameProp } from '@aria/config';
import { emit } from '../util/emit';
import { resolveIdref } from '../util/file-ids';
import { configForRule } from '../util/load-config';
import {
  effectiveRole,
  getAttrState,
  hasSpreadAttribute,
  intrinsicTag,
  type JSXOpeningElementNode,
} from '../util/resolve-role';

export const ruleMeta: AriaRuleMeta = {
  id: 'control-needs-name',
  // Native basis, lint tier — the same decoupling as img-needs-alt, for the
  // same reason. "No accessible name found by any in-file check" is a FACT
  // (mechanical, read off the file), so the basis is 'native'; but the only
  // repair is authoring label text, a hard non-goal, so the rule is
  // permanently report-only (no fix, ever, on the intrinsic path). It is
  // lint-tier because it is unfixable-by-machine, not because it is uncertain.
  //
  // The component path (a config-declared control) emits basis 'declared' —
  // the control-ness and its name prop are config ground truth — and is still
  // report-only, exactly like img-needs-alt's component path. Declared basis
  // does not imply a fix.
  tier: 'lint',
  basis: 'native',
  description:
    'Flag an interactive control (button, link, form field, or declared control component) that has no accessible name.',
  specBasis:
    'WCAG 2.1 SC 4.1.2 (Name, Role, Value): every user-interface component must expose an accessible name. A placeholder is not a name (it disappears on input).',
};

// v1 element scope, kept deliberately tight (see docs/rule-registry.md):
//   'content'     — named by text content or ARIA: <button>, <a href>, and
//                   anything the shared resolver calls role button / link.
//   'formControl' — named by a <label> or ARIA (NOT text content, NOT a
//                   placeholder): <input> of a name-needing type, <textarea>,
//                   <select>.
// Out of scope for v1 (flagged, not silently expanded): input type=number
// (spinbutton) and type=range (slider); input button-types (submit/reset/
// button/image — value/alt-named, a different mechanism); every other ARIA
// widget role (tab, menuitem, switch, …).
type ControlKind = 'content' | 'formControl';

const CONTENT_ROLES: ReadonlySet<string> = new Set(['button', 'link']);
const FORM_CONTROL_INPUT_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
]);

function controlKind(node: JSXOpeningElementNode, tag: string): ControlKind | null {
  // <select> resolves to null in the shared resolver; <textarea> to textbox.
  // Gate them by tag so the scope is stable regardless of resolver coverage.
  if (tag === 'textarea' || tag === 'select') return 'formControl';
  if (tag === 'input') {
    return FORM_CONTROL_INPUT_ROLES.has(effectiveRole(node, tag) ?? '') ? 'formControl' : null;
  }
  return CONTENT_ROLES.has(effectiveRole(node, tag) ?? '') ? 'content' : null;
}

// --- minimal JSX child shapes (the host union omits JSX) --------------------
interface JSXTextNode {
  type: 'JSXText';
  value: string;
}
interface JSXElementChild {
  type: 'JSXElement';
  openingElement: JSXOpeningElementNode;
  children: JSXChildNode[];
}
type JSXChildNode = JSXTextNode | JSXElementChild | { type: string; children?: JSXChildNode[] };

type NameSignal = 'named' | 'none' | 'unknown';

/** Merge check results: any 'named' wins; else any 'unknown' → silent. */
function fold(signals: NameSignal[]): NameSignal {
  if (signals.includes('named')) return 'named';
  if (signals.includes('unknown')) return 'unknown';
  return 'none';
}

/** Non-whitespace text, or an unresolvable child (dynamic/component), anywhere. */
function subtreeText(children: JSXChildNode[]): NameSignal {
  let unknown = false;
  const walk = (nodes: JSXChildNode[]): boolean => {
    for (const child of nodes) {
      if (child.type === 'JSXText') {
        if ((child as JSXTextNode).value.trim() !== '') return true;
      } else if (child.type === 'JSXElement') {
        const el = child as JSXElementChild;
        const name = el.openingElement.name;
        // A component child could render text; a dynamic expression too.
        if (name.type !== 'JSXIdentifier' || name.name === undefined) unknown = true;
        else if (name.name[0] !== undefined && name.name[0] !== name.name[0].toLowerCase()) {
          unknown = true;
        }
        if (walk(el.children ?? [])) return true;
      } else if (child.type === 'JSXFragment') {
        if (walk((child as { children?: JSXChildNode[] }).children ?? [])) return true;
      } else if (child.type === 'JSXExpressionContainer') {
        unknown = true; // {expr} could be text
      }
    }
    return false;
  };
  if (walk(children)) return 'named';
  return unknown ? 'unknown' : 'none';
}

/** aria-label: a non-empty literal string is a name; dynamic is unknown. */
function ariaLabelSignal(node: JSXOpeningElementNode, hasSpread: boolean): NameSignal {
  const state = getAttrState(node, 'aria-label', hasSpread);
  if (state.presence === 'unknown') return 'unknown';
  if (state.presence === 'present') {
    if (state.value === null) return 'unknown'; // non-string literal — cannot judge
    return state.value.trim() !== '' ? 'named' : 'none'; // "" is not a name
  }
  return 'none';
}

/** aria-labelledby supplies a name only if at least one token resolves in-file. */
function ariaLabelledbySignal(
  node: JSXOpeningElementNode,
  hasSpread: boolean,
  definedIds: ReadonlySet<string>,
  hasDynamicId: boolean,
): NameSignal {
  const state = getAttrState(node, 'aria-labelledby', hasSpread);
  if (state.presence === 'unknown') return 'unknown';
  if (state.presence !== 'present' || state.value === null) {
    return state.presence === 'present' ? 'unknown' : 'none';
  }
  const tokens = state.value.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return 'none';
  const resolutions = tokens.map((t) => resolveIdref(t, definedIds, hasDynamicId));
  if (resolutions.includes('resolved')) return 'named'; // a resolved id gives a name
  if (resolutions.includes('unknown')) return 'unknown'; // a dynamic id might resolve it
  return 'none'; // every token is provably unresolved → supplies no name
}

export const controlNeedsName: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: ruleMeta.description },
    // Report-only: Aria cannot author label text, so it proposes no fix.
    messages: {
      controlNeedsName:
        '<{{element}}> is an interactive control ({{role}}) with no accessible name, so assistive technology cannot announce it (control-needs-name; WCAG 2.1 SC 4.1.2). Add text content, aria-label, or an associated <label>. A placeholder is not a name. Aria cannot write it for you.',
      componentControlNeedsName:
        '<{{component}}> is declared as a control (componentSemantics) with no accessible name: its "{{prop}}" prop is absent and there is no other name (control-needs-name; WCAG 2.1 SC 4.1.2). Set {{prop}}, or add aria-label. Aria cannot write it for you.',
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

    // Whole-file collection: ids can be referenced forward, and label
    // associations span the file, so resolve on Program:exit.
    const definedIds = new Set<string>();
    let hasDynamicId = false;
    const labelForTargets = new Set<string>();
    let hasDynamicLabelFor = false;

    interface PendingIntrinsic {
      node: Rule.Node;
      raw: JSXOpeningElementNode;
      tag: string;
      kind: ControlKind;
    }
    interface PendingComponent {
      node: Rule.Node;
      raw: JSXOpeningElementNode;
      name: string;
      nameProp: string;
    }
    const intrinsics: PendingIntrinsic[] = [];
    const components: PendingComponent[] = [];

    /** Walk ancestors for a literal `<label>` element wrapping this control. */
    function isInsideLabel(node: JSXOpeningElementNode): boolean {
      let current = (node as { parent?: unknown }).parent as
        | { type?: string; openingElement?: JSXOpeningElementNode; parent?: unknown }
        | undefined;
      while (current) {
        if (
          current.type === 'JSXElement' &&
          current.openingElement?.name.type === 'JSXIdentifier' &&
          current.openingElement.name.name === 'label'
        ) {
          return true;
        }
        current = (current as { parent?: unknown }).parent as typeof current;
      }
      return false;
    }

    function formControlLabelSignal(node: JSXOpeningElementNode, hasSpread: boolean): NameSignal {
      if (isInsideLabel(node)) return 'named';
      const idState = getAttrState(node, 'id', hasSpread);
      if (idState.presence === 'unknown') return 'unknown'; // dynamic id might be a label target
      if (idState.presence === 'present' && typeof idState.value === 'string' && idState.value !== '') {
        if (labelForTargets.has(idState.value)) return 'named';
        if (hasDynamicLabelFor) return 'unknown'; // a dynamic htmlFor might target this id
      }
      return 'none';
    }

    return {
      JSXOpeningElement(esNode: Rule.Node) {
        const node = esNode as unknown as JSXOpeningElementNode;
        const hasSpread = hasSpreadAttribute(node);

        // --- collect ids (for labelledby resolution) ---
        const idState = getAttrState(node, 'id', hasSpread);
        if (idState.presence === 'unknown') hasDynamicId = true;
        else if (idState.presence === 'present' && typeof idState.value === 'string' && idState.value !== '') {
          definedIds.add(idState.value);
        }

        const tag = intrinsicTag(node);

        // --- collect <label htmlFor> targets (for form-control association) ---
        if (tag === 'label') {
          for (const attrName of ['htmlFor', 'for']) {
            const forState = getAttrState(node, attrName, hasSpread);
            if (forState.presence === 'unknown') hasDynamicLabelFor = true;
            else if (forState.presence === 'present' && typeof forState.value === 'string' && forState.value !== '') {
              labelForTargets.add(forState.value);
            }
          }
        }

        // A spread could carry any name signal we cannot see — never flag.
        if (hasSpread) return;

        if (tag !== null) {
          const kind = controlKind(node, tag);
          if (kind !== null) intrinsics.push({ node: esNode, raw: node, tag, kind });
          return;
        }

        // Component path: config-declared control with a resolvable name prop.
        if (node.name.type !== 'JSXIdentifier' || node.name.name === undefined) return;
        const name = node.name.name;
        const isComponent = name[0] !== undefined && name[0] !== name[0].toLowerCase();
        if (!isComponent) return;
        const semantic = resolveComponentSemantic(config, name);
        if (semantic === undefined) return;
        // Only control roles are this rule's concern; an image (img-needs-alt's
        // job) or any non-control role stays silent here.
        if (!CONTENT_ROLES.has(semantic.role) && !FORM_CONTROL_INPUT_ROLES.has(semantic.role)) {
          return;
        }
        const nameProp = resolveNameProp(semantic);
        if (nameProp === undefined) return; // no declared name prop → no basis to check
        components.push({ node: esNode, raw: node, name, nameProp });
      },

      'Program:exit'() {
        for (const control of intrinsics) {
          const hasSpread = false; // spread-bearing controls were skipped
          const checks: NameSignal[] = [
            ariaLabelSignal(control.raw, hasSpread),
            ariaLabelledbySignal(control.raw, hasSpread, definedIds, hasDynamicId),
          ];
          if (control.kind === 'content') {
            const parent = (control.raw as { parent?: { children?: JSXChildNode[] } }).parent;
            checks.push(subtreeText(parent?.children ?? []));
          } else {
            checks.push(formControlLabelSignal(control.raw, hasSpread));
          }
          if (fold(checks) === 'none') {
            emit(context, {
              node: control.node,
              messageId: 'controlNeedsName',
              data: { element: control.tag, role: effectiveRole(control.raw, control.tag) ?? control.tag },
              basis: 'native',
            });
          }
        }

        for (const control of components) {
          const propState = getAttrState(control.raw, control.nameProp, false);
          let propSignal: NameSignal;
          if (propState.presence === 'unknown') propSignal = 'unknown';
          else if (propState.presence === 'present') {
            propSignal = propState.value === null || propState.value.trim() !== '' ? 'named' : 'none';
          } else propSignal = 'none';

          const parent = (control.raw as { parent?: { children?: JSXChildNode[] } }).parent;
          const signal = fold([
            propSignal,
            ariaLabelSignal(control.raw, false),
            ariaLabelledbySignal(control.raw, false, definedIds, hasDynamicId),
            subtreeText(parent?.children ?? []),
          ]);
          if (signal === 'none') {
            emit(context, {
              node: control.node,
              messageId: 'componentControlNeedsName',
              data: { component: control.name, prop: control.nameProp },
              basis: 'declared',
            });
          }
        }
      },
    };
  },
};

export default controlNeedsName;
