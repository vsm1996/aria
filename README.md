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

- **`eslint-plugin-aria-a11y`** with one format-tier rule implemented and
  gated: **`no-redundant-role`** — removes an explicit `role` that duplicates
  the element's implicit role (`<button role="button">` → `<button>`).
  It resolves ancestor-dependent roles statically (`<li role="listitem">` is
  redundant inside a visible `<ul>`, untouchable inside a `<div>` or across
  any component/portal/dynamic boundary) and stays silent on anything
  undecidable.
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

**Not yet.** The plugin isn't published to npm and the packages are marked
private — there is no supported way to depend on it from another project
today, and a git-dependency install won't resolve the workspace. To run it
from source:

```sh
git clone https://github.com/vsm1996/aria && cd aria
pnpm install
pnpm test           # tier-gate property tests + the rule's full fixture suite
pnpm parity:oxlint  # the same fixtures through ESLint and oxlint, diffed
```

To experiment with the rule against your own JSX, build the plugin
(`pnpm --filter eslint-plugin-aria-a11y build`) and load
`packages/eslint-plugin/dist/index.js` in a flat ESLint config or an
`.oxlintrc.json` `jsPlugins` entry — this repo's own
[.oxlintrc.json](./.oxlintrc.json) is a working example.

## Architecture & contributing

[CLAUDE.md](./CLAUDE.md) is the source of truth: the working agreement, the
gate, the full implementation plan, and the milestones.
[docs/rule-registry.md](./docs/rule-registry.md) tracks every rule's tier,
basis, spec citation, and status. Start there before touching anything.
