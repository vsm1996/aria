/**
 * oxlint parity harness — Phase 1/2 acceptance: "identical output under
 * oxlint's jsPlugins".
 *
 * Discovers every fixture module (packages/eslint-plugin/src/rules/
 * *.fixtures.ts — new rules are picked up automatically), then runs every
 * fixture through both hosts:
 *   - ESLint (programmatic Linter) — the stable contract
 *   - oxlint (CLI, jsPlugins via .oxlintrc.json) — the speed layer
 * with ALL plugin rules enabled, and diffs diagnostics (count, message,
 * line:col) and converged --fix output. Both hosts are also checked against
 * the fixture's own expectation (`converged` when the one-pass `output`
 * differs), so the comparison is three-way. Any drift exits nonzero.
 *
 * Usage:  pnpm parity:oxlint   (builds the plugin first — oxlint loads dist)
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rulesDir = path.join(root, 'packages/eslint-plugin/src/rules');
const plugin = (await import(path.join(root, 'packages/eslint-plugin/dist/index.js'))).default;

// ---- fixture discovery -----------------------------------------------------

const fixtureModules = readdirSync(rulesDir)
  .filter((f) => f.endsWith('.fixtures.ts'))
  .sort();
if (fixtureModules.length === 0) throw new Error('no fixture modules found');

const fixtures = [];
for (const file of fixtureModules) {
  const ruleName = file.replace(/\.fixtures\.ts$/, '');
  const { valid, invalid } = await import(path.join(rulesDir, file));
  for (const code of valid) {
    fixtures.push({ ruleName, code, expectedOutput: code, expectedErrors: 0 });
  }
  for (const f of invalid) {
    fixtures.push({
      ruleName,
      code: f.code,
      expectedOutput: f.converged ?? f.output,
      expectedErrors: f.errors.length,
    });
  }
}

// ---- ESLint side -----------------------------------------------------------

const linter = new Linter();
const eslintConfig = {
  plugins: { 'aria-a11y': plugin },
  rules: Object.fromEntries(
    Object.keys(plugin.rules).map((rule) => [`aria-a11y/${rule}`, 'error']),
  ),
  languageOptions: { ecmaVersion: 2022, parserOptions: { ecmaFeatures: { jsx: true } } },
};

function runESLint(code) {
  const messages = linter
    .verify(code, eslintConfig)
    .map((m) => ({ message: m.message, line: m.line, column: m.column }));
  const { output } = linter.verifyAndFix(code, eslintConfig); // converged
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
  if (!d.code.startsWith('aria-a11y(')) continue;
  const list = oxByFile.get(d.filename) ?? [];
  list.push({
    message: d.message,
    line: d.labels[0]?.span.line,
    column: d.labels[0]?.span.column,
  });
  oxByFile.set(d.filename, list);
}
// Run --fix to convergence. ESLint's verifyAndFix loops internally (up to 10
// passes); oxlint applies one pass per invocation and defers a fix that
// starts exactly where a previous one ended (same single-pass rule as
// ESLint's fixer), so adjacent discrete removals need a re-run. Same fixes,
// same destination — we compare converged output to converged output.
for (let pass = 0; pass < 10; pass += 1) {
  const before = fixtures.map((_, i) => readFileSync(fileFor(fixDir, i), 'utf8')).join('\0');
  oxlint(['--fix', fixDir]);
  const after = fixtures.map((_, i) => readFileSync(fileFor(fixDir, i), 'utf8')).join('\0');
  if (after === before) break;
}

// ---- diff ------------------------------------------------------------------

const byLoc = (a, b) => a.line - b.line || a.column - b.column;
let drift = 0;
const perRule = new Map();

fixtures.forEach((fixture, i) => {
  const problems = [];
  const es = runESLint(fixture.code);
  const ox = (oxByFile.get(fileFor(lintDir, i)) ?? []).sort(byLoc);
  const oxOutput = readFileSync(fileFor(fixDir, i), 'utf8').replace(/\n$/, '');

  if (es.messages.length !== fixture.expectedErrors) {
    problems.push(`eslint reported ${es.messages.length}, fixture expects ${fixture.expectedErrors}`);
  }
  if (es.output !== fixture.expectedOutput) {
    problems.push(`eslint output ${JSON.stringify(es.output)} != expected ${JSON.stringify(fixture.expectedOutput)}`);
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

  const tally = perRule.get(fixture.ruleName) ?? { ok: 0, drift: 0 };
  if (problems.length > 0) {
    drift += 1;
    tally.drift += 1;
    console.log(`DRIFT  [${fixture.ruleName}] ${JSON.stringify(fixture.code)}`);
    for (const p of problems) console.log(`       - ${p}`);
  } else {
    tally.ok += 1;
    console.log(`ok     [${fixture.ruleName}] ${JSON.stringify(fixture.code)}`);
  }
  perRule.set(fixture.ruleName, tally);
});

rmSync(workDir, { recursive: true, force: true });

console.log('');
for (const [rule, tally] of perRule) {
  console.log(`${rule}: ${tally.ok} ok${tally.drift > 0 ? `, ${tally.drift} DRIFTED` : ''}`);
}
console.log(
  `${fixtures.length} fixtures total: ` +
    (drift === 0 ? 'ESLint and oxlint agree on every diagnostic, location, and fix.' : `${drift} DRIFTED.`),
);
process.exit(drift === 0 ? 0 : 1);
