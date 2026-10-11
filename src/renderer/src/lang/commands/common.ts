// The command bar's shared pieces: reading a line into a node, the names it may use, its sentences for a value, and the vector helpers the routes share.
// Out of commands.ts as a pure move (CLEANUP-PLAN.md CW10).

import type { MathNode } from 'mathjs'
import { scene } from '../../core/store'
import { freeCapitals } from '../../core/naming'
import type { Computed } from '../../core/types'
import { inferKind, math, preprocess, sceneNames, splitArgs, symbolsOf, type ValueKind } from '../../math/expr'
import { tex, texIJK, texMeasure, texPrecise, type Precision } from '../../math/format'
import { heading, len, type V3 } from '../../math/vec'
import { polygonArea } from '../../math/geometry'
import { evaluateWithRealRoots } from '../../calc/engine'
import { TYPE_INSTEAD, unknownUnit } from '../../calc/units'

export type Node = MathNode & Record<string, unknown>

export const GRAPH_VARS = new Set(['x', 'y'])

export function logError(input: string, message: string) {
  scene().pushLog({ input, kind: 'error', text: message })
}

export const kindOfName = (name: string): ValueKind | undefined => {
  const { ev, objects } = scene()
  const id = ev.names.get(name)
  if (!id) return undefined
  const o = objects[id]
  if (o.type === 'point') return 'point'
  if (o.type === 'vector') return 'vector'
  return 'number'
}

/**
 * A name for an example in a sentence ("call it something else, e.g. P = (1, 2)"): the first of these
 * letters that no object in the scene has, else a free capital. Typing an example with a name that is
 * taken would redefine that object, and the student may copy the example as it stands.
 */
export function freeLetterFor(letters: string): string {
  const names = scene().ev.names
  return letters.split('').find((n) => !names.has(n)) ?? freeCapitals(names.keys(), 1)[0]
}

/** True when the expression uses no scene objects or variables (only numbers, π, e and units). */
export const isConstant = (node: MathNode) => {
  const names = scene().ev.names
  return symbolsOf(node).every((s) => !names.has(s) && (s === 'pi' || s === 'e' || s === 'deg' || isUnitName(s)))
}

export function isUnitName(s: string): boolean {
  try {
    return math.Unit.isValuelessUnit(s)
  } catch {
    return false
  }
}

const KNOWN_SYMBOLS = new Set(['pi', 'e', 'i', 'j', 'k', 't', 'x', 'y', 'z', 'deg', 'rad', 'theta', 'Infinity', 'phi', 'tau'])

function isLiteralNumber(node: MathNode | undefined): boolean {
  if (!node) return false
  if (node.type === 'ConstantNode') return true
  if (node.type === 'OperatorNode') {
    const op = node as (MathNode & { fn?: string; args?: MathNode[] })
    if (op.fn === 'unaryMinus') return isLiteralNumber(op.args?.[0])
    if (op.fn === 'divide' || op.fn === 'multiply' || op.fn === 'pow') {
      return isLiteralNumber(op.args?.[0]) && isLiteralNumber(op.args?.[1])
    }
  }
  return false
}

function isUnitLeaf(node: MathNode | undefined): boolean {
  if (!node) return false
  if (node.type === 'SymbolNode') {
    const sName = (node as unknown as { name: string }).name
    return isUnitName(sName) && sName !== 'u'
  }
  if (node.type === 'OperatorNode') {
    const op = node as (MathNode & { fn?: string; args?: MathNode[]; implicit?: boolean })
    if (op.fn === 'pow') {
      const base = op.args?.[0]
      if (base?.type === 'SymbolNode') {
        const sName = (base as unknown as { name: string }).name
        return isUnitName(sName) && sName !== 'u' && isLiteralNumber(op.args?.[1])
      }
    }
    if (op.fn === 'multiply' && op.implicit === true) {
      return isUnitLeaf(op.args?.[0]) && isUnitLeaf(op.args?.[1])
    }
  }
  return false
}

function isNumberOrUnitQuantity(node: MathNode | undefined): boolean {
  if (!node) return false
  if (isLiteralNumber(node)) return true
  if (node.type === 'OperatorNode') {
    const op = node as (MathNode & { fn?: string; args?: MathNode[]; implicit?: boolean })
    if (op.fn === 'multiply' && op.implicit === true) {
      return isNumberOrUnitQuantity(op.args?.[0]) && isUnitLeaf(op.args?.[1])
    }
    if (op.fn === 'divide') {
      return isNumberOrUnitQuantity(op.args?.[0]) && isUnitLeaf(op.args?.[1])
    }
  }
  return false
}

function isNodeInUnitPosition(curr: MathNode, parents: { node: MathNode; path?: string }[]): boolean {
  const name = (curr as unknown as { name: string }).name
  const toAncestor = parents.find((p) => {
    const op = p.node as (MathNode & { fn?: string })
    return op.type === 'OperatorNode' && op.fn === 'to'
  })
  if (toAncestor) {
    const toNode = toAncestor.node as (MathNode & { args?: MathNode[] })
    const inTarget = parents.some((p) => p.node === toNode && p.path === 'args[1]')
    if (inTarget) return true
    const inSource = parents.some((p) => p.node === toNode && p.path === 'args[0]')
    if (inSource) {
      if (toNode.args?.[0] === curr) return true
      const immediateParent = parents[parents.length - 1]
      if (immediateParent) {
        const p = immediateParent.node as (MathNode & { fn?: string; args?: MathNode[]; implicit?: boolean })
        if (p.type === 'OperatorNode' && p.fn === 'multiply' && immediateParent.path === 'args[1]' && p.implicit === true && isNumberOrUnitQuantity(p.args?.[0])) {
          return true
        }
      }
    }
  }
  if (name === 'u') return false

  const immediateParent = parents[parents.length - 1]
  if (immediateParent) {
    const p = immediateParent.node as (MathNode & { fn?: string; args?: MathNode[]; implicit?: boolean })
    if (p.type === 'OperatorNode' && p.fn === 'multiply' && immediateParent.path === 'args[1]' && p.implicit === true && isNumberOrUnitQuantity(p.args?.[0])) {
      return true
    }
  }

  if (isUnitName(name) && immediateParent) {
    const p = immediateParent.node as (MathNode & { fn?: string; args?: MathNode[] })
    if (p.type === 'OperatorNode' && p.fn === 'divide' && immediateParent.path === 'args[1]') {
      if (isNumberOrUnitQuantity(p.args?.[0])) {
        return true
      }
    }
    if (p.type === 'OperatorNode' && p.fn === 'pow' && immediateParent.path === 'args[0]') {
      const grandParent = parents[parents.length - 2]
      if (grandParent) {
        const gp = grandParent.node as (MathNode & { fn?: string; args?: MathNode[]; implicit?: boolean })
        if (gp.type === 'OperatorNode' && gp.fn === 'multiply' && grandParent.path === 'args[1]' && gp.implicit === true && isNumberOrUnitQuantity(gp.args?.[0])) {
          return true
        }
        if (gp.type === 'OperatorNode' && gp.fn === 'divide' && grandParent.path === 'args[1]' && isNumberOrUnitQuantity(gp.args?.[0])) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * Names that are neither scene objects nor constants. Physical units (N, m/s…) are only
 * accepted right after a number ("10 N"), so an undefined vector B is not mistaken for "byte".
 */
export function unknownSymbols(node: MathNode): string[] {
  const names = scene().ev.names
  const out = new Set<string>()

  function walk(curr: MathNode, parents: { node: MathNode; path?: string }[]) {
    if (curr.type === 'SymbolNode') {
      const immediateParent = parents[parents.length - 1]
      if (immediateParent?.node.type === 'FunctionNode' && immediateParent.path === 'fn') return
      const name = (curr as unknown as { name: string }).name
      // A θ slider is in the scope as theta too (core/evaluate.ts publish, P-PARSE W2).
      if (names.has(name) || Object.prototype.hasOwnProperty.call(scene().ev.scope, name) || KNOWN_SYMBOLS.has(name)) return
      const p = immediateParent?.node as (MathNode & { fn?: string | { name?: string }; implicit?: boolean; args?: MathNode[] }) | undefined
      // A function's name as the size before ∠ ("sin at 30"): polarVec says the size must be a number,
      // which is the sentence that helps (browser check BAR-16, F4). Only there: elsewhere a function
      // name typed as a value (a = gamma, 5 * distance) keeps "does not exist yet" (it is not a value).
      const fnName = p?.type === 'FunctionNode' && typeof p.fn === 'object' ? p.fn?.name : undefined
      if (fnName === 'polarVec' && immediateParent?.path === 'args[0]' && typeof (math as unknown as Record<string, unknown>)[name] === 'function') return
      if (isUnitName(name) && isNodeInUnitPosition(curr, parents)) return
      out.add(name)
      return
    }
    curr.forEach((child, path) => {
      walk(child, [...parents, { node: curr, path }])
    })
  }

  walk(node, [])
  return [...out]
}

export function assertKnown(node: MathNode) {
  const names = scene().ev.names
  let firstUnknownError: Error | undefined

  function walk(curr: MathNode, parents: { node: MathNode; path?: string }[]) {
    if (firstUnknownError) return
    if (curr.type === 'SymbolNode') {
      const immediateParent = parents[parents.length - 1]
      if (immediateParent?.node.type === 'FunctionNode' && immediateParent.path === 'fn') return
      const name = (curr as unknown as { name: string }).name
      if (names.has(name) || Object.prototype.hasOwnProperty.call(scene().ev.scope, name) || KNOWN_SYMBOLS.has(name)) return

      const p = immediateParent?.node as (MathNode & { fn?: string | { name?: string }; implicit?: boolean; args?: MathNode[] }) | undefined
      const fnName = p?.type === 'FunctionNode' && typeof p.fn === 'object' ? p.fn?.name : undefined
      if (fnName === 'polarVec' && immediateParent?.path === 'args[0]' && typeof (math as unknown as Record<string, unknown>)[name] === 'function') return

      if (isUnitName(name) && isNodeInUnitPosition(curr, parents)) return

      if (Object.hasOwn(TYPE_INSTEAD, name) && isNodeInUnitPosition(curr, parents)) {
        firstUnknownError = new Error(unknownUnit(name, true))
      } else {
        firstUnknownError = new Error(`"${name}" does not exist yet. Create it first, for example  ${name} = <1, 2>  or  ${name} = (1, 2)  or  ${name} = 5`)
      }
      return
    }

    curr.forEach((child, path) => {
      walk(child, [...parents, { node: curr, path }])
    })
  }

  walk(node, [])
  if (firstUnknownError) throw firstUnknownError
}

// An odd root of a negative number is the real root, (−8)^(1/3) = −2, as on the Calculator (owner, 2026-10-08).
export const evaluateNode = (node: MathNode) => evaluateWithRealRoots(node, { ...scene().ev.scope }).value

export const isGeo = (node: MathNode) => {
  const k = inferKind(node, kindOfName)
  return k === 'vector' || k === 'point'
}

/**
 * The × key is parsed as `timesOrCross`, which only decides what it means at evaluation time.
 * Kind inference and the step solver never learned that name, so `A × B` printed a bare
 * `[0, 0, -11]` with no steps and `C = A × B` refused with "not a number". Once the operands are
 * known the call is rewritten into the cross product or the ordinary product it stands for.
 * The · key (dot) is the same: between two vectors it stays the dot product, and with a number on
 * either side it is the ordinary product — `2·A` printed a vector with no steps and `C = 2·A` made
 * one with none, because only a `*` reaches the scalar-multiple steps.
 */
function resolveTimes(node: MathNode): MathNode {
  return node.transform((n) => {
    const fn = n as Node
    if (fn.type !== 'FunctionNode') return n
    const fname = (fn.fn as { name?: string }).name
    const args = fn.args as MathNode[]
    // A word-form dot(A) or dot(A, B, C) is left to say in its own words what it is missing.
    if ((fname !== 'timesOrCross' && fname !== 'dot') || args.length !== 2) return n
    const a = resolveTimes(args[0])
    const b = resolveTimes(args[1])
    if (isGeo(a) && isGeo(b)) return new math.FunctionNode(fname === 'dot' ? 'dot' : 'cross', [a, b])
    return new math.OperatorNode('*', 'multiply', [a, b])
  })
}

export const parseNode = (src: string): Node => resolveTimes(math.parse(preprocess(src, sceneNames()))) as Node

/** A number in LaTeX at a fixed number of decimals, or in the student's own precision. */
export const texAt = (n: number, p: Precision): string => (typeof p === 'number' ? tex(n, p) : texPrecise(n, p))

export function describeComputed(c: Computed | undefined, decimals: Precision = 3): string {
  if (!c) return '—'
  switch (c.type) {
    case 'point':
      return `(${c.p.map((v) => texAt(v, decimals)).join(', ')})`
    case 'vector':
      return `${texIJK(c.comp, decimals)}`
    case 'number':
      return texAt(c.value, decimals)
    case 'segment':
      return `\\text{length } ${texAt(len(c.line.d), decimals)}`
    case 'ray':
    case 'line':
      return `\\text{line through } (${c.line.p.slice(0, 2).map((v) => texAt(v, decimals)).join(', ')})`
    case 'circle':
      return `\\text{circle, } r = ${texAt(c.circle.r, decimals)}`
    case 'polygon':
      return `\\text{${c.pts.length === 3 ? 'triangle' : 'polygon'}, area } ${texAt(polygonArea(c.pts), decimals)}`
    case 'angle':
      return texMeasure(c.value, 'angle', scene().settings)
    default:
      return ''
  }
}

/**
 * A bracket the bar takes for a vector literal: a comma inside, and no <, >, = or angle bracket within.
 * relationsIn and splitInputs share it. It is a copy of preprocess's own rule (math/expr.ts
 * angleVectors), not a call to it, and the two differ on a few lines — B = k<1, 2> + <3, 4> is one
 * assignment to preprocess and "several equations" here — so one rule for both would change what the
 * bar says: parked for the owner (OWNER-APPROVALS CW6a-2, tests/readerRules.test.ts).
 */
export const VECTOR_LITERAL = /[⟨<][^<>=⟨⟩]*,[^<>=⟨⟩]*[⟩>]/g

export function vectorExtras(v: V3): string {
  const s = scene().settings
  const m = texPrecise(len(v), s)
  // eslint-disable-next-line no-restricted-syntax -- mirrors the number writer's display floor: θ is given while texIJK writes no z (under 10⁻¹²); a z of exactly 10⁻¹², and a vector wholly under the floor, are found bugs (tests/noiseFloors.test.ts)
  if (Math.abs(v[2]) > 1e-12) return `,\\quad \\text{magnitude } ${m}`
  return `,\\quad \\text{magnitude } ${m},\\ \\theta = ${texMeasure(heading(v), 'direction', s)}`
}

/** For `A + B + C` with vector symbols returns ['A','B','C']. */
export function sumOperands(node: MathNode): string[] | null {
  const out: string[] = []
  const walk = (n: Node): boolean => {
    if (n.type === 'ParenthesisNode') return walk(n.content as Node)
    if (n.type === 'OperatorNode' && n.fn === 'add') return (n.args as Node[]).every(walk)
    if (n.type === 'SymbolNode' && kindOfName(n.name as string) === 'vector') {
      out.push(n.name as string)
      return true
    }
    return false
  }
  return walk(node as Node) && out.length >= 2 ? out : null
}

/**
 * A command's inputs with a vector typed in angle brackets kept whole: angle(<1, 0>, <0, 1>) was once
 * four inputs, "<1" among them. splitArgs (math/expr.ts) now keeps a vector whole by preprocess's own
 * rule; this holds every bracket VECTOR_LITERAL takes for one, a comparison too (angle(x < 3, y > 1)
 * is one input here and two to splitArgs), so splitArgs alone would change a command's inputs: parked
 * with relationsIn (OWNER-APPROVALS CW6a-2).
 */
export function splitInputs(s: string): string[] {
  const held = s.replace(VECTOR_LITERAL, (vector) => vector.replace(/,/g, '\u0001'))
  // split/join, not a regex: a control character in a regex literal is a lint error (no-control-regex).
  return splitArgs(held).map((a) => a.split('\u0001').join(','))
}
