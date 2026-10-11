// A formula written the way a student writes it, for every sentence a person reads: the picture
// note in Problem Sets. Headless.

import type { ConstantNode, MathNode, OperatorNode, ParenthesisNode } from 'mathjs'
import { math, preprocess } from '../math/expr'

/**
 * A whole-number power raised, as `preprocess` reads it back (x⁴ is x^4, x⁻² is x^(-2), x¹² is
 * x^12); null for any other power. Only ², ³ and ⁻¹ were raised once, so a picture note or a
 * condition sentence read "x^4" — programming on screen (rule 2).
 */
const RAISED: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }
const raised = (power: string): string | null => (/^-?\d+$/.test(power) ? [...power].map((c) => RAISED[c]).join('') : null)

type AstHandler = (node: MathNode, recurse: (n: MathNode) => string) => string | undefined

/**
 * Custom mathjs AST printer: walks the tree, allowing custom handlers to format specific nodes
 * and recurse via the provided callback.
 */
export function printMathAst(node: MathNode, handler: AstHandler): string {
  return node.toString({
    handler: (n: MathNode, o: unknown): string | undefined => handler(n, (child) => child.toString(o as never))
  })
}

/**
 * A bound formula written the way a student writes it: 3x² − 2x, not mathjs's 3 * x ^ 2 - 2 * x,
 * which is programming (rule 2). It stays something the command bar reads back, because it
 * becomes the graph's equation and editing that equation runs it as a command: raised whole
 * powers and − are what `preprocess` understands, a number before a letter or a bracket is a
 * product, and every other product is ×.
 */
export function plainFormula(expr: string): string {
  const letterLike = (n: MathNode): boolean =>
    n.type === 'SymbolNode' ||
    n.type === 'FunctionNode' ||
    n.type === 'ParenthesisNode' ||
    (n.type === 'OperatorNode' && (n as OperatorNode).fn === 'pow' && letterLike((n as OperatorNode).args[0]))
  const root = math.parse(preprocess(expr))
  const formatted = printMathAst(root, (node, s) => {
    if (node.type !== 'OperatorNode') return undefined
    const op = node as OperatorNode
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
      const up = raised(key)
      return up ? `${s(base)}${up}` : `${s(base)}^${s(exp)}`
    }
    if (op.fn === 'multiply' && op.args.length === 2) {
      const [a, b] = op.args
      return a.type === 'ConstantNode' && letterLike(b) ? `${s(a)}${s(b)}` : `${s(a)} × ${s(b)}`
    }
    return undefined
  })
  // The proper minus, except inside a number's own exponent (1e-7).
  return formatted.replace(/(?<![0-9]e)-/g, '−')
}
