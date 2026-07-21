import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintText } from './runner';

/**
 * The CLI is zero-config for the USER (no ESLint setup), but it still honors an
 * `aria.config` file if one exists — that is how the config bridge reaches the
 * CLI. This proves discovery works end to end: a declared control component
 * with no name is flagged only when the config file declares it.
 */
describe('CLI honors aria.config discovery (config bridge)', () => {
  it('flags a config-declared control component missing its name prop', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aria-cli-'));
    try {
      writeFileSync(
        join(dir, 'aria.config.json'),
        JSON.stringify({
          componentSemantics: { IconButton: { role: 'button', nameProp: 'label' } },
        }),
      );
      const code = 'const x = <IconButton />;';
      const withConfig = lintText(code, join(dir, 'App.tsx'));
      expect(withConfig.some((d) => d.ruleId === 'aria-a11y/control-needs-name')).toBe(true);

      // Same code elsewhere (no config) → the component is unknown → silent.
      const noConfig = lintText(code, join(tmpdir(), 'nowhere', 'App.tsx'));
      expect(noConfig.some((d) => d.ruleId === 'aria-a11y/control-needs-name')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
