# Expanding and factorising steps (S1c)

Two step methods on the step framework: `expand` (multiply out a typed product of brackets) and `factorise`
(factorise a typed polynomial over the rationals). Both work in one letter (x, or any single letter) with exact
rational arithmetic. Two letters, as in (x + y)(x − y), are declined.

## Methods

- **expand** (`methods/expand.ts`, job `expand`): a product of two or more brackets, or a bracket to a power.
  Each step multiplies two factors term by term with nothing collected (`expand-factors`), then collects the like
  terms into order (`collect-factor`, only when the collected form differs). Three brackets take two steps per pair.
- **factorise** (`methods/factorise.ts`, job `factor`): the first factor not yet finished is moved on, in school order:
  1. highest common factor (`take-out-hcf`);
  2. difference of two squares (`difference-of-squares`);
  3. sum or difference of two cubes (`cube-factor`);
  4. perfect-square trinomial (`perfect-square`);
  5. quadratic by the ac method: split the middle term (`split-middle`), group the pairs (`group-pairs`), take out the
     common binomial (`common-binomial`);
  6. four terms by grouping (`group-pairs`, `common-binomial`);
  7. rational root (factor theorem) for degree 3 or more: a linear factor (`linear-factor`) and the quotient;
  8. irreducible (`irreducible`): a quadratic with a non-square discriminant, or a factor of degree 3 with no rational root.

A factor is finished when it is a monomial, a linear factor with no common factor left, or declared irreducible.
Any other factor (for example a degree 4 polynomial with no rational root) declines the method: the page shows nothing.

## Shared front (`methods/productState.ts`)

A typed product is read into its factors (`productFactorsOf`). Each step is an `ExprEq` whose `op` names the move
and whose `data` holds the factor lists before and after. The sentence and rule come from the builders in
`sentences.ts` (`productSentence`, `productRule`), so a method never types its own words.

## Framework support (files authorised for S1c)

- `types.ts`: `ExprOp`, the typed moves listed above.
- `check-adapter.ts`: the S1c section (product readers, `checkProductStep` and `checkProductOp` with one structural check
  per op, `rationalRootsOf`, `irreducibleOver`). The exact readers (`expandTerms`, `productPoly`) accept a negative
  power of ten (10^(-19)) and a bracketed constant denominator (2*10^18), which `tryParsePoly` cannot read exactly.
  `collect-factor` refuses a bracket input (it expands, it does not collect).
- `validate.ts`: `ExprOp` steps dispatch to `validateProductStep`; the first step starts from the typed product when
  its factors multiply out to it (`startsFromTypedProduct`); an expression ending is compared as text, with the
  variable its own step recorded.
- `sentences.ts`: `plainTex` writes powers as superscripts and drops `*`; product sentences and rules.

## Declines

- Numbers over 15 significant digits: an item is declined when an integer in its question or key has more than 15
  significant digits (trailing zeros not counted). This declines the expansion items with 20-digit coefficients
  (39 of 300). The 10^18 and 10^24 items are exact and are tested.
- Irreducibility is claimed only with its proof. A factor that cannot be proved is declined, never called irreducible.
- Root search refuses coefficients above 10^12 (existing engine limit).

## Tests (`tests/steps/expand-factor/`)

- `harness.ts`: the long-number rule, the factor-degree reader for a product text, integer polynomial arithmetic
  (independent of the methods), and the rendered-page judge.
- `planted-product.ts`: planted wrong steps built from real workings: wrong common factor, wrong number, dropped
  term, sign flip, wrong pair (split, group, binomial), wrong cube sign and formula, wrong root, mislabel, wrong answer,
  and false irreducibility claims. Each mutant must fail its step, fail its working and show nothing on the page.
- `expand.test.ts` and `factorise.test.ts`, each with four blocks:
  1. scoreboard generator items of the matching class (never `gating.json`). Every item not declined gives its key
     with every step valid. Expansion: 261 pass and 39 are declined for long numbers. Factorisation: 300 pass.
  2. 300 seeded problems, built backwards from their factors (mulberry32, seeds 20260913 and 20260915). All pass.
  3. Planted wrong steps: 611 expansion mutants and 933 factorisation mutants over 60 and 66 workings. All hidden on
     the page, none accepted.
  4. 20 hand-written textbook problems per method, with each line written out by hand. All match.

To run:

```bash
npx vitest run tests/steps/expand-factor
```

## Not covered

- Two letters (x + y)(x − y): declined, since every generator item is in one letter.
- Degree 4 and above with no rational root: declined rather than proved irreducible.
