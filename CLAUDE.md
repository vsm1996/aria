# Aria — Claude Code Working Agreement

This file is read automatically by Claude Code on every run. Read it before
writing or changing anything. When code and this file disagree, this file wins
until you change it on purpose.

The full philosophy, architecture, and milestone plan live in the
"Implementation Plan & Working Spec" section further down in THIS file.
Read it in full on any new session. There is no separate plan file.

---

## The one rule you may never break

A fix may be auto-applied (emitted as `fix` in ESLint, `fix_kind: "safe"` in Biome)
**only if its basis is `native` or `declared`.** Any fix whose basis is `inferred`
must be a `suggestion`. This is encoded in `@aria/core`'s `assertGate`. If a task
seems to require putting an inferred-basis auto-fix anywhere, stop and surface the
conflict instead of doing it.

The `emit` helper in `packages/eslint-plugin/src/util/emit.ts` enforces this for
you. Use it for every `context.report`. Never call `context.report` directly.

---

## Current status: Phases 0–5 complete. Published. Nothing in flight.

- **All 8 MVP rules shipped** (3 format-tier, 5 lint-tier) — statuses, bases,
  spec citations, and every documented judgment call live in
  `docs/rule-registry.md`. Nothing is marked shipped there that isn't tested
  and CI-gated.
- **Both packages live on npm at `0.1.1`**: `eslint-plugin-aria-a11y` and
  `@aria-a11y/cli` (the CLI wraps ESLint's `Linter` with a Babel→ESTree
  parser — "Option B", an approved deviation from the plan's own-runner
  sketch; see the note in §5 below). 0.1.0 is broken for installers
  (packaging bug, see CHANGELOG.md) — never point anyone at it.
- **CI is a required check with branch protection on `main`** — four gates on
  every push/PR: `pnpm typecheck`, `pnpm test`, `pnpm parity:oxlint`
  (ESLint ↔ oxlint fixture parity, zero drift), and `pnpm verify:pack`
  (packs both packages the way they are really published, installs the
  tarballs into a clean external dir, and does a real import / bin run).
  Direct pushes to `main` are rejected; everything lands via PR.
- **The config bridge is live with three consumers**
  (`interactive-role-required`, `img-needs-alt`, `control-needs-name`).
- **Phase 5 validation done** — five OSS repos, product findings hand-reviewed,
  two rule bugs found and fixed with regression fixtures (`docs/validation.md`).
- **Docs site live**: https://aria-formatter.vercel.app (source:
  github.com/vsm1996/aria-site — checked by Aria itself, zero findings).

**What's next when work resumes:** Phase 6 (multi-framework via
`@aria/normalize`) is roadmap-gated on host parser support — see the Watch
queue in the registry. Smaller candidates flagged in the registry: the
idref-resolves near-match auto-fix (high bar documented), control-needs-name
scope extensions (input number/range, button-types), and the
aria-hidden-not-focusable component path via role→focusability.

---

## Working rules for every task

1. **One rule per PR / change.** Rule + tests + registry entry land together.
2. **Test-first for format rules.** Write idempotence and meaning-preservation
   tests before the rule body. The test is the spec.
3. **Respect the purity boundary.** `core`, `rules`, and `config` are pure:
   no `fs`, no `process`, no network. Parsing and I/O live in the host or `cli`.
4. **Always use `emit`.** Never call `context.report` directly. The gate must run.
5. **Never author asserted values in `format` rules.** No label text, no alt copy.
   If the fix puts words in the user's mouth, it is lint-tier, not format-tier.
6. **Messages cite the spec.** Every `messageId` expansion names the rule and
   the ARIA / HTML-AAM basis. See existing rules for the pattern.
7. **Determinism.** Same input, same output. No `Date.now`, no ordering assumptions.
8. **Conventional commits.** `feat(rules): ...`, `fix(plugin): ...`, `docs(registry): ...`
9. **Before declaring done:** run `pnpm typecheck && pnpm test && pnpm
   parity:oxlint` (and `pnpm verify:pack` if packaging/publish surfaces were
   touched). Paste results. These are the same gates CI enforces.
10. **Ask before widening scope.** New framework adapters, CLI changes, or gate
    changes are decisions, not implementation details. Flag them.

---

## Package map

```
packages/core/            @aria/core            gate, policy, AriaRuleMeta types (internal, unpublished)
packages/config/          @aria/config          ComponentSemantic schema, loader, resolvers (internal, unpublished)
packages/eslint-plugin/   eslint-plugin-aria-a11y  PRIMARY deliverable (npm, 0.1.1)
  src/util/emit.ts        gate-aware context.report wrapper
  src/util/resolve-role.ts  shared role resolution (implicit/effective role, attr states)
  src/rules/              one rule + one test + one .fixtures.ts per rule
packages/cli/             @aria-a11y/cli        zero-config CLI (npm, 0.1.1); wraps ESLint's Linter, Babel parser
scripts/oxlint-parity.mjs ESLint↔oxlint parity harness (auto-discovers *.fixtures.ts)
scripts/verify-pack.mjs   real pack→install→import publish verification
docs/rule-registry.md     source of truth for every rule's status + judgment calls
docs/validation.md        Phase 5 real-repo validation results
CLAUDE.md                 this file: working agreement + full plan/architecture
```

---

## Dependency policy

Add no new dependency without a one-line justification in the commit message.
Current approved runtime deps: `aria-query` (role/attribute truth tables — the
only source of spec truth, never hand-roll role tables), `eslint` (host API;
also the CLI's internal engine under Option B), `cosmiconfig` (config
discovery, sanctioned in §7), and the CLI's parser stack
(`@babel/core`, `@babel/eslint-parser`, `@babel/preset-react`,
`@babel/preset-typescript` — scoped to `packages/cli` only, per the purity
boundary). Dev-only: `oxlint` (the second host, for the parity gate).

---

## What "done" looks like

A task is done when:
- `pnpm typecheck` exits 0 across all packages
- `pnpm test` exits 0 across all packages
- `pnpm parity:oxlint` reports zero drift (and `pnpm verify:pack` passes if
  packaging/publish surfaces were touched)
- `docs/rule-registry.md` reflects the new status
- No `context.report` call exists outside of `emit`
- It landed on `main` through a PR with the CI check green (branch protection
  rejects direct pushes — including yours)
# Aria: Implementation Plan & Working Spec

> This file lives at repo root. It is the build spec, the architecture of record, and the working agreement for Claude Code. Read it in full before writing or changing anything. When code and this file disagree, this file wins until you change it on purpose.

---

## 1. The Point

Code formatters won. Not because they made code prettier, but because they made a class of argument extinct. Nobody debates brace style anymore because `prettier --check` turns the debate into a failing build. The discipline that made that possible is a single contract: **a formatter never changes what the code means.** Output is equivalent by construction. That is the only reason a human stopped reading the diff.

Accessibility has no such tool, and the absence is the excuse. "I'll add a11y later" survives because a11y currently looks like judgment work: open a PR, argue about roles, eyeball a screen reader. Aria's thesis is that a real, defensible slice of that work is mechanical, and the mechanical slice can be held to the formatter contract. Run it on save. Gate it in CI. Kill the excuse with `aria fmt --check`, the same way Prettier killed brace wars.

The catch is that accessibility breaks the formatter contract the instant you guess. Put `role="button"` on a `div` and you changed behavior. Author `aria-label="Close"` and you asserted a fact that might be a lie, and the spec is explicit that a wrong label is worse than none. So Aria is built around one hard line, and finding that line is the entire design.

**North star:** make the meaning-preserving part of accessibility run automatically and gate it in CI, while keeping every guess in a separate, never-silent tier. Grow the automatic part over time by letting design systems declare what the tool would otherwise have to infer.

**What success looks like:** a developer adds `aria fmt --check` to CI, it fails on real violations with deterministic diffs, and the team stops shipping the redundant, conflicting, and broken ARIA that pollutes most codebases. The harder inference work shows up as located lint errors with suggested fixes that a human still approves.

---

## 2. The Central Invariant (read this twice)

Aria classifies every accessibility fact by where its semantics came from:

```ts
type SemanticSource =
  | 'native'    // implicit role/semantics of a real HTML element, per aria-query
  | 'declared'  // author-written explicit ARIA, or component semantics from config
  | 'inferred'; // guessed by the engine from signals (onClick, class names, context)
```

And every rule belongs to exactly one tier:

```ts
type Tier =
  | 'format'  // meaning-preserving. runs on save. gates CI.
  | 'lint';   // inference. located errors + suggested fixes. never silently applied.
```

**The gate, which nothing in this codebase is allowed to violate:**

> A fix may run in the `format` tier only if its semantic basis is `native` or `declared`. Any fix whose basis is `inferred` is `lint` tier and is never auto-applied by `aria fmt`.

The formatter acts only on semantics it *knows* (real HTML, or declared via config). It never acts on semantics it *guessed*. That single sentence is what separates the two tiers cleanly, what makes the tool safe to run on save, and what makes the design-system config (Section 6) the engine that grows the safe set over time.

A `format`-tier fix must additionally satisfy **meaning-preservation**:

> For every possible runtime, the computed accessibility tree after the fix is identical to before, or strictly more spec-conformant, with zero change to the conveyed name, role, or state.

In practice this means `format` fixes are **subtractive or normalizing**. They delete ARIA that is redundant or forbidden, and they normalize syntax. They do not add assertions. The first rule of ARIA is deletionist, and so is this formatter. If you ever find yourself adding an `aria-*` value that asserts a fact about the UI, you are in the wrong tier. Move it to lint.

When you are unsure whether a transform is format-safe, it is not. It is lint.

### The gate maps onto the host's fix model

Aria ships as a plugin (Section 5), and the host linters already encode this exact split. ESLint and oxlint distinguish an auto-applied `fix` from a surfaced `suggestion`. Biome distinguishes `safe` fixes (applied on save) from `unsafe` fixes (not), where safe is defined as not changing semantics. So the semantic-source gate is not something Aria enforces alone. It is the policy that decides which host fix kind to emit:

| Basis | Tier | ESLint / oxlint | Biome |
|-------|------|-----------------|-------|
| `native`, `declared` | format | `fix` (auto-applied) | `fix_kind: "safe"` |
| `inferred` | lint | `suggestion` (never auto-applied) | `fix_kind: "unsafe"` |

The host's own machinery then guarantees that inferred fixes never land on save. The gate is enforced twice: once by Aria's test suite (Section 9), once by the host. Never emit a host-applied fix for an inferred-basis diagnostic. That single rule is the whole safety story.

---

## 3. Architecture

### Pipeline

```
source (.jsx/.tsx, later .vue/.svelte/.html)
   -> framework detection (extension + content heuristics)
   -> adapter parse (Babel / vue compiler / svelte compiler / parse5)
   -> NormalizedNode tree  [the key asset: one model, all frameworks]
   -> rule runner (pure rules over nodes, with context)
   -> diagnostics, each tagged { tier, basis, fix? }
   -> tier gate (format fixes filtered to native|declared basis)
   -> printer (minimal-edit patch) for fmt, OR reporter for lint
   -> output: rewritten files | --check exit code | reporter (pretty/json/sarif)
```

The normalization layer is the eventual moat, but it is not the MVP. For the React MVP, Aria runs as a plugin and consumes the host's JSX AST directly (ESLint and oxlint both expose the tree with `node.parent` and ancestor access). No Babel adapter, no printer, no framework detection. The host parses and applies fixes; Aria supplies the rules. The `NormalizedNode` model and its adapters earn their keep only when Aria goes multi-framework, which is also exactly when the hosts cannot help (their plugin layers do not parse Vue or Svelte templates yet). So the pipeline above is the phase-six target. The MVP pipeline is shorter: host AST in, rules run, host-tagged fixes out.

### Core data model (`@aria/core`)

```ts
interface NormalizedNode {
  tag: string | null;          // 'div', 'button', null for fragments
  component: string | null;    // 'IconButton' for custom components, else null
  attributes: Attribute[];
  eventHandlers: EventHandler[]; // normalized: onClick, onKeyDown, v-on:click, on:click
  children: NormalizedNode[];
  parent: NormalizedNode | null;
  location: SourceLocation;     // file, line, col, range, for precise patches
  framework: 'react' | 'vue' | 'svelte' | 'html';
  raw: unknown;                 // adapter-specific handle, opaque to rules
}

interface Attribute {
  name: string;
  value: AttrValue;            // literal | dynamic (expression we cannot evaluate) | boolean-shorthand
  location: SourceLocation;
}

interface SourceLocation { file: string; start: Pos; end: Pos; }
```

Rules never touch `raw`. If a rule needs framework-specific data, the adapter lifts it into normalized fields first. This keeps the gate enforceable.

### Rule and diagnostic contracts

```ts
interface Rule {
  id: string;                  // 'no-redundant-role'
  tier: Tier;
  requires?: SemanticSource[]; // bases that make this rule's fix eligible
  evaluate(node: NormalizedNode, ctx: RuleContext): Diagnostic[];
}

interface RuleContext {
  roles: AriaQuery;            // role/attribute truth tables (aria-query)
  config: ResolvedConfig;      // componentSemantics, ignores
  fileIds: Set<string>;        // ids present in the current file, for idref checks
}

interface Diagnostic {
  ruleId: string;
  severity: 'error' | 'warning' | 'info';
  message: string;             // must name the rule and the spec basis
  location: SourceLocation;
  basis: SemanticSource;
  fix?: Fix;                   // on a format diagnostic, MUST be meaning-preserving
  confidence?: number;         // lint tier only, 0..1
}
```

The runner is pure: `(NormalizedNode tree, RuleContext) -> Diagnostic[]`. No I/O lives in core. File reads, writes, and process exit codes live only in `@aria-a11y/cli`. Parsing lives only in adapters. This separation is what makes the property tests in Section 9 possible.

---

## 4. The Two Tiers

### Format tier (meaning-preserving, MVP scope)

Small on purpose. A safe core you can defend line by line beats a broad one you have to babysit.

| Rule | What it does | Why it is meaning-preserving |
|------|--------------|------------------------------|
| `no-redundant-role` | Remove an explicit role equal to the element's implicit role (`<button role="button">`) | Accessibility tree is byte-identical. Pure noise removal. |
| `no-unsupported-aria` | Remove `aria-*` attributes that aria-query marks as not allowed on the element or role, only when removal is unambiguous | User agents already ignore them. Tree identical, source honest. |
| `aria-syntax-normalize` | Normalize attribute name casing, boolean and token value form, and ordering within the a11y attribute cluster | Pure syntax. No semantic change. |

Candidates that graduate into this tier later, once their basis can be made `native` or `declared`, are tracked in `docs/rule-registry.md`. They do not ship in `format` until they can prove the invariant.

### Lint tier (inference, never silent)

Everything that requires a guess or an authored value. Located errors, suggested fixes, human approves. `aria lint --fix` is opt-in and applies only fixes whose basis is `native` or `declared` (which by definition are the same ones `fmt` would have taken anyway). Inferred fixes are never written by any command.

MVP lint set:

- `interactive-role-required`: non-semantic element with a click handler and no role. Suggest `<button>` or `role` + focus, basis `inferred`.
- `control-needs-name`: icon-only control with no accessible name. Flag. The tool cannot author the text, so this stays lint even at high confidence.
- `img-needs-alt`: image with no `alt`. Flag, suggest decorative vs content branches.
- `idref-resolves`: `aria-labelledby` / `aria-describedby` / `aria-controls` pointing at an id not present in the file. Error. Auto-fixable in `format` only when the correct target is unique and present, otherwise lint.
- `aria-hidden-not-focusable`: `aria-hidden="true"` on a focusable element. Error, but lint, because the correct fix might be to remove focusability instead. Aria refuses to pick for you.

The reasoning in those last two rows is the model for every tier decision. When more than one correct fix exists, it is lint.

---

## 5. Host Integration & Distribution

Aria is plugin-first, standalone-capable. The decision: build against the ESLint-compatible plugin API as the rule contract, ride oxlint for speed, keep a thin standalone CLI as the escape hatch.

### Why this shape

An ESLint-compatible rule module is already a portable artifact. The host hands Aria the AST, Aria reports diagnostics and fixes, the host applies them. Write the rules once and they run in:

- **ESLint** (stable substrate, test here)
- **oxlint** (same API, near-Rust speed via raw transfer, currently alpha, run here for performance)
- **a thin standalone CLI** (`@aria-a11y/cli`, wraps the same rule modules with its own runner, for users on neither host)

This is why "standalone later if necessary" is nearly free. The rule logic never moves. Only the harness around it changes.

### Why not Biome as the primary target

Biome does not run ESLint-style JS plugins. Its extensibility is GritQL, a structural pattern-and-rewrite language targeting JS, CSS, and JSON. GritQL cannot hold aria-query role tables, resolve idrefs within a file, or run the Renge config to graduate components. Putting Aria's engine in Biome means writing Rust upstream in Biome's repo on Biome's roadmap, where the Renge bridge cannot live as a third-party concern. Biome stays a possible future target via a generated GritQL subset for the handful of purely structural format rules, but it is not where the engine lives.

### Distribution surface

- `eslint-plugin-aria-a11y` — the primary deliverable. Standard plugin export, rules emit host-native fix vs. suggestion per the gate table in Section 2.
- Runs under oxlint via its `jsPlugins` config with no code change.
- `@aria-a11y/cli` — thin standalone wrapper for `fmt` / `lint` / `check`, same rules, own runner. This is the fallback that keeps Aria independent of any host.

### CLI surface (standalone wrapper)

```
aria fmt [paths]            # apply format-tier (native|declared) fixes, write files
aria fmt --check [paths]    # exit nonzero if any file would change, write nothing   <- the CI teeth
aria lint [paths]           # report lint-tier diagnostics, write nothing
aria lint --fix [paths]     # apply ONLY native|declared-basis fixes, never inferred
aria explain <rule-id>      # print the rule, its tier, and its spec basis
```

> **As shipped (deliberate deviation, approved during Phase 5):** the published
> CLI is `@aria-a11y/cli` with two commands — `aria check` (reports both tiers,
> exits nonzero on any format-tier issue: the CI teeth) and `aria fix` (applies
> format-tier fixes only; lint suggestions never). And instead of an own runner
> over a raw Babel AST, it wraps ESLint's `Linter` with `@babel/eslint-parser`
> ("Option B"): a raw `@babel/parser` AST does not match the ESTree shapes the
> rules consume (`StringLiteral` vs `Literal`, no `.parent`), so an own runner
> would have meant forking rule logic or re-implementing the Babel→ESTree
> bridge — both worse than an internal `eslint` dependency. The rules run
> completely unchanged, output is identical to ESLint by construction, and a
> parity test asserts it. "Standalone" means zero-config/no host setup, not
> zero ESLint code inside. `fmt --check` semantics live in `aria check`'s exit
> code; `explain` is unbuilt (the registry serves that role today).

`--check` is the product, in plugin form or CLI form. In a host it is the failing lint run on an `error`-severity Aria rule. Standalone it is this exit code. Either way it turns "I'll do a11y later" into a red build today.

Reporters (CLI): `pretty` (default), `json`, `sarif`. In a host, reporting is the host's job.

### Do not re-implement what the hosts already ship

Both oxlint and Biome already ship jsx-a11y rule sets covering the structural, pattern-level checks. Aria must not duplicate them. Aria's rules are only the semantic-source-gated ones the hosts lack: redundant-role removal driven by aria-query, in-file idref resolution, and the Renge-config graduation logic. Tight scope, clean differentiation.

---

## 6. The Renge Bridge (the growth engine)

The line between `format` and `lint` is not fixed. It slides, and config is the lever.

```ts
// aria.config.ts
import { defineConfig } from '@aria/config';

export default defineConfig({
  componentSemantics: {
    IconButton: { role: 'button', requiresName: true, source: 'declared' },
    Link:       { role: 'link', source: 'declared' },
    MenuItem:   { role: 'menuitem', source: 'declared' },
  },
  ignore: ['**/*.stories.tsx', '**/*.test.tsx'],
});
```

When a design system declares that `IconButton` is a button, the engine stops guessing. The basis for any role normalization on `IconButton` becomes `declared`, which makes it eligible for `format`. The "this control must have a name" assertion becomes a deterministic, CI-failing error instead of a 95% hunch. The tool still cannot write the name text (that is an authored fact, forever lint), but the *requirement* graduates from suggestion to hard gate.

This is why Aria's weakest claim in the original research, "respects design systems via config," is actually its strongest mechanism. A token-and-semantics design system like Renge can hand Aria ground truth at scale. Every component Renge declares moves a class of diagnostics from lint to format. The safe tier grows as the design system matures. Build the config schema as a first-class package, not a footnote.

---

## 7. Repo Structure & Tech Stack

```
aria/
  packages/
    core/             @aria/core         rule types, tier gate, the basis->fix-kind policy, shared utils. no deps, no I/O.
    rules/            @aria/rules        the rule library (format + lint). pure functions over the host AST.
    eslint-plugin/    eslint-plugin-aria-a11y   PRIMARY deliverable. wraps rules for ESLint/oxlint.
    config/           @aria/config       config schema + cosmiconfig loader + Renge bridge types
    cli/              @aria-a11y/cli          thin standalone wrapper: own runner, reporters, exit codes. the fallback.
    test-utils/       @aria/test-utils   property validators + golden harness
    normalize/        @aria/normalize    NormalizedNode + adapters. (phase 6, multi-framework only)
  docs/
    rule-registry.md  every rule: id, tier, basis, spec citation, graduation status
  examples/           real fixtures
```

Tooling, matching the established Renge stack:

- pnpm workspaces, Turborepo for the task graph
- tsup for builds, TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true`
- vitest for tests, plus the ESLint `RuleTester` for plugin conformance
- rules consume the host's estree/JSX AST directly. No Babel adapter in the MVP.
- `aria-query` for role and attribute truth tables (single source of spec truth, do not hand-roll role tables)
- `cosmiconfig` for config discovery
- `commander` for the standalone CLI, `picocolors` for output
- phase 6 only: `@babel/parser`, `@vue/compiler-dom`, `svelte/compiler`, `parse5` inside `@aria/normalize`

Add no dependency without a one-line justification in the PR and an entry the reviewer can see. Prefer the standard library and prefer deletion.

---

## 8. Coding Conventions

- **Purity boundary.** `core`, `rules`, and `config` are pure. No `fs`, no `process`, no network. I/O lives only in `cli`. Rules read the AST the host gives them and report; they never read files or apply writes themselves. A rule that needs to touch disk is a design error.
- **No `any`, no non-null `!` on external data.** Model uncertainty with unions and exhaustive `switch` (with a `never` default). Dynamic attribute values are a first-class `AttrValue` variant, not an escape hatch.
- **Rules are pure and colocated with their tests.** `rules/no-redundant-role/index.ts` next to `rules/no-redundant-role/index.test.ts`. One rule per file. One rule per PR.
- **Every rule declares its tier and basis explicitly.** A reviewer must be able to see the tier and the `SemanticSource` without reading the body.
- **Messages cite the spec.** Every diagnostic message names the rule id and the ARIA/HTML-AAM basis. `explain` reads from the same source.
- **Determinism.** Same input, same output, byte for byte. No `Date.now`, no map iteration order assumptions, stable sort on diagnostics by location then rule id.
- **Fixes are minimal-edit and never reflow.** A fix changes only the bytes of the a11y attribute it touches. The host formatter (Prettier, Biome, oxfmt) owns whitespace. Emit the fix through the host's fix/suggestion API with the correct kind per the gate table, never as a raw file write.
- **Conventional commits.** `feat(rules): ...`, `fix(adapter-react): ...`, `docs(registry): ...`.
- **Never author asserted values in `format`.** No label text, no descriptions, no alt copy. If the fix puts words in the user's mouth, it is lint.

---

## 9. Testing Strategy

The tier contract is only real if it is tested as a property, not a vibe. `@aria/test-utils` provides validators that every `format` rule must pass.

- **Idempotence.** `fmt(fmt(x)) === fmt(x)` for all fixtures. A formatter that does not converge is broken.
- **Meaning-preservation.** Build an accessibility-tree oracle (compute the a11y tree from a node, using aria-query) and assert `aatree(x)` and `aatree(fmt(x))` are equal or that `fmt(x)` is strictly more conformant with no name/role/state delta. This is the executable form of the central invariant. A `format` rule that fails this gets demoted to `lint`, automatically, by the test.
- **Tier gate enforcement.** A test asserts that no diagnostic with `basis: 'inferred'` ever carries a fix that `fmt` would apply. This guards the one rule that protects the whole product.
- **Golden snapshots per framework.** Normalized output and final diagnostics, checked in, reviewed on change.
- **Plugin conformance.** Every rule has an ESLint `RuleTester` suite covering valid cases, invalid cases, and exact fix output. This is the contract that keeps the rule portable across ESLint, oxlint, and the standalone CLI.
- **Cross-framework equivalence (phase 6).** Once `@aria/normalize` exists, the same logical UI in React and HTML must produce the same diagnostics, proving the normalization layer holds.
- **Real-codebase validation (phase 5).** Run against 10+ open-source React repos plus Renge itself. Measure accuracy on high-confidence predictions and false-positive rate. Targets: 85%+ accuracy on high-confidence, under 5% false positives. False positives are the only metric that kills adoption, so weight it hardest.

Write the meaning-preservation and idempotence tests for a `format` rule *before* the rule. The test is the spec.

---

## 10. Working Agreement for Claude Code

When operating in this repo:

1. **Read this file first.** The gate in Section 2 is the one thing you may never violate. If a task seems to require putting an inferred fix into `fmt`, stop and surface the conflict instead of doing it.
2. **One rule per change.** A rule, its tests, and its `rule-registry.md` entry land together. Do not batch unrelated rules.
3. **Test-first for format rules.** Write idempotence and meaning-preservation tests before the rule body.
4. **Respect the purity boundary.** No I/O outside `cli`. No parsing outside `adapters`. No `raw` access in `rules`.
5. **When unsure of the tier, choose lint.** It is always safe to under-claim. It is never safe to silently change meaning.
6. **Never author asserted values** in any auto-applied fix. The tool corrects and deletes. Humans write the words.
7. **Before declaring a task done,** run `pnpm typecheck && pnpm test` and confirm `aria fmt --check` is clean on the example fixtures. Paste the result.
8. **Keep `docs/rule-registry.md` current.** It is the human-readable map of what is automated, what is suggested, and what is waiting to graduate.
9. **No new dependency without justification** in the PR description.
10. **Ask before widening scope.** Adding a framework adapter, changing the gate, or changing the CLI contract are decisions, not implementation details. Flag them.

---

## 11. Milestones

Each phase ends with acceptance criteria that are testable, not aspirational. Do not advance until the prior phase's criteria pass.

> **Status:** Phases 0–5 are **COMPLETE** — all acceptance criteria below were
> met and are enforced in CI where applicable (the registry and
> `docs/validation.md` hold the evidence; both packages published at 0.1.1).
> Two scope notes against the original text: Phase 5's validation ran against
> five OSS repos rather than "10+ plus Renge" (documented in validation.md),
> and the standalone CLI shipped as an ESLint-`Linter` wrapper rather than an
> own runner (see the "As shipped" note in §5). Phase 6 has not started and
> remains roadmap-gated on host parser support.

**Phase 0: Skeleton (week 1).**
Monorepo, `core` rule types, the tier gate and the basis-to-fix-kind policy as code, an empty `eslint-plugin-aria-a11y` that loads, cosmiconfig loader.
*Accept:* typecheck and lint green. The plugin registers in a sample ESLint config and under oxlint `jsPlugins` with zero rules and runs clean. Tier-gate enforcement test exists and passes against a deliberately mis-tagged fixture.

**Phase 1: First format rule, end to end (week 1-2).**
`no-redundant-role` written against the host JSX AST, emitted as an auto-fix, with a full `RuleTester` suite.
*Accept:* the rule fixes `<button role="button">` in both ESLint and oxlint, identical output. Idempotence and meaning-preservation tests pass. No Babel adapter exists or is needed.

**Phase 2: Format tier complete (week 2-3).**
Remaining safe rules (`no-unsupported-aria`, `aria-syntax-normalize`), all aria-query-driven.
*Accept:* meaning-preservation and idempotence hold for every format rule. Run with `--fix` on dirty fixtures produces clean, convergent output. An `error`-severity Aria rule fails a sample CI run, which is the `--check` product in plugin form.

**Phase 3: Lint tier (week 3).**
The MVP lint rules, emitted as suggestions, never auto-applied. Confidence on each.
*Accept:* inferred-basis diagnostics provably emit host suggestions, not fixes. No silent writes under `--fix` anywhere. `RuleTester` confirms suggestion output.

**Phase 4: Config and Renge bridge (week 3-4).**
Config schema, loader, graduation logic that flips a diagnostic's basis from `inferred` to `declared` and therefore its emitted fix kind from suggestion to fix.
*Accept:* declaring `componentSemantics` measurably moves the relevant diagnostics from suggestion to auto-fix and upgrades severity, proven by tests run with and without the declaration. Point it at Renge's component set and watch the safe tier grow.

**Phase 5: Validation and release (week 4-5).**
Run on 10+ OSS React repos plus Renge, under both ESLint and oxlint. Measure accuracy and false positives. Thin `@aria-a11y/cli` wrapper for non-host users. Docs.
*Accept:* targets in Section 9 met. `eslint-plugin-aria-a11y` published, runs under oxlint unmodified, and the standalone CLI runs on a fresh machine.

**Phase 6+: Multi-framework and beyond (later, roadmap-gated).**
Build `@aria/normalize` and adapters for Vue, Svelte, HTML. This phase is blocked on the hosts: oxlint and Biome do not parse those templates in plugins yet, both list it as in progress. Track their progress and build the normalization layer to be ready when they land. Optional: generate a GritQL subset of the purely structural format rules so Biome users get the safe tier too.

---

## 12. Non-Goals

State these so scope does not creep into the gap that broke the original research.

- **No runtime checks.** Color contrast, focus order, keyboard navigation, target size, motion safety. These need a rendered DOM. That is axe-core's job. Aria is build-time and complementary, not a replacement.
- **No authoring of asserted content.** Aria will not invent label text, alt copy, or descriptions. It flags their absence.
- **No ML in the format tier, ever.** The format tier is deterministic by definition. Inference, including any future model-assisted suggestion, is confined to lint and is never auto-applied.
- **No reflowing or whitespace ownership.** Aria edits a11y semantics with minimal patches and defers layout to the host formatter.

---

## 13. One-Paragraph Summary

Aria is the accessibility formatter. It holds itself to the one contract that made code formatters non-optional: it never changes meaning. That contract forces a hard split. A small, deletionist `format` tier corrects redundant, forbidden, and broken ARIA, runs on save, and gates CI with `aria fmt --check`, which is the thing that finally kills "I'll do a11y later." A separate `lint` tier handles every guess and every authored value, reports located errors with suggested fixes, and never writes silently. The line between the tiers is not fixed: a design system that declares its component semantics moves work from guess to known, from lint to format, and that is why a token-and-semantics system like Renge is the engine that grows the safe set over time. Build the gate first, test it as a property, and never let an inference cross it.