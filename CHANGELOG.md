# Changelog

`eslint-plugin-aria-a11y` and `@aria-a11y/cli` shipped in lockstep through
0.1.1. From 0.1.2 on they version independently — a fix that touches only one
package bumps only that package (the rule engine is shared source, but the
published artifacts are separate). Current: plugin `0.2.0`, CLI `0.2.0`.

## 0.2.0 — `eslint-plugin-aria-a11y` and `@aria-a11y/cli`

Config-bridge improvements from the real design-system case study
([docs/case-study-renge.md](./docs/case-study-renge.md)). The changes live in
the plugin's rules and config; the CLI republishes at the same version because
it runs the identical rules. **Minor**, for the behavior change below.

### ⚠️ BEHAVIOR CHANGE — role injection is now opt-in (`injectRole`)

`componentSemantics` gains **`injectRole?: boolean` (default `false`)**.

Previously, declaring a component's `role` caused `interactive-role-required` to
**auto-inject** `role="…"` on any role-less usage of that component with a click
handler. **That no longer happens by default.** `role` is now *descriptive* —
every rule still reads it to understand the component — and injection happens
**only when the component is declared `injectRole: true`**.

**If you have a role-declared component that relied on that automatic injection,
add `injectRole: true` to keep it.** Without it, `interactive-role-required` will
no longer report or fix a missing role on that component. This is the one change
here that can quietly alter what your CI does, so it is called out on its own.

Why the default flipped: injecting a role onto a component that renders a native
element (an icon button that renders `<button>`, say) produced a *redundant*
`role="button"` — the very thing `no-redundant-role` removes, reached through the
config path. Injection is only correct for a component that renders a
non-semantic element and genuinely needs the role; that is now the opt-in case.

### control-needs-name — two config-bridge coverage fixes (no opt-in needed)

- **Gap A:** a declared control whose only child is an unknown icon *component*
  (`<IconButton><CloseIcon/></IconButton>`) with no name supplied is now flagged
  — it was silently skipped, because the declared path had inherited the
  intrinsic path's "unknown child → can't tell → silent" conservatism.
- **Gap B:** declaring a name requirement (`requiresName` / `nameProp`) for a
  role no rule name-checks (e.g. a `<div>` combobox declared `role: 'combobox'`)
  now emits a distinct tooling-scope notice (`declaredRoleUnsupported`) instead
  of validating cleanly and doing nothing.

## @aria-a11y/cli 0.1.2

CLI only. `eslint-plugin-aria-a11y` is unchanged and stays at `0.1.1`; the rule
behaviour is byte-identical (the shared rule modules were not touched).

- **Fix: `aria check .` no longer scans build-output directories.** Reported
  from running the CLI against a real Next.js project: the walker recursed into
  `.next/**` (and would have into `out/`, `build/`), whose generated bundles
  carry `eslint-disable` comments for rules this standalone runner doesn't
  define (`@typescript-eslint/no-unused-vars`, `@next/internal/no-ambiguous-jsx`,
  …). Each surfaced as a `Definition for rule '…' was not found` error — 77 on
  the reporting project — drowning the one real finding in actual source. The
  walker now default-skips `node_modules`, `.git`, `.next`, `out`, `build`,
  `dist`, `coverage`, `.turbo`, `.vercel`, with no configuration required.
  (`node_modules` and `dist` were already skipped; `.next`/`out`/`build` were
  the gap.) An explicitly named file argument still overrides the skip — naming
  a file is intent.
- **Also honours the project's own root `.gitignore`.** Real projects already
  declare what shouldn't be linted; for a directory target, a `.gitignore` at
  that root is applied with full gitignore semantics (via the `ignore` package).
  Nested `.gitignore` files and ESLint flat-config `ignores` arrays are out of
  scope for this cut — the latter would mean executing the project's config.
- **Foreign `eslint-disable` rule references are no longer findings.** An
  `eslint-disable` for a rule outside the `aria-a11y/` namespace is a
  config/environment mismatch with the project's own ESLint setup, not an
  accessibility finding. These are now suppressed from the diagnostics and
  reported as one summary line (`note: N eslint-disable comment(s) reference
  rules unknown to this standalone runner`). **Footgun guard:** the suppression
  applies only outside `aria-a11y/`; an unknown `aria-a11y/*` reference (which
  would mean one of Aria's own rules failed to load) stays a loud error, so a
  silently-broken rule can never look like a clean pass. A test pins the
  difference.
- **New runtime dependency: `ignore`** — the gitignore matcher used by ESLint
  itself; needed for correct `.gitignore` semantics rather than a hand-rolled
  subset.
- Regression captured as a permanent fixture (`packages/cli/src/walk.test.ts`):
  a `.next`-shaped project with disable-comment-bearing bundles, asserting the
  build dirs are skipped and the one real finding survives.

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
