/**
 * Shared in-file idref resolution semantics, used by idref-resolves (which
 * reports unresolved references) and control-needs-name (which asks whether an
 * aria-labelledby actually supplies a name). One source of truth for the
 * dynamic-id fail-safe: a dynamic `id={…}` anywhere could resolve to any
 * literal reference at runtime, so a literal token that matches no literal id
 * is only *provably* unresolved when the file has no dynamic id at all.
 */

export type IdrefResolution =
  | 'resolved' // a literal id in the file matches this token
  | 'unresolved' // no literal id matches AND there is no dynamic id to explain it
  | 'unknown'; // no literal match, but a dynamic id could resolve it at runtime

export function resolveIdref(
  token: string,
  definedIds: ReadonlySet<string>,
  hasDynamicId: boolean,
): IdrefResolution {
  if (definedIds.has(token)) return 'resolved';
  if (hasDynamicId) return 'unknown';
  return 'unresolved';
}
