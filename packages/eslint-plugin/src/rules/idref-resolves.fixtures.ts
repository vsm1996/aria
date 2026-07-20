/**
 * The canonical fixture set for idref-resolves, consumed by BOTH the ESLint
 * RuleTester suite and the oxlint parity harness (scripts/oxlint-parity.mjs)
 * — one source, two hosts.
 *
 * This rule is report-only (basis native, no fix — see the rule's docblock for
 * the deliberate native-basis / lint-tier split). Every invalid fixture uses
 * `output: null`: RuleTester asserts nothing is auto-applied, and the parity
 * harness asserts --fix leaves the code byte-identical on both hosts.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the parity
 * script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string; data: Record<string, string> }[];
  output: string | null;
}

export const valid: string[] = [
  // Resolves: the id exists elsewhere in the file (ids are global — the target
  // need not be a sibling or ancestor).
  '<div><span id="foo">Label</span><button aria-labelledby="foo">x</button></div>',

  // A space-separated list where every id resolves.
  '<div><span id="a" /><span id="b" /><button aria-labelledby="a b">x</button></div>',

  // Forward reference: the target appears AFTER the reference in source order.
  // Resolution is whole-file, so order does not matter.
  '<div><button aria-labelledby="later">x</button><span id="later" /></div>',

  // aria-controls resolves — all three attributes are checked, not just labelledby.
  '<div><section id="panel" /><button aria-controls="panel">x</button></div>',
  // aria-describedby resolves.
  '<div><p id="hint">Help</p><input aria-describedby="hint" /></div>',

  // A literal id written as a string expression is still statically known.
  "<div><span id={'foo'} /><button aria-labelledby=\"foo\">x</button></div>",

  // Dynamic reference value — cannot be checked statically. Silent.
  '<button aria-describedby={dynamicVar}>x</button>',
  '<button aria-controls={id}>x</button>',

  // The target id exists only as a DYNAMIC value: a literal reference cannot be
  // compared to it, and it could resolve at runtime — so the whole file stays
  // silent rather than risk a false positive.
  '<div><span id={computedId} /><button aria-labelledby="foo">x</button></div>',
  // Same suppression: a dynamic id elsewhere silences an otherwise-unresolved
  // literal reference.
  '<div><span id={rowId} /><button aria-controls="totally-missing">x</button></div>',

  // No idref attributes at all.
  '<button>x</button>',
];

export const invalid: InvalidFixture[] = [
  // Missing entirely: no element in the file has this id.
  {
    code: '<button aria-labelledby="missing-id">x</button>',
    errors: [
      {
        messageId: 'unresolvedIdref',
        data: { attribute: 'aria-labelledby', id: 'missing-id' },
      },
    ],
    output: null,
  },
  // List where one resolves and one does not — exactly one diagnostic, for the
  // unresolved token only.
  {
    code: '<div><span id="a" /><button aria-labelledby="a b">x</button></div>',
    errors: [
      { messageId: 'unresolvedIdref', data: { attribute: 'aria-labelledby', id: 'b' } },
    ],
    output: null,
  },
  // Multiple unresolved tokens in one value — one diagnostic each.
  {
    code: '<button aria-labelledby="x y">z</button>',
    errors: [
      { messageId: 'unresolvedIdref', data: { attribute: 'aria-labelledby', id: 'x' } },
      { messageId: 'unresolvedIdref', data: { attribute: 'aria-labelledby', id: 'y' } },
    ],
    output: null,
  },
  // aria-describedby — confirmed independently, not assumed wired.
  {
    code: '<button aria-describedby="nope">x</button>',
    errors: [
      { messageId: 'unresolvedIdref', data: { attribute: 'aria-describedby', id: 'nope' } },
    ],
    output: null,
  },
  // aria-controls — confirmed independently.
  {
    code: '<button aria-controls="no-panel">x</button>',
    errors: [
      { messageId: 'unresolvedIdref', data: { attribute: 'aria-controls', id: 'no-panel' } },
    ],
    output: null,
  },
  // Case mismatch is a genuine non-resolution: idref matching is case-sensitive
  // (like getElementById), so aria-labelledby="Foo" does not resolve to id="foo".
  {
    code: '<div><span id="foo" /><button aria-labelledby="Foo">x</button></div>',
    errors: [
      { messageId: 'unresolvedIdref', data: { attribute: 'aria-labelledby', id: 'Foo' } },
    ],
    output: null,
  },
];
