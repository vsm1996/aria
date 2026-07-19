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
| `no-unsupported-aria` | SHIPPED | native | ARIA in HTML §2.4 / WAI-ARIA 1.2 §6.5 — ARIA attributes not in the allowed set for a role SHOULD be ignored. Removing them makes source honest. |
| `aria-syntax-normalize` | SHIPPED | native | WAI-ARIA 1.2 §6.1 — ARIA attribute names and state/property token values are processed case-insensitively; lowercase is canonical and lossless. |

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

### `no-unsupported-aria` — classification calls

The rule strips an aria-* attribute only when the element's role resolved
with full confidence (shared resolver with `no-redundant-role`: explicit
literal role recognized by aria-query wins; otherwise the implicit role with
all its undecidable → silent discipline; dynamic/spread roles, multi-token
fallback lists, unrecognized or abstract explicit roles are all silence).
Deliberate calls, each on the never-strip-on-doubt side:

- **Globals are exempt everywhere, defined as a union.** Base set: aria-query's
  own global list (the `props` of the abstract base role `roletype`). Extended
  with `aria-disabled`, `aria-invalid`, `aria-errormessage`, `aria-haspopup`:
  ARIA 1.2 narrowed these from global (1.1) to role-specific, aria-query
  follows 1.2, but browsers still map them broadly — a debatable
  reclassification is not enforced by deletion.
- **Spec-prohibited globals are still not stripped.** `generic` prohibits
  `aria-label`/`aria-labelledby` (aria-query `prohibitedProps`), but browsers
  may still compute a name from them; removal could change the tree. The
  prohibition is a flag-worthy fact for a future lint rule, not a format fix.
- **Unrecognized aria-* names are skipped** (`aria-lable=`…). A typo is a
  signal to the human; deleting it hides the bug. Candidate for a lint rule
  that suggests the nearest real attribute.
- **Role-based check only.** aria-query has no per-element attribute tables
  (ARIA in HTML's element-level constraints), so the check is strictly
  role-level. Element-level tightening would need a second data source.
- **Fail-safe on data shape:** if a future aria-query stops modeling
  `roletype`, the rule disables itself rather than run with a shrunken
  global list.

### `aria-syntax-normalize` — scope decisions

The rule ONLY changes character case, and its test suite asserts exactly
that as a property: every fix output equals its input under case folding,
and the converged output is silent (idempotence). What it normalizes:
attribute name casing (`aria-Label` → `aria-label`, when the lowercase name
is a real ARIA attribute) and enumerated value casing for boolean / tristate
/ single-token types per aria-query (`aria-hidden="True"` → `"true"`,
`aria-current="Page"` → `"page"`). Deliberate exclusions:

- **Attribute ordering — dropped from scope entirely.** In JSX, attribute
  order is program semantics whenever a spread is present (`{...p}` before
  vs. after a literal attribute changes which value wins), so reordering is
  not meaning-preserving in general; without a spread it is semantically
  inert diff churn with zero accessibility value. Not built.
- **`role` value casing.** Role token matching is case-sensitive in
  practice: `role="BUTTON"` matches no role and is ignored, so normalizing
  it would newly apply the role — a tree change, not a normalization.
- **Components.** `aria-Hidden="True"` on a component is a JS prop name and
  value; rewriting either changes what the component receives.
- **Rename guards.** Name casing fixes are skipped when a spread is present
  (pre-DOM, `aria-Label` and `aria-label` are different JS keys, so the
  rename could change which wins) or when the canonical name already exists
  (rename would create a duplicate).
- **tokenlist values** (`aria-relevant`) hold multiple tokens; multi-token
  normalization is out of scope. Unknown values (`aria-hidden="yes"`) and
  unrecognized names (`aria-lable`) are signals to the human, untouched.

### Host parity

Parity ("identical output under oxlint's `jsPlugins`") is verified by
`pnpm parity:oxlint` (`scripts/oxlint-parity.mjs`): every fixture module
(`src/rules/*.fixtures.ts`, discovered automatically — new rules are picked
up without touching the harness) runs through ESLint and oxlint (v1.74.0,
`jsPlugins` via `.oxlintrc.json`) with all plugin rules enabled, and the
harness diffs diagnostic count, message, line:col, and converged `--fix`
output — currently zero drift across every rule.

One measured host difference, by design not a drift: both hosts use the same
single-pass fixer rule (a fix starting exactly where a previous one ended is
deferred), but `eslint --fix` loops internally up to 10 passes while oxlint
applies one pass per invocation. Adjacent discrete removals (two unsupported
aria-* side by side) therefore converge in one ESLint run vs. two oxlint
runs — same fixes, same final output. The harness compares converged output;
fixtures document the one-pass state in `output` and the final form in
`converged`. Parity is a blocking CI gate (`.github/workflows/ci.yml`
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

**Config bridge status: built and tested, not yet consumed by any rule.**
`@aria/config` now ships the full mechanism: `loadAriaConfig(searchFrom)`
(cosmiconfig, upward search to the filesystem root over
`aria.config.{ts,js,cjs,json}` / `.ariarc(.json)`; "no config" is a
first-class `null` result, a malformed or schema-invalid config throws
`AriaConfigError` naming the file — never silently swallowed), the pure
synchronous `resolveComponentSemantic(config, name)` that a future lint rule
calls at lint time, and strict validation (unknown keys rejected loudly,
`source` normalized to `'declared'` and never contradicted). Caching is
per-process with per-directory search results plus a validation memo, so
repeated loads return the same object and nothing hits the filesystem per
node visit; `clearAriaConfigCache()` exists for tests and long-lived
servers. The loader is the config package's single sanctioned I/O surface —
rule logic receives a loaded config and calls only the pure resolver. No
rule consumes this yet; wiring it into the first lint rule is deliberately a
separate change.

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
