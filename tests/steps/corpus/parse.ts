/**
 * A strict reader for the corpus's own maths text. It reads only the forms the generators write, and it throws
 * on anything else: a text the reader does not understand is a failed item, never a skipped one.
 *
 * Grammar (spaces are ignored):
 *   expr   := ['+' | '-'] term { ('+' | '-') term }
 *   term   := factor { ('*' | '/' | <implicit>) factor }      left to right; '/' only by a constant
 *   factor := atom [ '^' integer ]
 *   atom   := decimal | 'x' | 'i' | 'sqrt' '(' integer ')' | '(' expr ')'
 * where <implicit> is a factor that begins with a number, x, i, sqrt or '(' (so "3x", "2(x + 1)").
 * Each parser is given an algebra (polynomials for equations, Q(√d)[i] for roots) and computes in it.
 */

import {
  Cx,
  Poly,
  Rat,
  ONE,
  ZERO,
  ratDiv,
  ratFromDecimal,
  ratIsZero,
  cxRat,
  cxZero,
  cxI,
  cxAdd,
  cxSub,
  cxMul,
  cxIsRational,
  qsRat,
  polyAdd,
  polyMul,
  polyNeg,
  polySub,
  trimPoly,
} from './exact';

type Token =
  | { t: 'num'; v: string }
  | { t: 'id'; v: 'x' | 'i' | 'sqrt' }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' }
  | { t: 'lp' | 'rp' | 'eq' };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let k = 0;
  while (k < text.length) {
    const c = text[k];
    if (c === ' ') {
      k++;
    } else if (/[0-9]/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(text.slice(k));
      if (!m) throw new Error(`bad number at ${k} in "${text}"`);
      out.push({ t: 'num', v: m[0] });
      k += m[0].length;
    } else if (/[a-z]/.test(c)) {
      const m = /^[a-z]+/.exec(text.slice(k));
      const word = m ? m[0] : '';
      if (word !== 'x' && word !== 'i' && word !== 'sqrt') throw new Error(`unknown name "${word}" in "${text}"`);
      out.push({ t: 'id', v: word });
      k += word.length;
    } else if ('+-*/^'.includes(c)) {
      out.push({ t: 'op', v: c as '+' | '-' | '*' | '/' | '^' });
      k++;
    } else if (c === '(') {
      out.push({ t: 'lp' });
      k++;
    } else if (c === ')') {
      out.push({ t: 'rp' });
      k++;
    } else if (c === '=') {
      out.push({ t: 'eq' });
      k++;
    } else {
      throw new Error(`unexpected "${c}" in "${text}"`);
    }
  }
  return out;
}

/** The arithmetic a parse is carried out in. */
interface Algebra<T> {
  fromRat(r: Rat): T;
  /** The variable x; throws in an algebra that has none. */
  x(): T;
  /** The imaginary unit; throws in an algebra without it. */
  i(): T;
  sqrt(n: bigint): T;
  add(a: T, b: T): T;
  sub(a: T, b: T): T;
  neg(a: T): T;
  mul(a: T, b: T): T;
  /** Division by a constant only; throws otherwise. */
  divConst(a: T, b: T): T;
  pow(a: T, n: number): T;
}

class Reader<T> {
  private pos = 0;
  constructor(
    private readonly toks: Token[],
    private readonly alg: Algebra<T>,
    private readonly source: string,
  ) {}

  done(): boolean {
    return this.pos >= this.toks.length;
  }

  private peek(): Token | undefined {
    return this.toks[this.pos];
  }

  private fail(why: string): never {
    throw new Error(`${why} in "${this.source}"`);
  }

  private expect(t: Token['t']): Token {
    const tok = this.peek();
    if (!tok || tok.t !== t) this.fail(`expected ${t}`);
    this.pos++;
    return tok;
  }

  expr(): T {
    let negative = false;
    const first = this.peek();
    if (first && first.t === 'op' && (first.v === '+' || first.v === '-')) {
      negative = first.v === '-';
      this.pos++;
    }
    let value = this.term();
    if (negative) value = this.alg.neg(value);
    for (;;) {
      const tok = this.peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '+' && tok.v !== '-')) break;
      this.pos++;
      const rhs = this.term();
      value = tok.v === '+' ? this.alg.add(value, rhs) : this.alg.sub(value, rhs);
    }
    return value;
  }

  private startsFactor(tok: Token | undefined): boolean {
    return !!tok && (tok.t === 'num' || tok.t === 'lp' || (tok.t === 'id' && (tok.v === 'x' || tok.v === 'i' || tok.v === 'sqrt')));
  }

  private term(): T {
    let value = this.factor();
    for (;;) {
      const tok = this.peek();
      if (tok && tok.t === 'op' && (tok.v === '*' || tok.v === '/')) {
        this.pos++;
        const rhs = this.factor();
        value = tok.v === '*' ? this.alg.mul(value, rhs) : this.alg.divConst(value, rhs);
      } else if (this.startsFactor(tok)) {
        value = this.alg.mul(value, this.factor());
      } else {
        break;
      }
    }
    return value;
  }

  private factor(): T {
    let value = this.atom();
    const tok = this.peek();
    if (tok && tok.t === 'op' && tok.v === '^') {
      this.pos++;
      const e = this.expect('num');
      if (e.t !== 'num' || !/^\d+$/.test(e.v)) this.fail('exponent must be a whole number');
      value = this.alg.pow(value, Number(e.v));
    }
    return value;
  }

  private atom(): T {
    const tok = this.peek();
    if (!tok) this.fail('unexpected end');
    if (tok.t === 'num') {
      this.pos++;
      return this.alg.fromRat(ratFromDecimal(tok.v));
    }
    if (tok.t === 'id' && tok.v === 'x') {
      this.pos++;
      return this.alg.x();
    }
    if (tok.t === 'id' && tok.v === 'i') {
      this.pos++;
      return this.alg.i();
    }
    if (tok.t === 'id' && tok.v === 'sqrt') {
      this.pos++;
      this.expect('lp');
      const n = this.expect('num');
      if (n.t !== 'num' || !/^\d+$/.test(n.v)) this.fail('sqrt needs a whole number');
      this.expect('rp');
      return this.alg.sqrt(BigInt(n.v));
    }
    if (tok.t === 'lp') {
      this.pos++;
      const inner = this.expr();
      this.expect('rp');
      return inner;
    }
    return this.fail(`unexpected token ${tok.t}`);
  }
}

/** Reads a single expression in the given algebra; the whole text must be used. */
function readExpr<T>(text: string, alg: Algebra<T>): T {
  const reader = new Reader(tokenize(text), alg, text);
  const value = reader.expr();
  if (!reader.done()) throw new Error(`trailing input in "${text}"`);
  return value;
}

const polyAlgebra: Algebra<Poly> = {
  fromRat: (r) => trimPoly([r]),
  x: () => [ZERO, ONE],
  i: () => {
    throw new Error('i is not allowed in an equation');
  },
  sqrt: () => {
    throw new Error('sqrt is not allowed in an equation');
  },
  add: polyAdd,
  sub: polySub,
  neg: polyNeg,
  mul: polyMul,
  divConst: (a, b) => {
    if (b.length !== 1) throw new Error('can only divide an equation by a constant');
    return a.map((c) => ratDiv(c, b[0]));
  },
  pow: (a, n) => {
    let out: Poly = [ONE];
    for (let k = 0; k < n; k++) out = polyMul(out, a);
    return out;
  },
};

/** Reads a polynomial in x (for example "2x^2 - 3x + 1/2"). */
export function parsePoly(text: string): Poly {
  return trimPoly(readExpr(text, polyAlgebra));
}

/** Reads "LHS = RHS" and returns both sides as polynomials. Exactly one '=' is required. */
export function parseEquation(text: string): { left: Poly; right: Poly } {
  const parts = text.split('=');
  if (parts.length !== 2) throw new Error(`need exactly one "=" in "${text}"`);
  return { left: parsePoly(parts[0]), right: parsePoly(parts[1]) };
}

const cxAlgebra: Algebra<Cx> = {
  fromRat: cxRat,
  x: () => {
    throw new Error('x is not allowed in a root');
  },
  i: () => cxI,
  sqrt: (n) => {
    if (n <= 1n) throw new Error(`sqrt(${n}) is not a simplified radical`);
    return { re: { a: ZERO, b: ONE, d: n }, im: qsRat(ZERO) };
  },
  add: cxAdd,
  sub: cxSub,
  neg: (a) => cxSub(cxZero, a),
  mul: cxMul,
  divConst: (a, b) => {
    if (!cxIsRational(b) || ratIsZero(b.re.a)) throw new Error('can only divide a root by a nonzero rational');
    const q = b.re.a;
    return { re: { a: ratDiv(a.re.a, q), b: ratDiv(a.re.b, q), d: a.re.d }, im: { a: ratDiv(a.im.a, q), b: ratDiv(a.im.b, q), d: a.im.d } };
  },
  pow: (a, n) => {
    let out: Cx = cxRat(ONE);
    for (let k = 0; k < n; k++) out = cxMul(out, a);
    return out;
  },
};

/** Reads one root, possibly with √ and i: (3 + sqrt(5))/2, 2*i*sqrt(3), -5/2, 1.25. */
export function parseRoot(text: string): Cx {
  return readExpr(text, cxAlgebra);
}

/** The radicands a root text uses, as written (for the simplified-surd check). */
export function radicandsIn(text: string): bigint[] {
  const out: bigint[] = [];
  const re = /sqrt\((\d+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(BigInt(m[1]));
  return out;
}
