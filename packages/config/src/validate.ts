import type { AriaConfig, ComponentSemantic } from './index';

/**
 * A broken config file must never be indistinguishable from "no config":
 * every schema violation throws this, loudly, with the file and the reason.
 */
export class AriaConfigError extends Error {
  constructor(source: string, reason: string) {
    super(`Invalid Aria config at ${source}: ${reason}`);
    this.name = 'AriaConfigError';
  }
}

const TOP_LEVEL_KEYS = new Set(['componentSemantics', 'ignore']);
const SEMANTIC_KEYS = new Set(['role', 'injectRole', 'requiresName', 'nameProp', 'source']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate a raw loaded config value against the AriaConfig schema. Pure:
 * takes the already-loaded value, returns a normalized AriaConfig or throws
 * AriaConfigError. `source` names the config file for error messages.
 *
 * Strict on unknown keys — a typo like `componentSemantic` silently doing
 * nothing would defeat the entire point of declaring semantics.
 */
export function validateAriaConfig(raw: unknown, source: string): AriaConfig {
  if (!isPlainObject(raw)) {
    throw new AriaConfigError(source, 'config must be an object');
  }

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      throw new AriaConfigError(
        source,
        `unknown key "${key}" (allowed: ${[...TOP_LEVEL_KEYS].join(', ')})`,
      );
    }
  }

  const config: AriaConfig = {};

  if ('componentSemantics' in raw && raw['componentSemantics'] !== undefined) {
    const semantics = raw['componentSemantics'];
    if (!isPlainObject(semantics)) {
      throw new AriaConfigError(source, '"componentSemantics" must be an object');
    }
    const validated: Record<string, ComponentSemantic> = {};
    for (const [component, entry] of Object.entries(semantics)) {
      if (!isPlainObject(entry)) {
        throw new AriaConfigError(
          source,
          `componentSemantics.${component} must be an object`,
        );
      }
      for (const key of Object.keys(entry)) {
        if (!SEMANTIC_KEYS.has(key)) {
          throw new AriaConfigError(
            source,
            `componentSemantics.${component} has unknown key "${key}" (allowed: ${[...SEMANTIC_KEYS].join(', ')})`,
          );
        }
      }
      const role = entry['role'];
      if (typeof role !== 'string' || role.trim() === '') {
        throw new AriaConfigError(
          source,
          `componentSemantics.${component}.role must be a non-empty string`,
        );
      }
      const injectRole = entry['injectRole'];
      if (injectRole !== undefined && typeof injectRole !== 'boolean') {
        throw new AriaConfigError(
          source,
          `componentSemantics.${component}.injectRole must be a boolean`,
        );
      }
      const requiresName = entry['requiresName'];
      if (requiresName !== undefined && typeof requiresName !== 'boolean') {
        throw new AriaConfigError(
          source,
          `componentSemantics.${component}.requiresName must be a boolean`,
        );
      }
      const nameProp = entry['nameProp'];
      if (nameProp !== undefined && (typeof nameProp !== 'string' || nameProp.trim() === '')) {
        throw new AriaConfigError(
          source,
          `componentSemantics.${component}.nameProp must be a non-empty string`,
        );
      }
      // `source: 'declared'` is the schema's whole point; it may be omitted
      // (we normalize it in) but never contradicted.
      const declaredSource = entry['source'];
      if (declaredSource !== undefined && declaredSource !== 'declared') {
        throw new AriaConfigError(
          source,
          `componentSemantics.${component}.source must be 'declared' if present — config-supplied semantics are ground truth by definition`,
        );
      }
      validated[component] = {
        role,
        ...(injectRole !== undefined ? { injectRole } : {}),
        ...(requiresName !== undefined ? { requiresName } : {}),
        ...(nameProp !== undefined ? { nameProp } : {}),
        source: 'declared',
      };
    }
    config.componentSemantics = validated;
  }

  if ('ignore' in raw && raw['ignore'] !== undefined) {
    const ignore = raw['ignore'];
    if (!Array.isArray(ignore) || ignore.some((entry) => typeof entry !== 'string')) {
      throw new AriaConfigError(source, '"ignore" must be an array of strings');
    }
    config.ignore = ignore as string[];
  }

  return config;
}
