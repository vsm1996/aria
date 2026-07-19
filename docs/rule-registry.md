# Aria Rule Registry

Every rule in the system lives here. A reviewer must be able to learn a rule's
tier, basis, and spec citation without reading implementation code.

## Status keys

- `SHIPPED`    — in the npm package, gating CI
- `PHASE 1`    — being implemented now (red test exists)
- `CANDIDATE`  — in scope, not yet started
- `WATCH`      — awaiting host platform support before implementation

---

## Format-tier rules (basis: native | declared)

These are auto-applied on save / `--fix`. They never add asserted values.

| id | status | basis | spec citation |
|----|--------|-------|---------------|
| `no-redundant-role` | SHIPPED | native | WAI-ARIA 1.2 §6.3 — "Authors MUST NOT use an explicit role that is the same as the element's implicit ARIA role." |
| `no-unsupported-aria` | CANDIDATE | native | ARIA in HTML §2.4 — ARIA attributes not in the allowed set for a role SHOULD be ignored. Removing them makes source honest. |
| `aria-syntax-normalize` | CANDIDATE | native | WAI-ARIA 1.2 §6.1 — role and state/property values are case-insensitive tokens; normalizing to lowercase is lossless. |

### `no-redundant-role` — ancestor-dependent implicit roles

Some implicit roles exist only in an ancestor context (HTML-AAM element
mapping): `<li>` is `listitem` only inside `<ul>`/`<ol>`/`<menu>`; `<footer>`/
`<header>` are `contentinfo`/`banner` only when scoped to `<body>`; `<td>` is
`cell` vs `gridcell` by the ancestor table's role; `<th>` is positional. The
rule resolves aria-query's concept-level constraints statically where the JSX
makes them decidable and stays silent everywhere else:

- **Acts**: `<li role="listitem">` directly inside a static `<ul>`/`<ol>`/
  `<menu>` (no spread, no role override, fragments transparent); `<th>` with an
  explicit `scope`.
- **Silent**: any broken ancestor chain (component boundary, `.map()` callback,
  orphan element, spread or dynamic role on the list parent); `footer`/`header`
  scoping and `td` table-role constraints (never provable from a JSX fragment);
  bare `<th>` (aria-query's unconditioned `th → columnheader` entry
  under-encodes HTML-AAM's positional condition, so acting on it could change
  meaning); any constraint string the matcher does not recognize (future
  aria-query versions fail safe).

Fixtures pinning every case: `no-redundant-role.fixtures.ts` (shared by the
RuleTester suite and the oxlint parity harness).

### Host parity

Phase 1 acceptance ("identical output under oxlint's `jsPlugins`") is verified
by `pnpm parity:oxlint` (`scripts/oxlint-parity.mjs`): every fixture runs
through ESLint and oxlint (v1.74.0, `jsPlugins` via `.oxlintrc.json`) and the
harness diffs diagnostic count, message, line:col, and `--fix` output —
currently zero drift. Parity is a blocking CI gate (`.github/workflows/ci.yml`
runs `typecheck`, `test`, and `parity:oxlint` on push to main and on every
PR), not a command someone has to remember. Caveats: `jsPlugins` is still
experimental upstream, and
oxlint loads the **built** plugin (`dist/`), since its Node plugin runtime
cannot resolve TS source imports — the harness rebuilds before running.

---

## Lint-tier rules (basis: inferred)

These surface as located errors + suggested fixes. Never auto-applied. Humans approve.

| id | status | basis | confidence band | spec citation |
|----|--------|-------|-----------------|---------------|
| `interactive-role-required` | CANDIDATE | inferred | 50–85% | WCAG 2.1 SC 4.1.2 — UI components must have a role. Non-semantic elements with event handlers need one. |
| `control-needs-name` | CANDIDATE | inferred | 70–99% | WCAG 2.1 SC 4.1.2 — UI components must have an accessible name. Cannot author the name text — flagging only. |
| `img-needs-alt` | CANDIDATE | native* | 100% | WCAG 2.1 SC 1.1.1 — All non-decorative images need alt text. Cannot author the text — flagging only. |
| `idref-resolves` | CANDIDATE | native | 100% (in-file) | WAI-ARIA 1.2 §7 — aria-labelledby/describedby/controls MUST reference a valid id. In-file check only. |
| `aria-hidden-not-focusable` | CANDIDATE | native | 100% | WAI-ARIA 1.2 §6.6 — aria-hidden=true MUST NOT be applied to a focusable element. Fix is ambiguous → lint. |

*`img-needs-alt` has native basis for the detection (the img tag is known), but
the fix would author alt text (an asserted value), so it stays lint-tier.

---

## Graduation queue (lint → format on declared basis)

A rule moves from lint to format when config supplies ground truth for the detection.
The mechanism: `componentSemantics` in aria.config.ts changes `basis: inferred` to
`basis: declared`, which the `emit` helper translates to an auto-applied `fix`.

| rule | graduates when |
|------|---------------|
| `interactive-role-required` | component declared with an explicit `role` in config |
| `control-needs-name` | component declared with `requiresName: true` in config |

---

## Watch queue (awaiting host platform support)

| rule domain | blocked on |
|-------------|-----------|
| Vue SFC template rules | oxlint Vue parser (in progress per oxlint MS3) |
| Svelte component rules | oxlint Svelte parser (not started) |
| HTML template rules | oxlint / parse5 integration (not started) |
