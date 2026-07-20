# Aria Rule Registry

Every rule in the system lives here. A reviewer must be able to learn a rule's
tier, basis, and spec citation without reading implementation code.

> **Phase 5 validation** ran the full plugin against five OSS React repos; see
> [validation.md](./validation.md). Two real bugs were found and are flagged as
> Known Issues below (each gets its own tested follow-up, not a drive-by fix).

## Known issues (found in Phase 5 validation)

- **`aria-hidden-not-focusable` — React `tabIndex` casing. RESOLVED.**
  `isFocusable` now reads camelCase `tabIndex` (JSX's casing) as well as
  lowercase `tabindex`, so the spec-recommended `aria-hidden` +
  `tabIndex="-1"` de-focus pattern is no longer flagged. Regression fixtures
  use the camelCase casing. An audit confirmed no other rule had a
  camelCase/lowercase attribute-name mismatch (`control-needs-name` already
  handled `htmlFor`/`for`; all other checked attributes — `id`, `role`,
  `href`, `type`, `list`, `aria-*` — are unchanged in JSX). See validation.md,
  BUG 1.
- **`control-needs-name` — `aria-hidden` not exempted.** An `aria-hidden="true"`
  control is out of the accessibility tree and needs no name, but the rule
  flags it anyway (inconsistent with `img-needs-alt`, which exempts it).
  Fixable; needs a follow-up PR. See validation.md, BUG 2.

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

## Lint-tier rules (mostly inferred; see `idref-resolves` for native)

These surface as located diagnostics, human-reviewed, never auto-applied. Most
carry `inferred` basis. `idref-resolves` is the exception: a `native` fact
that is still lint-tier because there is no single safe repair and its finding
is advisory, not conclusive — the basis and the tier deliberately diverge (see
its section below).

| id | status | basis | confidence band | spec citation |
|----|--------|-------|-----------------|---------------|
| `interactive-role-required` | SHIPPED | inferred → declared via config | intrinsic: child-inspected suggestion / report-only / silent · declared: auto-fix | WCAG 2.1 SC 4.1.2 — UI components must have a role. Non-semantic elements with event handlers need one. |
| `control-needs-name` | SHIPPED | native (report-only) · declared for the component path | 100% (in-file) | WCAG 2.1 SC 4.1.2 — UI components must have an accessible name. Cannot author the name text — flagging only. |
| `img-needs-alt` | SHIPPED | native (report-only) | 100% (in-file) | WCAG 2.1 SC 1.1.1 — All non-decorative images need alt text. Cannot author the text — flagging only. |
| `idref-resolves` | SHIPPED | native (report-only) | 100% (in-file) | WAI-ARIA 1.2 §7 — aria-labelledby/describedby/controls MUST reference a valid id. In-file check only. |
| `aria-hidden-not-focusable` | SHIPPED | native (report-only) | 100% (in-file) | WAI-ARIA 1.2 — aria-hidden=true MUST NOT be applied to a focusable element (or a subtree containing one). Fix is ambiguous → lint. |

*`img-needs-alt` has native basis for the detection (the img tag is known), but
the fix would author alt text (an asserted value), so it stays lint-tier — see
its section below for the full basis/tier reasoning.

### `interactive-role-required` — confidence policy and bridge wiring

The first lint-tier rule, and the precedent for every one after it. Its
confidence policy has been revised as the rule matured; this section is the
current, authoritative version (superseding the earlier "single default
suggestion" and, briefly, "report-only for everything" formulations).

**Detection (unchanged across revisions):** a confidently-resolved `generic`
intrinsic element (div, span, bare `<a>`) with a *confirmed* click handler
and no role. Everything short of that is silent: an explicit role in any
form, a spread (could carry a role or handler), a handler expression we
cannot confirm is real (conditionals, `undefined`), non-generic implicit
semantics (`<h1 onClick>`), and undecidable ancestor-dependent roles.

**Confidence policy — the intrinsic path inspects the element's CHILDREN**,
not merely the presence of `onClick`, and sorts into three outcomes:

- **Confident → a `role="button"` SUGGESTION** (never an auto-fix; see the
  gate note below) in three narrow, defensible shapes — with nothing else in
  the subtree (no dynamic `{expression}` or fragment children): (1) *icon-only*
  — no text anywhere in the subtree and exactly one non-interactive intrinsic
  element child (`<svg>`, `<i>`, `<img>`); (2) *short-text-only* — a single
  short action-like text child and no element children (`<div onClick>Save</div>`);
  (3) *icon + short text* — one such element child AND one such short text
  child (`<div onClick><svg/>Save</div>`), the most button-like shape of all, a
  labelled icon button (order-agnostic). The label bar is deliberately minimal
  — one text child, trimmed, ≤ 3 words — not a verb dictionary. The bucket
  stays narrow: a long text alongside an icon, or more than one element child
  next to the text, falls to report-only.
- **Silent → report nothing** when the element *contains a nested
  interactive element* (a native control, an element with a widget role per
  aria-query's superclass chain, or another generic-with-onClick). That is a
  **different bug — invalid nesting of interactive elements — and an explicit
  non-goal of this rule**, not an oversight. Suggesting a role on the outer
  element would compound it. Each interactive child is still judged on its
  own merits; only the outer wrapper is left alone. This also governs the
  "several independently-clickable children" shape (a toolbar-like
  container): its children are interactive, so the container stays silent
  rather than being flagged.
- **Report-only → flag, no fix, no suggestion** for the genuinely ambiguous
  remainder: a card-like mix of image + text + nested content, a long text
  body, an empty or whitespace-only element, or — importantly — any element
  whose contents are *unknown*: a nested component (its output is invisible
  from the call site and may itself be interactive) or a dynamic
  `{expression}`. The role can't be inferred, but the missing role is still
  a real finding. No guessing `menuitem`/`tab`/etc.: those need parent
  context (is it inside `role="menu"`?) that is a candidate for a *future*
  rule, not this one.

**Deliberate conservatism call, flagged for the record:** an icon that is a
*component* (`<div onClick><Icon/></div>`) is report-only, not a confident
suggestion, because the resolver cannot confirm the component is
non-interactive (it may itself render a `<button>`) — it errs toward
report-only rather than a guess. (An earlier revision also treated an
*icon+text* labelled button as report-only; that is now resolved — it is a
confident suggestion, shape (3) above.)

**The gate, not a convention, is why confidence never buys an auto-fix.**
Every intrinsic diagnostic is `basis: inferred`. `emit` maps inferred to a
host *suggestion*, and the core gate throws on any inferred + auto-fix
pairing (`assertGate`). So even the confident cases produce a suggestion a
human approves; raising confidence cannot loosen this. The test
`confident intrinsic suggestion is a suggestion, never a fix` proves it on
this real rule (RuleTester shows the suggestion output yet `output: null`;
`verifyAndFix` writes nothing), and the oxlint parity harness proves the
same on the other host (oxlint never applies suggestions under `--fix`).

**Unknown custom components are silent, not guessed at.** Their rendered
output is invisible from the call site and is very often already a native
`<button>`; suggesting `role="button"` on the wrapper coaches users into
double semantics. The graduation path below is the sanctioned alternative.

**The config bridge is now live, consumed by this rule.** Mechanism: on a
capitalized component with a confirmed onClick and no role, the rule calls
`resolveComponentSemantic(config, componentName)`. A match turns a situation
that would otherwise be an inferred report (or, for an unknown component,
silence) into a `basis: declared` diagnostic with a real auto-applied fix
inserting the declared role — a known answer, not a guess.
Config comes from inline rule options (deterministic; what tests and the
parity harness use) or, absent options, from `@aria/config`'s file loader
searching upward from the linted file. The named test
`graduation contrast (config bridge, end to end)` in
`interactive-role-required.test.ts` is the executable proof, alongside the
gate-misuse test showing an inferred-basis fix structurally cannot emit as
a host auto-fix.

### `idref-resolves` — a native fact in the lint tier

Flags `aria-labelledby` / `aria-describedby` / `aria-controls` references
(each a space-separated id list) to an id not present in the file. All three
attributes are checked; each unresolved id in a list is its own diagnostic.

**Basis/tier — the first rule where they deliberately diverge.** Whether a
literal reference resolves against the file's literal `id`s is a *fact* read
straight off the source, so the detection basis is `native` — not a guess,
and the message states it plainly. But the rule sits in the **lint tier,
report-only, `warn` by default**, decoupled from the `format` that
`tierForBasis('native')` would return, for two reasons:

1. **No single safe repair exists.** A broken reference could be fixed by
   deleting it, correcting a typo, or adding the missing id to some element —
   the rule cannot know which, so it never auto-fixes. "Missing id is a fact;
   the correct fix is not."
2. **"Not found in this file" is not conclusively a bug.** Ids are resolved
   in the rendered DOM, which can compose elements from other files or inject
   ids at runtime. A legitimate cross-file reference must not fail CI — that
   would be a false positive on correct code, the one thing the format tier
   may never do. So this is advisory: a `warn` a human confirms. (Nothing
   enforces `tier === tierForBasis(basis)`; this rule departs from that
   convention consciously, as the plan foresaw by listing it as `native` in
   the lint tier. A team confident in its in-file id discipline can raise it
   to `error` in their own config; the rule reports regardless of severity.)

**Scope and the literal-only discipline:**

- **In-file, whole-file.** Ids are global to the DOM, so a reference resolves
  against any literal `id` anywhere in the file, not just siblings/ancestors;
  forward references (target after the reference in source order) resolve too.
  Resolution runs on `Program:exit`, after the whole file is collected.
- **Literal-to-literal only.** A dynamic reference (`aria-labelledby={id}`) is
  never checked. `id={'x'}` (a string-literal expression) counts as literal.
- **Case-sensitive**, like `getElementById`: `aria-labelledby="Foo"` does not
  resolve to `id="foo"` — a real non-resolution, reported.
- **A dynamic id anywhere suppresses ALL unresolved-reference reports for the
  file.** A `id={computed}` could evaluate to any referenced string at
  runtime, so no literal reference can be *proven* absent. Fail-safe: stay
  silent. This honors the "id exists only as a dynamic value → silent" case,
  at the cost of false negatives in files mixing a broken ref with a dynamic
  id — an acceptable trade (a missed warning, never a wrong one).

**Near-match auto-fix exception — deliberately skipped in v1.** The plan
allows a format-tier auto-fix "when the correct target is unique and present"
(e.g. a case-only typo where exactly one id in the file matches
case-insensitively). It is not built: report-only surfaces the problem and
the casing fix is trivial for a human, while the safe bar is narrow and the
token-level surgery within a multi-id value adds complexity disproportionate
to a first version. The door is left open at a *high* bar for later — exact
case-insensitive match with exactly one candidate id, correcting the
*reference* token to match an existing element (never inventing an id, never
Levenshtein guessing). No fuzzy matching.

### `img-needs-alt` — decorative detection and a schema gap

Flags an intrinsic `<img>` that is exposed as an image but has no accessible
name and no decorative signal (WCAG 1.1.1). Report-only — Aria never authors
the alt text.

**Basis/tier — native fact, lint tier, but NOT idref-resolves's reason.** The
detection is a `native` fact (the img's own attributes are read directly).
Unlike idref-resolves there is *no* cross-file ambiguity: an image's
accessible name can come only from its own attributes or a locally-present
`aria-labelledby` attribute, so a nameless `<img>` is a clear-cut violation,
not a "maybe fine elsewhere" case. It is still lint-tier / report-only for a
different reason: the only repair is authoring alt text, which is a hard
non-goal ("Aria will not invent label text, alt copy, or descriptions"). So
two native-basis lint-tier rules now exist for two distinct reasons —
idref-resolves is *uncertain-if-broken* (advisory), img-needs-alt is
*certainly-broken-but-unfixable-by-machine* (flag-only). Surfaced as `warn`;
a team may raise it to `error` (there is no false-positive-driven reason to
soften it, unlike idref-resolves).

**What silences the flag (an img is fine when any hold), evaluated
conservatively — presence, dynamic value, or spread all silence:**

- **A name mechanism:** `alt` in any form (`alt="text"` is a name; `alt=""` is
  the spec-correct decorative marker; `alt={expr}` is unevaluable → silent),
  `aria-label`, or `aria-labelledby`. Beyond the plan's alt+role list on
  purpose: flagging `<img aria-label="Logo">` as needing alt would be a false
  positive. Presence of the *attribute* is always in-file-visible, so this
  stays a pure in-file check (whether an `aria-labelledby` target resolves is
  idref-resolves's job, not this rule's).
- **A decorative / non-image role:** `role="presentation"` or `role="none"`
  (decorative); a dynamic `role={…}` (could be decorative → silent); or any
  other explicit role (the element is no longer exposed as an image, so alt is
  out of scope — whether it needs a *name* is control-needs-name's concern).
  Only an implicit img or explicit `role="img"` stays in scope.
- **Hidden from assistive tech:** `aria-hidden` present and not literal
  `"false"` (boolean shorthand and dynamic values count as hidden → silent).
- **A spread** (`<img {...props} />`) — could carry any of the above.

**Deliberately NOT accepted:** `title`. It is a discouraged, unreliable name
source (not surfaced to touch/keyboard users); an `<img title="…">` with no
alt is still flagged, matching jsx-a11y.

**Scope for intrinsic detection:** the `<img>` tag only. `role="img"` on a
*non-img* element (`<div role="img">`) is a related case — it needs an
accessible *name*, not `alt` specifically — and is left to control-needs-name
/ a later pass.

**Config bridge — LIVE, via the generic `nameProp` field.** A component
declared as an image (`role: 'img'`) is checked exactly like intrinsic
`<img>`, but on its declared accessible-name prop instead of hardcoded `alt`.
The prop comes from `resolveNameProp(semantic)` in `@aria/config`: an explicit
`nameProp` wins, else `'alt'` is the default for `role: 'img'`, else undefined
(no name-checking basis → silent). So `{ MyImage: { role: 'img', nameProp:
'altText' } }` makes `<MyImage/>` with no `altText` flagged, `altText=""`
decorative-silent, `altText={x}` dynamic-silent — the same
decorative/dynamic/aria-label exceptions as the intrinsic path, applied to the
named prop. `{ Logo: { role: 'img' } }` (no `nameProp`) defaults to checking
`alt`. No matching config, or a non-image declaration, stays silent. The
component-path diagnostic carries basis `declared` (the image-ness is config
ground truth) and is still report-only — declared basis does not imply a fix;
Aria still cannot author the name.

`nameProp` is intentionally **generic**, not img-specific: it answers "which
prop carries this component's accessible name" for any name-aware rule.
`img-needs-alt` is the first consumer; **`control-needs-name` is the second**
(shipped), reading the same field the same way for non-image interactive
components — no re-touching required.

### `control-needs-name` — the scope boundaries and the name checks

Flags an interactive control with no accessible name (WCAG 4.1.2).
Report-only — Aria cannot author label text. Basis/tier is the *same*
decoupling as img-needs-alt: `native` fact, lint tier because
unfixable-by-machine (not because uncertain). The config-component path emits
`declared` (config ground truth) and is still report-only.

**Element scope (v1, deliberately tight):**

- **Named by content or ARIA:** `<button>`, `<a href>`, and anything the
  shared resolver calls role `button` or `link` (so explicit `role="button"`
  on a div, etc.). Name from subtree text, `aria-label`, or a resolving
  `aria-labelledby`.
- **Named by a label or ARIA (never by content, never by placeholder):**
  `<input>` whose role is `textbox`/`searchbox`/`checkbox`/`radio`,
  `<textarea>`, and `<select>`. (`<select>` resolves to `null` in the shared
  resolver, so it is gated by tag, not role.)
- **Out of scope, flagged for a later decision rather than silently added:**
  `<input type="number">` (spinbutton) and `type="range"` (slider) — they need
  names and are the same shape, but sit outside the prompt's explicit list;
  `<input>` button-types (submit/reset/button/image) — role `button` but named
  by the `value`/`alt` attribute, a different mechanism; and every other ARIA
  widget role (tab, menuitem, switch, …). These are real future scope.

**What counts as a name** (any one silences; a *dynamic* form of any of them
means "can't determine" → silent, never flagged):

- Visible text anywhere in the subtree (content controls only).
- `aria-label` — a **non-empty literal** string. `aria-label=""` is not a name.
- `aria-labelledby` — supplies a name only if at least one token **resolves to
  an in-file id**. This reuses idref-resolves's resolution semantics via the
  shared `util/file-ids.resolveIdref` (idref-resolves was refactored onto the
  same helper). An unresolved labelledby supplies no name (that's
  idref-resolves's bug to report, not a name here); a dynamic id anywhere makes
  it "could resolve at runtime" → silent.
- For form controls: an associated `<label>`, **via `htmlFor`/`id` match
  (in-file) OR by a literal `<label>` ancestor wrapping the control.**

**Placeholder is NOT a name** — it disappears on input and fails WCAG in most
interpretations. `<input placeholder="Search">` with no other name is flagged.

**Two boundary calls, flagged for the record:**

1. **Implicit label wrapping is handled** (a literal `<label>` ancestor
   silences the control) — beyond the prompt's literal "htmlFor/id" spec, but
   omitting it would false-positive the extremely common
   `<label>Name <input/></label>` pattern. Conservative: the ancestor `<label>`
   silences without inspecting its text (false-negative-safe).
2. **Component ancestors are NOT assumed to render a label.** A raw `<input>`
   inside a label-rendering *component* (`<Field><input/></Field>`) with no
   visible label or ARIA IS flagged — component internals are invisible, the
   same principle as everywhere. The fix is `aria-label`, an explicit
   `<label>`, or declaring the *component* (not the raw input) via config.

**Component path** mirrors img-needs-alt: a config entry whose `role` is a
control role (button/link/textbox/…) and whose `resolveNameProp` yields a prop
is checked for that prop (present non-empty → silent, absent/empty → flagged,
dynamic → silent), plus the same ARIA/content checks on the usage. A `role:
'img'` component, or one with no resolvable name prop, stays silent (not this
rule's concern). Basis `declared`, report-only.

### `aria-hidden-not-focusable` — the third reason for native-basis / lint-tier

Flags `aria-hidden="true"` on a focusable element, or on a subtree containing
a focusable element — a "focusable ghost" a keyboard user can still reach but
assistive tech cannot describe (WAI-ARIA 1.2). Report-only.

**Basis/tier — a THIRD distinct reason.** The three native-basis lint rules
now decouple from `format` for three different reasons, a real taxonomy:

- `idref-resolves` — native but lint because the finding is *uncertain*
  (cross-file resolution) — advisory.
- `img-needs-alt` / `control-needs-name` — native but lint because
  *unfixable-by-machine* (only a human can author the content).
- `aria-hidden-not-focusable` — native but lint because *multiple valid,
  intent-dependent repairs exist and Aria refuses to pick*: remove the
  `aria-hidden` (it should be perceivable), add `tabindex="-1"` (it should
  stay hidden but out of the tab order), or restructure so the control isn't
  in the hidden subtree. A mechanical fix *is* available here (unlike the
  middle category) — the rule declines it on purpose.

**Fix/suggestion — considered and declined, for both cases.** A single-element
`tabindex="-1"` suggestion was weighed against interactive-role-required's
confident-suggestion precedent and rejected: it is correct only if the author
*meant* to hide the element. If the `aria-hidden` was accidental, the right
fix is removing it, and suggesting `tabindex="-1"` would turn a recoverable
focusable-ghost into a fully keyboard-unreachable control — strictly worse. The
correct repair depends on unknowable intent, exactly what the plan reserves.
So: report-only, no fix, no suggestion; the message names the options.

**Focusability — defined, not winged.** Focusable = a native control
(`<button>`, `<a href>`, non-`hidden` `<input>`, `<select>`, `<textarea>`) OR
any element with a literal `tabindex` ≥ 0. `tabindex="-1"` is explicitly
non-focusable (the spec-recommended de-focus pattern), so
`aria-hidden="true" tabindex="-1"` is correct and silent. A literal `tabindex`
overrides native focusability either way. Dynamic `tabindex={expr}`, dynamic
`href`/`type`, dynamic `aria-hidden={cond}`, and a spread all resolve to
"undecidable → silent."

**Subtree detection — built.** The prompt's instinct is right (a hidden
container with a focusable descendant is the more common bug), and the walk is
safe: the same recursive child scan as interactive-role-required /
control-needs-name, applying the focusability predicate, with components and
dynamic `{expr}` children treated as `unknown` → silent. Known limitation:
`<div aria-hidden="true">{children}</div>` (dynamic children) is silent — the
subtree can't be seen — but that usually coincides with a dynamic `aria-hidden`
(a toggled modal), which is silent regardless. Direct-JSX subtrees are caught.

**Component path — deferred, with an option flagged.** A component with
`aria-hidden` is out of scope: `aria-hidden`/`tabindex` usually pass through,
but we cannot see whether they land on a focusable element inside. A future
version *could* use the existing `role` field to infer focusability (interactive
widget roles are focusable), but that layers a role→focusability inference on a
forwarding assumption — a real judgment call, not a clean reuse of existing
fields, so it is surfaced here rather than built solo. (Inside a hidden subtree,
a component descendant is already handled conservatively as `unknown` → silent.)

---

## Phase 3 status: COMPLETE

All planned Phase 3 lint rules are shipped: `interactive-role-required`,
`img-needs-alt`, `idref-resolves`, `control-needs-name`, and
`aria-hidden-not-focusable`. Together with the Phase 2 format tier
(`no-redundant-role`, `no-unsupported-aria`, `aria-syntax-normalize`) and the
config bridge, the MVP rule set from the plan is complete. The lint tier
demonstrates the full range the architecture set out to cover: an
inferred-basis rule that graduates to declared auto-fix via config
(`interactive-role-required`), and native-basis report-only rules that stay
lint-tier for three distinct, documented reasons (uncertain / unfixable /
refuses-to-pick). What remains in the plan is validation-and-release (Phase 5)
and multi-framework (Phase 6), not new MVP rules.

---

## Graduation queue (lint → format on declared basis)

A rule moves from lint to format when config supplies ground truth for the detection.
The mechanism: `componentSemantics` in aria.config.ts changes `basis: inferred` to
`basis: declared`, which the `emit` helper translates to an auto-applied `fix`.

**Config bridge status: live — three consumers.**
`interactive-role-required` reads `role` (component name match → declared basis
→ an auto-applied fix inserting the declared role). `img-needs-alt` and
`control-needs-name` read `role` plus the accessible-name prop via
`resolveNameProp` (declared basis, report-only) — img-needs-alt for `role:
'img'`, control-needs-name for control roles (button/link/textbox/…). All stay
silent without a match.

**`ComponentSemantic` schema fields:** `role` (the ARIA role the component
renders as), `requiresName?` (boolean; declared but not yet consumed),
`nameProp?` (the prop that carries the accessible name — generic across
name-aware rules; consumed by `img-needs-alt`, next by `control-needs-name`;
`resolveNameProp` defaults it to `'alt'` when `role: 'img'`), and `source`
(always `'declared'`, normalized in). Validation rejects unknown keys and
non-conforming values loudly; a non-string/empty `nameProp` is rejected like
every other field.

`@aria/config` ships the full mechanism: `loadAriaConfig(searchFrom)`
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
rule logic receives a loaded config and calls only the pure resolvers
(`resolveComponentSemantic`, `resolveNameProp`).

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
