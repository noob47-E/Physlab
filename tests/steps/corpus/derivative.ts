/**
 * Derivatives, built from a small grammar: polynomial leaves, sums, products, quotients and compositions of
 * sin, cos, tan, exp, log (the natural logarithm) and sqrt, nested to depth 3.
 *
 * Every answer and every sub-derivative key is produced by mathjs derivative with simplify off. A candidate is
 * kept only if its function is defined at five sample points (every sub-expression finite and real there), its
 * derivative depends on x, and each key agrees with a central difference at those points.
 */

import { create, all, MathNode } from 'mathjs';
import { CorpusItem, Random, randomFor } from './types';
import { domainText, isSymNode, ruleList } from './keys';

const math = create(all);

export type DerivativeStratum = 'easy' | 'medium' | 'hard' | 'chain' | 'product' | 'quotient';

export const DERIVATIVE_STRATA: DerivativeStratum[] = ['easy', 'medium', 'hard', 'chain', 'product', 'quotient'];

const FUNCTIONS = ['sin', 'cos', 'tan', 'exp', 'log', 'sqrt'] as const;

/** Candidate points, in order. The first five at which the function is defined are the item's sample points. */
export const GRID = [-2.4, -1.9, -1.3, -0.9, -0.6, -0.35, -0.1, 0.2, 0.45, 0.7, 0.95, 1.25, 1.7, 2.2, 2.8, 3.4];

/** Step of the central difference used in the generator's own check. The test uses a far smaller step. */
const H = 1e-6;

interface Expr {
  text: string;
  kind: 'leaf' | 'sum' | 'product' | 'quotient' | 'chain';
  parts: Expr[];
  fn?: string;
}

function nonzeroSmall(random: Random): number {
  return random.pick([-1, 1]) * random.int(1, 6);
}

function leaf(random: Random): Expr {
  const c = nonzeroSmall(random);
  const shape = random.int(0, 2);
  if (shape === 0) {
    const n = random.int(1, 4);
    return { text: n === 1 ? `${c} * x` : `${c} * x^${n}`, kind: 'leaf', parts: [] };
  }
  if (shape === 1) {
    return { text: c < 0 ? `x - ${-c}` : `x + ${c}`, kind: 'leaf', parts: [] };
  }
  return { text: `x^${random.int(2, 3)}`, kind: 'leaf', parts: [] };
}

function generate(random: Random, depth: number): Expr {
  if (depth === 0) return leaf(random);
  const kind = random.pick(['sum', 'sum', 'product', 'product', 'quotient', 'chain', 'chain', 'chain'] as const);
  return compose(random, kind, depth);
}

function compose(random: Random, kind: 'sum' | 'product' | 'quotient' | 'chain', depth: number): Expr {
  if (kind === 'chain') {
    const fn = random.pick(FUNCTIONS);
    const u = generate(random, depth - 1);
    return { text: `${fn}(${u.text})`, kind: 'chain', parts: [u], fn };
  }
  const a = generate(random, depth - 1);
  const b = generate(random, depth - 1);
  if (kind === 'sum') {
    const op = random.pick(['+', '-'] as const);
    return { text: `(${a.text} ${op} ${b.text})`, kind: 'sum', parts: [a, b] };
  }
  if (kind === 'product') return { text: `(${a.text}) * (${b.text})`, kind: 'product', parts: [a, b] };
  return { text: `(${a.text}) / (${b.text})`, kind: 'quotient', parts: [a, b] };
}

function evalAt(node: MathNode, x: number): number {
  const v: unknown = node.evaluate({ x });
  return typeof v === 'number' ? v : Number.NaN;
}

/**
 * Every sub-expression that is a value (not a bare function name) is finite, real and no larger than MAGNITUDE_LIMIT at x.
 * The limit is what makes the double and the 40-digit checks agree: beyond it doubles overflow where BigNumber does not.
 */
export const MAGNITUDE_LIMIT = 1e6;

function definedAt(node: MathNode, x: number): boolean {
  let ok = true;
  node.traverse((n) => {
    if (!ok) return;
    if (isSymNode(n) && n.name !== 'x') return;
    const v: unknown = n.evaluate({ x });
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAGNITUDE_LIMIT) ok = false;
  });
  return ok;
}

/** True when a and b agree to a relative tolerance. A NaN never agrees. */
function agrees(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

function centralDifference(node: MathNode, x: number): number {
  return (evalAt(node, x + H) - evalAt(node, x - H)) / (2 * H);
}

type DerivativeOutcome = { ok: true; item: CorpusItem } | { ok: false; reason: string };

/**
 * The keys of an item: the sub-expressions of its top rule and their derivatives, each with the check that pairs it
 * with a central difference. A sum has no keys.
 */
function keysOf(top: Expr): { intermediates: Record<string, string>; keyChecks: Array<{ f: string; df: string }> } {
  const intermediates: Record<string, string> = {};
  const keyChecks: Array<{ f: string; df: string }> = [];
  if (top.kind === 'product' || top.kind === 'quotient') {
    const [left, right] = top.parts;
    const [nameL, nameR] = top.kind === 'product' ? ['left', 'right'] : ['numerator', 'denominator'];
    const dl = math.derivative(left.text, 'x', { simplify: false }).toString();
    const dr = math.derivative(right.text, 'x', { simplify: false }).toString();
    intermediates[nameL] = left.text;
    intermediates[nameR] = right.text;
    intermediates[`d${nameL}`] = dl;
    intermediates[`d${nameR}`] = dr;
    keyChecks.push({ f: left.text, df: dl }, { f: right.text, df: dr });
  } else if (top.kind === 'chain') {
    const inner = top.parts[0].text;
    const dInner = math.derivative(inner, 'x', { simplify: false }).toString();
    // The outer factor is the derivative of the function with respect to its own argument t, then t is replaced
    // by the inner expression. The test checks that outer times dinner gives the derivative.
    const outer = math.derivative(`${top.fn}(t)`, 't', { simplify: false }).transform((n) =>
      isSymNode(n) && n.name === 't' ? math.parse(`(${inner})`) : n,
    );
    intermediates.inner = inner;
    intermediates.dinner = dInner;
    intermediates.outer = outer.toString();
    keyChecks.push({ f: inner, df: dInner });
  }
  return { intermediates, keyChecks };
}

/** Generates one derivative item from its id. The result is a pure function of the id and the stratum. */
export function generateDerivative(id: string, stratum: DerivativeStratum): DerivativeOutcome {
  const random = randomFor(id);
  let top: Expr;
  if (stratum === 'easy') top = generate(random, 1);
  else if (stratum === 'medium') top = generate(random, 2);
  else if (stratum === 'hard') top = generate(random, 3);
  else top = compose(random, stratum, 2);

  const question = top.text;
  const node = math.parse(question);
  const answerNode = math.derivative(question, 'x', { simplify: false });
  const { intermediates, keyChecks } = keysOf(top);

  // Every expression the checks evaluate (the question, the answer and each key) must be defined at a sample point.
  const checkedNodes = [node, answerNode, ...Object.values(intermediates).map((t) => math.parse(t))];
  const valid = GRID.filter((x) => checkedNodes.every((n) => definedAt(n, x)));
  if (valid.length < 5) return { ok: false, reason: 'undefined at too few sample points' };
  const samplePoints = valid.slice(0, 5);

  const answerValues = valid.map((x) => evalAt(answerNode, x));
  if (answerValues.some((v) => !Number.isFinite(v))) return { ok: false, reason: 'derivative undefined at a sample point' };
  const spread = Math.max(...answerValues) - Math.min(...answerValues);
  if (spread <= 1e-9 * Math.max(1, Math.abs(answerValues[0]))) return { ok: false, reason: 'derivative does not depend on x' };
  if (answerValues.some((v) => Math.abs(v) > 1e8)) return { ok: false, reason: 'derivative too large to check' };

  for (const { f, df } of keyChecks) {
    const fNode = math.parse(f);
    const dNode = math.parse(df);
    for (const x of samplePoints) {
      if (!agrees(centralDifference(fNode, x), evalAt(dNode, x), 1e-5)) {
        return { ok: false, reason: 'a sub-derivative disagrees with its central difference' };
      }
    }
  }
  for (const x of samplePoints) {
    if (!agrees(centralDifference(node, x), evalAt(answerNode, x), 1e-5)) {
      return { ok: false, reason: 'the derivative disagrees with its central difference' };
    }
  }
  if (top.kind === 'chain') {
    const outerNode = math.parse(intermediates.outer);
    const dInnerNode = math.parse(intermediates.dinner);
    for (const x of samplePoints) {
      if (!agrees(evalAt(outerNode, x) * evalAt(dInnerNode, x), evalAt(answerNode, x), 1e-7)) {
        return { ok: false, reason: 'the chain factors do not multiply to the derivative' };
      }
    }
  }

  return {
    ok: true,
    item: {
      id,
      family: 'derivative',
      stratum,
      question,
      answer: answerNode.toString(),
      intermediates,
      rulesExpected: ruleList(node),
      level: stratum === 'hard' ? 'first-year university' : 'FSc/A level',
      domain: domainText(node),
      samplePoints,
    },
  };
}
