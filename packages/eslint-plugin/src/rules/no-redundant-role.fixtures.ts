/**
 * The canonical fixture set for no-redundant-role. Every case here is a
 * contract, consumed by BOTH the ESLint RuleTester suite and the oxlint
 * parity harness (scripts/oxlint-parity.mjs) — one source, two hosts, so the
 * hosts provably run the same inputs.
 *
 * VALID cases: the rule must stay silent.
 * INVALID cases: the rule must fire and the fix must produce `output` exactly.
 *
 * Do not change expected output to make tests pass — fix the rule until the
 * output matches.
 *
 * NOTE: this module must stay erasable TypeScript with no imports — the
 * parity script loads it directly under plain Node via type stripping.
 */

export interface InvalidFixture {
  code: string;
  errors: { messageId: string; data: Record<string, string> }[];
  output: string;
}

export const valid: string[] = [
  // No role at all — nothing to remove.
  '<button>Save</button>',

  // Explicit role IS the implicit role but element has no implicit role.
  // A bare <div> has no implicit role, so role="none" is intentional.
  '<div role="none">decorative</div>',

  // <a> without href has an implicit role of 'generic', NOT 'link'.
  // role="link" here is NOT redundant — the author is promoting it.
  // (<a> WITH href is the redundant case — covered in INVALID below.)
  '<a role="link">anchor without href</a>',

  // Dynamic role — cannot evaluate statically, must not touch.
  '<button role={computedRole}>x</button>',

  // Custom component — no known implicit role, do not touch.
  '<Button role="button">x</Button>',

  // role is different from implicit role — intentional semantic override.
  '<button role="menuitem">x</button>',

  // <input type="checkbox"> has implicit role "checkbox". role="checkbox"
  // would be redundant, but role="switch" is a valid override.
  '<input type="checkbox" role="switch" />',

  // ---- Ancestor-dependent roles: undecidable means hands off. ----

  // <li> is 'listitem' only inside <ul>/<ol>/<menu>. In a <div> the role
  // is a promotion, not a redundancy. MUST NOT be touched.
  '<div><li role="listitem">x</li></div>',

  // Orphan <li>: the runtime parent could be a list via composition.
  '<li role="listitem">x</li>',

  // Component boundary: <List> may or may not render a list element.
  '<List><li role="listitem">x</li></List>',

  // Dynamic child: the chain from <ul> to <li> passes through an
  // expression, so the direct-descendant relation is not static.
  '<ul>{items.map((item) => <li role="listitem">{item}</li>)}</ul>',

  // The parent list is re-roled: its items are no longer listitems.
  '<ul role="presentation"><li role="listitem">x</li></ul>',

  // Spread / dynamic role on the parent: list semantics not static.
  '<ul {...props}><li role="listitem">x</li></ul>',
  '<ul role={dyn}><li role="listitem">x</li></ul>',

  // <footer>/<header> are contentinfo/banner only when scoped to <body>,
  // which a JSX fragment can never prove. Always undecidable.
  '<div><footer role="contentinfo">x</footer></div>',
  '<article><header role="banner">x</header></article>',

  // <td> is cell vs gridcell depending on the ancestor table's role.
  '<div><td role="cell">x</td></div>',

  // <th> without scope is positional per HTML-AAM (columnheader /
  // rowheader / cell); aria-query's unconditioned entry under-encodes it.
  '<th role="columnheader">h</th>',
];

export const invalid: InvalidFixture[] = [
  // Core case: explicit role == implicit role. Remove it.
  {
    code: '<button role="button">Save</button>',
    errors: [{ messageId: 'redundantRole', data: { role: 'button', element: 'button' } }],
    output: '<button>Save</button>',
  },
  // Heading
  {
    code: '<h1 role="heading">Title</h1>',
    errors: [{ messageId: 'redundantRole', data: { role: 'heading', element: 'h1' } }],
    output: '<h1>Title</h1>',
  },
  // List
  {
    code: '<ul role="list">items</ul>',
    errors: [{ messageId: 'redundantRole', data: { role: 'list', element: 'ul' } }],
    output: '<ul>items</ul>',
  },
  // Image with alt — implicit role is 'img'
  {
    code: '<img role="img" alt="photo" />',
    errors: [{ messageId: 'redundantRole', data: { role: 'img', element: 'img' } }],
    output: '<img alt="photo" />',
  },
  // Other attributes present — only the role is removed
  {
    code: '<button role="button" type="submit">Go</button>',
    errors: [{ messageId: 'redundantRole', data: { role: 'button', element: 'button' } }],
    output: '<button type="submit">Go</button>',
  },
  // <a> WITH href: implicit role is 'link', so role="link" is redundant
  {
    code: '<a href="/home" role="link">Home</a>',
    errors: [{ messageId: 'redundantRole', data: { role: 'link', element: 'a' } }],
    output: '<a href="/home">Home</a>',
  },

  // ---- Ancestor-dependent roles, statically resolved. ----

  // <li> directly inside a static list parent: 'listitem' is redundant.
  {
    code: '<ul><li role="listitem">item</li></ul>',
    errors: [{ messageId: 'redundantRole', data: { role: 'listitem', element: 'li' } }],
    output: '<ul><li>item</li></ul>',
  },
  {
    code: '<ol><li role="listitem">item</li></ol>',
    errors: [{ messageId: 'redundantRole', data: { role: 'listitem', element: 'li' } }],
    output: '<ol><li>item</li></ol>',
  },
  {
    code: '<menu><li role="listitem">item</li></menu>',
    errors: [{ messageId: 'redundantRole', data: { role: 'listitem', element: 'li' } }],
    output: '<menu><li>item</li></menu>',
  },
  // Parent restates its own implicit role: both are redundant. The
  // parent's role="list" keeps the list semantics static, so the <li>
  // is still decidable.
  {
    code: '<ul role="list"><li role="listitem">item</li></ul>',
    errors: [
      { messageId: 'redundantRole', data: { role: 'list', element: 'ul' } },
      { messageId: 'redundantRole', data: { role: 'listitem', element: 'li' } },
    ],
    output: '<ul><li>item</li></ul>',
  },
  // Fragments are transparent: their children are direct DOM children
  // of the fragment's parent, so the relation is still static.
  {
    code: '<ul><><li role="listitem">item</li></></ul>',
    errors: [{ messageId: 'redundantRole', data: { role: 'listitem', element: 'li' } }],
    output: '<ul><><li>item</li></></ul>',
  },
  // <th> with an explicit scope IS decidable: scope, not position,
  // fixes the role.
  {
    code: '<th scope="col" role="columnheader">h</th>',
    errors: [{ messageId: 'redundantRole', data: { role: 'columnheader', element: 'th' } }],
    output: '<th scope="col">h</th>',
  },
];
