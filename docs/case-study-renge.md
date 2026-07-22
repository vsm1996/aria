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
    IconButton:  { role: 'button',   requiresName: true, nameProp: 'aria-label' },
    Checkbox:    { role: 'checkbox', requiresName: true, nameProp: 'label' },
    MultiSelect: { role: 'combobox', requiresName: true, nameProp: 'placeholder' },
  },
};
```

Every entry validates cleanly (`validateAriaConfig` only requires `role` to be a
non-empty string). The experiment fed this through the deterministic inline
rule-options path — identical to what the file loader produces.

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
the headline *suggestion → auto-fix* graduation:

```
const C = () => <IconButton onClick={close}><CloseIcon /></IconButton>;
  NO config: (silent)
  + config : [AUTO-FIX] <IconButton> is declared as role 'button' via
             componentSemantics, but this usage carries no role attribute
             (interactive-role-required; basis: declared).

aria fix output:
  const C = () => <IconButton role="button" onClick={close}><CloseIcon/></IconButton>;
```

Same code, same rule, silent → a real declared-basis auto-fix that actually
rewrites the source — driven entirely by config. **The bridge mechanism is
real.**

---

## Result 2 — three gaps a real design system surfaced

### Gap A — the dominant icon-button shape evades the name check

`control-needs-name` on `IconButton`, varying only the child (all **with** the
config above):

```
  <IconButton onClick={x} />                        -> FLAGGED (no name)
  <IconButton onClick={x}>Save</IconButton>         -> silent  (text is a name — correct)
  <IconButton onClick={x}><svg/></IconButton>       -> FLAGGED (svg is known-non-text)
  <IconButton onClick={x}><CloseIcon/></IconButton> -> silent  (!)
  <IconButton aria-label="Close" …><CloseIcon/>…    -> silent  (named — correct)
```

The fourth line is the finding. `<CloseIcon/>` is a **component**, so its
rendered content is invisible from the call site; the rule conservatively treats
an unknown-content child as "might supply a name" and stays silent. That is
correct-by-its-own-rules, but it means the single most common icon-button shape —
`<IconButton><SomeIconComponent/></IconButton>` — slips through the missing-name
check. It works for a raw `<svg>` child and for a self-closing element, but real
design systems ship icon **components**. So for icon buttons specifically, the
config-bridge name check has limited reach. (`Checkbox`, which has no children,
is unaffected — this is a shape-specific limit, not a bridge-wide one.)

### Gap B — the custom `<div>` Select can't be name-checked at all

```
const C = () => <MultiSelect options={opts} onChange={onChange} />;
  NO config: (silent)
  + config : (silent)   // declared role: 'combobox'
```

`MultiSelect` renders a `<div>` with no native role — arguably the component
*most* in need of an enforced accessible name. But `control-needs-name`'s v1
role scope is `button / link / textbox / searchbox / checkbox / radio`;
`combobox` is outside it, so the rule silently ignores the declaration. The
config **validates fine and has zero effect** — a silent no-op, with no warning
that the declared role is unsupported. A team could reasonably believe their
custom Select is covered when it isn't.

### Gap C — the `role` field is overloaded, and the two consumers disagree

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

---

## Does this validate "a token system hands Aria ground truth at scale"?

**Partially — and the failure modes are the valuable part.**

- **Yes:** the bridge is real. `Checkbox` is a clean win — an unlabeled control
  that is invisible without config becomes a located, declared-basis finding
  with it. The `interactive-role-required` auto-fix graduation genuinely rewrites
  source from a config declaration. The plumbing works end to end on real
  components.
- **But not "at scale, for free":** on a real, *good* design system the reach is
  narrower than the synthetic tests implied. Icon buttons (the poster child) leak
  through the unknown-component-child rule (Gap A); the custom widgets that most
  need help sit outside the consuming rule's role scope and fail silently (Gap
  B); and the one overloaded `role` field makes a single honest declaration do
  the right thing for one rule and a redundant thing for another (Gap C).

None are fatal. All are cheaper to fix now than after more rules assume
"declare the component and it just works."

## Recommended follow-ups (for the registry's watch list)

1. **Separate "understand" from "inject" in the schema.** `interactive-role-required`
   should only inject a role for components declared as rendering a *non-semantic*
   element (or gate injection behind an explicit flag like `injectRole`/
   `rendersNativeElement: false`). A component that renders a native control wants
   its role understood, not stamped on.
2. **Warn on a declared role no consumer supports** (Gap B). A `role: 'combobox'`
   that silently does nothing is worse than an error — the config lies by
   omission. Either expand `control-needs-name`'s role scope to the ARIA widget
   roles (combobox, listbox, …) or have the loader/rule surface "declared role
   'combobox' is not yet consumed."
3. **Consider a `requiresName`-driven check that trusts the declaration over the
   subtree** (Gap A). When a component is declared `requiresName: true` with a
   `nameProp`, an unknown-content child arguably should *not* silence the check —
   the design system has asserted the name must come from the prop, so an
   unknown icon child shouldn't be assumed to provide it. This is a real judgment
   call (it trades a possible false positive for catching the common case), which
   is why it's flagged here rather than changed.

**Bottom line:** the config bridge is not vaporware — it moves real diagnostics
on real components. But "a design system declares its components and the safe
tier grows" is, today, true for the *simple* control shapes and leaky for the
*custom* ones — which is exactly the population a design system exists to
provide. Worth knowing now.
