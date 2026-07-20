# Phase 5 Validation — real-repo results

Ran `eslint-plugin-aria-a11y` (all 8 rules, recommended config) against five
open-source React codebases and manually reviewed the findings. The run used
oxlint as the host (it parses TSX natively and loads the plugin via
`jsPlugins`, the same path the parity harness exercises), with every non-Aria
category disabled so only Aria diagnostics were counted.

## Repos (a deliberate mix; not hand-picked for cleanliness)

| repo | shape | files | total | test/story noise | product-code findings |
|------|-------|------:|------:|-----------------:|----------------------:|
| **mui/material-ui** (`mui-material/src`) | design-system library (the target audience) | 1228 | 53 | 51 | **2** |
| **excalidraw/excalidraw** (`packages`) | general app (canvas editor) | 560 | 18 | 0 | **18** |
| **vercel/commerce** | general app (e-commerce) | 66 | 4 | 0 | **4** |
| **react-bootstrap** (`src`) | UI library | 146 | 0 | 0 | 0 |
| **grommet/grommet** | UI library | 1226 | 16 | 16 | 0 |

## What the numbers mean

**Test/story scaffolding dominates the raw counts and is not a false
positive.** MUI's 51 and grommet's 16 are `*.test.*`/`*.stories.*` files where
bare `<div onClick>`, unnamed `<button>`, and `<input>`-as-a-label appear as
deliberate test scaffolding. The rules fire *correctly* — those elements really
have no name/role — but the code isn't shipped UI, and the plan's recommended
config already excludes it (`ignore: ['**/*.test.tsx', '**/*.stories.tsx']`).
Counted as true positives, discounted as non-actionable.

**Product-code findings, reviewed by hand:**

- **Excalidraw (18) and commerce (4): true positives.** A representative sample
  was traced to source: clickable `<div onClick>` acting as a dropdown trigger,
  collapsible header, avatar, or overlay with no role (interactive-role-required);
  search `<input>`s with only a `placeholder` and no label (control-needs-name,
  exactly the documented "placeholder is not a name" case); a color-swatch
  `<button>` named only by `title` (flagged per the documented "title is not a
  name" policy — a defensible lint-tier flag). No false positives found in the
  app sample.
- **react-bootstrap (0) and grommet (0 product):** spread-heavy component
  libraries where props pass through `{...props}`, which the rules conservatively
  silence. No false positives, but little signal without config declarations —
  which is exactly what the config bridge (`role` / `nameProp`) exists to unlock.
- **MUI (2): both false positives, both on the same element**
  (`TextareaAutosize.tsx:238`, a `<textarea aria-hidden tabIndex={-1}>` shadow/
  measurement element), tracing to **two real, fixable bugs** (below).

## Metrics vs. the plan's targets

- **False positives, product code: 2 / 24 ≈ 8.3%** — over the 5% target, but
  *entirely* the two bugs below, both on one element. With those fixed, the
  projected rate is **0 / 22 = 0%**.
- **Accuracy on high-confidence (format-tier) predictions: no sample.** The
  three format-tier rules (`no-redundant-role`, `no-unsupported-aria`,
  `aria-syntax-normalize`) fired **zero** times across all five repos — these
  mature codebases have clean ARIA syntax, so there were no high-confidence
  predictions to score. Every real finding came from the lint tier, which is
  where the common real-world gaps (missing names, missing roles) live.

## Bugs found — flagged for their own follow-ups, NOT fixed here

Both surfaced on MUI's `<textarea aria-hidden tabIndex={-1}>` and both make that
correct, common pattern (an offscreen measurement field) a false positive.

### BUG 1 — `aria-hidden-not-focusable`: React's `tabIndex` casing not recognized

`isFocusable` reads the attribute as lowercase `tabindex`, but JSX/React uses
camelCase `tabIndex`. So `tabIndex="-1"` (the spec-recommended de-focus pattern)
is not seen as de-focusing → the element falls through to native-focusable →
`<button aria-hidden tabIndex="-1">` is **false-positive flagged** as a focusable
ghost. Also causes false negatives (`<div tabIndex="0">` not seen as focusable).
Confirmed with a probe: `tabIndex="-1"` → flagged, `tabindex="-1"` → silent. The
rule's own fixtures used lowercase `tabindex`, so this was never caught. Fixable
(read `tabIndex`, likely both casings). Secondary: `tabIndex={-1}`/`{0}` are
expression values that resolve to "unknown → silent" — evaluating simple numeric
literals would improve coverage but is not needed to fix the false positive.
This is a logic bug, not a documented-scope exclusion.

### BUG 2 — `control-needs-name`: does not exempt `aria-hidden` elements

An `aria-hidden="true"` control is removed from the accessibility tree, so it
needs no accessible name — but `control-needs-name` checks name mechanisms
without exempting `aria-hidden`, so `<textarea aria-hidden>`, `<button
aria-hidden>`, etc. are **false-positive flagged** as nameless. `img-needs-alt`
already exempts `aria-hidden`; `control-needs-name` should too (an inconsistency
between the two rules). Fixable; a logic bug, not a documented-scope exclusion.

## Takeaways

- On real product code, the lint tier finds legitimate, common a11y gaps
  (role-less clickable divs, unlabeled inputs) with a low false-positive
  surface — 2 FPs across 24 product findings, both from 2 identifiable bugs.
- The format tier found nothing in mature libraries — appropriate (they don't
  ship redundant/unsupported/miscased ARIA), and a reminder its value is in CI
  on *changing* code, not as a bulk auditor of clean repos.
- Spread-heavy component libraries are near-silent without config; the config
  bridge is the intended answer, validating that investment.
- Two real bugs found — each gets its own tested, reviewed follow-up PR.
