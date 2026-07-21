# Aria

[![CI](https://github.com/vsm1996/aria/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/vsm1996/aria/actions/workflows/ci.yml)
[![npm: eslint-plugin-aria-a11y](https://img.shields.io/npm/v/eslint-plugin-aria-a11y?label=eslint-plugin-aria-a11y)](https://www.npmjs.com/package/eslint-plugin-aria-a11y)
[![npm: @aria-a11y/cli](https://img.shields.io/npm/v/%40aria-a11y%2Fcli?label=%40aria-a11y%2Fcli)](https://www.npmjs.com/package/@aria-a11y/cli)

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

The gate maps directly onto the hosts' own fix models:

| Basis | Tier | ESLint / oxlint emit | Applied on save / `--fix`? |
|-------|------|----------------------|----------------------------|
| `native`, `declared` | format | `fix` | yes — and fails CI when present |
| `inferred` | lint | `suggestion` | never — a human approves |

That single rule splits the tool into a **format tier** (meaning-preserving,
subtractive fixes that run on save and fail CI) and a **lint tier** (located
diagnostics, never auto-applied). The line between the tiers moves: when a
design system declares its component semantics via config, those diagnostics
graduate from guess to known — from suggestion to auto-fix. The gate is
enforced three times — in code (`@aria/core`'s `assertGate` makes an
inferred-basis auto-fix structurally impossible to emit), by the host's own
fix model, and by tests — and this repo's own CI runs the same checks it
preaches. The full philosophy lives in [CLAUDE.md](./CLAUDE.md).

## Status

Everything below is shipped, tested, and CI-gated — the
[rule registry](./docs/rule-registry.md) is the source of truth, and nothing
is marked shipped there that isn't.

- **Both packages live on npm at `0.1.1`:**
  [`eslint-plugin-aria-a11y`](https://www.npmjs.com/package/eslint-plugin-aria-a11y)
  and [`@aria-a11y/cli`](https://www.npmjs.com/package/@aria-a11y/cli).
- **All 8 planned MVP rules shipped** — 3 format-tier, 5 lint-tier (below).
- **CI is a required check with branch protection**: typecheck, the full test
  suite (including the tier-gate property tests), ESLint ↔ oxlint parity, and
  a real pack-install-and-import verification on every push and PR.
- **ESLint ↔ oxlint parity, enforced**: the same rules run under oxlint's
  experimental `jsPlugins` with zero drift across every fixture — diagnostics,
  locations, and fix output.
- **The config bridge is live with three consumers** (see below).

### Format tier — auto-fixed, gates CI

| rule | what it does |
|------|--------------|
| `no-redundant-role` | Removes an explicit `role` that duplicates the element's implicit role (`<button role="button">` → `<button>`). Resolves ancestor-dependent roles statically; silent on anything undecidable. |
| `no-unsupported-aria` | Removes aria-* attributes WAI-ARIA doesn't support on the element's resolved role (`<button aria-checked>` → `<button>`). Global ARIA properties are never touched. |
| `aria-syntax-normalize` | Canonical lowercase for ARIA attribute names (`aria-Label` → `aria-label`) and enumerated values (`aria-hidden="True"` → `"true"`). Only ever changes character case — tested as a property. |

### Lint tier — located diagnostics, human-reviewed, never auto-applied

| rule | what it flags |
|------|---------------|
| `interactive-role-required` | A generic element (div, span) with a click handler and no role. Button-like children earn a `role="button"` *suggestion*; ambiguous content is report-only. Graduates to a real auto-fix when config declares the component. |
| `control-needs-name` | An interactive control with no accessible name — icon-only buttons/links, unlabeled form fields. A placeholder is explicitly *not* a name. |
| `img-needs-alt` | An `<img>` exposed as an image with no accessible name and no decorative signal. `alt=""`, `role="presentation"`, `aria-label`, and `aria-hidden` all legitimately silence it. |
| `idref-resolves` | `aria-labelledby` / `aria-describedby` / `aria-controls` references to an id that doesn't exist anywhere in the file. Advisory — a reference can legitimately point across files. |
| `aria-hidden-not-focusable` | `aria-hidden="true"` on a focusable element, or on a subtree still containing one — a "focusable ghost." Several valid repairs exist, so it names them and refuses to pick. |

Several lint rules detect a `native` *fact* yet stay lint-tier on purpose —
because the finding is advisory, because only a human can author the repair,
or because multiple valid repairs exist. The registry documents each reason.

### The config bridge

Declare a component's semantics and the engine stops guessing:

```ts
// aria.config.ts
import { defineConfig } from '@aria/config';

export default defineConfig({
  componentSemantics: {
    IconButton: { role: 'button' },
    MyImage: { role: 'img', nameProp: 'altText' },
  },
});
```

Live with three consumers: `interactive-role-required` (a declared role turns
an inferred suggestion into a declared auto-fix — proven by a named end-to-end
test), plus `img-needs-alt` and `control-needs-name`, which read the generic
`nameProp` field to check a design system's accessible-name prop without
assuming it's called `alt`.

## Validated on real code

Phase 5 ran all 8 rules against five OSS React repos — mui/material-ui,
excalidraw, vercel/commerce, react-bootstrap, and grommet — with the
product-code findings reviewed by hand ([full writeup](./docs/validation.md)):

- **24 product-code findings.** The 22 in the app repos (excalidraw, commerce)
  held up under review as true positives — role-less clickable divs,
  placeholder-only search inputs, a title-only icon button.
- **The other two — both on a single MUI element — were false positives,
  traced to two real rule bugs** (React `tabIndex` casing; `aria-hidden`
  controls not exempted from the name requirement). Each was fixed in its own
  tested follow-up with regression fixtures — see Known Issues in the
  [registry](./docs/rule-registry.md).
- **The format tier fired zero times** — mature codebases don't ship malformed
  ARIA syntax, which is the point: its value is gating *changing* code in CI,
  not bulk-auditing clean repos.
- **Spread-heavy component libraries are near-silent without config** — the
  rules refuse to guess through `{...props}`. That's the gap the config bridge
  exists to close.

## Using it

Two surfaces, one rule set — the CLI runs the *exact same modules* as the
plugin, with output identical to ESLint by construction (a parity test asserts
it).

### `eslint-plugin-aria-a11y` — the plugin

```sh
npm install --save-dev eslint eslint-plugin-aria-a11y
```

```js
// eslint.config.js
import aria from 'eslint-plugin-aria-a11y';

export default [
  { plugins: { 'aria-a11y': aria }, rules: aria.configs.recommended.rules },
];
```

The recommended config sets the three format-tier rules to `error` — that's
the CI gate — and the five lint-tier rules to `warn`. The plugin also runs
under oxlint via `jsPlugins`, unchanged; this repo's own
[.oxlintrc.json](./.oxlintrc.json) is a working example.

### `@aria-a11y/cli` — the zero-config CLI

```sh
npx @aria-a11y/cli check [paths]   # report a11y diagnostics (both tiers);
                                   # exits nonzero on any format-tier issue — the CI teeth
npx @aria-a11y/cli fix   [paths]   # apply format-tier (safe, meaning-preserving) fixes only
```

**Zero-config** means exactly that: no ESLint config file, no host setup — point
it at files or directories and it works, parsing `.jsx`/`.tsx` (and plain JS) out
of the box. It picks up an optional `aria.config.{ts,js,json}` if present (that's
how a design system declares component semantics), but requires none.

Under the hood the CLI wraps ESLint's `Linter` programmatically with a
Babel→ESTree parser — so `eslint` is a real internal dependency. That's an
implementation detail, not something you configure. It is "standalone" in the
sense that matters — no ESLint config, no host — not a claim of zero ESLint
code inside.

> **Version note:** start at **0.1.1**. `0.1.0` exists in npm's history but was
> broken for installers (a packaging bug — its manifest pointed at unshipped
> `src`); it's fixed in 0.1.1 and guarded by a real install-and-import CI check.
> See [CHANGELOG.md](./CHANGELOG.md).

### From source

```sh
git clone https://github.com/vsm1996/aria && cd aria
pnpm install
pnpm test                                   # all rules + CLI parity + gate tests
pnpm --filter @aria-a11y/cli build          # build the CLI
node packages/cli/dist/cli.js check src     # run it against your code
```

## Links

- npm: [`eslint-plugin-aria-a11y`](https://www.npmjs.com/package/eslint-plugin-aria-a11y) · [`@aria-a11y/cli`](https://www.npmjs.com/package/@aria-a11y/cli)
- [CHANGELOG](./CHANGELOG.md) — including why 0.1.0 exists but shouldn't be used
- [aria-formatter.vercel.app](https://aria-formatter.vercel.app/) — the docs/marketing site, itself checked by Aria: zero findings ([source](https://github.com/vsm1996/aria-site))

## Architecture & contributing

[CLAUDE.md](./CLAUDE.md) is the source of truth: the working agreement, the
gate, the full implementation plan, and the milestones.
[docs/rule-registry.md](./docs/rule-registry.md) tracks every rule's tier,
basis, spec citation, and status — plus every documented judgment call the
rules make. Start there before touching anything.
