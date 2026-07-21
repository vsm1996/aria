import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import plugin from 'eslint-plugin-aria-a11y';
import { describe, expect, it } from 'vitest';
import { fixText, lintText } from './runner';

/**
 * Third-consumer parity: the CLI (ESLint Linter + Babel→ESTree parser) must
 * produce IDENTICAL diagnostics and IDENTICAL fix output to ESLint's Linter
 * run directly — the same discipline the oxlint harness applies. Reuses the
 * plugin's shared fixture modules (no new fixtures).
 *
 * The reference uses the default (espree) parser; the CLI uses Babel. Both use
 * the same recommended rule set with NO inline options — so config-bridge
 * fixtures resolve their component as "unknown" on BOTH sides (identical), and
 * the config path itself is covered by the plugin/oxlint suites and the
 * separate config-discovery test below.
 */

const rulesDir = join(dirname(fileURLToPath(import.meta.url)), '../../eslint-plugin/src/rules');

const reference = new Linter();
const refConfig = {
  files: ['**/*.{js,jsx,ts,tsx}'],
  plugins: { 'aria-a11y': plugin as never },
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: (plugin as never as { configs: Record<string, { rules: object }> }).configs['recommended']!
    .rules,
} as never;

const norm = (m: { ruleId?: string | null; line?: number; column?: number; message: string }) => ({
  ruleId: m.ruleId ?? null,
  line: m.line ?? 0,
  column: m.column ?? 0,
  message: m.message,
});

const fixtureFiles = readdirSync(rulesDir).filter((f) => f.endsWith('.fixtures.ts'));

describe('CLI parity with ESLint Linter (shared fixtures)', () => {
  for (const file of fixtureFiles) {
    it(file.replace('.fixtures.ts', ''), async () => {
      const mod: { valid: string[]; invalid: { code: string }[] } = await import(
        join(rulesDir, file)
      );
      const codes = [...mod.valid, ...mod.invalid.map((f) => f.code)];
      const filename = 'Fixture.jsx';

      for (const code of codes) {
        const cli = lintText(code, filename).map(norm);
        const ref = reference.verify(code, refConfig, filename).map(norm);
        expect(cli, `diagnostics for: ${code}`).toEqual(ref);

        const cliFix = fixText(code, filename).output;
        const refFix = reference.verifyAndFix(code, refConfig, filename).output;
        expect(cliFix, `fix output for: ${code}`).toBe(refFix);
      }
    });
  }
});
