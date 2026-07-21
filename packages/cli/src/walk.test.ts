import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectFiles } from './walk';
import { lintTextDetailed } from './runner';

/**
 * REGRESSION: real-world bug from running the CLI against a Next.js project
 * (see CHANGELOG 0.1.2). `aria check .` scanned `.next/**` (and out/, build/)
 * whose generated bundles carry eslint-disable comments for rules this
 * standalone runner doesn't define, producing dozens of
 * "Definition for rule '…' was not found" noise findings that drowned the one
 * real finding in source. Curated JSX fixtures will never organically produce
 * this shape, so it is captured deliberately here.
 */

// The .next-shaped generated bundle from the original report, minimized.
const NEXT_BUNDLE = `/* eslint-disable @typescript-eslint/no-unused-vars, @next/internal/no-ambiguous-jsx */
// eslint-disable-next-line import/no-commonjs
const t = require("react");
/* eslint-disable react-hooks/rules-of-hooks */
module.exports = { t };
`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aria-walk-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function scaffoldNextProject(root: string): void {
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, '.next/server/chunks'), { recursive: true });
  mkdirSync(join(root, 'out'), { recursive: true });
  mkdirSync(join(root, 'build/static'), { recursive: true });
  writeFileSync(
    join(root, 'src/App.jsx'),
    'export const Save = () => <button role="button">Save</button>;\n',
  );
  writeFileSync(join(root, '.next/server/chunks/ssr-chunk.js'), NEXT_BUNDLE);
  writeFileSync(join(root, 'out/export-chunk.js'), NEXT_BUNDLE);
  writeFileSync(join(root, 'build/static/bundle.js'), NEXT_BUNDLE);
}

describe('default build-directory skips (the Next.js regression)', () => {
  it('never descends into .next/, out/, build/, dist/, node_modules/', () => {
    scaffoldNextProject(dir);
    mkdirSync(join(dir, 'dist'), { recursive: true });
    mkdirSync(join(dir, 'node_modules/somepkg'), { recursive: true });
    writeFileSync(join(dir, 'dist/x.js'), NEXT_BUNDLE);
    writeFileSync(join(dir, 'node_modules/somepkg/index.js'), NEXT_BUNDLE);

    const { files } = collectFiles([dir]);
    expect(files).toEqual([join(dir, 'src/App.jsx')]);
  });

  it('an explicitly named file is always linted, even inside a skipped dir', () => {
    scaffoldNextProject(dir);
    const explicit = join(dir, '.next/server/chunks/ssr-chunk.js');
    const { files } = collectFiles([explicit]);
    expect(files).toEqual([explicit]);
  });

  it('reports missing paths without throwing', () => {
    const { files, missing } = collectFiles([join(dir, 'nope')]);
    expect(files).toEqual([]);
    expect(missing).toEqual([join(dir, 'nope')]);
  });
});

describe("the project's own .gitignore is honoured", () => {
  it('skips directories and files the target root gitignores', () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'generated'), { recursive: true });
    writeFileSync(join(dir, 'src/App.jsx'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'generated/g.jsx'), NEXT_BUNDLE);
    writeFileSync(join(dir, 'src/ignored-file.jsx'), NEXT_BUNDLE);
    writeFileSync(join(dir, '.gitignore'), 'generated/\nsrc/ignored-file.jsx\n');

    const { files } = collectFiles([dir]);
    expect(files).toEqual([join(dir, 'src/App.jsx')]);
  });

  it('a malformed or absent .gitignore never breaks the walk', () => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/App.jsx'), 'export const x = 1;\n');
    const { files } = collectFiles([dir]);
    expect(files).toEqual([join(dir, 'src/App.jsx')]);
  });
});

describe('foreign unknown-rule suppression (and its footgun guard)', () => {
  it('suppresses foreign eslint-disable rule references into a count, not findings', () => {
    const { diagnostics, foreignRuleReferences } = lintTextDetailed(NEXT_BUNDLE, 'chunk.js');
    expect(diagnostics).toEqual([]); // zero noise findings
    expect(foreignRuleReferences).toBeGreaterThan(0); // but NOT invisible
  });

  it('FOOTGUN GUARD: an unknown aria-a11y/* rule reference stays a loud error', () => {
    // If one of OUR rules failed to load, that must never look like a clean
    // pass — the suppression applies only outside the aria-a11y namespace.
    const code = `/* eslint-disable aria-a11y/does-not-exist */\nconst x = 1;\n`;
    const { diagnostics, foreignRuleReferences } = lintTextDetailed(code, 'x.js');
    expect(foreignRuleReferences).toBe(0);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toMatch(/Definition for rule 'aria-a11y\/does-not-exist'/);
  });

  it('real findings still surface alongside suppressed foreign references', () => {
    const code =
      `// eslint-disable-next-line react-hooks/rules-of-hooks\n` +
      `export const Save = () => <button role="button">Save</button>;\n`;
    const { diagnostics, foreignRuleReferences } = lintTextDetailed(code, 'App.jsx');
    expect(foreignRuleReferences).toBe(1);
    expect(diagnostics.map((d) => d.ruleId)).toContain('aria-a11y/no-redundant-role');
  });
});
