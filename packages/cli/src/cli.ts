import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fixText, lintText, type AriaDiagnostic } from './runner';

// Zero-config: no ESLint config file, no host setup. `aria check` / `aria fix`
// just work. Internally this wraps ESLint's Linter with a Babel→ESTree parser
// (Option B) — an implementation detail that never surfaces to the user.

const SOURCE_EXT = /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', 'coverage', '.turbo']);

const useColor = process.stdout.isTTY && process.env['NO_COLOR'] === undefined;
const paint = (code: string, s: string) => (useColor ? `[${code}m${s}[0m` : s);
const red = (s: string) => paint('31', s);
const yellow = (s: string) => paint('33', s);
const dim = (s: string) => paint('2', s);
const bold = (s: string) => paint('1', s);

function collectFiles(paths: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string): void => {
    let st;
    try {
      st = statSync(p);
    } catch {
      process.stderr.write(red(`aria: no such path: ${p}\n`));
      return;
    }
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) {
        if (SKIP_DIR.has(entry)) continue;
        walk(join(p, entry));
      }
    } else if (SOURCE_EXT.test(p)) {
      out.push(p);
    }
  };
  for (const p of paths) walk(p);
  return out;
}

function printDiagnostics(file: string, diags: AriaDiagnostic[]): void {
  if (diags.length === 0) return;
  process.stdout.write(bold(relative(process.cwd(), file)) + '\n');
  for (const d of diags) {
    const sev = d.severity === 'error' ? red('error') : yellow('warn ');
    const loc = dim(`${d.line}:${d.column}`);
    const rule = dim(d.ruleId ?? '');
    process.stdout.write(`  ${loc}  ${sev}  ${d.message}  ${rule}\n`);
  }
  process.stdout.write('\n');
}

function summarize(files: number, diags: AriaDiagnostic[]): void {
  const errors = diags.filter((d) => d.severity === 'error').length;
  const warnings = diags.length - errors;
  const format = diags.filter((d) => d.formatTier).length;
  process.stdout.write(
    dim(
      `${files} file(s) scanned — ${diags.length} finding(s): ${errors} error, ${warnings} warning ` +
        `(${format} format-tier).\n`,
    ),
  );
}

function runCheck(paths: string[]): number {
  const files = collectFiles(paths);
  const all: AriaDiagnostic[] = [];
  for (const file of files) {
    const diags = lintText(readFileSync(file, 'utf8'), file);
    printDiagnostics(file, diags);
    all.push(...diags);
  }
  summarize(files.length, all);
  // The CI teeth: any format-tier (native/declared basis) issue fails the run.
  // Lint-tier findings are reported but do not, on their own, set exit code.
  return all.some((d) => d.formatTier) ? 1 : 0;
}

function runFix(paths: string[]): number {
  const files = collectFiles(paths);
  let fixedCount = 0;
  const remaining: AriaDiagnostic[] = [];
  for (const file of files) {
    const before = readFileSync(file, 'utf8');
    // Applies ONLY format-tier fixes — ESLint's verifyAndFix never applies
    // lint-tier suggestions. Same gate as everywhere, nothing added here.
    const { output, remaining: left } = fixText(before, file);
    if (output !== before) {
      writeFileSync(file, output);
      fixedCount += 1;
      process.stdout.write(dim(`fixed  ${relative(process.cwd(), file)}\n`));
    }
    printDiagnostics(file, left);
    remaining.push(...left);
  }
  process.stdout.write(dim(`\n${fixedCount} file(s) fixed.\n`));
  summarize(files.length, remaining);
  // Any format-tier issue that survived the fix (should not happen for the
  // subtractive format rules, but honours idempotence) still fails.
  return remaining.some((d) => d.formatTier) ? 1 : 0;
}

const HELP = `aria — zero-config accessibility linter (Aria rules, no ESLint config required)

Usage:
  aria check [paths...]   Report accessibility diagnostics (both tiers).
                          Exits nonzero if any format-tier issue is present.
  aria fix   [paths...]   Apply format-tier (safe, meaning-preserving) fixes.
                          Never applies lint-tier suggestions.

paths default to the current directory. Scans .js/.jsx/.ts/.tsx (and .mjs/.cjs).
`;

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  const paths = rest.filter((a) => !a.startsWith('-'));
  const targets = paths.length > 0 ? paths : ['.'];

  switch (command) {
    case 'check':
      return runCheck(targets);
    case 'fix':
      return runFix(targets);
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(HELP);
      return command === undefined ? 1 : 0;
    default:
      process.stderr.write(red(`aria: unknown command "${command}"\n\n`) + HELP);
      return 1;
  }
}

process.exit(main(process.argv.slice(2)));
