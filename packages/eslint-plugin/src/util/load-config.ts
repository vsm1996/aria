import path from 'node:path';
import type { Rule } from 'eslint';
import { loadAriaConfig, validateAriaConfig, type AriaConfig } from '@aria/config';

/**
 * Acquire the Aria config for a rule invocation. This is host wiring, not
 * rule logic: rules receive the loaded config and call only the pure
 * `resolveComponentSemantic` on it.
 *
 * Precedence:
 *  1. Inline rule options (`{ componentSemantics: ... }`) — deterministic,
 *     used by tests and by users who configure per-lint-config rather than
 *     per-project. Validated with the same loud validator as file configs.
 *  2. File discovery via @aria/config's loader, searching upward from the
 *     linted file's directory. "No config" resolves to null (fall back to
 *     inference); a malformed config throws AriaConfigError, loudly.
 */
export function configForRule(context: Rule.RuleContext): AriaConfig | null {
  const inline = context.options[0];
  if (inline !== undefined) {
    return validateAriaConfig(inline, '<rule options>');
  }
  const filename = context.filename;
  const searchFrom =
    filename && !filename.startsWith('<') ? path.dirname(filename) : process.cwd();
  return loadAriaConfig(searchFrom).config;
}
