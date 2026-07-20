/**
 * The canonical fixture set for control-needs-name, consumed by BOTH the
 * ESLint RuleTester suite and the oxlint parity harness
 * (scripts/oxlint-parity.mjs) — one source, two hosts.
 *
 * Report-only (basis native/declared, no fix — Aria cannot author label text).
 * Every invalid fixture uses `output: null`. Fixtures are kept clean of OTHER
 * rules' triggers (the harness runs every rule on every fixture), so
 * aria-labelledby references resolve in-file; cases that intentionally leave a
 * reference unresolved live in the rule's own test file instead.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the parity
 * script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string; data?: Record<string, string> }[];
  output: string | null;
}

/** Mirrored verbatim in .oxlintrc.json (the parity harness fails on drift). */
export const ruleOptions: unknown[] = [
  {
    componentSemantics: {
      IconButton: { role: 'button', nameProp: 'label', source: 'declared' },
    },
  },
];

export const valid: string[] = [
  // Named by content or ARIA.
  '<button>Save</button>',
  '<button aria-label="Close">×</button>',
  '<a href="/home">Home</a>',
  '<input type="text" aria-label="Search" />',
  '<select aria-label="Country" />',

  // aria-labelledby resolving to an in-file id supplies a name.
  '<div><span id="lbl">Name</span><button aria-labelledby="lbl"><svg /></button></div>',

  // Form controls associated with a <label> — via htmlFor/id, or by wrapping.
  '<div><label htmlFor="n">Name</label><input type="text" id="n" /></div>',
  '<label>Name <input type="text" /></label>',
  '<label>Bio <textarea /></label>',

  // Dynamic name sources cannot be evaluated → silent (don't guess).
  '<button aria-label={dynamicVar}>x</button>',
  '<input type="text" aria-labelledby={ids} />',
  // A dynamic id in the file means an unresolved labelledby MIGHT resolve at
  // runtime → silent (same fail-safe as idref-resolves).
  '<div><span id={rowId} /><button aria-labelledby="ghost"><svg /></button></div>',

  // A spread could carry any name signal we cannot see.
  '<button {...props} />',

  // Out of scope: <a> without href is generic, not a link.
  '<a><svg /></a>',
  // Out of scope: hidden input.
  '<input type="hidden" />',
  // Not a control.
  '<div>caption</div>',

  // aria-hidden removes the control from the accessibility tree → it needs no
  // name (BUG 2 fix). The real MUI shape: an aria-hidden shadow field. It is
  // also tabIndex="-1", so aria-hidden-not-focusable is silent too, keeping
  // this parity-clean — but control-needs-name's exemption is independent of
  // focus (see the rule's own test for the focusable-aria-hidden case).
  '<textarea aria-hidden tabIndex={-1} />',

  // ---- Config bridge: declared control components. ----
  '<IconButton label="Close" />', // declared name prop present
  '<IconButton aria-label="Close" />', // named via ARIA on the usage
  '<IconButton>Save</IconButton>', // named by child content
  '<UnknownThing />', // no config match → silent
];

export const invalid: InvalidFixture[] = [
  // Icon-only button: no text, no ARIA, no label.
  {
    code: '<button><svg /></button>',
    errors: [{ messageId: 'controlNeedsName', data: { element: 'button', role: 'button' } }],
    output: null,
  },
  // Icon-only link.
  {
    code: '<a href="/home"><svg /></a>',
    errors: [{ messageId: 'controlNeedsName', data: { element: 'a', role: 'link' } }],
    output: null,
  },
  // Unlabeled text input — a placeholder is NOT a name (it disappears on input).
  {
    code: '<input type="text" placeholder="Search" />',
    errors: [{ messageId: 'controlNeedsName', data: { element: 'input', role: 'textbox' } }],
    output: null,
  },
  // Unlabeled select and textarea.
  {
    code: '<select />',
    errors: [{ messageId: 'controlNeedsName', data: { element: 'select', role: 'select' } }],
    output: null,
  },
  {
    code: '<textarea />',
    errors: [{ messageId: 'controlNeedsName', data: { element: 'textarea', role: 'textbox' } }],
    output: null,
  },

  // ---- Config bridge: declared control component missing its name. ----
  {
    code: '<IconButton />',
    errors: [
      { messageId: 'componentControlNeedsName', data: { component: 'IconButton', prop: 'label' } },
    ],
    output: null,
  },
];
