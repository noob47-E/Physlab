/**
 * Quadratic equations, built backwards from the roots.
 *
 * Each stratum fixes the kind of roots and the factor structure:
 *   rational  two distinct rational roots P1/R1 and P2/R2 (factorised form k(R1x - P1)(R2x - P2))
 *   double    one repeated rational root P/R (factorised form k(Rx - P)^2, answer listed once)
 *   surd      real irrational roots (P ± Q√D)/R with D squarefree and above one
 *   complex   roots (P ± Q·i√D)/R with a negative discriminant (D = 1 gives a ± bi)
 * The equation is A·x² + B·x + C = 0 with A = k·R² (or k·R1·R2) and the other coefficients following from the roots.
 * It is then written in one of four arrangements, so the same polynomial can appear as "x² = 5x - 6".
 */

import { CorpusItem, Random, randomFor } from './types';
import { Rat, rat, ratSub, ratMul, ratDiv, ratNeg, ratIsZero, ratToString, gcdB } from './exact';

type QuadraticKind = 'rational' | 'double' | 'surd' | 'complex';
type QuadraticDifficulty = 'easy' | 'medium' | 'hard';

const KINDS: QuadraticKind[] = ['rational', 'double', 'surd', 'complex'];
const DIFFICULTIES: QuadraticDifficulty[] = ['easy', 'medium', 'hard'];

/** Stratum labels: "kind/difficulty". */
export const QUADRATIC_STRATA: string[] = KINDS.flatMap((k) => DIFFICULTIES.map((d) => `${k}/${d}`));

interface Params {
  /** Smallest and largest magnitude of the scale factor k. Each difficulty has its own band, so keys do not collide. */
  leadMin: number;
  leadMax: number;
  /** Largest magnitude of a root's numerator P. */
  num: number;
  /** Largest denominator R of a root. */
  den: number;
  /** Largest coefficient Q of a surd or of an imaginary part. */
  qMax: number;
  /** Squarefree radicands D for surd roots (each above one). */
  surdD: number[];
  /** Squarefree radicands D for complex roots (one allowed: a ± bi). */
  complexD: number[];
}

const PARAMS: Record<QuadraticDifficulty, Params> = {
  easy: { leadMin: 1, leadMax: 3, num: 7, den: 4, qMax: 3, surdD: [2, 3, 5, 6, 7], complexD: [1, 2, 3, 5, 7] },
  medium: { leadMin: 4, leadMax: 6, num: 9, den: 4, qMax: 3, surdD: [2, 3, 5, 6, 7, 10, 11, 13], complexD: [1, 2, 3, 5, 6, 7, 10] },
  hard: {
    leadMin: 7,
    leadMax: 9,
    num: 11,
    den: 6,
    qMax: 5,
    surdD: [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22],
    complexD: [1, 2, 3, 5, 6, 7, 10, 11, 13],
  },
};

const absB = (n: bigint): bigint => (n < 0n ? -n : n);

/** A nonzero integer whose magnitude is between min and max, with either sign. */
function signedBand(random: Random, min: number, max: number): bigint {
  return BigInt(random.pick([-1, 1]) * random.int(min, max));
}

/** A root numerator and denominator in lowest terms: P/R with R ≥ 1 and gcd(P, R) = 1. */
function reducedPair(random: Random, p: Params): [bigint, bigint] {
  for (;;) {
    const P = BigInt(random.int(-p.num, p.num));
    const R = BigInt(random.int(1, p.den));
    if (gcdB(P, R) === 1n) return [P, R];
  }
}

/** Terms "2x^2", "-3x", "5" joined with their signs: "2x^2 - 3x + 5". */
function joinTerms(terms: Array<{ c: bigint; power: number }>): string {
  const parts: string[] = [];
  for (const { c, power } of terms) {
    if (c === 0n) continue;
    const mag = absB(c);
    let body: string;
    if (power === 0) body = `${mag}`;
    else {
      const xs = power === 1 ? 'x' : 'x^2';
      body = mag === 1n ? xs : `${mag}${xs}`;
    }
    const sign = c < 0n ? '-' : '+';
    parts.push(parts.length === 0 ? (sign === '-' ? `-${body}` : body) : `${sign === '-' ? ' - ' : ' + '}${body}`);
  }
  return parts.length === 0 ? '0' : parts.join('');
}

/** The same terms with every sign reversed, for the right-hand side of a rearranged equation. */
function negatedTerms(terms: Array<{ c: bigint; power: number }>): string {
  return joinTerms(terms.map(({ c, power }) => ({ c: -c, power })));
}

/** One root in the surd or complex form. */
function rootText(P: bigint, Q: bigint, D: bigint, R: bigint, sign: 1 | -1, imaginary: boolean): string {
  let radical: string;
  if (imaginary) {
    radical = `${Q === 1n ? '' : `${Q}*`}i${D === 1n ? '' : `*sqrt(${D})`}`;
  } else {
    radical = `${Q === 1n ? '' : `${Q}*`}sqrt(${D})`;
  }
  const numer =
    P === 0n ? `${sign < 0 ? '-' : ''}${radical}` : `${P} ${sign > 0 ? '+' : '-'} ${radical}`;
  return R === 1n ? numer : `(${numer})/${R}`;
}

/** A linear factor (Rx - P) written as "(Rx - P)", "(x + 3)", "(2x)". */
function factorText(R: bigint, P: bigint): string {
  const lead = R === 1n ? '' : `${R}`;
  const tail = P === 0n ? '' : P > 0n ? ` - ${P}` : ` + ${-P}`;
  return `(${lead}x${tail})`;
}

/** The completed-square form A(x + p)² + q. */
function completedSquare(A: Rat, B: Rat, C: Rat): string {
  const p = ratDiv(B, ratMul(rat(2n), A));
  const q = ratDiv(ratSub(ratMul(rat(4n), ratMul(A, C)), ratMul(B, B)), ratMul(rat(4n), A));
  const lead = A.n === 1n && A.d === 1n ? '' : A.n === -1n && A.d === 1n ? '-' : ratToString(A);
  const pText = ratIsZero(p) ? 'x' : p.n > 0n ? `x + ${ratToString(p)}` : `x - ${ratToString(ratNeg(p))}`;
  const qText = ratIsZero(q) ? '' : q.n > 0n ? ` + ${ratToString(q)}` : ` - ${ratToString(ratNeg(q))}`;
  return `${lead}(${pText})^2${qText}`;
}

type QuadraticOutcome = { ok: true; item: CorpusItem } | { ok: false; reason: string };

/** Generates one quadratic item from its id. The result is a pure function of the id and the stratum. */
export function generateQuadratic(id: string, stratum: string): QuadraticOutcome {
  const random = randomFor(id);
  const [kind, difficulty] = stratum.split('/') as [QuadraticKind, QuadraticDifficulty];
  const p = PARAMS[difficulty];
  const k = signedBand(random, p.leadMin, p.leadMax);

  let A: bigint;
  let B: bigint;
  let C: bigint;
  let answer: string;
  let factorised: string | null = null;

  if (kind === 'rational') {
    const [P1, R1] = reducedPair(random, p);
    const [P2, R2] = reducedPair(random, p);
    if (P1 * R2 === P2 * R1) return { ok: false, reason: 'equal roots' };
    A = k * R1 * R2;
    B = -k * (R1 * P2 + R2 * P1);
    C = k * P1 * P2;
    const r1 = ratDiv(rat(P1), rat(R1));
    const r2 = ratDiv(rat(P2), rat(R2));
    const [lo, hi] = ratSub(r1, r2).n < 0n ? [r1, r2] : [r2, r1];
    answer = `x = ${ratToString(lo)} or x = ${ratToString(hi)}`;
    const kPart = k === 1n ? '' : k === -1n ? '-' : `${k}`;
    factorised = `${kPart}${factorText(R1, P1)}${factorText(R2, P2)}`;
  } else if (kind === 'double') {
    const [P, R] = reducedPair(random, p);
    A = k * R * R;
    B = -2n * k * R * P;
    C = k * P * P;
    answer = `x = ${ratToString(rat(P, R))}`;
    const kPart = k === 1n ? '' : k === -1n ? '-' : `${k}`;
    factorised = `${kPart}${factorText(R, P)}^2`;
  } else if (kind === 'surd') {
    const [P, R] = reducedPair(random, p);
    const Q = BigInt(random.int(1, p.qMax));
    const D = BigInt(random.pick(p.surdD));
    if (gcdB(gcdB(P, Q), R) !== 1n) return { ok: false, reason: 'not in lowest terms' };
    A = k * R * R;
    B = -2n * k * P * R;
    C = k * (P * P - Q * Q * D);
    answer = `x = ${rootText(P, Q, D, R, 1, false)} or x = ${rootText(P, Q, D, R, -1, false)}`;
  } else {
    const [P, R] = reducedPair(random, p);
    const Q = BigInt(random.int(1, p.qMax));
    const D = BigInt(random.pick(p.complexD));
    if (gcdB(gcdB(P, Q), R) !== 1n) return { ok: false, reason: 'not in lowest terms' };
    A = k * R * R;
    B = -2n * k * P * R;
    C = k * (P * P + Q * Q * D);
    answer = `x = ${rootText(P, Q, D, R, 1, true)} or x = ${rootText(P, Q, D, R, -1, true)}`;
  }

  const a = rat(A);
  const b = rat(B);
  const c = rat(C);
  const discriminant = B * B - 4n * A * C;

  // Four arrangements of the same polynomial: the normal form, and three rearrangements.
  const variant = random.pick([0, 0, 1, 2, 3]);
  let question: string;
  if (variant === 0) {
    question = `${joinTerms([{ c: A, power: 2 }, { c: B, power: 1 }, { c: C, power: 0 }])} = 0`;
  } else if (variant === 1) {
    question = `${joinTerms([{ c: A, power: 2 }, { c: B, power: 1 }])} = ${negatedTerms([{ c: C, power: 0 }])}`;
  } else if (variant === 2) {
    question = `${joinTerms([{ c: A, power: 2 }])} = ${negatedTerms([{ c: B, power: 1 }, { c: C, power: 0 }])}`;
  } else {
    question = `${joinTerms([{ c: A, power: 2 }, { c: C, power: 0 }])} = ${negatedTerms([{ c: B, power: 1 }])}`;
  }

  const intermediates: Record<string, string> = {
    discriminant: discriminant.toString(),
    'completed-square': completedSquare(a, b, c),
  };
  let rules = ['formula', 'complete-square'];
  if (factorised !== null) {
    intermediates.factorised = factorised;
    rules = [...rules, 'factorise'];
  }

  return {
    ok: true,
    item: {
      id,
      family: 'quadratic',
      stratum,
      question,
      answer,
      intermediates,
      rulesExpected: rules,
      level: kind === 'complex' ? 'FSc/A level' : 'O/IGCSE',
    },
  };
}
