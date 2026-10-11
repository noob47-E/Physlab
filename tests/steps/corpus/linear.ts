/**
 * Linear equations, built backwards from a chosen root.
 *
 * A side of the equation is a list of pieces (a bare x-term, a bare constant, a bracket k(sx + u), a fraction
 * (sx + u)/d). The generator picks the right side at random, then adds one adjusting piece to the left so that
 * left minus right equals A·x + B with -B/A equal to the chosen root. Every piece is rendered to text, and the
 * text is what the test reads back. The expansion, the collected form and the answer are all computed here
 * from the pieces, and checked independently by the test.
 */

import { CorpusItem, Random, randomFor } from './types';
import {
  Rat,
  ZERO,
  rat,
  ratAdd,
  ratSub,
  ratMul,
  ratDiv,
  ratNeg,
  ratIsZero,
  ratEq,
  ratToString,
  ratToDecimal,
} from './exact';

type LinearDifficulty = 'easy' | 'medium' | 'hard';
type LinearForm = 'integer' | 'brackets' | 'fraction' | 'decimal';

const FORMS: LinearForm[] = ['integer', 'brackets', 'fraction', 'decimal'];
const DIFFICULTIES: LinearDifficulty[] = ['easy', 'medium', 'hard'];

/** Stratum labels: "form/difficulty" for solvable equations, and the two special cases. */
export const LINEAR_STRATA: string[] = [
  ...FORMS.flatMap((f) => DIFFICULTIES.map((d) => `${f}/${d}`)),
  'no-solution',
  'identity',
];

interface Params {
  /** Largest magnitude of a coefficient (integer forms; decimal forms use the same bound). */
  mag: number;
  /** Pieces per side, drawn uniformly from this inclusive range (the special piece is extra). */
  pieces: [number, number];
  /** Largest magnitude of a root's numerator. */
  rootNum: number;
  rootDens: number[];
  groupMax: number;
  fracDens: number[];
}

const PARAMS: Record<LinearDifficulty, Params> = {
  easy: { mag: 12, pieces: [1, 2], rootNum: 12, rootDens: [1, 2, 3], groupMax: 3, fracDens: [2, 3, 4] },
  medium: { mag: 16, pieces: [2, 3], rootNum: 16, rootDens: [1, 2, 3, 4, 5], groupMax: 4, fracDens: [2, 3, 4, 5] },
  hard: { mag: 20, pieces: [2, 4], rootNum: 20, rootDens: [1, 2, 3, 4, 5, 6, 8], groupMax: 4, fracDens: [2, 3, 4, 5, 6] },
};

/** Denominators whose reciprocals terminate (2^a·5^b), so a decimal equation has a decimal answer. */
const DECIMAL_DENS: Record<LinearDifficulty, number[]> = {
  easy: [1, 2, 4, 5],
  medium: [1, 2, 4, 5, 8, 10],
  hard: [1, 2, 4, 5, 8, 10, 20, 25],
};

type Piece =
  | { t: 'x'; c: Rat }
  | { t: 'k'; c: Rat }
  | { t: 'group'; m: Rat; s: Rat; u: Rat }
  | { t: 'frac'; s: Rat; u: Rat; d: number };

interface Lin {
  a: Rat;
  b: Rat;
}

function pieceValue(p: Piece): Lin {
  switch (p.t) {
    case 'x':
      return { a: p.c, b: ZERO };
    case 'k':
      return { a: ZERO, b: p.c };
    case 'group':
      return { a: ratMul(p.m, p.s), b: ratMul(p.m, p.u) };
    case 'frac': {
      const d = rat(BigInt(p.d));
      return { a: ratDiv(p.s, d), b: ratDiv(p.u, d) };
    }
  }
}

function sideValue(pieces: Piece[]): Lin {
  let a = ZERO;
  let b = ZERO;
  for (const p of pieces) {
    const v = pieceValue(p);
    a = ratAdd(a, v.a);
    b = ratAdd(b, v.b);
  }
  return { a, b };
}

// ---- text -----------------------------------------------------------------------------------------------

const abs = (r: Rat): Rat => (r.n < 0n ? rat(-r.n, r.d) : r);
const signOf = (r: Rat): string => (r.n < 0n ? '-' : '');

/** |r| as text: a decimal when the style is decimal and r terminates, otherwise p or p/q. */
function absText(r: Rat, dec: boolean): string {
  const a = abs(r);
  if (dec) {
    const s = ratToDecimal(a);
    if (s !== null) return s;
  }
  return ratToString(a);
}

/** c·x with its sign, written 3x, -x, (3/2)x, 0.5x. */
function xTerm(c: Rat, dec: boolean): string {
  const sign = signOf(c);
  const a = abs(c);
  if (a.n === 1n && a.d === 1n) return `${sign}x`;
  const plain = a.d === 1n || (dec && ratToDecimal(a) !== null);
  const txt = absText(a, dec);
  return plain ? `${sign}${txt}x` : `${sign}(${txt})x`;
}

function constTerm(c: Rat, dec: boolean): string {
  return `${signOf(c)}${absText(c, dec)}`;
}

/** The inside of a bracket or a fraction: "2x - 3", "-x + 1", "x", "4". */
function inner(s: Rat, u: Rat, dec: boolean): string {
  let out = ratIsZero(s) ? '' : xTerm(s, dec);
  if (!ratIsZero(u)) {
    out = out === '' ? constTerm(u, dec) : `${out}${u.n < 0n ? ' - ' : ' + '}${absText(u, dec)}`;
  }
  return out === '' ? '0' : out;
}

/** Joins signed terms: "a", "a + b", "a - b". */
function join(terms: string[]): string {
  if (terms.length === 0) return '0';
  let out = terms[0];
  for (const t of terms.slice(1)) {
    out += t.startsWith('-') ? ` - ${t.slice(1)}` : ` + ${t}`;
  }
  return out;
}

function pieceText(p: Piece, dec: boolean): string {
  switch (p.t) {
    case 'x':
      return xTerm(p.c, dec);
    case 'k':
      return constTerm(p.c, dec);
    case 'group': {
      const mag = abs(p.m);
      const body = `(${inner(p.s, p.u, dec)})`;
      const magTxt = mag.n === 1n && mag.d === 1n ? '' : absText(mag, dec);
      return `${signOf(p.m)}${magTxt}${body}`;
    }
    case 'frac':
      return `(${inner(p.s, p.u, dec)})/${p.d}`;
  }
}

/** The expanded form of a·x + b. */
function expandedText(v: Lin, dec: boolean): string {
  const terms: string[] = [];
  if (!ratIsZero(v.a)) terms.push(xTerm(v.a, dec));
  if (!ratIsZero(v.b)) terms.push(constTerm(v.b, dec));
  return join(terms);
}

// ---- construction ---------------------------------------------------------------------------------------

function nonzero(random: Random, mag: number): number {
  let v = 0;
  while (v === 0) v = random.int(-mag, mag);
  return v;
}

/** A coefficient for the chosen form: an integer, or a decimal with one or two places. */
function coefficient(random: Random, form: LinearForm, mag: number): Rat {
  if (form !== 'decimal') return rat(BigInt(nonzero(random, mag)));
  const places = random.int(1, 2);
  return rat(BigInt(nonzero(random, mag * 10 ** places)), 10n ** BigInt(places));
}

function randomPieces(random: Random, form: LinearForm, p: Params, difficulty: LinearDifficulty): Piece[] {
  const count = random.int(p.pieces[0], p.pieces[1]);
  const out: Piece[] = [];
  if (form === 'brackets') {
    const m = rat(BigInt(random.pick([-1, 1]) * random.int(2, p.groupMax)));
    out.push({ t: 'group', m, s: coefficient(random, 'integer', Math.ceil(p.mag / 2)), u: coefficient(random, 'integer', p.mag) });
  } else if (form === 'fraction') {
    out.push({ t: 'frac', s: rat(BigInt(nonzero(random, p.mag))), u: rat(BigInt(nonzero(random, p.mag))), d: random.pick(p.fracDens) });
  } else if (form === 'decimal' && difficulty === 'hard') {
    out.push({ t: 'group', m: rat(BigInt(random.pick([-1, 1]) * random.int(2, 3))), s: coefficient(random, 'decimal', Math.ceil(p.mag / 2)), u: coefficient(random, 'decimal', p.mag) });
  }
  for (let k = 0; k < count; k++) {
    out.push(random.chance(0.5) ? { t: 'x', c: coefficient(random, form, p.mag) } : { t: 'k', c: coefficient(random, form, p.mag) });
  }
  return out;
}

/** The least common multiple of two denominators: the smallest whole number that clears both. */
function lcmOfDenominators(a: Rat, b: Rat): bigint {
  const gcd = (x: bigint, y: bigint): bigint => (y === 0n ? x : gcd(y, x % y));
  return (a.d * b.d) / gcd(a.d, b.d);
}

type LinearOutcome = { ok: true; item: CorpusItem } | { ok: false; reason: string };

/**
 * Generates one linear item from its id. The result is a pure function of the id and the stratum.
 * A candidate that cannot be built (for example one whose left side loses its x) is reported as a discard.
 */
export function generateLinear(id: string, stratum: string): LinearOutcome {
  const random = randomFor(id);
  const special = stratum === 'no-solution' || stratum === 'identity';
  let form: LinearForm;
  let difficulty: LinearDifficulty;
  if (special) {
    form = random.pick(FORMS);
    difficulty = 'medium';
  } else {
    const [f, d] = stratum.split('/') as [LinearForm, LinearDifficulty];
    form = f;
    difficulty = d;
  }
  const p = PARAMS[difficulty];
  const dec = form === 'decimal';

  let root = ZERO;
  let A: Rat;
  let B: Rat;
  if (special) {
    A = ZERO;
    B = stratum === 'identity' ? ZERO : coefficient(random, form, p.mag);
    if (stratum === 'no-solution' && ratIsZero(B)) return { ok: false, reason: 'zero constant' };
  } else {
    const dens = dec ? DECIMAL_DENS[difficulty] : p.rootDens;
    const q = random.pick(dens);
    root = rat(BigInt(nonzero(random, p.rootNum)), BigInt(q));
    if (dec) {
      A = rat(BigInt(nonzero(random, p.mag * 10)), 10n);
    } else {
      A = rat(BigInt(q * nonzero(random, p.mag)));
    }
    B = ratNeg(ratMul(A, root));
  }

  const leftPieces = randomPieces(random, form, p, difficulty);
  const rightPieces = randomPieces(random, form, p, difficulty);
  // Both sides carry an x: the right side always gets one, and the left must keep one below.
  rightPieces.push({ t: 'x', c: coefficient(random, form, p.mag) });

  const left = sideValue(leftPieces);
  const right = sideValue(rightPieces);
  const dA = ratSub(ratAdd(right.a, A), left.a);
  const dB = ratSub(ratAdd(right.b, B), left.b);
  if (!ratIsZero(dA) || !ratIsZero(dB)) {
    if (form === 'fraction' && (dA.d !== 1n || dB.d !== 1n)) {
      const d = lcmOfDenominators(dA, dB);
      if (d > 6n) return { ok: false, reason: 'fraction denominator above 6' };
      leftPieces.push({ t: 'frac', s: ratMul(dA, rat(d)), u: ratMul(dB, rat(d)), d: Number(d) });
    } else {
      if (!ratIsZero(dA)) leftPieces.push({ t: 'x', c: dA });
      if (!ratIsZero(dB)) leftPieces.push({ t: 'k', c: dB });
    }
  }

  const finalLeft = sideValue(leftPieces);
  const finalRight = sideValue(rightPieces);
  const diffA = ratSub(finalLeft.a, finalRight.a);
  const diffB = ratSub(finalLeft.b, finalRight.b);
  if (!ratEq(diffA, A) || !ratEq(diffB, B)) throw new Error(`linear construction mismatch for ${id}`);
  if (ratIsZero(finalLeft.a) || ratIsZero(finalRight.a)) return { ok: false, reason: 'one side has no x' };

  const question = `${join(leftPieces.map((x) => pieceText(x, dec)))} = ${join(rightPieces.map((x) => pieceText(x, dec)))}`;
  const expanded = `${expandedText(finalLeft, dec)} = ${expandedText(finalRight, dec)}`;
  const collected = special
    ? `0 = ${expandedText({ a: ZERO, b: ratNeg(B) }, dec)}`
    : `${expandedText({ a: A, b: ZERO }, dec)} = ${expandedText({ a: ZERO, b: ratNeg(B) }, dec)}`;

  let answer: string;
  let rules: string[];
  const intermediates: Record<string, string> = { expanded, collected };
  if (special) {
    answer = stratum === 'identity' ? 'All real numbers' : 'No solution';
    rules = ['collect'];
  } else {
    const rootText = dec && ratToDecimal(root) !== null ? (ratToDecimal(root) as string) : ratToString(root);
    answer = `x = ${rootText}`;
    intermediates.divided = answer;
    rules = ['collect', 'divide'];
  }

  return {
    ok: true,
    item: {
      id,
      family: 'linear',
      stratum,
      question,
      answer,
      intermediates,
      rulesExpected: rules,
      level: 'O/IGCSE',
    },
  };
}
