import type { FixKind, SemanticSource, Tier } from './types';

/**
 * The basis -> tier policy. Native and declared semantics are known, so they may
 * be format-tier. Inferred semantics are guesses, so they are lint-tier.
 *
 * This function is the entire policy. Everything downstream derives from it.
 */
export function tierForBasis(basis: SemanticSource): Tier {
  switch (basis) {
    case 'native':
    case 'declared':
      return 'format';
    case 'inferred':
      return 'lint';
    default: {
      // Exhaustiveness guard: if SemanticSource grows, this fails to compile.
      const _exhaustive: never = basis;
      return _exhaustive;
    }
  }
}

/**
 * The basis -> host fix kind policy. A fix is auto-applied only when its basis is
 * format-tier (native or declared). Inferred-basis fixes are suggestions.
 *
 * Rules never choose their fix kind directly. They declare a basis and the kind
 * follows from policy. This is what makes the gate impossible to forget.
 */
export function fixKindForBasis(basis: SemanticSource): FixKind {
  return tierForBasis(basis) === 'format' ? 'auto' : 'suggestion';
}

/** Thrown when a rule tries to emit an auto-applied fix for an inferred guess. */
export class AriaGateViolation extends Error {
  constructor(
    readonly basis: SemanticSource,
    readonly fixKind: FixKind,
  ) {
    super(
      `Gate violation: a '${fixKind}' fix was emitted for '${basis}' basis. ` +
        `Auto-applied fixes require 'native' or 'declared' basis. ` +
        `An inferred-basis diagnostic must be a suggestion, never an auto-fix.`,
    );
    this.name = 'AriaGateViolation';
  }
}

export interface GateInput {
  basis: SemanticSource;
  /** `null` means report-only (no fix, no suggestion). */
  fixKind: FixKind | null;
}

/**
 * The gate. The one rule the whole product must never break:
 * an auto-applied fix is allowed only on format-tier (native|declared) basis.
 * Suggestions and report-only diagnostics are always allowed, on any basis.
 */
export function isGateSafe({ basis, fixKind }: GateInput): boolean {
  if (fixKind === 'auto') {
    return tierForBasis(basis) === 'format';
  }
  return true;
}

/** Throwing form of {@link isGateSafe}, used by the emit helpers in the plugin. */
export function assertGate(input: GateInput): void {
  if (!isGateSafe(input)) {
    // `fixKind` is necessarily 'auto' here, since that is the only unsafe case.
    throw new AriaGateViolation(input.basis, input.fixKind as FixKind);
  }
}
