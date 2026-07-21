# Changelog

Both packages (`eslint-plugin-aria-a11y` and `@aria-a11y/cli`) are versioned
together.

## 0.1.1

First working release. **Use this, not 0.1.0.**

- All eight rules: `no-redundant-role`, `no-unsupported-aria`,
  `aria-syntax-normalize` (format tier, auto-fix, gate CI) and
  `interactive-role-required`, `img-needs-alt`, `idref-resolves`,
  `control-needs-name`, `aria-hidden-not-focusable` (lint tier, report/suggest).
- `@aria-a11y/cli` — zero-config `aria check` / `aria fix`, identical output to
  the ESLint plugin (a parity test asserts it).
- **Packaging fix (the reason 0.1.1 exists).** `eslint-plugin-aria-a11y@0.1.0`
  shipped broken: its manifest pointed `main`/`exports` at `./src/index.ts`,
  which `files: ["dist"]` never shipped, so every install failed with
  `ERR_MODULE_NOT_FOUND`. Root cause: the dist entry points were set via a
  `publishConfig` field override, which is a pnpm-only feature that
  `npm publish` silently ignores — and 0.1.0 was published with npm. Fixed by
  pointing the top-level `main`/`types`/`exports` at `dist` directly (no
  `publishConfig`), so the manifest is correct regardless of publish tool. Now
  guarded by `pnpm verify:pack`, a blocking CI step that packs each package the
  way it is published, installs the tarball into a clean external directory, and
  does a real import / bin run — a `--dry-run` file list was not enough to catch
  this.

## 0.1.0 — do not use (yanked in practice)

Broken for every installer (the packaging bug above). Left in npm's version
history because it can't be overwritten; superseded by 0.1.1.
