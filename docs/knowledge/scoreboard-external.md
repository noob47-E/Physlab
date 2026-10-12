# External holdout corpus (scoreboard)

`tests/engine/scoreboard/external/` holds known answers taken from published OpenStax textbooks, licensed under
the Creative Commons Attribution 4.0 International licence (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/).
The items are used for testing only. They are never shown in the app, and nothing under `src/` reads them.

**Status: incomplete.** The contract asks for 100 to 200 items in each of seven classes. This part keeps 116 items in
four classes and has none for the other three.

## Contents

| file | class | kept |
| --- | --- | --- |
| `expand.json` | expand | 33 |
| `factor_over_Q.json` | factor over ℚ | 31 |
| `partial_fractions.json` | partial fractions | 36 |
| `rational-expression_simplification.json` | rational-expression simplification | 16 |
| `derivatives.json` | derivatives | 0 |
| none | polynomial equations | 0 |
| none | 2x2 and 3x3 linear systems | 0 |

`rejected.json` lists the 5 items that were not kept, each with its reason. Every item has the fields `id`, `class`,
`question`, `answer` and `source` (`book`, `edition`, `chapter`, `section`, `exercise number`, `url`).

The source fields come from the extractor. `chapter` is empty and `url` is the site root (`https://openstax.org`): the
extractor did not record either, and the OpenStax source bundles it read are not on the owner's PC. Filling them in
needs the bundles again, which means a download that the owner has to approve.

## How each item is checked

`tools/verifier.ts` re-derives every kept item with exact arithmetic. A check that cannot be made exactly refuses the
item with a reason; it never passes it.

- **expand, factor over ℚ, rational-expression simplification, partial fractions:** the question and the answer are
  written as rational functions over BigInt rationals and cross-multiplied. Both sides must match term by term. A zero
  denominator is refused. A square root or a function name used as a variable is refused.
- **polynomial equations (no items yet):** every root in the answer, counted with repeats and with `±` expanded,
  must multiply back to the equation's polynomial. So the count must equal the degree and every multiplicity must
  match. Surd roots must come with their conjugates. An unreadable root refuses the item; it is not skipped.
- **2x2 and 3x3 linear systems (no items yet):** the system must be square with a nonzero exact determinant, and the
  answer must satisfy every equation exactly.
- **derivatives (no items yet):** the question must have one variable, and a prime or an `=` in either side refuses
  the item. A rational question is checked exactly: its derivative is worked out as a rational function and compared
  term by term; an answer that is not rational is refused. Any other function must pass five fixed points (a central
  difference at 100 digits, h = 1e-30, relative tolerance 1e-40) and a symbolic certificate: the derivative minus the
  answer must simplify to exactly 0. The points alone do not prove a derivative, since a crafted answer can match them.
  The certificate is conservative: a correct answer written in a form the simplifier cannot reduce is refused.

`external.test.ts` re-runs `verifyItem` on every kept item. It also runs plants that must be accepted or refused, so a
check that stops working fails the suite. It checks that every item carries its file's class, and that `rejected.json`
gives a reason for each entry.

## Sources and attribution

Used for testing only. Each book is CC BY 4.0.

- **College Algebra 2e** (edition 2e), by Jay Abramson, et al. Items in `expand`, `factor over ℚ`,
  `partial fractions` and `rational-expression simplification`.
- **Calculus Volume 1** (edition 1), by Edwin "Jed" Herman, Gilbert Strang, et al. Items in `partial fractions`.

The author lines are as the extraction recorded them. They have not been checked against the OpenStax book pages in
this part: the pages returned only the title when fetched. Check them before any public use. The NOTICE file has
one line for these books.

## Known limits and traps

- `tools/extractor.py` reads the OpenStax CNXML bundles from `/tmp`, which the owner's PC does not have. Its fallback
  takes any exercise that has one formula, whatever its type. That is why the first draft had two non-derivative
  items in the derivative class, and 14 items of the wrong kind in the rational class (11 moved to expand or factor,
  3 rejected). Re-run it only with a type filter per class.
- Rational-expression excluded values are not recorded. The check does not test them.
- Radicals are not checked. The rational class has one item with a radical, rejected for that reason.
- Equations and systems have no items. Their checks are in place and are plant-tested.
- Derivatives have no items. The first draft's two entries were not derivatives and were rejected.
