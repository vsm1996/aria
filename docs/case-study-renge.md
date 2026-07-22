# Case study: the config bridge against a real design system (Renge)

**What this is.** The config bridge's claim — *"a token-and-semantics design
system hands Aria ground truth at scale, moving diagnostics from guess to
known"* (CLAUDE.md §6) — has been proven only by synthetic tests with three
consumers. This is the first run against a **real** design system's actual
component source: [Renge](https://github.com/vsm1996/renge-ui)
(`@renge-ui/react`). The goal was a real before/after, and to let real
component shapes surface whatever the synthetic cases missed.

**Verdict up front.** The mechanism is real and works end to end — the same
code, same rule, moves from silent to a declared-basis finding (and, for
`interactive-role-required`, to a real auto-fix) purely because of config. But
applying it to a *well-built* design system surfaced three things the synthetic
tests did not, and all three are worth fixing before more rules are built on the
"declare it and it just works" assumption. **Partially validated, with a
sharper picture of where the bridge's reach actually ends.**

> **Status:** all three gaps are now **resolved** — A and B in one PR, C
> (the `injectRole` schema change) in its own, each with the real before/after
> in its section.

---

## The components (real APIs, read from source)

| Component | Renders | Accessible name comes from | Note |
|-----------|---------|----------------------------|------|
| `IconButton` | a native `<button>` | `aria-label` (**required** in its TS props) | already safe by construction |
| `Checkbox` | `<label><input type=checkbox>…</label>` | a `label?: string` prop (**optional**) | omitting `label` is a real, permitted mistake |
| `MultiSelect` | a `<div>` (custom combobox) | — (only `placeholder`, `options`, `values`) | no native role, no name mechanism |

Sourced from `packages/react/src/components/{IconButton,Checkbox,MultiSelect}.tsx`.
Renge's *own* usage is correct everywhere (every `<Checkbox>` has `label`, every
`<IconButton>` has `aria-label`) — the right baseline. The graduation shows when
a consumer omits a name the API permits.

## The config

```ts
// aria.config.ts — declared from what the components actually do
export default {
  componentSemantics: {
    IconButton:  { role: 'button',   requiresName: true, nameProp: 'aria-label', injectRole: true },
    Checkbox:    { role: 'checkbox', requiresName: true, nameProp: 'label' },
    MultiSelect: { role: 'combobox', requiresName: true, nameProp: 'placeholder' },
  },
};
```

Every entry validates cleanly. Note `injectRole: true` on `IconButton`: as of the
Gap C fix, `role` is descriptive by default and role *injection* is opt-in (see
Gap C below). It is set here **purely to preserve this document's original
end-to-end proof** that the graduation produces a real auto-fix (Result 1) — the
one flag keeps the before/after honest. In a real config you would normally
**leave it off** for `IconButton`, precisely because it renders a native
`<button>` and the injected `role="button"` is redundant (that redundancy *is*
Gap C). `injectRole` earns its keep on a component that renders a *non-semantic*
element and genuinely needs the role.

The experiment fed this through the deterministic inline rule-options path —
identical to what the file loader produces.

---

## Result 1 — the mechanism works (the thesis holds)

**`control-needs-name` · Checkbox with the `label` omitted** — the exact bug the
bridge exists to catch, invisible without config because the component boundary
hides it:

```
const C = () => <Checkbox checked={x} onChange={onChange} />;
  NO config: (silent)
  + config : [report-only] <Checkbox> is declared as a control (componentSemantics)
             with no accessible name: its "label" prop is absent and there is no
             other name (control-needs-name; WCAG 2.1 SC 4.1.2). Set label, or add
             aria-label. Aria cannot write it for you.
```

`<Checkbox label="Accept terms" onChange={…} />` (real Renge usage) is correctly
**silent both ways** — no false positive.

**`interactive-role-required` · IconButton with a click handler and no role** —
the headline *suggestion → auto-fix* graduation. Re-verified under the Gap C
fix, with `injectRole: true` in the config (the opt-in that now gates injection);
the diagnostic text and fix output are byte-identical to the original capture:

```
const C = () => <IconButton onClick={close}><CloseIcon /></IconButton>;
  NO config:                          (silent)
  + config, injectRole: true : [AUTO-FIX] <IconButton> is declared as role 'button'
             via componentSemantics, but this usage carries no role attribute
             (interactive-role-required; basis: declared).
  + config, WITHOUT injectRole:       (silent)   ← new default: role is descriptive only

aria fix output (injectRole: true):
  const C = () => <IconButton role="button" onClick={close}><CloseIcon/></IconButton>;
```

The graduation mechanism is intact. The new default (no injection without
`injectRole`) is also visible here: without the opt-in the same usage is silent,
which for a native-`<button>`-rendering IconButton is the *correct* outcome — the
redundant role is simply not written (Gap C).

Same code, same rule, silent → a real declared-basis auto-fix that actually
rewrites the source — driven entirely by config. **The bridge mechanism is
real.**

---

## Result 2 — three gaps a real design system surfaced

> **Update:** Gaps A and B are now **RESOLVED** (with the real before/after
> below). Gap C is a schema decision, proposed separately — see the end.

### Gap A — the dominant icon-button shape evaded the name check · RESOLVED

`control-needs-name` on `IconButton`, varying only the child (all **with** the
config), **before** the fix:

```
  <IconButton onClick={x} />                        -> FLAGGED (no name)
  <IconButton onClick={x}>Save</IconButton>         -> silent  (text is a name — correct)
  <IconButton onClick={x}><svg/></IconButton>       -> FLAGGED (svg is known-non-text)
  <IconButton onClick={x}><CloseIcon/></IconButton> -> silent  (!)  <- the gap
  <IconButton aria-label="Close" …><CloseIcon/>…    -> silent  (named — correct)
```

The fourth line was the finding: `<CloseIcon/>` is a **component**, so the rule
conservatively treated its unknown content as "might supply a name" and stayed
silent — letting the most common icon-button shape slip through.

**Root cause (not a special-case):** the *declared* path was folding in
`subtreeText`, the intrinsic path's child-content signal, and inheriting its
"unknown child → cannot determine → silent" conservatism. That conservatism is
right for the intrinsic content path (where child text genuinely is the only
name signal) but wrong for a declared component — the declaration already states
the name comes from its `nameProp`/ARIA, so an opaque child is simply *"no name
supplied here"*, not *"cannot determine."*

**Fix:** in the declared path, an `unknown` subtree result no longer silences
(known text still counts; a dynamic `nameProp`/ARIA value still folds to
`unknown` — that conservatism is about the real name signal and stays). **After**:

```
const C = () => <IconButton onClick={close}><CloseIcon /></IconButton>;   // no name
  -> <IconButton> is declared as a control (componentSemantics) with no accessible
     name: its "aria-label" prop is absent and there is no other name
     (control-needs-name; WCAG 2.1 SC 4.1.2).                              FLAGGED

const C = () => <IconButton aria-label="Close" onClick={close}><CloseIcon /></IconButton>;
  -> (silent)                                                              correct
```

The icon-only declared component with no name is now caught; the same shape with
a name is still correctly silent. Pinned by fixtures in both directions
(`control-needs-name.fixtures.ts`).

### Gap B — a declared role no rule name-checks failed silently · RESOLVED

```
const C = () => <MultiSelect options={opts} onChange={onChange} />;   // role: 'combobox', requiresName
  BEFORE: (silent — config validated but did nothing)
```

`MultiSelect` renders a `<div>` with no native role — arguably the component
*most* in need of an enforced name. But `control-needs-name`'s role scope is
`button / link / textbox / searchbox / checkbox / radio`; `combobox` is outside
it, so the declaration was a **silent no-op** — worse than an uncovered case,
because it *looked* like it worked.

**Fix:** when a declaration carries a name intent (`requiresName: true` or a
`nameProp`) for a role no rule name-checks, `control-needs-name` now emits a
distinct, once-per-component **tooling-scope notice** rather than silence.
`role: 'img'` is excluded (img-needs-alt owns it); a bare `{ role }` with no
name intent stays silent (the role may still drive `interactive-role-required`).
**After**:

```
const C = () => <MultiSelect options={opts} onChange={onChange} />;
  -> componentSemantics declares <MultiSelect> with role 'combobox' and a name
     requirement, but no rule checks accessible names for role 'combobox' yet —
     supported roles are button, link, textbox, searchbox, checkbox, radio
     (control-needs-name), and img (img-needs-alt). The name requirement is NOT
     enforced for 'combobox'; see docs/rule-registry.md. This is a tooling-scope
     notice, not a problem with your code.
```

The config no longer lies by omission: a team is told, at the usage site, that
their declared name requirement can't be honored for that role yet. Pinned by
fixtures (name-intent role → notice; bare role → silent).

### Gap C — the `role` field was overloaded between two consumers · RESOLVED

A single `role` declaration means two different things to two rules:

- to `control-needs-name`: *"this component's semantic role is button — check it
  for a name."* (Correct for `IconButton`.)
- to `interactive-role-required`: *"inject `role="button"` if the usage lacks
  one."*

For a well-built component those conflict. `IconButton` renders a native
`<button>`, so the injected `role="button"` becomes `<button role="button">` at
runtime — redundant (exactly what `no-redundant-role` exists to remove). Aria
can't see that, because it only has the declaration, not the render:

```
aria fix →  <IconButton role="button" onClick={x}><CloseIcon/></IconButton>
no-redundant-role on that output: (silent — a component's role isn't resolvable,
                                   so it can't be flagged as redundant either)
```

So the auto-fix is **lint-safe** (nothing flags it) but **semantically
redundant** (the rendered DOM carries a role the component already implies). The
schema has no way to say "understand this role for name-checking, but don't
inject it." A component that renders native semantics wants the former and not
the latter; today one declaration forces both.

#### Fix (built) — proposed, approved, shipped

**`role` is now purely descriptive, and role *injection* is an explicit,
per-component opt-in (`injectRole`).**

Read the two consumers as they actually are: `control-needs-name` and
`img-needs-alt` already use `role` **read-only** (to decide *whether* to
name-check). Only `interactive-role-required`'s declared path is *prescriptive* —
it inserts `role="X"` via an auto-fix, and it does so **unconditionally** for any
declared role. That single prescriptive behavior is the whole of Gap C. The
"check redundancy before injecting" idea can't be reused from `no-redundant-role`
directly: that rule compares an explicit role against an *intrinsic element's*
implicit role, and a component has no resolvable implicit role to compare
against — so there is nothing for it to check. The missing information isn't
computable; it has to be *declared*.

**Concrete field-level change (additive, not schema-breaking):**

```ts
interface ComponentSemantic {
  role: string;              // DESCRIPTIVE ONLY — "what this component is",
                             //   read by any rule that needs the semantics.
                             //   No longer implies a fix.
  requiresName?: boolean;
  nameProp?: string;
  injectRole?: boolean;      // NEW, optional, default false. PRESCRIPTIVE —
                             //   interactive-role-required inserts role="{role}"
                             //   (declared-basis auto-fix) only when this is true.
  source: 'declared';
}
```

- **`interactive-role-required`**: inject only when `injectRole === true`. A
  declared component without it is understood (its role informs other rules) but
  never has a role stamped onto it.
- **`validateAriaConfig`**: add `injectRole` to `SEMANTIC_KEYS`, typed boolean,
  optional. Every existing config stays **valid** — nothing is removed or
  retyped.
- **Who sets `injectRole: true`?** Only a component that renders a *non-semantic*
  element and genuinely needs the role at runtime (a `<div>`-based widget). A
  component that renders a native control (`IconButton → <button>`) leaves it
  off, and the redundant `role="button"` is never injected.

**Semver / migration.** The schema change is additive (a new optional field), so
no config becomes invalid — **not a schema-breaking change**. There *is* a
behavior change: `interactive-role-required` stops auto-injecting for existing
`{ role: … }` declarations that don't opt in. That is the safe direction —
injecting a role onto a component that already renders native semantics was
redundant in ~every real case (it *is* Gap C), so defaulting off fixes more than
it changes. Ship as a 0.x **minor** with a CHANGELOG note; a design system that
truly wants injection adds one boolean.

**Alternative considered — a descriptive `renders` field** (e.g.
`rendersNativeElement?: boolean`, or `renders?: 'button' | 'div' | …`) that lets
`interactive-role-required` infer redundancy itself. It's more "truthful" and
could serve future rules that need to know what a component renders, but it's
heavier (every injectable component must describe its render) and still collapses
to the same yes/no injection decision. `injectRole` is the minimal field that
captures the actual choice; the `renders` descriptor is worth revisiting only if
a second rule needs render information. It was set aside.

**As shipped:** `injectRole?: boolean` (default `false`) on `ComponentSemantic`,
validated with the same strictness as every other field (unknown-key rejection,
boolean type-check). `interactive-role-required` injects only when
`injectRole === true`; otherwise the declared role is descriptive and the rule
writes nothing. Behavior change (loud in the CHANGELOG): an existing
role-declared component that relied on automatic injection now needs
`injectRole: true` to keep it. Proven both directions by fixtures
(`interactive-role-required.fixtures.ts`) and the graduation-contrast test.

---

## Does this validate "a token system hands Aria ground truth at scale"?

**Partially — and the failure modes are the valuable part.**

- **Yes:** the bridge is real. `Checkbox` is a clean win — an unlabeled control
  that is invisible without config becomes a located, declared-basis finding
  with it. The `interactive-role-required` auto-fix graduation genuinely rewrites
  source from a config declaration. The plumbing works end to end on real
  components.
- **But not "at scale, for free":** on a real, *good* design system the reach was
  narrower than the synthetic tests implied — and fixing that is the point.
  Icon buttons (the poster child) leaked through the unknown-component-child rule
  (Gap A, **now fixed**); the custom widgets that most need help failed silently
  outside the consuming rule's role scope (Gap B, **now a notice**); and the one
  overloaded `role` field made a single declaration do the right thing for one
  rule and a redundant thing for another (Gap C, **now split**: `role` is
  descriptive, injection is opt-in via `injectRole`).

None were fatal. All were cheaper to fix now than after more rules assume
"declare the component and it just works."

## Follow-ups

- **Gap A — DONE (this PR).** The declared name check no longer inherits the
  intrinsic path's unknown-subtree conservatism, so an icon-only declared
  component with no name is caught.
- **Gap B — DONE (this PR).** A name intent declared for a role no rule
  name-checks now emits a tooling-scope notice instead of a silent no-op.
- **Gap C — DONE (its own PR).** `role` is now descriptive; role injection is
  opt-in via `injectRole` (default `false`). Additive to the schema, a localized
  behavior change to `interactive-role-required`, called out loudly in the
  CHANGELOG. Was proposed, approved, then built — same review bar as `nameProp`.

**Bottom line:** the config bridge is not vaporware — it moves real diagnostics
on real components, and the two coverage gaps a real design system exposed are
now closed. What remains (Gap C) is a one-field schema decision, not a
correctness problem. "A design system declares its components and the safe tier
grows" is now true for the simple control shapes *and* honest about the custom
ones — it tells you when it can't help instead of failing silently.
