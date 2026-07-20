/**
 * The canonical fixture set for aria-hidden-not-focusable, consumed by BOTH
 * the ESLint RuleTester suite and the oxlint parity harness
 * (scripts/oxlint-parity.mjs) — one source, two hosts.
 *
 * Report-only (basis native, no fix — multiple valid intent-dependent repairs;
 * Aria refuses to pick). Every invalid fixture uses `output: null`. Fixtures
 * are kept clean of OTHER rules' triggers (the harness runs every rule on every
 * fixture): focusable controls carry an accessible name so control-needs-name
 * stays silent, etc.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the parity
 * script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string; data?: Record<string, string> }[];
  output: string | null;
}

export const valid: string[] = [
  // Not focusable → correct decorative usage of aria-hidden.
  '<div aria-hidden="true">text</div>',
  '<span aria-hidden="true"><svg /></span>',

  // Focusable but correctly removed from the tab order.
  '<button aria-hidden="true" tabindex="-1" aria-label="x">i</button>',
  // Descendant correctly de-focused inside the hidden subtree.
  '<div aria-hidden="true"><button tabindex="-1" aria-label="x">i</button></div>',

  // aria-hidden is dynamic → cannot confirm it is "true" → silent.
  '<div aria-hidden={cond}><button aria-label="x">i</button></div>',
  '<button aria-hidden={cond} aria-label="x">i</button>',
  // tabindex is dynamic → focusability undecidable → silent.
  '<button aria-hidden="true" tabindex={expr} aria-label="x">i</button>',
  '<div aria-hidden="true" tabindex={expr}>text</div>',

  // aria-hidden="false" is not a trigger.
  '<button aria-hidden="false" aria-label="x">i</button>',

  // Dynamic children could be anything → cannot confirm a focusable ghost.
  '<div aria-hidden="true">{children}</div>',

  // No aria-hidden at all.
  '<button aria-label="x">i</button>',
];

export const invalid: InvalidFixture[] = [
  // The element itself is focusable and hidden.
  {
    code: '<button aria-hidden="true" aria-label="x">i</button>',
    errors: [{ messageId: 'focusableHidden', data: { element: 'button' } }],
    output: null,
  },
  // An otherwise non-focusable element made focusable with tabindex >= 0.
  {
    code: '<div aria-hidden="true" tabindex="0">x</div>',
    errors: [{ messageId: 'focusableHidden', data: { element: 'div' } }],
    output: null,
  },
  // A focusable link, hidden.
  {
    code: '<a href="/home" aria-hidden="true" aria-label="x">i</a>',
    errors: [{ messageId: 'focusableHidden', data: { element: 'a' } }],
    output: null,
  },
  // The subtree case: a hidden container with a focusable descendant.
  {
    code: '<div aria-hidden="true"><button aria-label="x">i</button></div>',
    errors: [
      { messageId: 'focusableDescendantHidden', data: { element: 'div', descendant: 'button' } },
    ],
    output: null,
  },
  // Subtree focusable found deeper than a direct child.
  {
    code: '<div aria-hidden="true"><span><input aria-label="x" /></span></div>',
    errors: [
      { messageId: 'focusableDescendantHidden', data: { element: 'div', descendant: 'input' } },
    ],
    output: null,
  },
];
