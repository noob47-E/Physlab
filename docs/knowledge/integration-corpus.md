# Integration Corpus

Rubi's own integration test suite, converted into PhysLab's format, so that each Rubi rule family can be scored on
known antiderivatives before integrals switch to it. The rule family must score at least 92 % with 0 wrong answers.
This note covers section 1 (algebraic functions). Only the converted output is committed: the suite's own files are
not, and nothing from the suite is run.

## Source and licence

- Repository: https://github.com/RuleBasedIntegration/MathematicaSyntaxTestSuite (default branch `master`).
- The copy used here was downloaded with the owner's approval on 2026-10-12. It is read as data by the converter.
- Licence: MIT. The suite's LICENSE file, verbatim:

```
MIT License

Copyright (c) 2018 Rule-based Integration

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The converted JSON carries this notice through this document and through the NOTICE line
("Copyright (c) 2018 Rule-based Integration").

## Regenerating

From the repository root, with the suite folder (the one that holds `1 Algebraic functions`):

```bash
node scripts/rubi/convert-tests.mjs "<suite folder>"
```

Optional: `--section "1 Algebraic functions"` (the default) and `--out <folder>` (the default is
`tests/engine/integration`). The run writes three files there: `section1.json` (kept), `section1-unsupported.json`
and `section1-rejected.json`. It takes about 12 minutes, most of it in verification. Then:

```bash
npx vitest run tests/engine/integration
```

## Tests

Both modes live in `tests/engine/integration`.

- **Default**: `npx vitest run tests/engine/integration`. The whole-suite `npm test` runs it too. `rubi-section1.test.ts`
  checks that the three files hold the counts in the tables below, that every item has the fields the converter writes,
  and that each test line is in exactly one file. It then re-verifies a fixed sample of 299 kept items at 40 digits. The
  sample is deterministic: each of the 38 source files that has kept items contributes an even stride of its own items,
  seven or eight each. File `1.2.3.5` has only seven, so the sample is 299, not 300. The sample test took 3.3 s to 9.1 s, and
  the whole default run 9 s to 40 s (wall, including vitest startup), depending on how loaded the machine was.
- **Full**: `npm run test:rubi-full`, which sets `PHYSLAB_RUBI_FULL=1`. `rubi-section1-01.test.ts` to
  `rubi-section1-09.test.ts` re-verify every one of the 17,981 kept items, one ninth each, in parallel (`rubi-verify.ts`
  holds the shared check). Without the variable they are skipped. On the loaded machine the full run took 84 s of test
  time (1 min 35 s wall), and all nine parts passed.

## How a line is converted

Each `.m` file holds lines `{integrand, variable, steps, antiderivative}`. Mathematica comments, `(* ... *)`, nested ones
included, are masked first, so a test that the suite has commented out is not counted. Then, for each line:

1. The field count, the variable (`x`) and the step count (a whole number, possibly negative) are checked.
2. Every function name is read from the raw text. Any name that is not a supported function is an unsupported line,
   reported by that name, before anything else is attempted.
3. Mathematica text becomes mathjs text: `Sqrt` to `sqrt`, `Log` (natural) to `log`, `ArcTan` to `atan`, `E` to `e`,
   `I` to `i`, `Pi` to `pi`, and so on. Implicit products are written with `*`, because mathjs binds implicit products
   tighter than `/` while Mathematica does not. A symbol that mathjs already uses (`e`, `i`, `pi`) is renamed with a
   `_s` suffix.
4. A line whose steps are 0 and whose antiderivative is 0 is a placeholder, and is rejected as one.
5. The antiderivative is differentiated symbolically (`math.derivative` with `simplify: false`), and the result is compared
   with the integrand (see below).

Every line lands in exactly one file, so the three counts add up to the number of test lines.

## Verification

- Constants: the symbols of an item take fixed values, in name order, from the first constant set
  (1.3, 0.7, 2.1, ...). Where the first set gives too few real points, the second set (the same values with some
  negated) is used. The set an item was verified under is recorded in `constantSet`.
- Points: the variable takes the first five values of the grid 0.25, 0.5, 0.75, 0.9, 1.1, 1.4, 1.7, 2.2, 2.7, 3.3,
  4.1, 5, then -0.25, -0.5, -0.9, -1.4, -2.2, -3.3 at which both the integrand and the derivative are finite real numbers
  (points inside the domain). At least three must be found; `validPoints` records how many.
- Arithmetic: BigNumber at 40 significant digits, throughout.
- Tolerance: a point agrees when |integrand - derivative| is at most 1e-30 times the larger of 1 and the two values.
  The derivative is symbolic, so there is no truncation error at all; only rounding remains, about 1e-38 relative per
  operation, and 1e-30 leaves many orders of magnitude of margin. A wrong antiderivative differs by far more than
  that. The one risk is cancellation inside a large expression, which can lose digits and make a correct item look
  wrong; no mismatch in this run is of that kind (see the counts: there were none).
- A mismatch at any real point rejects the item. Nothing is dropped: an exception while converting or verifying a line
  is recorded as a rejection with its reason.

What this shows: each kept antiderivative differentiates back to its integrand at the points and constants recorded, to
40 digits. It does not prove the identity for every value of every symbol; that is the limit of any numerical check.

## Counts

Measured from one run over the 40 files of section 1: 25,697 test lines, 0 mismatches, and 0 evaluation, parse or
differentiation failures. Two of the 40 files, `1.1.1.7` and `1.2.2.8`, have no kept item. The rejections are listed by
category below.

| outcome | count |
|---|---:|
| kept (verified) | 17,981 |
| unsupported (names a function mathjs cannot express) | 5,585 |
| rejected | 2,131 |
| **total test lines** | **25,697** |

Kept, by subsection: 1.1 Binomial products 10,042; 1.2 Trinomial products 6,918; 1.3 Miscellaneous 1,021.
Kept, by constant set: set 1 17,543; set 2 438. Kept, by real points found: 5 points 17,432; 4 points 65; 3 points 484.

Unsupported, by the first unsupported function in the line (lines can name several):

| function | lines with it first | lines naming it |
|---|---:|---:|
| EllipticE | 2,471 | 2,478 |
| EllipticF | 1,255 | 3,418 |
| Hypergeometric2F1 | 1,183 | 1,256 |
| AppellF1 | 497 | 499 |
| If (version conditional, `If[$VersionNumber>=8, ...]`) | 95 | 95 |
| EllipticPi | 53 | 400 |
| Unintegrable | 20 | 20 |
| F (an undefined placeholder function) | 10 | 10 |
| CannotIntegrate | 1 | 11 |

Rejected, by category:

| category | count | meaning |
|---|---:|---|
| few-valid-points | 1,761 | fewer than three real points inside the domain under either constant set |
| split | 370 | five fields: the antiderivative is two expressions, not one; not converted |

Of the 1,761 few-valid-points, 1,571 have no real point at all on the grid under either constant set, 64 have one and
126 have two. For these constants no grid point makes both sides real: the real domain is empty, or it lies between grid points (for example `1/(Sqrt[-2 - 3*x]*Sqrt[2 + 3*x])`, real for no real x except its one boundary point). A
different choice of constants or of grid could recover some of them; that is not done here.

Mismatches: 0. Parse, differentiation and evaluation failures: 0.

## Spot checks by hand

Ten kept items, spread evenly through `section1.json`. Each antiderivative was differentiated by hand (with x > 0 and
the positive square roots the item assumes) and compared with the integrand. All ten agree.

1. `(x^3*(a+b*x)^n)/(c*x^2)^(3/2)` has antiderivative `x*(a+b*x)^(1+n)/(b*c*(1+n)*sqrt(c*x^2))`. With c, x > 0 the
   integrand is (a+bx)^n / c^(3/2); the derivative of the antiderivative is (a+bx)^n / c^(3/2). Agrees.
2. `(1-2*x)^3*(2+3*x)^8*(3+5*x)^2` with the six-term antiderivative in (2+3x). With u = 2+3x: 1-2x = (7-2u)/3 and
   3+5x = (5u-1)/3, so the integrand is (7-2u)^3 (5u-1)^2 u^8 / 243. The coefficients of the derivative, in u^8 to u^13,
   are 343, -3724, 11599, -8198, 2180, -200 over 243, matching the expansion of (7-2u)^3 (5u-1)^2. Agrees.
3. `(a+b*x^2)^(5/2)/x^4` with its four-term antiderivative. With S = sqrt(a+bx^2) the terms combine to S^5/x^4. Agrees.
4. `x^2*(a+b*x^3)^(2/3)` with antiderivative `(a+b*x^3)^(5/3)/(5*b)`. Agrees.
5. `1/((c+d*x)^3*(a+b*(c+d*x)^3))` (the cube-root partial fraction). With u = c+dx the integrand is (1/d)(1/(a u^3)
   - b/(a(a+bu^3))). The atan and logarithm terms differentiate to -b/(a(a+bu^3)) after the factor (q^2/p^5) with
   p = a^(1/3), q = b^(1/3); the rest gives 1/(a u^3). Agrees.
6. `1/sqrt(4-12*x+9*x^2)` with antiderivative `-((2-3*x)*log(2-3*x))/(3*sqrt(4-12*x+9*x^2))`. Since the square root is
   2-3x for x < 2/3, the antiderivative is -log(2-3x)/3, whose derivative is 1/(2-3x). Agrees.
7. `((A+B*x)*(b*x+c*x^2)^2)/x^7`, a sum of four powers of x, with the four-term antiderivative. Each coefficient matches
   (checked term by term). Agrees.
8. Replaced: the eighth candidate (about 1,200 characters on each side) was too large to differentiate by hand reliably. The next item in the same family of sums was used instead: `x*(d+e*x)^5*(a+b*x+c*x^2)` with the four-term
   antiderivative in (d+ex). With u = d+ex, the integrand is u^5 (u-d) (ae^2 + be(u-d) + c(u-d)^2) / e^3, expanding to
   (cu^3 + (be-3cd)u^2 + (ae^2-2bde+3cd^2)u + (bed^2 - ade^2 - cd^3)) u^5 / e^3, and the derivative of the antiderivative
   has the same four coefficients. Agrees.
9. `(a^2+2*a*b*x^2+b^2*x^4)^(5/2)/(d*x)^(3/2)`, which is (a+bx^2)^5 / (dx)^(3/2) for a+bx^2 > 0. Its six-term
   antiderivative differentiates term by term to the six terms of (a+bx^2)^5 (coefficients 1, 5, 10, 10, 5, 1). Agrees.
10. `((1+sqrt(3))*a^(1/3)+b^(1/3)*x)/(((1-sqrt(3))*a^(1/3)+b^(1/3)*x)*sqrt(a+b*x^3))` with its atanh antiderivative. The
    derivative reduces to a quartic identity in x, which holds at x = -1, 0, 1, 2 and 3 (checked numerically with
    p = q = 1), so it holds for all x. Agrees.

## Known limits

- The 1,761 few-valid-points rejections are real in the sense above: under these two constant sets no grid point gives a
  real value. They are not verified, and are not counted as correct.
- The elliptic and hypergeometric functions, and `If`, are not converted: mathjs has no such functions.
- Section 1 only. Sections 2 to 8 and the independent suites are not converted.
- The verification is numerical at chosen constants (see above).
- Converting takes about 12 minutes. The default test takes under a minute; the full re-verification
  (`npm run test:rubi-full`) takes about a minute and a half on this machine.
