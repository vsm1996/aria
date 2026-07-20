/**
 * The canonical fixture set for img-needs-alt, consumed by BOTH the ESLint
 * RuleTester suite and the oxlint parity harness (scripts/oxlint-parity.mjs)
 * — one source, two hosts.
 *
 * This rule is report-only (basis native, no fix — Aria cannot author alt
 * text; see the rule's docblock for the native-basis / lint-tier split).
 * Every invalid fixture uses `output: null`: RuleTester asserts nothing is
 * auto-applied, and the parity harness asserts --fix leaves the code
 * byte-identical on both hosts.
 *
 * Fixtures are kept clean of OTHER rules' triggers (the parity harness runs
 * every rule on every fixture), so id references resolve in-file, etc.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the parity
 * script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string }[];
  output: string | null;
}

export const valid: string[] = [
  // Empty alt — the spec-correct way to mark an image decorative. NOT missing.
  '<img src="x.jpg" alt="" />',
  // A real accessible name.
  '<img src="x.jpg" alt="a mountain at sunrise" />',
  // Dynamic alt — cannot be evaluated statically. Do not assume empty/missing.
  '<img src="x.jpg" alt={dynamicVar} />',

  // Decorative via role — removes the image from the a11y tree; alt not needed.
  '<img src="x.jpg" role="presentation" />',
  '<img src="x.jpg" role="none" />',

  // A name supplied by aria-label / aria-labelledby (no alt, but named).
  '<img src="x.jpg" aria-label="Company logo" />',
  '<div><img src="x.jpg" aria-labelledby="cap" /><span id="cap">Photo caption</span></div>',

  // Hidden from assistive tech entirely — needs no name.
  '<img src="x.jpg" aria-hidden="true" />',

  // Role overridden away from image: no longer an image, so alt is not this
  // rule's concern (whether it needs a NAME is control-needs-name's job).
  '<img src="x.jpg" role="button" />',

  // A spread could carry alt or any signal we cannot see. Silent.
  '<img {...props} />',

  // Custom component — opaque internals, no matching config. Silent.
  '<CustomImage src="x.jpg" />',

  // Not an image at all.
  '<div>caption</div>',
];

export const invalid: InvalidFixture[] = [
  // The clearest case: a plain <img> with no alt and no other signal.
  {
    code: '<img src="x.jpg" />',
    errors: [{ messageId: 'imgNeedsAlt' }],
    output: null,
  },
  // aria-hidden="false" leaves the image exposed — it still needs a name.
  {
    code: '<img src="x.jpg" aria-hidden="false" />',
    errors: [{ messageId: 'imgNeedsAlt' }],
    output: null,
  },
  // `title` is NOT accepted as an alt-equivalent: it is a discouraged,
  // unreliable name source (not shown to touch/keyboard users), matching
  // jsx-a11y. An <img> with only a title still needs alt.
  {
    code: '<img src="x.jpg" title="Company logo" />',
    errors: [{ messageId: 'imgNeedsAlt' }],
    output: null,
  },
];
