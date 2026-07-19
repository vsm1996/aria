/**
 * oxlint parity harness — Phase 1 acceptance: "identical output under oxlint's
 * jsPlugins".
 *
 * Runs every fixture from no-redundant-role.fixtures.ts through both hosts:
 *   - ESLint (programmatic Linter) — the stable contract
 *   - oxlint (CLI, jsPlugins via .oxlintrc.json) — the speed layer
 * and diffs diagnostics (count, message, line:col) and --fix output. Both
 * hosts are also checked against the fixture's own expected `output`, so the
 * comparison is three-way. Any drift exits nonzero.
 *
 * Usage:  pnpm parity:oxlint   (builds the plugin first — oxlint loads dist)
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plugin = (await import(path.join(root, 'packages/eslint-plugin/dist/index.js'))).default;
const { valid, invalid } = await import(
  path.join(root, 'packages/eslint-plugin/src/rules/no-redundant-role.fixtures.ts')
);

const RULE_CODE = 'aria-a11y(no-redundant-role)';
const fixtures = [
  ...valid.map((code) => ({ code, output: code, expectedErrors: 0 })),
  ...invalid.map((f) => ({ code: f.code, output: f.output, expectedErrors: f.errors.length })),
];

// ---- ESLint side -----------------------------------------------------------

const linter = new Linter();
const eslintConfig = {
  plugins: { 'aria-a11y': plugin },
  rules: { 'aria-a11y/no-redundant-role': 'error' },
  languageOptions: { ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } } },
};

function runESLint(code) {
  const messages = linter
    .verify(code, eslintConfig)
    .map((m) => ({ message: m.message, line: m.line, column: m.column }));
  const { output } = linter.verifyAndFix(code, eslintConfig);
  return { messages, output };
}

// ---- oxlint side -----------------------------------------------------------

const workDir = path.join(tmpdir(), `aria-oxlint-parity-${process.pid}`);
rmSync(workDir, { recursive: true, force: true });
const lintDir = path.join(workDir, 'lint');
const fixDir = path.join(workDir, 'fix');
mkdirSync(lintDir, { recursive: true });
mkdirSync(fixDir, { recursive: true });

const fileFor = (dir, i) => path.join(dir, `fixture-${String(i).padStart(3, '0')}.jsx`);
fixtures.forEach((f, i) => {
  writeFileSync(fileFor(lintDir, i), `${f.code}\n`);
  writeFileSync(fileFor(fixDir, i), `${f.code}\n`);
});

function oxlint(args) {
  // oxlint exits nonzero when diagnostics remain; that's data, not failure.
  try {
    return execFileSync('npx', ['oxlint', '-c', path.join(root, '.oxlintrc.json'), ...args], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (typeof error.stdout === 'string' && error.status !== null) return error.stdout;
    throw error;
  }
}

const report = JSON.parse(oxlint(['--format', 'json', lintDir]));
const oxByFile = new Map();
for (const d of report.diagnostics) {
  if (d.code !== RULE_CODE) continue;
  const list = oxByFile.get(d.filename) ?? [];
  list.push({
    message: d.message,
    line: d.labels[0]?.span.line,
    column: d.labels[0]?.span.column,
  });
  oxByFile.set(d.filename, list);
}
oxlint(['--fix', fixDir]);

// ---- diff ------------------------------------------------------------------

const byLoc = (a, b) => a.line - b.line || a.column - b.column;
let drift = 0;

fixtures.forEach((fixture, i) => {
  const problems = [];
  const es = runESLint(fixture.code);
  const ox = (oxByFile.get(fileFor(lintDir, i)) ?? []).sort(byLoc);
  const oxOutput = readFileSync(fileFor(fixDir, i), 'utf8').replace(/\n$/, '');

  if (es.messages.length !== fixture.expectedErrors) {
    problems.push(`eslint reported ${es.messages.length}, fixture expects ${fixture.expectedErrors}`);
  }
  if (es.output !== fixture.output) {
    problems.push(`eslint output ${JSON.stringify(es.output)} != expected ${JSON.stringify(fixture.output)}`);
  }
  if (ox.length !== es.messages.length) {
    problems.push(`oxlint reported ${ox.length}, eslint reported ${es.messages.length}`);
  } else {
    es.messages.sort(byLoc).forEach((m, j) => {
      const o = ox[j];
      if (o.message !== m.message) problems.push(`message drift: ${JSON.stringify(o.message)} != ${JSON.stringify(m.message)}`);
      if (o.line !== m.line || o.column !== m.column) {
        problems.push(`location drift: oxlint ${o.line}:${o.column} != eslint ${m.line}:${m.column}`);
      }
    });
  }
  if (oxOutput !== es.output) {
    problems.push(`fix drift: oxlint ${JSON.stringify(oxOutput)} != eslint ${JSON.stringify(es.output)}`);
  }

  if (problems.length > 0) {
    drift += 1;
    console.log(`DRIFT  ${JSON.stringify(fixture.code)}`);
    for (const p of problems) console.log(`       - ${p}`);
  } else {
    console.log(`ok     ${JSON.stringify(fixture.code)}`);
  }
});

rmSync(workDir, { recursive: true, force: true });

console.log(
  `\n${fixtures.length} fixtures (${valid.length} valid, ${invalid.length} invalid): ` +
    (drift === 0 ? 'ESLint and oxlint agree on every diagnostic, location, and fix.' : `${drift} DRIFTED.`),
);
process.exit(drift === 0 ? 0 : 1);
