/**
 * The canonical fixture set for no-unsupported-aria, consumed by BOTH the
 * ESLint RuleTester suite and the oxlint parity harness
 * (scripts/oxlint-parity.mjs) — one source, two hosts.
 *
 * VALID cases: the rule must stay silent.
 * INVALID cases: the rule must fire and the fix must produce `output` exactly.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the
 * parity script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string; data: Record<string, string> }[];
  /** Result of ONE fixer pass — the RuleTester `output` contract. */
  output: string;
  /**
   * Result once `--fix` converges, when it differs from the single pass.
   * Adjacent discrete removals share a range boundary, and ESLint's
   * single-pass fixer defers a fix starting exactly where the previous one
   * ended; the next pass picks it up. The parity harness asserts both hosts
   * reach this final form.
   */
  converged?: string;
}

export const valid: string[] = [
  // Global ARIA properties are allowed on every role — never flagged, even
  // on roles with an otherwise restrictive supported set.
  '<button aria-label="Close">x</button>',
  '<h1 aria-live="polite">Title</h1>',

  // aria-label on generic is PROHIBITED by ARIA 1.2 (aria-query lists it in
  // generic's prohibitedProps), but it is still a global: browsers may still
  // compute a name from it, so removal could change meaning. Never stripped.
  '<div aria-label="decorated">x</div>',

  // ARIA 1.2 narrowed aria-disabled / aria-invalid / aria-errormessage /
  // aria-haspopup from global (1.1) to role-specific. That reclassification
  // is exactly the kind of debatable call we refuse to enforce by deletion —
  // exempted as if global. (Registry documents this.)
  '<h1 aria-disabled="true">Title</h1>',
  '<ul aria-haspopup="menu">x</ul>',

  // Supported by the resolved role: positive controls.
  '<button aria-expanded="true">x</button>',
  '<div role="checkbox" aria-checked="true">x</div>',

  // ---- Unresolved role means silence, full stop. ----

  // Orphan <li>: implicit role undecidable (ancestor-dependent), so even an
  // obviously-wrong attribute stays untouched.
  '<li aria-checked="true">x</li>',

  // Bare <th>: positional per HTML-AAM, undecidable.
  '<th aria-checked="true">h</th>',

  // Dynamic role, spread props, custom component: role not statically known.
  '<div role={dyn} aria-checked="true">x</div>',
  '<div {...props} aria-checked="true">x</div>',
  '<Widget aria-checked="true">x</Widget>',

  // Explicit role aria-query does not recognize: not this rule's problem —
  // it fixes unsupported attributes, it does not second-guess a bad role.
  '<div role="fancy-widget" aria-checked="true">x</div>',

  // Abstract roles must not be used by authors; treat as unrecognized.
  '<div role="widget" aria-checked="true">x</div>',

  // An aria-* name aria-query has no definition for (here: a typo of
  // aria-label). A typo is a signal to the human — deleting it would hide
  // the bug. Skipped, not stripped.
  '<button aria-lable="Close">x</button>',
];

export const invalid: InvalidFixture[] = [
  // Core case: aria-checked is not in role button's supported set.
  {
    code: '<button aria-checked="true">Save</button>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-checked', role: 'button', element: 'button' },
      },
    ],
    output: '<button>Save</button>',
  },
  // Implicit generic: aria-sort belongs to column/row headers only.
  {
    code: '<div aria-sort="ascending">x</div>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-sort', role: 'generic', element: 'div' },
      },
    ],
    output: '<div>x</div>',
  },
  // The EXPLICIT role wins: button supports aria-pressed, menuitem does not.
  {
    code: '<button role="menuitem" aria-pressed="true">x</button>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-pressed', role: 'menuitem', element: 'button' },
      },
    ],
    output: '<button role="menuitem">x</button>',
  },
  // Conditional implicit role feeding this rule: <a href> resolves to link.
  {
    code: '<a href="/x" aria-checked="true">x</a>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-checked', role: 'link', element: 'a' },
      },
    ],
    output: '<a href="/x">x</a>',
  },
  // A dynamic VALUE does not matter — the attribute NAME is static and the
  // attribute is ignored by user agents regardless of what it evaluates to.
  {
    code: '<button aria-checked={isOn}>x</button>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-checked', role: 'button', element: 'button' },
      },
    ],
    output: '<button>x</button>',
  },
  // Multiple unsupported attributes: one diagnostic and one discrete,
  // correctly-scoped fix EACH. The two removals touch (each consumes the
  // space before its attribute), so ESLint's single pass applies the first
  // and defers the second — `output` is that one-pass state, `converged` is
  // where `--fix` lands one pass later.
  {
    code: '<div aria-checked="true" aria-sort="ascending">x</div>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-checked', role: 'generic', element: 'div' },
      },
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-sort', role: 'generic', element: 'div' },
      },
    ],
    output: '<div aria-sort="ascending">x</div>',
    converged: '<div>x</div>',
  },
  // Unsupported attribute mixed with a kept attribute: only the offender goes.
  {
    code: '<button type="submit" aria-checked="true" aria-label="Go">Go</button>',
    errors: [
      {
        messageId: 'unsupportedAria',
        data: { attribute: 'aria-checked', role: 'button', element: 'button' },
      },
    ],
    output: '<button type="submit" aria-label="Go">Go</button>',
  },
];
