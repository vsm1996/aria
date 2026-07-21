import { createRequire } from 'node:module';
import { parse, resolve } from 'node:path';
import { Linter } from 'eslint';
import type { ESLint, Linter as LinterNS } from 'eslint';
// The rules run COMPLETELY UNCHANGED — the CLI is Option B: ESLint's Linter
// wrapped programmatically, with a Babel→ESTree parser so no ESLint config or
// host is required. This is the same engine the plugin and the oxlint parity
// harness use, so output is identical by construction.
import plugin from 'eslint-plugin-aria-a11y';
import babelParser from '@babel/eslint-parser';

/**
 * A diagnostic as the CLI surfaces it. Mirrors ESLint's message plus the one
 * derived fact the CLI's exit gate needs: whether the finding is format-tier.
 */
export interface AriaDiagnostic {
  ruleId: string | null;
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
  /**
   * True when ESLint attached an auto-applicable `fix` to this message. Per the
   * gate (already enforced inside the rules via `emit`), only native/declared
   * basis — i.e. format-tier — diagnostics carry a `fix`; lint-tier ones carry
   * a `suggest` or nothing. So this flag IS the format-tier signal, reused, not
   * recomputed.
   */
  formatTier: boolean;
}

// Anchor the Linter at the filesystem root so the `files` globs match any
// ABSOLUTE path (flat config matches relative to the Linter's cwd). Combined
// with always resolving filenames to absolute below, this lets the CLI lint
// files anywhere — inside or outside the invocation directory.
const linter = new Linter({ cwd: parse(process.cwd()).root });

// Babel as an ESTree bridge: parses TS/TSX/JSX with no babel config file.
// preset-typescript infers .ts vs .tsx from the filename ESLint passes through.
const recommendedRules = (
  plugin as unknown as { configs: Record<string, { rules: LinterNS.RulesRecord }> }
).configs['recommended']?.rules;
if (recommendedRules === undefined) {
  throw new Error('eslint-plugin-aria-a11y is missing its recommended config');
}

// Resolve the Babel presets to ABSOLUTE paths from the CLI's own install
// location. Babel otherwise resolves preset names relative to the linted
// file's cwd, where they are not installed — the CLI must carry its own parser.
const requireFromHere = createRequire(import.meta.url);
const presetReact = requireFromHere.resolve('@babel/preset-react');
const presetTypescript = requireFromHere.resolve('@babel/preset-typescript');

const baseConfig: LinterNS.Config = {
  // Flat config only opts non-.js extensions into linting via an explicit
  // `files` glob — without this, .tsx/.jsx get "no matching configuration".
  files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
  plugins: { 'aria-a11y': plugin as unknown as ESLint.Plugin },
  languageOptions: {
    parser: babelParser as unknown as LinterNS.Parser,
    parserOptions: {
      requireConfigFile: false,
      ecmaFeatures: { jsx: true },
      babelOptions: {
        // Absolute preset paths so Babel needn't resolve them from the target's cwd.
        presets: [[presetReact, { runtime: 'automatic' }], presetTypescript],
      },
    },
  },
  // The recommended rule set — all eight rules at their tier severities.
  rules: recommendedRules,
};

function toDiagnostics(messages: LinterNS.LintMessage[]): AriaDiagnostic[] {
  return messages
    .filter((m) => m.ruleId !== null || m.fatal)
    .map((m) => ({
      ruleId: m.ruleId ?? null,
      severity: m.severity === 2 ? 'error' : 'warning',
      message: m.message,
      line: m.line ?? 1,
      column: m.column ?? 1,
      formatTier: m.fix !== undefined,
    }));
}

/** Lint one source string. `filename` drives TS/TSX detection and config discovery. */
export function lintText(code: string, filename: string): AriaDiagnostic[] {
  return toDiagnostics(linter.verify(code, baseConfig, resolve(filename)));
}

/**
 * Fix one source string. Applies ONLY ESLint-native `fix` edits — which, by the
 * gate, are exactly the format-tier (native/declared) fixes. Lint-tier
 * suggestions are never applied (ESLint's `verifyAndFix` never applies
 * `suggest`). No separate "is this safe" check exists or is needed.
 */
export function fixText(
  code: string,
  filename: string,
): { output: string; remaining: AriaDiagnostic[] } {
  const result = linter.verifyAndFix(code, baseConfig, resolve(filename));
  return { output: result.output, remaining: toDiagnostics(result.messages) };
}

