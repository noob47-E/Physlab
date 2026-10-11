/**
 * Independent checks of one corpus item. Each checker reads the item's text back and recomputes what the item claims:
 * linear and quadratic items with exact arithmetic (exact.ts), derivative items with 40-digit BigNumber arithmetic.
 *
 * A checker returns a list of problems; an empty list means the item is right. A text the reader cannot parse throws,
 * and the test fails with that error. Nothing in this file catches an exception.
 */

import { create, all, BigNumber, MathNode } from 'mathjs';
import { CorpusItem } from './types';
import { parseEquation, parsePoly, parseRoot, radicandsIn } from './parse';
import {
  Cx,
  Poly,
  Rat,
  cxAdd,
  cxEq,
  cxIsRational,
  cxIsReal,
  cxIsZero,
  cxMul,
  cxRat,
  gcdB,
  isPerfectSquare,
  isSquarefreeAboveOne,
  polyAt,
  polyCoef,
  polyEq,
  polySub,
  rat,
  ratDiv,
  ratEq,
  ratFromDecimal,
  ratIsZero,
  ratMul,
  ratNeg,
  ratSub,
  ratToDecimal,
  ratToString,
  ZERO,
} from './exact';
import { containsX, domainText, isFnNode, isOpNode, ruleList, OpNode } from './keys';
import { GRID, MAGNITUDE_LIMIT } from './derivative';

/** Central-difference step: far below the 40-digit precision's own rounding, so the step's error is negligible. */
const STEP = '1e-20';
/**
 * Relative agreement required between a derivative and its central difference. At 40 significant digits and a step of
 * 1e-20, rounding contributes about 1e-20 relative to a value of size one and truncation about 1e-40, so 1e-12
 * leaves ten orders of magnitude of margin, while a wrong derivative differs by an amount of order one.
 */
const TOLERANCE = '1e-12';

const big = create(all);
big.config({ number: 'BigNumber', precision: 40 });

/** The text a rational root must have in a linear answer: decimal in the decimal form, otherwise p or p/q. */
function linearRootText(r: Rat, decimal: boolean): string {
  if (decimal) {
    const d = ratToDecimal(r);
    if (d !== null) return d;
  }
  return ratToString(r);
}

function lcmOfDenominators(values: Rat[]): bigint {
  let out = 1n;
  for (const v of values) out = (out * v.d) / gcdB(out, v.d);
  return out;
}

/**
 * The one text a quadratic root may have: a rational, or (P ± Q·√D)/R, or (P ± Q·i√D)/R, with gcd(P, Q, R) = 1, D
 * squarefree and above one (or one, for a ± bi), the radical written with a leading "*". A root of any other shape
 * throws, because it is not a form the corpus writes.
 */
export function canonicalRoot(z: Cx): string {
  const complex = !cxIsReal(z);
  const radicalRe = !ratIsZero(z.re.b);
  const radicalIm = !ratIsZero(z.im.b);
  if (radicalRe && complex) throw new Error('a real radical with an imaginary part is not a form in the corpus');
  if (radicalIm && !ratIsZero(z.im.a)) throw new Error('a rational and a radical imaginary part together are not a form in the corpus');
  if (!complex && !radicalRe) return ratToString(z.re.a);

  // The coefficient of the radical (or of i, when there is no radical), and the radicand it sits under.
  const coefficient = radicalRe ? z.re.b : complex && radicalIm ? z.im.b : z.im.a;
  const d = radicalRe ? z.re.d : complex && radicalIm ? z.im.d : 1n;
  let den = lcmOfDenominators([z.re.a, coefficient]);
  let P = z.re.a.n * (den / z.re.a.d);
  let Q = coefficient.n * (den / coefficient.d);
  const g = gcdB(gcdB(P, Q), den);
  P /= g;
  Q /= g;
  den /= g;

  const magnitude = Q < 0n ? -Q : Q;
  const coefText = magnitude === 1n ? '' : `${magnitude}*`;
  const radical = complex ? `${coefText}i${d === 1n ? '' : `*sqrt(${d})`}` : `${coefText}sqrt(${d})`;
  const numerator = P === 0n ? `${Q < 0n ? '-' : ''}${radical}` : `${P} ${Q < 0n ? '-' : '+'} ${radical}`;
  return den === 1n ? numerator : `(${numerator})/${den}`;
}

/** Real rationals compared exactly. */
function compareRat(a: Rat, b: Rat): number {
  const lhs = a.n * b.d;
  const rhs = b.n * a.d;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/** The answer a quadratic must read, from its parsed roots: rationals ascending, surd or complex pairs plus-first. */
function quadraticAnswer(roots: Cx[], kind: string): string {
  if (kind === 'rational' || kind === 'double') {
    const sorted = roots.slice().sort((x, y) => compareRat(x.re.a, y.re.a));
    return `x = ${sorted.map(canonicalRoot).join(' or x = ')}`;
  }
  // The sign of the coefficient of the radical (or of i, when there is no radical): the root with the positive one
  // comes first. For a ± bi the coefficient is the rational imaginary part, which sits in im.a, not im.b.
  const sign = (z: Cx): bigint => {
    if (!ratIsZero(z.re.b)) return z.re.b.n;
    if (cxIsReal(z)) return 0n;
    return ratIsZero(z.im.b) ? z.im.a.n : z.im.b.n;
  };
  const sorted = roots.slice().sort((x, y) => Number(sign(y) > sign(x)) - Number(sign(y) < sign(x)));
  return `x = ${sorted.map(canonicalRoot).join(' or x = ')}`;
}

/**
 * True when the text has a bracket around more than a number: (x + 2) or 2(x - 1). A bracket around a fraction
 * coefficient, as in (3/2)x, is allowed.
 */
function hasBracketGroup(text: string): boolean {
  for (const m of text.matchAll(/\(([^()]*)\)/g)) {
    if (!/^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(m[1])) return true;
  }
  return false;
}

/** The key lines a linear item must carry, and the coefficient features its stratum promises. */
function checkLinearFeatures(item: CorpusItem, form: string | null, diff: Poly, left: Poly, right: Poly): string[] {
  const problems: string[] = [];
  const question = item.question;
  const hasFraction = question.includes('/');
  const hasBracket = question.includes('(');
  const hasDecimal = /\d\./.test(question);
  if (form === 'fraction' && !hasFraction) problems.push('fraction stratum has no fraction');
  for (const m of question.matchAll(/\)\/(\d+)/g)) {
    const d = Number(m[1]);
    if (d < 2 || d > 6) problems.push(`fraction denominator ${d} is outside 2 to 6`);
  }
  if (form === 'brackets' && (!hasBracket || hasFraction)) problems.push('brackets stratum must have a bracket and no fraction');
  if (form === 'decimal' && (!hasDecimal || hasFraction)) problems.push('decimal stratum must have a decimal and no fraction');
  if (form === 'integer' && (hasFraction || hasBracket || hasDecimal)) problems.push('integer stratum has a bracket, fraction or decimal');
  if (polyCoef(left, 1).n === 0n || polyCoef(right, 1).n === 0n) problems.push('x must appear on both sides');

  const expanded = item.intermediates.expanded ?? '';
  const expandedParts = expanded.split(' = ');
  if (expandedParts.length !== 2) {
    problems.push('the expanded line must have one "="');
  } else {
    if (hasBracketGroup(expanded)) problems.push('the expanded line still has brackets');
    if (!polyEq(parsePoly(expandedParts[0]), left) || !polyEq(parsePoly(expandedParts[1]), right)) {
      problems.push('the expanded line does not expand the two sides');
    }
  }

  const collected = item.intermediates.collected ?? '';
  const collectedParts = collected.split(' = ');
  if (collectedParts.length !== 2) {
    problems.push('the collected line must have one "="');
  } else {
    const L = parsePoly(collectedParts[0]);
    const R = parsePoly(collectedParts[1]);
    if (!polyEq(polySub(L, R), diff)) problems.push('the collected line is not the same equation');
    if (!ratIsZero(polyCoef(L, 0))) problems.push('the collected left side still has a constant');
    if (!ratIsZero(polyCoef(R, 1))) problems.push('the collected right side still has an x-term');
  }
  return problems;
}

/** Linear equations: the question, its key lines, its answer and its stratum's promised features. */
export function checkLinear(item: CorpusItem): string[] {
  const problems: string[] = [];
  const special = item.stratum === 'no-solution' || item.stratum === 'identity';
  const form = special ? null : item.stratum.split('/')[0];
  const decimal = form === 'decimal';

  const { left, right } = parseEquation(item.question);
  const diff = polySub(left, right);
  if (diff.length > 2) problems.push('the equation is not linear');
  const A = polyCoef(diff, 1);
  const B = polyCoef(diff, 0);
  problems.push(...checkLinearFeatures(item, form, diff, left, right));

  if (item.stratum === 'no-solution') {
    if (!ratIsZero(A) || ratIsZero(B)) problems.push('a no-solution equation must reduce to 0 = (nonzero)');
    if (item.answer !== 'No solution') problems.push('answer of a no-solution equation must be "No solution"');
  } else if (item.stratum === 'identity') {
    if (!ratIsZero(A) || !ratIsZero(B)) problems.push('an identity must reduce to 0 = 0');
    if (item.answer !== 'All real numbers') problems.push('answer of an identity must be "All real numbers"');
  } else if (ratIsZero(A)) {
    problems.push('a solvable equation has no x-coefficient');
  } else {
    const root = ratDiv(ratNeg(B), A);
    const match = /^x = (.+)$/.exec(item.answer);
    if (!match) {
      problems.push(`answer is not of the form "x = …": ${item.answer}`);
    } else {
      const value = parseRoot(match[1]);
      if (!cxIsRational(value)) problems.push('answer is not a rational number');
      else if (!ratEq(value.re.a, root)) problems.push(`answer ${match[1]} is not the root ${ratToString(root)}`);
    }
    const canonical = `x = ${linearRootText(root, decimal)}`;
    if (item.answer !== canonical) problems.push(`answer must read "${canonical}" (lowest terms, no "/1")`);
    if (item.intermediates.divided !== item.answer) problems.push('the divided line must be the answer');
  }

  const expectedKeys = special ? ['collected', 'expanded'] : ['collected', 'divided', 'expanded'];
  if (JSON.stringify(Object.keys(item.intermediates).sort()) !== JSON.stringify(expectedKeys)) {
    problems.push(`intermediate keys must be ${expectedKeys.join(', ')}`);
  }
  const rules = special ? ['collect'] : ['collect', 'divide'];
  if (JSON.stringify(rules) !== JSON.stringify(item.rulesExpected)) problems.push(`rulesExpected must be ${rules.join(', ')}`);
  if (item.level !== 'O/IGCSE') problems.push('linear items are O/IGCSE');
  return problems;
}

/** The shapes the two factor forms are written in: k(R1x - P1)(R2x - P2) and k(Rx - P)^2. */
const DISTINCT_FACTOR_FORM = /^(-?\d*)\((\d*)x(?: ([+-]) (\d+))?\)\((\d*)x(?: ([+-]) (\d+))?\)$/;
const DOUBLE_FACTOR_FORM = /^(-?\d*)\((\d*)x(?: ([+-]) (\d+))?\)\^2$/;

/** A non-negative rational written 3, 3/2 or 0.75 (a fraction or a decimal, read exactly). */
function readMagnitude(text: string): Rat {
  if (text.includes('/')) {
    const [n, d] = text.split('/');
    return rat(BigInt(n), BigInt(d));
  }
  return ratFromDecimal(text);
}

/**
 * The completed-square form must be A(x + p)^2 + q with p = B/(2A) and q = (4AC - B²)/(4A), and its leading
 * coefficient must be A. Any other text that expands to the same quadratic is not the completed square.
 */
function completedSquareShape(text: string, A: Rat, B: Rat, C: Rat): string[] {
  const m = /^(-?\d*)\(x(?: ([+-]) (\d+(?:\/\d+)?))?\)\^2(?: ([+-]) (\d+(?:\/\d+)?))?$/.exec(text);
  if (!m) return [`the completed-square form must be A(x + p)^2 + q: ${text}`];
  const lead = m[1] === '' ? 1n : m[1] === '-' ? -1n : BigInt(m[1]);
  const problems: string[] = [];
  if (!ratEq(rat(lead), A)) problems.push('the completed-square leading coefficient is not A');
  const p = m[2] === undefined ? ZERO : ratMul(readMagnitude(m[3]), rat(m[2] === '-' ? -1n : 1n));
  const q = m[4] === undefined ? ZERO : ratMul(readMagnitude(m[5]), rat(m[4] === '-' ? -1n : 1n));
  const expectedP = ratDiv(B, ratMul(rat(2n), A));
  const expectedQ = ratDiv(ratSub(ratMul(rat(4n), ratMul(A, C)), ratMul(B, B)), ratMul(rat(4n), A));
  if (!ratEq(p, expectedP)) problems.push(`the completed-square p must be ${ratToString(expectedP)}`);
  if (!ratEq(q, expectedQ)) problems.push(`the completed-square q must be ${ratToString(expectedQ)}`);
  return problems;
}

/** Quadratic equations: the roots (exactly, and in their one canonical text), the discriminant and the two forms. */
export function checkQuadratic(item: CorpusItem): string[] {
  const problems: string[] = [];
  const kind = item.stratum.split('/')[0];
  const { left, right } = parseEquation(item.question);
  const diff = polySub(left, right);
  if (diff.length !== 3) return ['the equation is not quadratic'];
  const A = polyCoef(diff, 2);
  const B = polyCoef(diff, 1);
  const C = polyCoef(diff, 0);

  const discriminant = ratSub(ratMul(B, B), ratMul(rat(4n), ratMul(A, C)));
  if (discriminant.d !== 1n) problems.push('discriminant is not an integer');
  const D = discriminant.n;
  if (item.intermediates.discriminant !== D.toString()) problems.push(`discriminant key must be ${D}`);
  if (kind === 'rational' && !(D > 0n && isPerfectSquare(D))) problems.push('rational stratum needs a positive square discriminant');
  if (kind === 'double' && D !== 0n) problems.push('double stratum needs discriminant 0');
  if (kind === 'surd' && !(D > 0n && !isPerfectSquare(D))) problems.push('surd stratum needs a positive non-square discriminant');
  if (kind === 'complex' && !(D < 0n)) problems.push('complex stratum needs a negative discriminant');

  const expectedRoots = kind === 'double' ? 1 : 2;
  const match = /^x = (.+)$/.exec(item.answer);
  if (!match) {
    problems.push(`answer is not of the form "x = …": ${item.answer}`);
  } else {
    const parts = match[1].split(' or x = ');
    if (parts.length !== expectedRoots) problems.push(`expected ${expectedRoots} root(s), found ${parts.length}`);
    const roots: Cx[] = [];
    for (const text of parts) {
      for (const n of radicandsIn(text)) {
        if (!isSquarefreeAboveOne(n)) problems.push(`radical sqrt(${n}) is not simplified: ${text}`);
      }
      const z = parseRoot(text);
      roots.push(z);
      if (kind === 'complex') {
        if (cxIsReal(z)) problems.push(`complex stratum has a real root: ${text}`);
      } else if (!cxIsReal(z)) {
        problems.push(`real root expected: ${text}`);
      } else if (kind === 'surd' && cxIsRational(z)) {
        problems.push(`surd stratum has a rational root: ${text}`);
      } else if ((kind === 'rational' || kind === 'double') && !cxIsRational(z)) {
        problems.push(`rational root expected: ${text}`);
      }
      if (!cxIsZero(polyAt(diff, z))) problems.push(`${text} does not satisfy the equation`);
    }
    if (roots.length === expectedRoots) {
      const first = roots[0];
      const last = roots[roots.length - 1];
      if (!cxEq(cxAdd(first, last), cxRat(ratDiv(ratNeg(B), A)))) problems.push('the roots do not sum to -B/A');
      if (!cxEq(cxMul(first, last), cxRat(ratDiv(C, A)))) problems.push('the roots do not multiply to C/A');
      const canonical = quadraticAnswer(roots, kind);
      if (item.answer !== canonical) problems.push(`answer must read "${canonical}"`);
    }
  }

  const factorisable = kind === 'rational' || kind === 'double';
  const expectedKeys = factorisable ? ['completed-square', 'discriminant', 'factorised'] : ['completed-square', 'discriminant'];
  if (JSON.stringify(Object.keys(item.intermediates).sort()) !== JSON.stringify(expectedKeys)) {
    problems.push(`intermediate keys must be ${expectedKeys.join(', ')}`);
  }
  if (item.intermediates.factorised !== undefined) {
    const fz = item.intermediates.factorised;
    if (!polyEq(parsePoly(fz), diff)) problems.push('the factorised form does not expand to the equation');
    const shape = kind === 'double' ? DOUBLE_FACTOR_FORM : DISTINCT_FACTOR_FORM;
    const fm = shape.exec(fz);
    if (!fm) {
      problems.push(`the factorised form must be ${kind === 'double' ? 'k(Rx - P)^2' : 'k(R1x - P1)(R2x - P2)'}: ${fz}`);
    } else {
      // Each factor (Rx - P) is in lowest terms: gcd(R, P) = 1. So (2x - 2)(x - 2) is not the factorisation; 2(x - 1)(x - 2) is.
      const factors = kind === 'double' ? [[fm[2], fm[3], fm[4]]] : [[fm[2], fm[3], fm[4]], [fm[5], fm[6], fm[7]]];
      for (const [rText, sign, pText] of factors) {
        const R = rText === '' ? 1n : BigInt(rText);
        const P = pText === undefined ? 0n : sign === '-' ? BigInt(pText) : -BigInt(pText);
        if (gcdB(R, P) !== 1n) problems.push(`a factor (${R}x - ${P}) is not in lowest terms: ${fz}`);
      }
    }
  }
  const cs = item.intermediates['completed-square'];
  if (cs === undefined) {
    problems.push('missing completed-square form');
  } else {
    if (!polyEq(parsePoly(cs), diff)) problems.push('the completed-square form does not expand to the equation');
    problems.push(...completedSquareShape(cs, A, B, C));
  }

  const rules = factorisable ? ['formula', 'complete-square', 'factorise'] : ['formula', 'complete-square'];
  if (JSON.stringify(rules) !== JSON.stringify(item.rulesExpected)) problems.push(`rulesExpected must be ${rules.join(', ')}`);
  if (item.level !== (kind === 'complex' ? 'FSc/A level' : 'O/IGCSE')) problems.push('wrong level for this stratum');
  return problems;
}

/** The shape of a derivative's top rule, with the keys that rule needs. */
type Shape = 'product' | 'quotient' | 'chain' | 'other';

const SHAPE_KEYS: Record<Shape, string[]> = {
  product: ['dleft', 'dright', 'left', 'right'],
  quotient: ['ddenominator', 'dnumerator', 'denominator', 'numerator'],
  chain: ['dinner', 'inner', 'outer'],
  other: [],
};

function shapeOf(node: MathNode): Shape {
  if (isFnNode(node)) return 'chain';
  if (isOpNode(node) && node.op === '*' && node.args.length === 2 && node.args.every((a) => containsX(a))) return 'product';
  if (isOpNode(node) && node.op === '/' && node.args.length === 2 && containsX(node.args[1])) return 'quotient';
  return 'other';
}

/** A sub-expression's value at x, as a BigNumber. Throws if it is not finite and real: never swallowed. */
function realAt(node: MathNode, x: BigNumber): BigNumber {
  const value: unknown = node.evaluate({ x });
  if (big.typeOf(value) !== 'BigNumber') throw new Error(`${node.toString()} is not real at x = ${x.toString()}`);
  const v = value as BigNumber;
  if (!v.isFinite()) throw new Error(`${node.toString()} is not finite at x = ${x.toString()}`);
  return v;
}

/** The central difference of f at x, with the step STEP. */
function centralDifference(f: MathNode, x: BigNumber): BigNumber {
  const h = big.bignumber(STEP);
  const up = realAt(f, big.add(x, h) as BigNumber);
  const down = realAt(f, big.subtract(x, h) as BigNumber);
  return big.divide(big.subtract(up, down) as BigNumber, big.multiply(big.bignumber(2), h) as BigNumber) as BigNumber;
}

/** True when a and b agree to TOLERANCE relative to the larger of 1 and |b|. */
function agreeAt(a: BigNumber, b: BigNumber): boolean {
  const scale = big.max(big.bignumber(1), big.abs(b)) as BigNumber;
  const diff = big.abs(big.subtract(a, b) as BigNumber) as BigNumber;
  return !big.larger(diff, big.multiply(big.bignumber(TOLERANCE), scale) as BigNumber);
}

/**
 * True when every sub-expression that is a value (not a bare function name) is finite, real and within the same
 * magnitude limit the generator uses (MAGNITUDE_LIMIT), at x.
 */
function definedBig(node: MathNode, x: BigNumber): boolean {
  const limit = big.bignumber(MAGNITUDE_LIMIT);
  let ok = true;
  node.traverse((n) => {
    if (!ok) return;
    if (n.type === 'SymbolNode' && (n as MathNode & { name: string }).name !== 'x') return;
    const value: unknown = n.evaluate({ x });
    if (big.typeOf(value) !== 'BigNumber') {
      ok = false;
      return;
    }
    const v = value as BigNumber;
    if (!v.isFinite() || big.larger(big.abs(v) as BigNumber, limit)) ok = false;
  });
  return ok;
}

/** Derivative items: the answer and every key, checked at the five sample points against central differences. */
export function checkDerivative(item: CorpusItem): string[] {
  const problems: string[] = [];
  const node = big.parse(item.question) as MathNode;
  const answer = big.parse(item.answer) as MathNode;
  const points = item.samplePoints ?? [];
  if (points.length !== 5) problems.push('a derivative item needs exactly five sample points');

  if (item.domain !== domainText(node)) problems.push(`domain must read "${domainText(node)}"`);
  const rules = ruleList(node);
  if (JSON.stringify(rules) !== JSON.stringify(item.rulesExpected)) problems.push(`rulesExpected must be ${rules.join(', ')}`);

  const shape = shapeOf(node);
  const wanted: Record<string, Shape> = { chain: 'chain', product: 'product', quotient: 'quotient' };
  if (wanted[item.stratum] !== undefined && wanted[item.stratum] !== shape) {
    problems.push(`stratum ${item.stratum} needs a ${wanted[item.stratum]} at the top, found ${shape}`);
  }
  if (JSON.stringify(Object.keys(item.intermediates).sort()) !== JSON.stringify([...SHAPE_KEYS[shape]].sort())) {
    problems.push(`intermediate keys for a ${shape} must be ${SHAPE_KEYS[shape].join(', ') || 'none'}`);
  }

  // Every expression checked here: the question, the answer and each key. The generator applies the same rule.
  const keyNodes = Object.values(item.intermediates).map((text) => big.parse(text) as MathNode);
  const checked = [node, answer, ...keyNodes];
  const values: BigNumber[] = [];
  for (const x of points) {
    const xb = big.bignumber(x);
    if (!checked.every((n) => definedBig(n, xb))) problems.push(`a sub-expression is undefined or too large at sample point x = ${x}`);
    const exact = realAt(answer, xb);
    values.push(exact);
    if (!agreeAt(centralDifference(node, xb), exact)) problems.push(`answer disagrees with the central difference at x = ${x}`);
  }
  // The sample points are the first five grid points at which everything checked is defined, and the derivative must
  // not be constant over all of those grid points (the same rule the generator applies).
  const defined = GRID.filter((x) => checked.every((n) => definedBig(n, big.bignumber(x))));
  if (JSON.stringify(points) !== JSON.stringify(defined.slice(0, 5))) {
    problems.push('the sample points are not the first five defined grid points');
  }
  const gridValues = defined.map((x) => realAt(answer, big.bignumber(x)));
  if (gridValues.length > 0 && gridValues.every((v) => big.equal(v, gridValues[0]))) {
    problems.push('the derivative does not depend on x');
  }

  // Each sub-derivative against its own central difference, and each sub-expression against the question's structure.
  const pair = (fText: string | undefined, dText: string | undefined, label: string): void => {
    if (fText === undefined || dText === undefined) return;
    const fNode = big.parse(fText) as MathNode;
    const dNode = big.parse(dText) as MathNode;
    for (const x of points) {
      const xb = big.bignumber(x);
      if (!agreeAt(centralDifference(fNode, xb), realAt(dNode, xb))) problems.push(`${label} disagrees with its central difference at x = ${x}`);
    }
  };
  if (shape === 'product' || shape === 'quotient') {
    const args = (node as OpNode).args;
    const [nameL, nameR, dnameL, dnameR] =
      shape === 'product' ? ['left', 'right', 'dleft', 'dright'] : ['numerator', 'denominator', 'dnumerator', 'ddenominator'];
    pair(item.intermediates[nameL], item.intermediates[dnameL], dnameL);
    pair(item.intermediates[nameR], item.intermediates[dnameR], dnameR);
    const sides: Array<[string, MathNode]> = [
      [nameL, args[0]],
      [nameR, args[1]],
    ];
    for (const [name, arg] of sides) {
      const text = item.intermediates[name];
      if (text === undefined) continue;
      const k = big.parse(text) as MathNode;
      for (const x of points) {
        const xb = big.bignumber(x);
        if (!agreeAt(realAt(arg, xb), realAt(k, xb))) problems.push(`${name} is not the matching part of the question at x = ${x}`);
      }
    }
  } else if (shape === 'chain') {
    const arg = (node as unknown as { args: MathNode[] }).args[0];
    pair(item.intermediates.inner, item.intermediates.dinner, 'dinner');
    if (item.intermediates.inner !== undefined && item.intermediates.outer !== undefined && item.intermediates.dinner !== undefined) {
      const inner = big.parse(item.intermediates.inner) as MathNode;
      const outer = big.parse(item.intermediates.outer) as MathNode;
      const dinner = big.parse(item.intermediates.dinner) as MathNode;
      // The outer factor is checked directly: it must be the derivative of the outer function at t = inner(x), taken
      // by a central difference in t. Checking only outer times dinner would leave it undetermined where dinner is zero.
      const fnName = (node as unknown as { fn: { name: string } }).fn.name;
      const outerFunction = big.parse(`${fnName}(t)`) as MathNode;
      const step = big.bignumber(STEP);
      for (const x of points) {
        const xb = big.bignumber(x);
        const u = realAt(inner, xb);
        const above = outerFunction.evaluate({ t: big.add(u, step) }) as unknown;
        const below = outerFunction.evaluate({ t: big.subtract(u, step) }) as unknown;
        if (big.typeOf(above) !== 'BigNumber' || big.typeOf(below) !== 'BigNumber') {
          throw new Error(`${fnName} is not real at ${u.toString()}`);
        }
        const slope = big.divide(big.subtract(above as BigNumber, below as BigNumber) as BigNumber, big.multiply(big.bignumber(2), step) as BigNumber) as BigNumber;
        if (!agreeAt(slope, realAt(outer, xb))) problems.push(`outer is not the derivative of ${fnName} at the inner expression, at x = ${x}`);
      }
      for (const x of points) {
        const xb = big.bignumber(x);
        if (!agreeAt(realAt(arg, xb), realAt(inner, xb))) problems.push(`inner is not the argument of the question at x = ${x}`);
        if (!agreeAt(big.multiply(realAt(outer, xb), realAt(dinner, xb)) as BigNumber, realAt(answer, xb))) {
          problems.push(`outer times dinner is not the derivative at x = ${x}`);
        }
      }
    }
  }
  return problems;
}

/** Checks any item by its family. */
export function checkItem(item: CorpusItem): string[] {
  if (item.family === 'linear') return checkLinear(item);
  if (item.family === 'quadratic') return checkQuadratic(item);
  return checkDerivative(item);
}
