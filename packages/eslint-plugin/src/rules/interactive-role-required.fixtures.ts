/**
 * The canonical fixture set for interactive-role-required, consumed by BOTH
 * the ESLint RuleTester suite and the oxlint parity harness
 * (scripts/oxlint-parity.mjs) — one source, two hosts.
 *
 * First lint-tier rule: invalid fixtures with `output: null` carry a
 * SUGGESTION only (basis inferred — the host must never auto-apply it; the
 * parity harness asserts --fix leaves the code byte-identical on both
 * hosts). The DeclaredButton fixtures exercise the config bridge: with the
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
   * asserts NO autofix was applied (suggestion-only diagnostics).
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
];

export const invalid: InvalidFixture[] = [
  // ---- Inferred basis: suggestion only, NEVER auto-applied. ----
  {
    code: '<div onClick={handleClick}>x</div>',
    errors: [
      {
        messageId: 'missingRole',
        data: { element: 'div' },
        suggestions: [
          {
            messageId: 'missingRole',
            output: '<div role="button" onClick={handleClick}>x</div>',
          },
        ],
      },
    ],
    output: null,
  },
  {
    code: '<span onClick={handleClick}>x</span>',
    errors: [
      {
        messageId: 'missingRole',
        data: { element: 'span' },
        suggestions: [
          {
            messageId: 'missingRole',
            output: '<span role="button" onClick={handleClick}>x</span>',
          },
        ],
      },
    ],
    output: null,
  },
  // Bare <a> without href resolves to generic — the classic JS-link.
  {
    code: '<a onClick={handleClick}>x</a>',
    errors: [
      {
        messageId: 'missingRole',
        data: { element: 'a' },
        suggestions: [
          { messageId: 'missingRole', output: '<a role="button" onClick={handleClick}>x</a>' },
        ],
      },
    ],
    output: null,
  },
  // Confirmed handler forms: arrow, member expression.
  {
    code: '<div onClick={() => save()}>x</div>',
    errors: [
      {
        messageId: 'missingRole',
        data: { element: 'div' },
        suggestions: [
          { messageId: 'missingRole', output: '<div role="button" onClick={() => save()}>x</div>' },
        ],
      },
    ],
    output: null,
  },
  {
    code: '<div onClick={handlers.save}>x</div>',
    errors: [
      {
        messageId: 'missingRole',
        data: { element: 'div' },
        suggestions: [
          {
            messageId: 'missingRole',
            output: '<div role="button" onClick={handlers.save}>x</div>',
          },
        ],
      },
    ],
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
