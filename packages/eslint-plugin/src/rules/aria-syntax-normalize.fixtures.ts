/**
 * The canonical fixture set for aria-syntax-normalize, consumed by BOTH the
 * ESLint RuleTester suite and the oxlint parity harness
 * (scripts/oxlint-parity.mjs) — one source, two hosts.
 *
 * This rule ONLY changes case: attribute name casing (aria-Label →
 * aria-label) and enumerated value casing (aria-hidden="True" → "true").
 * Its test file asserts that property directly: every fix output equals its
 * input case-insensitively, and re-running the rule on output is silent.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the
 * parity script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string; data: Record<string, string> }[];
  /** Result of ONE fixer pass — the RuleTester `output` contract. */
  output: string;
  /** Result once `--fix` converges, when it differs from the single pass. */
  converged?: string;
}

export const valid: string[] = [
  // aria-label's type is plain string: values are authored text, never
  // case-normalized — even when they happen to look like a token.
  '<div aria-label="Save">x</div>',
  '<div aria-label="TRUE">x</div>',

  // Dynamic values and boolean shorthand are not literal strings. Untouched.
  '<button aria-hidden={hidden}>x</button>',
  '<button aria-hidden>x</button>',

  // Already canonical.
  '<div aria-current="page">x</div>',

  // Not a defined token for the attribute ("yes" is not a boolean value):
  // garbage is a signal to the human, not something to case-fold.
  '<div aria-hidden="yes">x</div>',

  // tokenlist values (aria-relevant) can hold multiple tokens; multi-token
  // normalization is out of scope — skipped, not guessed at.
  '<div aria-relevant="Additions Text">x</div>',

  // Component props are JavaScript identifiers, not HTML attributes:
  // renaming aria-Hidden or case-folding its value changes what the
  // component receives. Untouched.
  '<Widget aria-Hidden="True" />',

  // Renaming with a spread present could change which prop wins (aria-Label
  // and aria-label are different JS keys until they reach the DOM).
  '<div aria-Label="x" {...props}>x</div>',

  // The canonical name already exists: renaming would create a duplicate.
  '<div aria-Label="x" aria-label="y">x</div>',

  // Lowercased name is not a real ARIA attribute (typo of aria-label):
  // not ours to rename — deleting/renaming typos hides bugs.
  '<div aria-lable="x">x</div>',
];

export const invalid: InvalidFixture[] = [
  // Attribute name casing.
  {
    code: '<div aria-Label="Save">x</div>',
    errors: [
      {
        messageId: 'attrNameCase',
        data: { attribute: 'aria-Label', normalized: 'aria-label' },
      },
    ],
    output: '<div aria-label="Save">x</div>',
  },
  {
    code: '<div ARIA-HIDDEN="true">x</div>',
    errors: [
      {
        messageId: 'attrNameCase',
        data: { attribute: 'ARIA-HIDDEN', normalized: 'aria-hidden' },
      },
    ],
    output: '<div aria-hidden="true">x</div>',
  },
  // Boolean value casing.
  {
    code: '<div aria-hidden="True">x</div>',
    errors: [
      {
        messageId: 'valueCase',
        data: { attribute: 'aria-hidden', value: 'True', normalized: 'true' },
      },
    ],
    output: '<div aria-hidden="true">x</div>',
  },
  // Quote style is preserved: only the value's case changes.
  {
    code: "<div aria-hidden='True'>x</div>",
    errors: [
      {
        messageId: 'valueCase',
        data: { attribute: 'aria-hidden', value: 'True', normalized: 'true' },
      },
    ],
    output: "<div aria-hidden='true'>x</div>",
  },
  // Enumerated token value casing.
  {
    code: '<div aria-current="Page">x</div>',
    errors: [
      {
        messageId: 'valueCase',
        data: { attribute: 'aria-current', value: 'Page', normalized: 'page' },
      },
    ],
    output: '<div aria-current="page">x</div>',
  },
  {
    code: '<div aria-haspopup="MENU">x</div>',
    errors: [
      {
        messageId: 'valueCase',
        data: { attribute: 'aria-haspopup', value: 'MENU', normalized: 'menu' },
      },
    ],
    output: '<div aria-haspopup="menu">x</div>',
  },
  // Tristate value casing.
  {
    code: '<input type="checkbox" aria-checked="MIXED" />',
    errors: [
      {
        messageId: 'valueCase',
        data: { attribute: 'aria-checked', value: 'MIXED', normalized: 'mixed' },
      },
    ],
    output: '<input type="checkbox" aria-checked="mixed" />',
  },
  // Name and value both wrong: two discrete diagnostics, two disjoint fixes
  // (name range vs. value range), both applied in a single pass.
  {
    code: '<div aria-Current="Page">x</div>',
    errors: [
      {
        messageId: 'attrNameCase',
        data: { attribute: 'aria-Current', normalized: 'aria-current' },
      },
      {
        messageId: 'valueCase',
        data: { attribute: 'aria-Current', value: 'Page', normalized: 'page' },
      },
    ],
    output: '<div aria-current="page">x</div>',
  },
];
