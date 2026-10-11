/**
 * Helpers shared by the generators and the checks: the de-duplication key, the domain of a derivative, the rule names
 * it uses and typed guards for mathjs expression nodes. Everything is computed from an item's question text, so the
 * generator and the checks read the same text the same way.
 */

import { create, all, MathNode } from 'mathjs';
import { CorpusItem, normaliseText } from './types';
import { parseEquation } from './parse';
import { Rat, polyCoef, polySub, ratToString } from './exact';

const math = create(all);

/** mathjs node shapes used here, typed by their `type` tag. */
export interface OpNode extends MathNode {
  op: string;
  args: MathNode[];
}
interface FnNode extends MathNode {
  fn: SymNode;
  args: MathNode[];
}
interface SymNode extends MathNode {
  name: string;
}

export const isOpNode = (n: MathNode): n is OpNode => n.type === 'OperatorNode';
export const isFnNode = (n: MathNode): n is FnNode => n.type === 'FunctionNode';
export const isSymNode = (n: MathNode): n is SymNode => n.type === 'SymbolNode';

/** The points at which a derivative question is fingerprinted for de-duplication. */
const FINGERPRINT_POINTS = [0.31, 0.77, 1.13, 1.59, 2.07];

/** The coefficients (lowest power first) with the sign of the leading one made positive. */
function signNormalised(coefs: Rat[]): string {
  const lead = coefs[coefs.length - 1];
  const flip = lead.n < 0n ? -1n : 1n;
  return coefs.map((c) => ratToString({ n: c.n * flip, d: c.d })).join(':');
}

/**
 * The de-duplication key of an item. A linear or quadratic equation is keyed on the exact coefficients of
 * left minus right (sign-normalised, not divided by a common factor, so 2x + 4 = 0 and x + 2 = 0 are different
 * questions). A linear equation with no x-term is keyed on its normalised text, because all of them share one
 * coefficient pair. A derivative is keyed on the values of its function at five fixed points.
 */
export function dedupeKey(item: CorpusItem): string {
  if (item.family === 'linear') {
    if (item.stratum === 'no-solution' || item.stratum === 'identity') return `text:${normaliseText(item.question)}`;
    const { left, right } = parseEquation(item.question);
    const diff = polySub(left, right);
    return `lin:${signNormalised([polyCoef(diff, 0), polyCoef(diff, 1)])}`;
  }
  if (item.family === 'quadratic') {
    const { left, right } = parseEquation(item.question);
    const diff = polySub(left, right);
    return `quad:${signNormalised([polyCoef(diff, 0), polyCoef(diff, 1), polyCoef(diff, 2)])}`;
  }
  const node = math.parse(item.question);
  const values = FINGERPRINT_POINTS.map((x) => {
    const v: unknown = node.evaluate({ x });
    return typeof v === 'number' ? v.toPrecision(10) : 'other';
  });
  return `der:${values.join(',')}`;
}

/** Every node of an expression, parent before child. */
function allNodes(root: MathNode): MathNode[] {
  const out: MathNode[] = [];
  root.traverse((n) => {
    out.push(n);
  });
  return out;
}

/** The conditions a derivative needs: every square root and logarithm argument must be positive. */
function domainConditions(root: MathNode): string[] {
  const out: string[] = [];
  for (const n of allNodes(root)) {
    if (isFnNode(n) && (n.fn.name === 'sqrt' || n.fn.name === 'log')) out.push(`${n.args[0].toString()} > 0`);
  }
  return [...new Set(out)];
}

/** The domain text stored on a derivative item; "all real x" when no condition applies. */
export function domainText(root: MathNode): string {
  const conditions = domainConditions(root);
  return conditions.length === 0 ? 'all real x' : `x such that ${conditions.join(' and ')}`;
}

/** Whether a node contains the variable x. */
export function containsX(root: MathNode): boolean {
  return allNodes(root).some((n) => isSymNode(n) && n.name === 'x');
}

/** The rule names a derivative uses, in order of first appearance from the top. */
export function ruleList(root: MathNode): string[] {
  const out: string[] = [];
  const add = (rule: string): void => {
    if (!out.includes(rule)) out.push(rule);
  };
  for (const n of allNodes(root)) {
    if (isOpNode(n)) {
      if ((n.op === '+' || n.op === '-') && n.args.length === 2) add('sum');
      else if (n.op === '*' && n.args.length === 2 && n.args.every(containsX)) add('product');
      else if (n.op === '/' && n.args.length === 2 && containsX(n.args[1])) add('quotient');
      else if (n.op === '^' && n.args.length === 2 && containsX(n.args[0])) add('power');
    } else if (isFnNode(n)) {
      add('chain');
    }
  }
  return out;
}
