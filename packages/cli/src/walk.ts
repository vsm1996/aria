import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';

/**
 * File collection for the CLI, with sane defaults for real projects.
 *
 * Two layers, both born from a real-world bug (see CHANGELOG 0.1.2): scanning
 * a Next.js project pulled in `.next/**` build output whose generated bundles
 * carry eslint-disable comments for rules this standalone runner doesn't
 * define, drowning real findings in "Definition for rule … was not found"
 * noise.
 *
 *  1. DEFAULT_SKIP — common build/output/vendor directories are never
 *     scanned, no configuration required. This is baseline behaviour.
 *  2. The project's own `.gitignore` — real projects already know what
 *     shouldn't be linted. For each *directory* target, a `.gitignore` at
 *     that root is honoured (full gitignore semantics via the `ignore`
 *     package — the same matcher class ESLint itself uses). Scope note:
 *     nested .gitignore files and ESLint flat-config `ignores` arrays are
 *     deliberately out of scope for now — the latter would mean executing
 *     the project's config module. Root .gitignore covers the practical
 *     cases (build dirs are gitignored in essentially every real project).
 *
 * An explicitly named FILE argument is always linted — naming a file is
 * user intent, and it must beat both layers.
 */
export const DEFAULT_SKIP: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.next',
  'out',
  'build',
  'dist',
  'coverage',
  '.turbo',
  '.vercel',
]);

const SOURCE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;

function gitignoreFor(root: string): Ignore | null {
  const file = join(root, '.gitignore');
  if (!existsSync(file)) return null;
  try {
    return ignore().add(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export interface WalkResult {
  files: string[];
  /** Paths passed on the CLI that don't exist (reported, not fatal). */
  missing: string[];
}

export function collectFiles(paths: string[]): WalkResult {
  const files: string[] = [];
  const missing: string[] = [];

  const walkDir = (dir: string, root: string, ig: Ignore | null): void => {
    for (const entry of readdirSync(dir)) {
      if (DEFAULT_SKIP.has(entry)) continue;
      const full = join(dir, entry);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue; // broken symlink etc.
      }
      if (ig !== null) {
        // gitignore matching wants paths relative to the .gitignore location,
        // POSIX-separated; directories are checked with a trailing slash too.
        const rel = relative(root, full).split(sep).join('/');
        if (ig.ignores(rel) || (st.isDirectory() && ig.ignores(`${rel}/`))) continue;
      }
      if (st.isDirectory()) walkDir(full, root, ig);
      else if (SOURCE_EXT.test(entry)) files.push(full);
    }
  };

  for (const p of paths) {
    let st;
    try {
      st = statSync(p);
    } catch {
      missing.push(p);
      continue;
    }
    if (st.isDirectory()) {
      walkDir(p, p, gitignoreFor(p));
    } else {
      // Explicit file argument: user intent wins over every ignore layer.
      files.push(p);
    }
  }
  return { files, missing };
}
