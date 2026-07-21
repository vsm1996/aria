# @aria-a11y/cli

The **zero-config** command-line runner for [Aria](https://github.com/vsm1996/aria)'s
accessibility rules. No ESLint config file, no host setup — point it at your
code and it works, parsing `.jsx`/`.tsx` (and plain JS) out of the box.

```sh
npx @aria-a11y/cli check src     # report a11y diagnostics (both tiers);
                            # exits nonzero on any format-tier issue — the CI teeth
npx @aria-a11y/cli fix src       # apply format-tier (safe, meaning-preserving) fixes only
```

`aria fix` applies only auto-safe format-tier fixes; lint-tier suggestions are
never applied. It honors an optional `aria.config.{ts,js,json}` (how a design
system declares component semantics) but requires none.

## How it works

Internally the CLI wraps ESLint's `Linter` with a Babel→ESTree parser, so
`eslint` is a real dependency — an implementation detail, not something you
configure. The rules are the *exact same modules* the ESLint plugin runs, so
output is identical to ESLint by construction. "Standalone" means no ESLint
config and no host, not zero ESLint code inside.

MIT
