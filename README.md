# Aria

[![CI](https://github.com/vsm1996/aria/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/vsm1996/aria/actions/workflows/ci.yml)

Aria is an accessibility formatter. It holds itself to the contract that made
code formatters non-optional: **it never changes what the code means.** Prettier
ended brace-style debates by turning them into a failing build; Aria applies the
same discipline to the mechanical slice of accessibility work — the redundant,
conflicting, and broken ARIA that pollutes most codebases — so that slice can
run on save and gate CI instead of living in review debates. Everything that
would require a guess stays out of the automatic path, by construction.

## The core idea

Every accessibility fact is classified by where its semantics came from:
`native` (real HTML, per [aria-query](https://github.com/A11yance/aria-query)),
`declared` (explicit author ARIA or design-system config), or `inferred`
(a guess from signals like `onClick`). One gate governs the whole system:

> A fix may be auto-applied only if its basis is `native` or `declared`.
> Anything `inferred` is surfaced as a suggestion a human approves — never
> applied silently.

That single rule splits the tool into a **format tier** (meaning-preserving,
subtractive fixes that run on save and fail CI) and a **lint tier** (located
errors with suggested fixes, never auto-applied). The line between the tiers
moves: when a design system declares its component semantics via config, those
diagnostics graduate from guess to known — from suggestion to auto-fix. The
gate is enforced in code (`@aria/core`), by the host's own fix model, and by
tests, and this repo's own CI runs the same checks it preaches. The full spec
lives in [CLAUDE.md](./CLAUDE.md).

## What exists today

- **`eslint-plugin-aria-a11y`** with the full format tier implemented and
  gated:
  - **`no-redundant-role`** — removes an explicit `role` that duplicates the
    element's implicit role (`<button role="button">` → `<button>`). Resolves
    ancestor-dependent roles statically (`<li role="listitem">` is redundant
    inside a visible `<ul>`, untouchable inside a `<div>` or across any
    component/portal/dynamic boundary) and stays silent on anything
    undecidable.
  - **`no-unsupported-aria`** — removes aria-* attributes WAI-ARIA doesn't
    support on the element's resolved role (`<button aria-checked>` →
    `<button>`), using the same full-confidence role resolution. Global ARIA
    properties are never touched, and an unresolved role means every aria-*
    on the element stays put.
  - **`aria-syntax-normalize`** — canonical lowercase for ARIA attribute
    names (`aria-Label` → `aria-label`) and enumerated values
    (`aria-hidden="True"` → `"true"`). Only ever changes character case —
    tested as a property, not a promise.
- **The first lint-tier rule, with the config bridge live**:
  **`interactive-role-required`** flags a generic element (div, span) with a
  click handler and no role, then inspects its children to decide what to say.
  A button-like element — icon-only, short-labelled, or a labelled icon
  (`<div onClick><svg/>Save</div>`) — gets a `role="button"` *suggestion*; a
  genuinely ambiguous one (a card-like mix, or unknown/dynamic content) is
  report-only; and one that already wraps a real interactive element is left
  alone (that's a different bug). Every one of
  those is `inferred` basis, so the gate guarantees the suggestion can never be
  auto-applied — proven by test on both hosts. Declare a component's semantics
  in `aria.config.ts` (`componentSemantics: { IconButton: { role: 'button' } }`)
  and it graduates: basis `declared`, and now a real auto-fix inserting the
  role. That inferred-vs-declared contrast is a named end-to-end test.
- **`idref-resolves`** flags `aria-labelledby` / `aria-describedby` /
  `aria-controls` references to an id that doesn't exist anywhere in the file
  (each id in a space-separated list checked independently). It's the first
  rule where basis and tier deliberately diverge: the detection is a `native`
  fact (the id is or isn't there), but it's report-only and advisory rather
  than a CI-gating error, because there's no single safe repair and a
  reference can legitimately point across files. Literal-to-literal only —
  dynamic ids and references are left alone, and a dynamic id anywhere makes
  the whole file fail-safe silent.
- **`img-needs-alt`** flags an `<img>` exposed as an image with no accessible
  name and no decorative signal (WCAG 1.1.1). `alt=""`, `role="presentation"`,
  `aria-label`, `aria-labelledby`, and `aria-hidden` all legitimately silence
  it — the point is presence of *some* valid encoding, not the word "alt".
  Report-only, `native` basis: the missing name is a fact, but Aria won't
  invent the alt text (a hard non-goal), so it flags and leaves the words to a
  human. Also native-basis-but-lint-tier, like `idref-resolves`, but because
  it's unfixable-by-machine rather than uncertain. Via the config bridge, a
  component declared `role: 'img'` is checked the same way on its declared
  accessible-name prop (`nameProp`, defaulting to `alt`) — so a design system's
  `<Image altText="…">` is understood without assuming the prop is called `alt`.
- **`control-needs-name`** flags an interactive control with no accessible name
  — an icon-only `<button>`/`<a href>`, an unlabeled `<input>`/`<textarea>`/
  `<select>` (WCAG 4.1.2). A name can come from text content, `aria-label`, a
  resolving `aria-labelledby`, or (for form fields) an associated `<label>` by
  `htmlFor`/`id` or by wrapping; a placeholder is explicitly *not* a name.
  Report-only, `native` basis — same unfixable-by-machine reasoning as
  `img-needs-alt`. Config control components are checked on their declared
  `nameProp`, the third consumer of that field. Dynamic name sources → silent.
- **`aria-hidden-not-focusable`** flags `aria-hidden="true"` on a focusable
  element — or on a subtree that still contains one (the common modal/dropdown
  bug) — a "focusable ghost" a keyboard user can reach but assistive tech can't
  see (WAI-ARIA 1.2). `tabindex="-1"` correctly de-focuses it and is silent.
  Report-only for a third distinct reason: several valid repairs exist (remove
  `aria-hidden`, add `tabindex="-1"`, or restructure) and which is right depends
  on intent the tool can't see — so it names them and refuses to pick.

This is the full MVP rule set — **Phase 3 (the lint tier) is complete.** The
three format rules gate CI; the five lint rules surface located, human-reviewed
diagnostics, and config declarations graduate the relevant ones toward auto-fix.
- **ESLint ↔ oxlint parity, enforced.** The same rule runs under oxlint's
  experimental `jsPlugins` with zero drift across every fixture — diagnostics,
  locations, and fix output — verified by `pnpm parity:oxlint` on every push
  and PR, as a required check.
- **The tier gate as code and tests**: `@aria/core`'s `assertGate` plus a
  property suite that makes an inferred-basis auto-fix structurally impossible
  to emit.

Everything else — the remaining format rules, the lint tier, the config
bridge — is designed but not built. The live status of every rule is in
[docs/rule-registry.md](./docs/rule-registry.md); nothing is marked shipped
there that isn't tested and CI-gated here.

## Using it

Two surfaces, one rule set. **Not yet published to npm** (publish prep is done;
see below), so today you run from a clone — but the shapes are final.

### `@aria-a11y/cli` — the zero-config CLI

```sh
aria check [paths]   # report a11y diagnostics (both tiers); exits nonzero on
                     # any format-tier issue — the CI teeth
aria fix   [paths]   # apply format-tier (safe, meaning-preserving) fixes only
```

**Zero-config** means exactly that: no ESLint config file, no host setup — point
it at files or directories and it works, parsing `.jsx`/`.tsx` (and plain JS) out
of the box. It picks up an optional `aria.config.{ts,js,json}` if present (that's
how a design system declares component semantics), but requires none.

Under the hood the CLI wraps ESLint's `Linter` programmatically with a
Babel→ESTree parser — so `eslint` is a real internal dependency. That's an
implementation detail, not something you configure: the rules are the *exact
same modules* the ESLint plugin and the oxlint path run, so output is identical
to ESLint by construction (a parity test asserts it against the same fixtures).
It is "standalone" in the sense that matters — no ESLint config, no host — not a
claim of zero ESLint code inside.

### `eslint-plugin-aria-a11y` — the plugin

Standard flat-config plugin; also runs under oxlint via `jsPlugins` unchanged.
This repo's [.oxlintrc.json](./.oxlintrc.json) is a working example.

### From source (until published)

```sh
git clone https://github.com/vsm1996/aria && cd aria
pnpm install
pnpm test                                   # all rules + CLI parity + gate tests
pnpm --filter @aria-a11y/cli build               # build the CLI
node packages/cli/dist/cli.js check src     # run it against your code
```

## Architecture & contributing

[CLAUDE.md](./CLAUDE.md) is the source of truth: the working agreement, the
gate, the full implementation plan, and the milestones.
[docs/rule-registry.md](./docs/rule-registry.md) tracks every rule's tier,
basis, spec citation, and status. Start there before touching anything.
