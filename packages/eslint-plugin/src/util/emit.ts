import type { Rule } from 'eslint';
import { assertGate, fixKindForBasis, type SemanticSource } from '@aria/core';

export interface EmitOptions {
  /** The node (or token) the diagnostic attaches to. */
  node: Rule.Node;
  /** A messageId defined in the rule's `meta.messages`. */
  messageId: string;
  /** Interpolation data for the message. */
  data?: Record<string, string>;
  /** The semantic basis of this diagnostic. The fix kind is derived from it. */
  basis: SemanticSource;
  /**
   * Optional fix factory. If omitted, the diagnostic is report-only.
   * If present, the basis decides whether it is emitted as an auto-applied `fix`
   * or as a non-applied `suggest`. A rule never makes that choice itself.
   */
  fix?: (fixer: Rule.RuleFixer) => Rule.Fix | Rule.Fix[] | null;
}

/**
 * The single channel through which every Aria rule reports.
 *
 * It maps the declared `basis` to the correct host fix kind via core policy,
 * runs the gate, and then emits an ESLint `fix` (auto) or `suggest` (manual)
 * accordingly. Because the fix kind is derived, not chosen, it is structurally
 * impossible to ship an inferred-basis auto-fix through this helper.
 */
export function emit(context: Rule.RuleContext, options: EmitOptions): void {
  const { node, messageId, data, basis, fix } = options;
  const kind = fix ? fixKindForBasis(basis) : null;

  // Belt and suspenders: the gate also runs in the host. This catches a
  // mis-tagged rule at the source, in tests, before it ever reaches a user.
  assertGate({ basis, fixKind: kind });

  if (!fix) {
    context.report({ node, messageId, ...(data ? { data } : {}) });
    return;
  }

  if (kind === 'auto') {
    context.report({ node, messageId, ...(data ? { data } : {}), fix });
    return;
  }

  context.report({
    node,
    messageId,
    ...(data ? { data } : {}),
    suggest: [{ messageId, ...(data ? { data } : {}), fix }],
  });
}
