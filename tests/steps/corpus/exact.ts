/**
 * Exact arithmetic for the corpus checks: rationals over BigInt, polynomials over those rationals, and
 * numbers p + q·i with p and q in Q(√d). Nothing here uses floating point.
 */

export interface Rat {
  readonly n: bigint;
  /** Always positive, and gcd(|n|, d) = 1. */
  readonly d: bigint;
}

function absB(a: bigint): bigint {
  return a < 0n ? -a : a;
}

export function gcdB(a: bigint, b: bigint): bigint {
  let x = absB(a);
  let y = absB(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) throw new Error('rational with zero denominator');
  const sign = d < 0n ? -1n : 1n;
  const g = gcdB(n, d) || 1n;
  return { n: (sign * n) / g, d: (sign * d) / g };
}

export const ZERO: Rat = { n: 0n, d: 1n };
export const ONE: Rat = { n: 1n, d: 1n };

export const ratAdd = (a: Rat, b: Rat): Rat => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const ratSub = (a: Rat, b: Rat): Rat => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const ratMul = (a: Rat, b: Rat): Rat => rat(a.n * b.n, a.d * b.d);
export const ratNeg = (a: Rat): Rat => rat(-a.n, a.d);
export const ratIsZero = (a: Rat): boolean => a.n === 0n;
export const ratEq = (a: Rat, b: Rat): boolean => a.n === b.n && a.d === b.d;

export function ratDiv(a: Rat, b: Rat): Rat {
  if (b.n === 0n) throw new Error('division by zero');
  return rat(a.n * b.d, a.d * b.n);
}

/** "p" or "p/q" in lowest terms; never "p/1". */
export function ratToString(a: Rat): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
}

/** Exact decimal for a terminating rational (denominator 2^a·5^b), otherwise null. */
export function ratToDecimal(a: Rat): string | null {
  let d = a.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    twos++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    fives++;
  }
  if (d !== 1n) return null;
  const places = Math.max(twos, fives);
  const scaled = (a.n * 10n ** BigInt(places)) / a.d;
  const digits = absB(scaled).toString().padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const frac = digits.slice(digits.length - places).replace(/0+$/, '');
  const sign = scaled < 0n ? '-' : '';
  return frac === '' ? `${sign}${whole}` : `${sign}${whole}.${frac}`;
}

/** Reads "3", "-3", "0.75" exactly. Rejects anything else. */
export function ratFromDecimal(text: string): Rat {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`not a decimal number: ${text}`);
  const frac = m[2] ?? '';
  return rat(BigInt(m[1] + frac), 10n ** BigInt(frac.length));
}

/** Polynomials in x: index = power. Trailing zero coefficients are trimmed. */
export type Poly = Rat[];

export function trimPoly(p: Poly): Poly {
  const out = p.slice();
  while (out.length > 0 && ratIsZero(out[out.length - 1])) out.pop();
  return out;
}

export function polyCoef(p: Poly, k: number): Rat {
  return k < p.length ? p[k] : ZERO;
}

export function polyAdd(a: Poly, b: Poly): Poly {
  const n = Math.max(a.length, b.length);
  const out: Rat[] = [];
  for (let k = 0; k < n; k++) out.push(ratAdd(polyCoef(a, k), polyCoef(b, k)));
  return trimPoly(out);
}

export function polyNeg(a: Poly): Poly {
  return a.map(ratNeg);
}

export function polySub(a: Poly, b: Poly): Poly {
  return polyAdd(a, polyNeg(b));
}

export function polyMul(a: Poly, b: Poly): Poly {
  if (a.length === 0 || b.length === 0) return [];
  const out: Rat[] = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      out[i + j] = ratAdd(out[i + j], ratMul(a[i], b[j]));
    }
  }
  return trimPoly(out);
}

export function polyEq(a: Poly, b: Poly): boolean {
  const x = trimPoly(a);
  const y = trimPoly(b);
  return x.length === y.length && x.every((c, k) => ratEq(c, y[k]));
}

/**
 * Numbers p + q·√d with d a positive integer. A rational number has b = 0 and d = 1. Combining two numbers
 * whose radicands are both in use and differ throws: no expression here mixes √2 with √3.
 */
interface QS {
  readonly a: Rat;
  readonly b: Rat;
  readonly d: bigint;
}

export const qsRat = (r: Rat): QS => ({ a: r, b: ZERO, d: 1n });
const qsZero: QS = qsRat(ZERO);

function radicandOf(x: QS, y: QS): bigint {
  const xs = !ratIsZero(x.b);
  const ys = !ratIsZero(y.b);
  if (xs && ys && x.d !== y.d) throw new Error(`mixed radicands ${x.d} and ${y.d}`);
  if (xs) return x.d;
  if (ys) return y.d;
  return 1n;
}

function qsAdd(x: QS, y: QS): QS {
  return { a: ratAdd(x.a, y.a), b: ratAdd(x.b, y.b), d: radicandOf(x, y) };
}

function qsSub(x: QS, y: QS): QS {
  return { a: ratSub(x.a, y.a), b: ratSub(x.b, y.b), d: radicandOf(x, y) };
}

function qsMul(x: QS, y: QS): QS {
  const d = radicandOf(x, y);
  return {
    a: ratAdd(ratMul(x.a, y.a), ratMul(ratMul(x.b, y.b), rat(d))),
    b: ratAdd(ratMul(x.a, y.b), ratMul(x.b, y.a)),
    d,
  };
}

const qsIsZero = (x: QS): boolean => ratIsZero(x.a) && ratIsZero(x.b);

/** Numbers p + q·i with p and q in Q(√d). */
export interface Cx {
  readonly re: QS;
  readonly im: QS;
}

export const cxRat = (r: Rat): Cx => ({ re: qsRat(r), im: qsZero });
export const cxZero: Cx = cxRat(ZERO);
export const cxI: Cx = { re: qsZero, im: qsRat(ONE) };

export const cxAdd = (x: Cx, y: Cx): Cx => ({ re: qsAdd(x.re, y.re), im: qsAdd(x.im, y.im) });
export const cxSub = (x: Cx, y: Cx): Cx => ({ re: qsSub(x.re, y.re), im: qsSub(x.im, y.im) });

export function cxMul(x: Cx, y: Cx): Cx {
  return {
    re: qsSub(qsMul(x.re, y.re), qsMul(x.im, y.im)),
    im: qsAdd(qsMul(x.re, y.im), qsMul(x.im, y.re)),
  };
}

export const cxIsZero = (x: Cx): boolean => qsIsZero(x.re) && qsIsZero(x.im);
export const cxIsReal = (x: Cx): boolean => qsIsZero(x.im);
export const cxIsRational = (x: Cx): boolean => cxIsReal(x) && ratIsZero(x.re.b);
export const cxEq = (x: Cx, y: Cx): boolean => cxIsZero(cxSub(x, y));

/** Evaluates a polynomial exactly at a number of the form p + q·i (Horner's rule). */
export function polyAt(p: Poly, z: Cx): Cx {
  let acc: Cx = cxZero;
  for (let k = p.length - 1; k >= 0; k--) {
    acc = cxAdd(cxMul(acc, z), cxRat(p[k]));
  }
  return acc;
}

/** True when n is squarefree and greater than 1: the only radicand a simplified surd may carry. */
export function isSquarefreeAboveOne(n: bigint): boolean {
  if (n <= 1n) return false;
  for (let k = 2n; k * k <= n; k++) {
    if (n % (k * k) === 0n) return false;
  }
  return true;
}

/** Exact test for a perfect square (no floating point, so safe for large discriminants). */
export function isPerfectSquare(n: bigint): boolean {
  if (n < 0n) return false;
  if (n < 2n) return true;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x * x === n;
}
