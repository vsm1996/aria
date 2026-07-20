/**
 * The canonical fixture set for interactive-role-required, consumed by BOTH
 * the ESLint RuleTester suite and the oxlint parity harness
 * (scripts/oxlint-parity.mjs) — one source, two hosts.
 *
 * First lint-tier rule. The intrinsic path inspects children (see the rule's
 * confidence-policy docblock) and sorts into three outcomes:
 *   - CONFIDENT (icon-only, short-text-only, or icon-plus-short-text):
 *     `output: null` (basis inferred means the fix can ONLY be a suggestion,
 *     never auto-applied) PLUS a `suggestions` entry carrying the role="button"
 *     output. The parity harness confirms --fix leaves the code byte-identical
 *     on both hosts — the gate holding on a real rule, not just a synthetic one.
 *   - REPORT ONLY (ambiguous / empty / unknown children): `output: null`, no
 *     `suggestions`.
 *   - SILENT (nested interactive element): a `valid` fixture — the outer
 *     element is left entirely alone (invalid-nesting is a different bug).
 * The DeclaredButton fixtures exercise the config bridge: with the
 * componentSemantics entry in `ruleOptions`, the basis is declared and the
 * fix IS auto-applied.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the
 * parity script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: {
    messageId: string;
    data?: Record<string, string>;
    suggestions?: { messageId: string; output: string }[];
  }[];
  /**
   * Result of ONE fixer pass — the RuleTester `output` contract. `null`
   * asserts NO autofix was applied (report-only diagnostics).
   */
  output: string | null;
  /** Result once `--fix` converges, when it differs from the single pass. */
  converged?: string;
}

/**
 * Rule options shared by every consumer of these fixtures. The parity
 * harness configures BOTH hosts with these and verifies .oxlintrc.json
 * carries the identical options, so the graduation behavior is compared
 * host-to-host, not assumed.
 */
export const ruleOptions: unknown[] = [
  {
    componentSemantics: {
      DeclaredButton: { role: 'button', source: 'declared' },
    },
  },
];

export const valid: string[] = [
  // Natively interactive elements already convey a role. Silent.
  '<button onClick={handleClick}>x</button>',
  '<a href="/x" onClick={handleClick}>x</a>',
  '<input onClick={handleClick} />',

  // The author addressed the role — explicitly, or in a form we cannot
  // statically judge (dynamic role, spread that could carry one).
  '<div role="button" onClick={handleClick}>x</div>',
  '<div role={dyn} onClick={handleClick}>x</div>',
  '<div {...props} onClick={handleClick}>x</div>',

  // No click handler at all.
  '<div>x</div>',

  // Handler forms we cannot CONFIRM are real click handlers.
  '<div onClick={cond ? save : undefined}>x</div>',
  '<div onClick={undefined}>x</div>',

  // Real non-generic semantics (heading) — the right fix is unclear and
  // definitely not role="button" on a heading. Out of this rule's scope.
  '<h1 onClick={handleClick}>x</h1>',

  // Undecidable implicit role (ancestor-dependent orphan). Silent.
  '<li onClick={handleClick}>x</li>',

  // Unknown custom component: its rendered output is invisible from here
  // and may already be a native <button>. Nothing safe to guess — silent.
  // (Declare it in componentSemantics to graduate it; see DeclaredButton.)
  '<UnknownWidget onClick={handleClick}>x</UnknownWidget>',

  // Declared component whose usage already has a role. Silent.
  '<DeclaredButton role="button" onClick={handleClick} />',

  // ---- Case 3: nested interactive element → SILENT on the outer element. ----
  // A generic element wrapping a real control is invalid nesting of
  // interactive elements — a DIFFERENT bug, out of scope. Suggesting a role on
  // the outer element would compound it, so we leave the outer alone entirely.
  '<div onClick={handleClick}><button>Submit</button></div>',
  '<div onClick={handleClick}><a href="/x">Home</a></div>',
  // Interactive descendant found at depth, not just as a direct child.
  '<div onClick={handleClick}><span><button>Deep</button></span></div>',
  // Several independently-clickable children: each is interactive, so the
  // outer container stays silent (each child is judged on its own merits).
  '<div onClick={handleClick}><button>a</button><button>b</button></div>',
];

export const invalid: InvalidFixture[] = [
  // ---- Cases 1 & 2: CONFIDENT — a role="button" SUGGESTION (never a fix). ----
  // `output: null` proves nothing is auto-applied; the `suggestions` entry
  // carries what a human would get if they accept it.

  // Case 1: icon-only (a single non-interactive element child, no text).
  {
    code: '<div onClick={handleClick}><svg /></div>',
    errors: [
      {
        messageId: 'inferButtonRole',
        data: { element: 'div' },
        suggestions: [
          {
            messageId: 'inferButtonRole',
            output: '<div role="button" onClick={handleClick}><svg /></div>',
          },
        ],
      },
    ],
    output: null,
  },
  {
    code: '<span onClick={handleClick}><i /></span>',
    errors: [
      {
        messageId: 'inferButtonRole',
        data: { element: 'span' },
        suggestions: [
          {
            messageId: 'inferButtonRole',
            output: '<span role="button" onClick={handleClick}><i /></span>',
          },
        ],
      },
    ],
    output: null,
  },

  // Case 2: a single short action-like text child, no element children.
  {
    code: '<div onClick={handleClick}>Save</div>',
    errors: [
      {
        messageId: 'inferButtonRole',
        data: { element: 'div' },
        suggestions: [
          {
            messageId: 'inferButtonRole',
            output: '<div role="button" onClick={handleClick}>Save</div>',
          },
        ],
      },
    ],
    output: null,
  },
  // Same confident path reached via other confirmed handler forms (arrow,
  // member expression), so the handler-detection coverage is preserved.
  {
    code: '<div onClick={() => remove()}>Delete</div>',
    errors: [
      {
        messageId: 'inferButtonRole',
        data: { element: 'div' },
        suggestions: [
          {
            messageId: 'inferButtonRole',
            output: '<div role="button" onClick={() => remove()}>Delete</div>',
          },
        ],
      },
    ],
    output: null,
  },
  {
    code: '<a onClick={handlers.close}>Close</a>',
    errors: [
      {
        messageId: 'inferButtonRole',
        data: { element: 'a' },
        suggestions: [
          {
            messageId: 'inferButtonRole',
            output: '<a role="button" onClick={handlers.close}>Close</a>',
          },
        ],
      },
    ],
    output: null,
  },
  // Case 1c: icon + short text — one non-interactive element child plus one
  // short label. The most button-like shape; also confident. Order-agnostic.
  {
    code: '<div onClick={handleClick}><svg />Save</div>',
    errors: [
      {
        messageId: 'inferButtonRole',
        data: { element: 'div' },
        suggestions: [
          {
            messageId: 'inferButtonRole',
            output: '<div role="button" onClick={handleClick}><svg />Save</div>',
          },
        ],
      },
    ],
    output: null,
  },

  // ---- Cases 4 & 5: REPORT ONLY — flag, no fix, no suggestion. ----

  // Case 4: card-like mix of children, no single-action signal.
  {
    code: '<div onClick={handleClick}><img src="a.png" alt="" /><span>Title</span></div>',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },
  // Long text is not a button label.
  {
    code: '<div onClick={handleClick}>This is a paragraph of descriptive prose</div>',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },
  // Boundary: icon + text keeps the bucket narrow. A LONG text alongside an
  // icon is NOT a label — report-only, not confident.
  {
    code: '<div onClick={handleClick}><svg />This is a long descriptive sentence</div>',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },
  // Boundary: more than one element child alongside the text — not the single
  // icon + label shape. Report-only.
  {
    code: '<div onClick={handleClick}><svg /><img src="a.png" alt="" />Save</div>',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },
  // Unknown contents: a nested component (could be interactive, could be an
  // icon — cannot tell), and a dynamic {expression}. Flag, do not guess.
  {
    code: '<div onClick={handleClick}><Icon /></div>',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },
  {
    code: '<div onClick={handleClick}>{label}</div>',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },
  // Case 5: empty / whitespace-only — nothing to infer from.
  {
    code: '<div onClick={handleClick} />',
    errors: [{ messageId: 'missingRole', data: { element: 'div' } }],
    output: null,
  },

  // ---- Declared basis via the config bridge: a REAL auto-applied fix. ----
  {
    code: '<DeclaredButton onClick={handleClick} />',
    errors: [
      {
        messageId: 'declaredRoleMissing',
        data: { component: 'DeclaredButton', role: 'button' },
      },
    ],
    output: '<DeclaredButton role="button" onClick={handleClick} />',
  },
];
