/**
 * Where the semantics behind an accessibility fact came from.
 *
 *  - `native`   : the implicit role/semantics of a real HTML element, per aria-query,
 *                 or explicit author ARIA that we only read (never invent).
 *  - `declared` : component semantics supplied by config (see @aria/config). Ground truth.
 *  - `inferred` : a guess the engine made from signals (onClick, class names, context).
 *
 * This is the single most important type in the system. The central invariant
 * (see ARIA_IMPLEMENTATION_PLAN.md, section 2) is expressed entirely in terms of it.
 */
export type SemanticSource = 'native' | 'declared' | 'inferred';

/**
 * Which tier a diagnostic belongs to.
 *
 *  - `format` : meaning-preserving. May carry an auto-applied fix. Runs on save. Gates CI.
 *  - `lint`   : inference. Located errors and suggestions. Never silently applied.
 */
export type Tier = 'format' | 'lint';

/**
 * How a fix is surfaced to the host (ESLint / oxlint / Biome).
 *
 *  - `auto`       : an auto-applied fix  (ESLint `fix` / Biome `fix_kind: "safe"`).
 *  - `suggestion` : surfaced, never auto-applied (ESLint `suggest` / Biome `"unsafe"`).
 *
 * A `null` fix kind means report-only: a diagnostic with no fix and no suggestion.
 */
export type FixKind = 'auto' | 'suggestion';
