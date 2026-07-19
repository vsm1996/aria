/**
 * Declared semantics for one design-system component. Supplying this is how a
 * design system hands Aria ground truth instead of a guess, which is what lets
 * the matching diagnostics graduate from the lint tier to the format tier
 * (see CLAUDE.md, Implementation Plan §2 and §6 — "the Renge bridge").
 */
export interface ComponentSemantic {
  /** The ARIA role this component renders as. */
  role: string;
  /** Whether this component must carry an accessible name. */
  requiresName?: boolean;
  /**
   * Always 'declared'. Config-provided semantics are treated as ground truth,
   * never as a guess. That is the whole point: it moves the basis from
   * 'inferred' to 'declared', and therefore the fix from suggestion to auto.
   */
  source: 'declared';
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

// PHASE 4: a cosmiconfig-based loader (search for aria.config.{ts,js,json}, .ariarc)
// lands here. Phase 0 only needs the schema and defineConfig.
