# eslint-plugin-aria-a11y

The accessibility formatter, as an ESLint plugin. It holds itself to the
contract that made code formatters non-optional — **it never changes what the
code means** — and applies it to the mechanical slice of accessibility work, so
that slice can run on save and gate CI instead of living in review debates.

Every fix is classified by where its semantics came from: `native` (real HTML,
per aria-query), `declared` (config), or `inferred` (a guess). One gate governs
everything: a fix is auto-applied only when its basis is `native` or `declared`;
anything `inferred` is surfaced as a suggestion a human approves, never applied
silently. That splits the rules into a **format tier** (meaning-preserving,
auto-fix, fails CI) and a **lint tier** (located diagnostics, human-reviewed).

Runs in **ESLint** and, unchanged, under **oxlint** via `jsPlugins`.

## Install

```sh
npm install --save-dev eslint-plugin-aria-a11y
```

## Use (flat config)

```js
import aria from 'eslint-plugin-aria-a11y';

export default [
  { plugins: { 'aria-a11y': aria }, rules: aria.configs.recommended.rules },
];
```

> Installing the package doesn't wire it in — you must add it to your
> `eslint.config.js` as above for `eslint` to pick up the rules. (For a
> config-free run, use the standalone [`@aria-a11y/cli`](https://www.npmjs.com/package/@aria-a11y/cli) instead.)

## Rules

Format tier (auto-fix, `error`): `no-redundant-role`, `no-unsupported-aria`,
`aria-syntax-normalize`. Lint tier (report/suggest, `warn`):
`interactive-role-required`, `img-needs-alt`, `idref-resolves`,
`control-needs-name`, `aria-hidden-not-focusable`.

A design system can declare component semantics in `aria.config.ts` to graduate
inferred diagnostics toward auto-fix — see the
[project docs](https://github.com/vsm1996/aria).

MIT
