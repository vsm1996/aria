import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AriaConfigError, validateAriaConfig } from './validate';
import { resolveComponentSemantic } from './resolve';
import { clearAriaConfigCache, loadAriaConfig } from './loader';
import type { AriaConfig } from './index';

const SEMANTIC = { role: 'button', requiresName: true, source: 'declared' as const };

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'aria-config-'));
  clearAriaConfigCache();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveComponentSemantic (pure)', () => {
  const config: AriaConfig = { componentSemantics: { IconButton: SEMANTIC } };

  it('returns undefined for everything when there is no config', () => {
    expect(resolveComponentSemantic(null, 'IconButton')).toBeUndefined();
  });

  it('returns the declared semantic for a declared component', () => {
    expect(resolveComponentSemantic(config, 'IconButton')).toEqual(SEMANTIC);
  });

  it('returns undefined for an undeclared component', () => {
    expect(resolveComponentSemantic(config, 'Link')).toBeUndefined();
  });

  it('does not resolve through the object prototype', () => {
    expect(resolveComponentSemantic(config, 'toString')).toBeUndefined();
    expect(resolveComponentSemantic(config, 'constructor')).toBeUndefined();
  });
});

describe('validateAriaConfig (pure)', () => {
  it('rejects unknown top-level keys (typos must be loud)', () => {
    expect(() => validateAriaConfig({ componentSemantic: {} }, 'x')).toThrow(AriaConfigError);
    expect(() => validateAriaConfig({ componentSemantic: {} }, 'x')).toThrow(/componentSemantic/);
  });

  it('rejects a missing or empty role', () => {
    expect(() =>
      validateAriaConfig({ componentSemantics: { A: { requiresName: true } } }, 'x'),
    ).toThrow(/role must be a non-empty string/);
  });

  it('rejects unknown keys inside a semantic entry', () => {
    expect(() =>
      validateAriaConfig({ componentSemantics: { A: { role: 'button', requireName: true } } }, 'x'),
    ).toThrow(/unknown key "requireName"/);
  });

  it("normalizes an omitted source to 'declared' and rejects any other value", () => {
    const config = validateAriaConfig({ componentSemantics: { A: { role: 'link' } } }, 'x');
    expect(config.componentSemantics?.['A']).toEqual({ role: 'link', source: 'declared' });
    expect(() =>
      validateAriaConfig({ componentSemantics: { A: { role: 'link', source: 'inferred' } } }, 'x'),
    ).toThrow(/must be 'declared'/);
  });
});

describe('loadAriaConfig', () => {
  it('treats no config as a first-class result: null, never a throw', () => {
    const loaded = loadAriaConfig(dir);
    expect(loaded).toEqual({ config: null, filepath: null });
    expect(resolveComponentSemantic(loaded.config, 'Anything')).toBeUndefined();
  });

  it('loads aria.config.json and resolves declared components', () => {
    writeFileSync(
      path.join(dir, 'aria.config.json'),
      JSON.stringify({ componentSemantics: { IconButton: SEMANTIC } }),
    );
    const loaded = loadAriaConfig(dir);
    expect(loaded.filepath).toBe(path.join(dir, 'aria.config.json'));
    expect(resolveComponentSemantic(loaded.config, 'IconButton')).toEqual(SEMANTIC);
    expect(resolveComponentSemantic(loaded.config, 'Link')).toBeUndefined();
  });

  it('loads .ariarc (extensionless JSON)', () => {
    writeFileSync(
      path.join(dir, '.ariarc'),
      JSON.stringify({ componentSemantics: { MenuItem: { role: 'menuitem' } } }),
    );
    expect(resolveComponentSemantic(loadAriaConfig(dir).config, 'MenuItem')).toEqual({
      role: 'menuitem',
      source: 'declared',
    });
  });

  it('loads aria.config.js (CommonJS module)', () => {
    writeFileSync(
      path.join(dir, 'aria.config.js'),
      `module.exports = { componentSemantics: { Link: { role: 'link' } } };`,
    );
    expect(resolveComponentSemantic(loadAriaConfig(dir).config, 'Link')).toEqual({
      role: 'link',
      source: 'declared',
    });
  });

  it('loads aria.config.ts with a default export (native type stripping)', () => {
    writeFileSync(
      path.join(dir, 'aria.config.ts'),
      [
        `interface Semantics { componentSemantics: Record<string, { role: string; source: 'declared' }> }`,
        `const config: Semantics = { componentSemantics: { IconButton: { role: 'button', source: 'declared' } } };`,
        `export default config;`,
      ].join('\n'),
    );
    expect(resolveComponentSemantic(loadAriaConfig(dir).config, 'IconButton')).toEqual({
      role: 'button',
      source: 'declared',
    });
  });

  it('searches upward from a nested directory', () => {
    writeFileSync(
      path.join(dir, 'aria.config.json'),
      JSON.stringify({ componentSemantics: { IconButton: SEMANTIC } }),
    );
    const nested = path.join(dir, 'src', 'components');
    mkdirSync(nested, { recursive: true });
    const loaded = loadAriaConfig(nested);
    expect(loaded.filepath).toBe(path.join(dir, 'aria.config.json'));
  });

  it('throws loudly on unparseable config — never indistinguishable from none', () => {
    writeFileSync(path.join(dir, '.ariarc'), '{ this is not json');
    expect(() => loadAriaConfig(dir)).toThrow();
  });

  it('throws AriaConfigError, naming the file, on a schema violation', () => {
    writeFileSync(
      path.join(dir, 'aria.config.json'),
      JSON.stringify({ componentSemantics: { A: { role: 42 } } }),
    );
    let thrown: unknown;
    try {
      loadAriaConfig(dir);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AriaConfigError);
    expect((thrown as Error).message).toContain(path.join(dir, 'aria.config.json'));
  });

  it('caches per directory: the second load is the same result object', () => {
    writeFileSync(
      path.join(dir, 'aria.config.json'),
      JSON.stringify({ componentSemantics: { IconButton: SEMANTIC } }),
    );
    const first = loadAriaConfig(dir);
    const second = loadAriaConfig(dir);
    expect(second.config).toBe(first.config);
  });

  it('clearAriaConfigCache picks up a changed config', () => {
    const file = path.join(dir, 'aria.config.json');
    writeFileSync(file, JSON.stringify({ componentSemantics: { A: { role: 'link' } } }));
    expect(resolveComponentSemantic(loadAriaConfig(dir).config, 'A')?.role).toBe('link');
    writeFileSync(file, JSON.stringify({ componentSemantics: { A: { role: 'button' } } }));
    clearAriaConfigCache();
    expect(resolveComponentSemantic(loadAriaConfig(dir).config, 'A')?.role).toBe('button');
  });
});
