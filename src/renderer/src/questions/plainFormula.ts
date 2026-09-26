// A formula written the way a student writes it, for every sentence a person reads: the picture
// note in Problem Sets and the problem rows of Question Author's preview. Headless.

import type { ConstantNode, MathNode, OperatorNode, ParenthesisNode } from 'mathjs'
import { math, preprocess } from '../math/expr'

/** The powers the calculator reads back as superscripts (preprocess turns ², ³ and ⁻¹ into ^). */
const SUPERSCRIPT: Record<string, string> = { '2': '²', '3': '³', '-1': '⁻¹' }

/**
 * A bound formula written the way a student writes it: 3x² − 2x, not mathjs's 3 * x ^ 2 - 2 * x,
 * which is programming (rule 2). It stays something the command bar reads back, because it
 * becomes the graph's equation and editing that equation runs it as a command: ² ³ ⁻¹ and −
 * are what `preprocess` understands, a number before a letter or a bracket is a product, and
 * every other product is ×.
 */
export function plainFormula(expr: string): string {
  const letterLike = (n: MathNode): boolean =>
    n.type === 'SymbolNode' ||
    n.type === 'FunctionNode' ||
    n.type === 'ParenthesisNode' ||
    (n.type === 'OperatorNode' && (n as OperatorNode).fn === 'pow' && letterLike((n as OperatorNode).args[0]))
  const options = {
    handler: (node: MathNode, o: unknown): string | undefined => {
      if (node.type !== 'OperatorNode') return undefined
      const op = node as OperatorNode
      const s = (n: MathNode): string => n.toString(o as never)
      if (op.fn === 'pow' && op.args.length === 2) {
        const [base, exp] = op.args
        const inner = exp.type === 'ParenthesisNode' ? (exp as ParenthesisNode).content : exp
        const negated = inner.type === 'OperatorNode' && (inner as OperatorNode).fn === 'unaryMinus' ? (inner as OperatorNode).args[0] : null
        const key =
          inner.type === 'ConstantNode'
            ? String((inner as ConstantNode).value)
            : negated?.type === 'ConstantNode'
              ? `-${String((negated as ConstantNode).value)}`
              : ''
        return SUPERSCRIPT[key] ? `${s(base)}${SUPERSCRIPT[key]}` : `${s(base)}^${s(exp)}`
      }
      if (op.fn === 'multiply' && op.args.length === 2) {
        const [a, b] = op.args
        return a.type === 'ConstantNode' && letterLike(b) ? `${s(a)}${s(b)}` : `${s(a)} × ${s(b)}`
      }
      return undefined
    }
  }
  // The proper minus, except inside a number's own exponent (1e-7).
  return math.parse(preprocess(expr)).toString(options).replace(/(?<![0-9]e)-/g, '−')
}
