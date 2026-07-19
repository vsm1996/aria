import type { SemanticSource, Tier } from './types';

/**
 * Declarative metadata every Aria rule must expose, so a reviewer can read the
 * tier and basis of a rule without reading its body (see plan, section 8).
 */
export interface AriaRuleMeta {
  /** Stable rule id, e.g. 'no-redundant-role'. */
  id: string;
  /** The tier this rule operates in. Must agree with `tierForBasis(basis)`. */
  tier: Tier;
  /** The semantic basis of this rule's fixes. */
  basis: SemanticSource;
  /** One-line human description. */
  description: string;
  /** The ARIA / HTML-AAM citation that justifies the rule. */
  specBasis: string;
}
