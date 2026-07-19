import { createRequire } from 'node:module';
import path from 'node:path';
import { cosmiconfigSync } from 'cosmiconfig';
import type { AriaConfig } from './index';
import { validateAriaConfig } from './validate';

/**
 * Config discovery — the ONE sanctioned I/O surface in @aria/config.
 *
 * Rules stay pure: they receive a loaded AriaConfig (or null) and call the
 * pure `resolveComponentSemantic`. Only host wiring (the plugin entry, the
 * CLI) calls this loader.
 *
 * Search: aria.config.{ts,js,cjs,json} or .ariarc(.json), walking upward
 * from the linted file's directory, the way host tooling conventionally
 * resolves configs.
 *
 * Caching boundary: one explorer per process, cosmiconfig caching per
 * directory. ESLint invokes a rule's create() once per file but the process
 * spans the whole lint run (and stays alive in editors), so per-process +
 * per-directory is the boundary that avoids re-hitting the filesystem on
 * every node visit while still resolving nested configs correctly in
 * monorepos. Config edits mid-process need `clearAriaConfigCache()` (tests)
 * or a restart — the same contract ESLint itself has for its JS configs.
 */

export interface LoadedAriaConfig {
  /** The validated config, or null when no config file was found. */
  config: AriaConfig | null;
  /** Absolute path of the file the config came from, or null. */
  filepath: string | null;
}

const requireForLoader = createRequire(import.meta.url);

/**
 * Load a TS/JS config module synchronously via require. Node >= 22.6 strips
 * types from .ts natively (unflagged since 23.6), and modern Node supports
 * require() of ESM, so `export default defineConfig({...})` works in every
 * config flavor. Unwraps a default export when present.
 */
function requireLoader(filepath: string): unknown {
  delete requireForLoader.cache[requireForLoader.resolve(filepath)];
  const mod: unknown = requireForLoader(filepath);
  if (typeof mod === 'object' && mod !== null && 'default' in mod) {
    return (mod as { default: unknown }).default;
  }
  return mod;
}

const explorer = cosmiconfigSync('aria', {
  // Search all the way to the filesystem root (cosmiconfig's default stop at
  // the home directory would never ascend for projects outside it).
  stopDir: path.parse(process.cwd()).root,
  searchPlaces: [
    'aria.config.ts',
    'aria.config.js',
    'aria.config.cjs',
    'aria.config.json',
    '.ariarc',
    '.ariarc.json',
  ],
  loaders: {
    '.ts': requireLoader,
    '.js': requireLoader,
    '.cjs': requireLoader,
  },
});

// Validation memo, so repeated loads return the SAME validated object and no
// work happens per node visit. Keyed by filepath, invalidated when
// cosmiconfig hands back a different raw object (i.e. after clearCaches).
const validatedCache = new Map<string, { raw: unknown; validated: AriaConfig }>();

/**
 * Find and load the nearest Aria config, searching upward from `searchFrom`
 * (a directory, typically `path.dirname(filename)` of the linted file).
 * "No config found" is a first-class result — `{ config: null, filepath:
 * null }` — never an error. A config that EXISTS but is malformed
 * (unparseable, or schema-invalid) throws loudly instead: a broken config
 * must never be indistinguishable from no config.
 */
export function loadAriaConfig(searchFrom: string): LoadedAriaConfig {
  const result = explorer.search(searchFrom);
  if (result === null) return { config: null, filepath: null };
  // An empty config file declares nothing; that's a valid empty config.
  if (result.isEmpty) return { config: {}, filepath: result.filepath };

  const cached = validatedCache.get(result.filepath);
  if (cached !== undefined && cached.raw === result.config) {
    return { config: cached.validated, filepath: result.filepath };
  }
  const validated = validateAriaConfig(result.config, result.filepath);
  validatedCache.set(result.filepath, { raw: result.config, validated });
  return { config: validated, filepath: result.filepath };
}

/** Drop all cached search results (tests, long-lived servers). */
export function clearAriaConfigCache(): void {
  explorer.clearCaches();
  validatedCache.clear();
}
