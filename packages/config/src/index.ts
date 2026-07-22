/**
 * Declared semantics for one design-system component. Supplying this is how a
 * design system hands Aria ground truth instead of a guess, which is what lets
 * the matching diagnostics graduate from the lint tier to the format tier
 * (see CLAUDE.md, Implementation Plan §2 and §6 — "the Renge bridge").
 */
export interface ComponentSemantic {
  /**
   * The ARIA role this component renders as. **Descriptive.** Every rule reads
   * this to understand what the component *is* (name-checking, etc.); on its
   * own it never causes a role to be written into source. To have
   * `interactive-role-required` inject `role="…"`, set `injectRole` (below).
   */
  role: string;
  /**
   * Opt in to role INJECTION. When `true`, `interactive-role-required` inserts
   * `role="{role}"` (a declared-basis auto-fix) on a usage of this component
   * that has a click handler and no role. Default `false`: `role` stays purely
   * descriptive.
   *
   * Set this only for a component that renders a NON-semantic element and
   * genuinely needs the role at runtime (a `<div>`-based widget). A component
   * that renders a native control (e.g. an icon button that renders `<button>`)
   * must NOT set it — injecting `role="button"` there is redundant with the
   * native role (the same defect `no-redundant-role` removes), just reached
   * through the config path. See docs/case-study-renge.md (Gap C).
   */
  injectRole?: boolean;
  /** Whether this component must carry an accessible name. */
  requiresName?: boolean;
  /**
   * The prop that carries this component's ACCESSIBLE NAME.
   *
   * Generic on purpose: a design system's naming prop should be declared, not
   * assumed, and it is not always called `alt`. Any rule that needs "does this
   * component have a name" reads this same field — img-needs-alt today,
   * control-needs-name next — via `resolveNameProp` (below), which also
   * supplies the default: `alt` when `role` is `img`, otherwise none.
   */
  nameProp?: string;
  /**
   * Always 'declared'. Config-provided semantics are treated as ground truth,
   * never as a guess. That is the whole point: it moves the basis from
   * 'inferred' to 'declared', and therefore the fix from suggestion to auto.
   */
  source: 'declared';
}

/**
 * The prop that supplies a component's accessible name, or `undefined` when
 * the component has no name-checking basis. Single source of truth for every
 * name-aware rule:
 *  - an explicit `nameProp` always wins;
 *  - otherwise `alt` is the default for an image (`role: 'img'`), preserving
 *    intrinsic `<img>` semantics for declared image components;
 *  - otherwise `undefined` — a non-image component with no declared nameProp
 *    is not name-checkable, so name rules stay silent on it.
 */
export function resolveNameProp(semantic: ComponentSemantic): string | undefined {
  if (semantic.nameProp !== undefined) return semantic.nameProp;
  if (semantic.role === 'img') return 'alt';
  return undefined;
}

export interface AriaConfig {
  /** Map of component name -> its declared semantics. */
  componentSemantics?: Record<string, ComponentSemantic>;
  /** Glob patterns to skip. */
  ignore?: string[];
}

/** Identity helper that gives config files full type-checking and autocomplete. */
export function defineConfig(config: AriaConfig): AriaConfig {
  return config;
}

export { resolveComponentSemantic } from './resolve';
export { AriaConfigError, validateAriaConfig } from './validate';
export { clearAriaConfigCache, loadAriaConfig, type LoadedAriaConfig } from './loader';
