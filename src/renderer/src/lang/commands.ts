// The PhysLab command bar: calculator-style one-liners that create live objects.
//   A = (3, 4)      B = 10 N ∠ 30°     R = A + B      A × B      |R|
//   Triangle((0,0), (4,0), (0,3))      Circle(P, 3)   y = sin(x)  solve(x^2 - 5x + 6 = 0)

import type { MathNode } from 'mathjs'
import { Builder } from '../core/factory'
import { scene } from '../core/store'
import { parseExpr } from '../core/evaluate'
import { freeCapitals, isValidName } from '../core/naming'
import type { Computed, ObjId, SceneObject } from '../core/types'
import { visualizeGraph, visualizePoint, visualizeSolution, visualizeVector } from '../core/visualize'
import { cas } from '../math/cas'
import { inferKind, isUnit, math, plainNumber, preprocess, splitArgs, symbolsOf, toV3, type ValueKind } from '../math/expr'
import { fmtPrecise, tex, texIJK, texMeasure, texPrecise, type Precision } from '../math/format'
import { heading, len, type V3 } from '../math/vec'
import { polygonArea } from '../math/geometry'
import * as VS from '../math/vectorSolver'
import { linearToLatex, runPure, type JobId } from '../math/pure/run'
import { calculusUnitNote, casInDegrees } from '../calc/angle'
import { casRequestFor, usePure } from '../math/pure/store'
import { showPanel } from '../app/panels'

type Node = MathNode & Record<string, unknown>

const GRAPH_VARS = new Set(['x', 'y'])

function logError(input: string, message: string) {
  scene().pushLog({ input, kind: 'error', text: message })
}

const kindOfName = (name: string): ValueKind | undefined => {
  const { ev, objects } = scene()
  const id = ev.names.get(name)
  if (!id) return undefined
  const o = objects[id]
  if (o.type === 'point') return 'point'
  if (o.type === 'vector') return 'vector'
  return 'number'
}

/** True when the expression uses no scene objects or variables (only numbers, π, e and units). */
const isConstant = (node: MathNode) => {
  const names = scene().ev.names
  return symbolsOf(node).every((s) => !names.has(s) && (s === 'pi' || s === 'e' || s === 'deg' || isUnitName(s)))
}

function isUnitName(s: string): boolean {
  try {
    return math.Unit.isValuelessUnit(s)
  } catch {
    return false
  }
}

const KNOWN_SYMBOLS = new Set(['pi', 'e', 'i', 'j', 'k', 't', 'x', 'y', 'z', 'deg', 'rad', 'theta', 'Infinity', 'phi', 'tau'])

/**
 * Names that are neither scene objects nor constants. Physical units (N, m/s…) are only
 * accepted right after a number ("10 N"), so an undefined vector B is not mistaken for "byte".
 */
function unknownSymbols(node: MathNode): string[] {
  const names = scene().ev.names
  const out = new Set<string>()
  node.traverse((child, path, parent) => {
    if (child.type !== 'SymbolNode') return
    if (parent?.type === 'FunctionNode' && path === 'fn') return
    const name = (child as unknown as { name: string }).name
    if (names.has(name) || KNOWN_SYMBOLS.has(name)) return
    const p = parent as (MathNode & { fn?: string; implicit?: boolean; args?: MathNode[] }) | null
    const afterNumber = p?.type === 'OperatorNode' && (p.fn === 'multiply' || p.fn === 'divide') && p.args?.some((a) => a.type === 'ConstantNode' || a.type === 'OperatorNode')
    const compoundUnit = p?.type === 'OperatorNode' && (p.fn === 'divide' || p.fn === 'pow') && isUnitName(name)
    if (isUnitName(name) && (afterNumber || compoundUnit)) return
    out.add(name)
  })
  return [...out]
}

function assertKnown(node: MathNode) {
  const unknown = unknownSymbols(node)
  if (unknown.length) {
    const n = unknown[0]
    throw new Error(`"${n}" does not exist yet. Create it first, for example  ${n} = <1, 2>  or  ${n} = (1, 2)  or  ${n} = 5`)
  }
}

const evaluateNode = (node: MathNode) => node.compile().evaluate({ ...scene().ev.scope })

const isGeo = (node: MathNode) => {
  const k = inferKind(node, kindOfName)
  return k === 'vector' || k === 'point'
}

/**
 * The × key is parsed as `timesOrCross`, which only decides what it means at evaluation time.
 * Kind inference and the step solver never learned that name, so `A × B` printed a bare
 * `[0, 0, -11]` with no steps and `C = A × B` refused with "not a number". Once the operands are
 * known the call is rewritten into the cross product or the ordinary product it stands for.
 */
function resolveTimes(node: MathNode): MathNode {
  return node.transform((n) => {
    const fn = n as Node
    if (fn.type !== 'FunctionNode' || (fn.fn as { name?: string }).name !== 'timesOrCross') return n
    const a = resolveTimes((fn.args as MathNode[])[0])
    const b = resolveTimes((fn.args as MathNode[])[1])
    if (isGeo(a) && isGeo(b)) return new math.FunctionNode('cross', [a, b])
    return new math.OperatorNode('*', 'multiply', [a, b])
  })
}

const parseNode = (src: string): Node => resolveTimes(math.parse(preprocess(src))) as Node

/** A number in LaTeX at a fixed number of decimals, or in the student's own precision. */
const texAt = (n: number, p: Precision): string => (typeof p === 'number' ? tex(n, p) : texPrecise(n, p))

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

// ---------------------------------------------------------------------------

export async function runCommand(raw: string): Promise<void> {
  const input = raw.trim()
  if (!input) return
  const lower = input.toLowerCase()
  const s = scene()

  if (lower === 'clear' || lower === 'new') {
    s.newScene()
    s.pushLog({ input, kind: 'info', text: 'Scene cleared.' })
    return
  }
  if (lower === 'undo') return s.undo()
  if (lower === 'redo') return s.redo()
  if (lower === 'play') return s.setPlaying(true)
  if (lower === 'pause' || lower === 'stop') return s.setPlaying(false)
  if (lower === '2d' || lower === '3d') return s.setViewMode(lower)
  if (lower === 'help' || lower === '?') {
    s.pushLog({ input, kind: 'info', text: HELP })
    return
  }
  const del = input.match(/^(?:delete|del|remove)\s+(.+)$/i)
  if (del) {
    const ids = del[1].split(/[,\s]+/).map((n) => s.ev.names.get(n)).filter(Boolean) as ObjId[]
    if (!ids.length) return logError(input, 'Nothing with that name.')
    s.removeObjects(ids)
    s.pushLog({ input, kind: 'info', text: `Deleted ${del[1]}.` })
    return
  }

  try {
    if (tryPureMath(input)) return
    if (await tryCas(input)) return
    if (tryGraph(input)) return
    if (tryAssignment(input)) return
    if (tryGeometryCommand(input, undefined)) return
    if (trySolverCommand(input)) return
    evaluatePlain(input)
  } catch (e) {
    logError(input, friendlyError(e))
  }
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/Undefined symbol (\w+)/.test(msg)) return `I don't know "${msg.match(/Undefined symbol (\w+)/)![1]}". Create it first, e.g. ${msg.match(/Undefined symbol (\w+)/)![1]} = (1, 2).`
  if (/Unexpected end/.test(msg)) return 'The expression is incomplete. Check your brackets.'
  return msg
}

// ---------------------------------------------------------------------------
// Graphs: y = f(x), f(x) = ..., z = f(x,y), r = f(θ), implicit, inequalities, curves
// ---------------------------------------------------------------------------

function tryGraph(input: string): boolean {
  let m: RegExpMatchArray | null
  const s = scene()

  if ((m = input.match(/^\s*y\s*=\s*(.+)$/)) && !usesSymbol(m[1], 'y')) {
    graphIfFunctionOfX(input, m[1], undefined)
    return true
  }
  if ((m = input.match(/^\s*([A-Za-z]\w*)\s*\(\s*x\s*\)\s*=\s*(.+)$/))) {
    graphIfFunctionOfX(input, m[2], m[1])
    return true
  }
  if ((m = input.match(/^\s*z\s*=\s*(.+)$/))) {
    visualizeGraph(input, [m[1]], 'surface')
    s.pushLog({ input, kind: 'result', text: 'Surface created in the 3D view.' })
    return true
  }
  if ((m = input.match(/^\s*r\s*=\s*(.+)$/)) && /θ|theta/.test(m[1])) {
    visualizeGraph(input, [m[1].replace(/θ/g, 'theta')], 'polar', { tMin: 0, tMax: 2 * Math.PI })
    s.pushLog({ input, kind: 'result', text: 'Polar curve created.' })
    return true
  }
  if ((m = input.match(/^\s*curve\s*\((.+)\)\s*$/i))) {
    const parts = splitArgs(m[1])
    if (parts.length < 2) throw new Error('curve(x(t), y(t), tmin, tmax)')
    const tMin = parts[2] ? Number(math.evaluate(preprocess(parts[2]))) : 0
    const tMax = parts[3] ? Number(math.evaluate(preprocess(parts[3]))) : 2 * Math.PI
    visualizeGraph(input, [parts[0], parts[1]], 'parametric', { tMin, tMax })
    s.pushLog({ input, kind: 'result', text: 'Parametric curve created.' })
    return true
  }
  const ineq = input.match(/^(.+?)(<=|>=|<|>)(.+)$/)
  if (ineq && !/[<>].*[<>]/.test(input.replace(ineq[2], '')) && (usesSymbol(input, 'x') || usesSymbol(input, 'y'))) {
    const op = ineq[2] as '<' | '<=' | '>' | '>='
    visualizeGraph(input, [`(${ineq[1]}) - (${ineq[3]})`], 'inequality', { op })
    s.pushLog({ input, kind: 'result', text: 'Shaded region created.' })
    return true
  }
  const eq = input.match(/^([^=]+)=([^=]+)$/)
  if (eq && (usesSymbol(input, 'x') || usesSymbol(input, 'y'))) {
    const lhs = eq[1].trim()
    const isName = /^[A-Za-zͰ-Ͽ][\w']*$/.test(lhs) && !GRAPH_VARS.has(lhs)
    if (!isName) {
      visualizeGraph(input, [`(${eq[1]}) - (${eq[2]})`], 'implicit')
      s.pushLog({ input, kind: 'result', text: 'Implicit curve created.' })
      return true
    }
  }
  return false
}

function graphIfFunctionOfX(input: string, rhs: string, name?: string) {
  const node = parseExpr(rhs).node
  const syms = symbolsOf(node).filter((n) => !scene().ev.names.has(n) && n !== 'pi' && n !== 'e')
  const unknown = syms.filter((n) => n !== 'x')
  if (unknown.length) throw new Error(`Unknown name "${unknown[0]}" in the function. Make a slider first, e.g. ${unknown[0]} = 1`)
  visualizeGraph(input, [rhs], 'explicit', { name })
  scene().pushLog({ input, kind: 'result', text: 'Graph created. Roots and turning points are marked.' })
}

function usesSymbol(src: string, sym: string): boolean {
  try {
    return symbolsOf(math.parse(preprocess(src.replace(/(<=|>=|<|>|=)/g, ',')))).includes(sym)
  } catch {
    return new RegExp(`(^|[^A-Za-z_])${sym}([^A-Za-z_(]|$)`).test(src)
  }
}

// ---------------------------------------------------------------------------
// Assignments: name = expression | geometry command
// ---------------------------------------------------------------------------

function tryAssignment(input: string): boolean {
  const m = input.match(/^\s*([A-Za-zͰ-Ͽ][\wͰ-Ͽ']*)\s*=(?!=)\s*(.+)$/)
  if (!m) return false
  const [, name, rhs] = m
  if (GRAPH_VARS.has(name) || name === 'z') return false
  if (!isValidName(name)) throw new Error(`"${name}" is a reserved name. Try another.`)
  if (tryGeometryCommand(rhs, name, input)) return true

  // The line is kept as typed: the runtime × (math/expr.ts, timesOrCross) reads every case the
  // bar does, so `C = 2 × A` stays `2 × A` in the Properties field instead of becoming `2 * A`.
  const node = parseNode(rhs)
  const expr = rhs
  const unknown = unknownSymbols(node).filter((s) => s !== name)
  if (unknown.length) assertKnown(node)
  const kind = inferKind(node, kindOfName)
  const existing = scene().ev.names.get(name)
  const b = new Builder()
  let obj: SceneObject

  if (kind === 'point') {
    obj = isConstant(node) ? b.point(toV3(evaluateNode(node)), { name }) : b.point({ kind: 'expr', expr }, { name })
  } else if (kind === 'vector') {
    const unit = unitOf(node)
    if (isConstant(node)) {
      obj = b.vector({ kind: 'free', tail: [0, 0, 0], comp: toV3(evaluateNode(node)) }, { name, unit })
    } else {
      const addends = sumOperands(node)
      const first = addends?.[0] ? scene().ev.names.get(addends[0]) : undefined
      obj = b.vector({ kind: 'expr', expr, tailOf: first }, { name, unit, color: addends ? '#ffd43b' : undefined })
      if (addends && addends.length >= 2) addHeadToTailHelpers(b, addends)
    }
  } else {
    const constant = isConstant(node)
    const value = constant ? Number(evaluateNode(node)) : NaN
    if (constant && Number.isFinite(value)) {
      const span = Math.max(10, Math.ceil(Math.abs(value) * 2))
      obj = b.number(expr, { name, slider: { min: value < 0 ? -span : Math.min(0, -span / 2), max: span, step: Math.abs(value) < 1 && value !== 0 ? 0.01 : 0.1 } })
    } else {
      obj = b.number(expr, { name })
    }
  }

  if (existing) redefine(existing, obj, b)
  else b.commit()

  const c = scene().ev.values.get(scene().ev.names.get(name) ?? '')
  const err = scene().ev.errors.get(scene().ev.names.get(name) ?? '')
  if (err) {
    scene().pushLog({ input, kind: 'error', text: `${name}: ${err}` })
    return true
  }
  const solution = solutionFor(node, name)
  scene().pushLog({
    input,
    kind: 'result',
    tex: `${name} = ${describeComputed(c, scene().settings)}${c?.type === 'vector' ? vectorExtras(c.comp) : ''}`,
    solution: solution ?? undefined
  })
  return true
}

function vectorExtras(v: V3): string {
  const s = scene().settings
  const m = texPrecise(len(v), s)
  if (Math.abs(v[2]) > 1e-12) return `,\\quad \\text{magnitude } ${m}`
  return `,\\quad \\text{magnitude } ${m},\\ \\theta = ${texMeasure(heading(v), 'direction', s)}`
}

function unitOf(node: MathNode): string | undefined {
  let unit: string | undefined
  node.traverse((n) => {
    if (n.type === 'SymbolNode') {
      const nm = (n as unknown as { name: string }).name
      if (nm !== 'deg' && nm !== 'rad' && !scene().ev.names.has(nm) && isUnitName(nm)) unit ??= nm
    }
  })
  return unit
}

/** For `A + B + C` with vector symbols returns ['A','B','C']. */
function sumOperands(node: MathNode): string[] | null {
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

/** Faint copies of B, C… placed head-to-tail after A, linked live. */
function addHeadToTailHelpers(b: Builder, names: string[]) {
  const ids = names.map((n) => scene().ev.names.get(n)!)
  let prev = ids[0]
  for (let i = 1; i < ids.length; i++) {
    // The hidden tail point is named after the copy it carries, not from the shared A, B, C…
    // alphabet: after `R = A + B` it used to take the name C, and the student's next line
    // `C = <-1, 2>` quietly replaced it, leaving B′ hanging off a vector instead of a point.
    const head = b.point({ kind: 'vectorHead', vector: prev }, { name: `${names[i]}′tail`, auxiliary: true, visible: false })
    const placed = b.vector({ kind: 'placed', vector: ids[i], tail: head.id }, { name: `${names[i]}′`, color: '#868e96', auxiliary: true })
    prev = placed.id
  }
}

/** Replace one object id with another wherever it is used, without touching text or colours. */
function remapIds<T>(value: T, from: ObjId, to: ObjId): T {
  if (typeof value === 'string') return (value === from ? to : value) as T
  if (Array.isArray(value)) return value.map((v) => remapIds(v, from, to)) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = remapIds(v, from, to)
    return out as T
  }
  return value
}

function redefine(existingId: ObjId, obj: SceneObject, b: Builder) {
  const s = scene()
  const old = s.objects[existingId]
  const replaced = { ...obj, id: existingId, name: old.name, color: old.type === obj.type ? old.color : obj.color } as SceneObject
  const others = b.created.filter((o) => o.id !== obj.id)
  // Children created alongside (e.g. helper points) that referenced the new id must point at the old id.
  const fixed = others.map((o) => remapIds(o, obj.id, existingId) as SceneObject)
  s.addObjects([replaced, ...fixed], { select: true })
}

// ---------------------------------------------------------------------------
// Geometry commands
// ---------------------------------------------------------------------------

const GEO_ALIASES: Record<string, string> = {
  point: 'Point', segment: 'Segment', line: 'Line', ray: 'Ray', circle: 'Circle', polygon: 'Polygon', triangle: 'Triangle',
  midpoint: 'Midpoint', perpendicular: 'Perpendicular', parallel: 'Parallel', perpendicularbisector: 'PerpendicularBisector',
  perpbisector: 'PerpendicularBisector', anglebisector: 'AngleBisector', intersect: 'Intersect', intersection: 'Intersect',
  angle: 'Angle', vector: 'Vector', slider: 'Slider', tangent: 'Tangent', centroid: 'Centroid', circumcenter: 'Circumcenter',
  incenter: 'Incenter', orthocenter: 'Orthocenter', text: 'Text', square: 'Square', regularpolygon: 'RegularPolygon'
}

function tryGeometryCommand(src: string, name: string | undefined, fullInput = src): boolean {
  const m = src.match(/^\s*([A-Za-z]+)\s*\((.*)\)\s*$/)
  if (!m) return false
  const cmd = GEO_ALIASES[m[1].toLowerCase()]
  if (!cmd) return false
  // `angle(A, B)` with two vectors is a solver request, not a geometry angle.
  const rawArgs = splitArgs(m[2])
  if (cmd === 'Angle' && rawArgs.length === 2 && rawArgs.every((a) => kindOfName(a) === 'vector')) return false
  if (cmd === 'Vector' && rawArgs.length === 2 && rawArgs.every((a) => kindOfName(a) === 'vector')) return false

  const b = new Builder()
  const names = scene().ev.names
  const objects = () => ({ ...scene().objects, ...Object.fromEntries(b.created.map((o) => [o.id, o])) })

  const ref = (arg: string): ObjId => {
    const trimmed = arg.trim()
    const id = names.get(trimmed)
    if (id) return id
    const node = parseNode(trimmed)
    const kind = inferKind(node, kindOfName)
    if (kind === 'point' || kind === 'vector') {
      return isConstant(node)
        ? b.point(toV3(evaluateNode(node))).id
        : b.point({ kind: 'expr', expr: trimmed }).id
    }
    throw new Error(`"${trimmed}" is not a point or object`)
  }
  const typeOf = (id: ObjId) => objects()[id]?.type
  const opts = name ? { name } : {}
  let primary: SceneObject | undefined
  const a = rawArgs

  switch (cmd) {
    case 'Point':
      primary = a.length >= 2 ? b.point(toV3(math.evaluate(preprocess(`pt(${a.join(',')})`), { ...scene().ev.scope })), opts) : undefined
      break
    case 'Segment':
      if (a.length === 2) primary = b.segment(ref(a[0]), ref(a[1]), opts)
      break
    case 'Ray':
      if (a.length === 2) primary = b.ray(ref(a[0]), ref(a[1]), opts)
      break
    case 'Line': {
      if (a.length !== 2) break
      const p = ref(a[0])
      const q = ref(a[1])
      const qt = typeOf(q)
      primary = qt === 'line' || qt === 'segment' || qt === 'ray' || qt === 'vector'
        ? b.line({ kind: 'parallel', through: p, line: q }, opts)
        : b.line({ kind: 'twoPoints', a: p, b: q }, opts)
      break
    }
    case 'Circle': {
      if (a.length === 3) primary = b.circle({ kind: 'threePoints', a: ref(a[0]), b: ref(a[1]), c: ref(a[2]) }, opts)
      else if (a.length === 2) {
        const c = ref(a[0])
        const second = a[1].trim()
        const kind = names.has(second) ? kindOfName(second) : inferKind(parseNode(second), kindOfName)
        primary = kind === 'point'
          ? b.circle({ kind: 'centerPoint', c, p: ref(second) }, opts)
          : b.circle({ kind: 'centerRadius', c, r: second }, opts)
      }
      break
    }
    case 'Polygon':
    case 'Triangle': {
      if (a.length < 3) throw new Error(`${cmd} needs at least 3 points`)
      const pts = (cmd === 'Triangle' ? a.slice(0, 3) : a).map(ref)
      primary = b.polygon(pts, { ...opts, withSides: true })
      break
    }
    case 'Square':
    case 'RegularPolygon': {
      const p = ref(a[0])
      const q = ref(a[1])
      const n = cmd === 'Square' ? 4 : Number(math.evaluate(a[2] ?? '4'))
      const P = b.created.find((o) => o.id === p) ?? scene().objects[p]
      const Q = b.created.find((o) => o.id === q) ?? scene().objects[q]
      const pn = P.name
      const qn = Q.name
      const ids = [p, q]
      // Each next vertex is the previous one rotated about the vertex before it by the exterior angle.
      let prevName = pn
      let curName = qn
      for (let i = 2; i < n; i++) {
        const turn = (Math.PI * 2) / n
        const expr = `${curName} + [[cos(${turn} rad), -sin(${turn} rad), 0], [sin(${turn} rad), cos(${turn} rad), 0], [0, 0, 1]] * (${curName} - ${prevName})`
        const v = b.point({ kind: 'expr', expr })
        ids.push(v.id)
        prevName = curName
        curName = v.name
      }
      primary = b.polygon(ids, { ...opts, withSides: true })
      break
    }
    case 'Midpoint': {
      if (a.length === 2) primary = b.point({ kind: 'midpoint', a: ref(a[0]), b: ref(a[1]) }, opts)
      else if (a.length === 1) {
        const seg = objects()[ref(a[0])]
        if (seg?.type === 'segment') primary = b.point({ kind: 'midpoint', a: seg.a, b: seg.b }, opts)
      }
      break
    }
    case 'Perpendicular':
      if (a.length === 2) primary = b.line({ kind: 'perpendicular', through: ref(a[0]), line: ref(a[1]) }, opts)
      break
    case 'Parallel':
      if (a.length === 2) primary = b.line({ kind: 'parallel', through: ref(a[0]), line: ref(a[1]) }, opts)
      break
    case 'PerpendicularBisector': {
      if (a.length === 2) primary = b.line({ kind: 'perpBisector', a: ref(a[0]), b: ref(a[1]) }, opts)
      else if (a.length === 1) {
        const seg = objects()[ref(a[0])]
        if (seg?.type === 'segment') primary = b.line({ kind: 'perpBisector', a: seg.a, b: seg.b }, opts)
      }
      break
    }
    case 'AngleBisector':
      if (a.length === 3) primary = b.line({ kind: 'angleBisector', a: ref(a[0]), vertex: ref(a[1]), b: ref(a[2]) }, opts)
      break
    case 'Intersect': {
      if (a.length < 2) break
      const p = ref(a[0])
      const q = ref(a[1])
      const circles = [typeOf(p), typeOf(q)].filter((t) => t === 'circle').length
      if (a[2] !== undefined) primary = b.point({ kind: 'intersection', a: p, b: q, index: Number(a[2]) - 1 }, opts)
      else {
        primary = b.point({ kind: 'intersection', a: p, b: q, index: 0 }, opts)
        if (circles > 0) b.point({ kind: 'intersection', a: p, b: q, index: 1 })
      }
      break
    }
    case 'Angle':
      if (a.length === 3) primary = b.angle(ref(a[0]), ref(a[1]), ref(a[2]), opts)
      break
    case 'Vector': {
      if (a.length === 2) primary = b.vector({ kind: 'points', a: ref(a[0]), b: ref(a[1]) }, opts)
      else if (a.length === 1) {
        const node = parseNode(a[0])
        primary = b.vector({ kind: 'free', tail: [0, 0, 0], comp: toV3(evaluateNode(node)) }, opts)
      }
      break
    }
    case 'Slider': {
      const [val, min, max, step] = a.map((x) => Number(math.evaluate(preprocess(x))))
      primary = b.number(String(val ?? 1), { ...opts, slider: { min: min ?? -10, max: max ?? 10, step: step ?? 0.1 } })
      break
    }
    case 'Tangent': {
      if (a.length !== 2) break
      const p = ref(a[0])
      const c = ref(a[1])
      primary = b.line({ kind: 'tangent', point: p, circle: c, index: 0 }, opts)
      b.line({ kind: 'tangent', point: p, circle: c, index: 1 })
      break
    }
    case 'Centroid':
    case 'Circumcenter':
    case 'Incenter':
    case 'Orthocenter':
      if (a.length === 1) primary = b.point({ kind: 'triangleCenter', poly: ref(a[0]), which: cmd.toLowerCase() as 'centroid' }, opts)
      break
    case 'Text': {
      const text = a[0]?.replace(/^["']|["']$/g, '') ?? ''
      const pos = a[1] ? toV3(math.evaluate(preprocess(a[1]))) : ([0, 0, 0] as V3)
      primary = b.text(pos, text, opts)
      break
    }
  }

  if (!primary) throw new Error(`Wrong inputs for ${cmd}. Type "help" to see examples.`)
  const existing = name ? scene().ev.names.get(name) : undefined
  if (existing) redefine(existing, primary, b)
  else b.commit()
  const id = existing ?? primary.id
  const err = scene().ev.errors.get(id)
  scene().pushLog(
    err
      ? { input: fullInput, kind: 'error', text: `${scene().objects[id]?.name}: ${err}` }
      : { input: fullInput, kind: 'result', tex: `${scene().objects[id]?.name} = ${describeComputed(scene().ev.values.get(id), scene().settings)}` }
  )
  return true
}

// ---------------------------------------------------------------------------
// Vector solver commands with steps
// ---------------------------------------------------------------------------

interface VecArg {
  name: string
  v: V3
}

/**
 * Names the operands of one command for its steps. A symbol keeps its own name; anything else —
 * a literal `<1, 0>`, a sum `A + B` — needs a letter, and it must be one no object in the drawing
 * has: falling back to a fixed A or B put "B = 1i" in the working of `A × <1, 0>` while the
 * student's B was <2, −1>, and titled `cross(A + B, A)` "Vector product A×A". The result's own
 * letter goes through the same namer so it cannot collide with an operand either.
 */
function operandNamer(): { arg: (node: Node, preferred: string) => VecArg; letter: (preferred: string) => string } {
  const taken = new Set(scene().ev.names.keys())
  const letter = (preferred: string): string => {
    const name = taken.has(preferred) ? freeCapitals(taken, 1)[0] : preferred
    taken.add(name)
    return name
  }
  const arg = (node: Node, preferred: string): VecArg => {
    const name = node.type === 'SymbolNode' ? (node.name as string) : letter(preferred)
    return { name, v: toV3(evaluateNode(node)) }
  }
  return { arg, letter }
}

/**
 * Recognises vector operations written directly (A + B, A × B, |A|…) and builds a step-by-step
 * solution. `name` is what the result is being assigned to, so the steps say F for
 * `F = 10 N ∠ 30°` rather than the solver's default A.
 */
export function solutionFor(root: MathNode, name?: string): VS.Solution | null {
  let node = root as Node
  // The command bar answers in the student's own precision and angle unit, like the panels.
  const settings = scene().settings
  const result = name ?? 'R'
  while (node.type === 'ParenthesisNode') node = node.content as Node
  const vecSym = (n: Node) => n.type === 'SymbolNode' && kindOfName(n.name as string) === 'vector'
  const { arg: vecArg, letter } = operandNamer()
  try {
    if (node.type === 'OperatorNode') {
      const args = node.args as Node[]
      const sum = sumOperands(node)
      // A real SymbolNode, because vecArg evaluates it: a plain object shaped like one has no
      // compile(), and the throw was swallowed below, so `R = A + B` never had any steps.
      if (sum) return VS.solveAddition(sum.map((n) => vecArg(new math.SymbolNode(n) as unknown as Node, n)), result, settings)
      if (node.fn === 'subtract' && args.every(vecSym)) return VS.solveSubtraction(vecArg(args[0], 'A'), vecArg(args[1], 'B'), result, settings)
      if (node.fn === 'multiply' && args.length === 2) {
        if (vecSym(args[1]) && isConstant(args[0])) return VS.solveScalarMultiply(Number(evaluateNode(args[0])), vecArg(args[1], 'A'), result, settings)
        if (vecSym(args[0]) && isConstant(args[1])) return VS.solveScalarMultiply(Number(evaluateNode(args[1])), vecArg(args[0], 'A'), result, settings)
        if (vecSym(args[0]) && vecSym(args[1])) return VS.solveDot(vecArg(args[0], 'A'), vecArg(args[1], 'B'), settings)
      }
    }
    if (node.type === 'FunctionNode') {
      const fname = (node.fn as { name: string }).name
      const args = node.args as Node[]
      if (fname === 'polarVec' && args.length === 2) return VS.solveResolve({ name: name ?? 'A', v: toV3(evaluateNode(node)) }, settings)
      // A compound operand such as `(A + B) × A` gets the answer without working: the steps
      // would have to call A + B by a letter of their own, and a line typed as an expression
      // reads better with the answer alone than with a name the student never gave.
      if (!args.every((a) => vecSym(a) || isConstant(a))) return null
      if (fname === 'cross' && args.length === 2 && args.every(isGeo)) return VS.solveCross(vecArg(args[0], 'A'), vecArg(args[1], 'B'), name ?? letter('C'), settings)
      if (fname === 'dot' && args.length === 2 && args.every(isGeo)) return VS.solveDot(vecArg(args[0], 'A'), vecArg(args[1], 'B'), settings)
      if (fname === 'mag' && args.length === 1 && isGeo(args[0])) return VS.solveMagnitudeDirection(vecArg(args[0], 'A'), settings)
      if (fname === 'unitVec' && args.length === 1) return VS.solveUnitVector(vecArg(args[0], 'A'), settings)
      if (fname === 'proj' && args.length === 2) return VS.solveProjection(vecArg(args[0], 'B'), vecArg(args[1], 'A'), settings)
      if (fname === 'angleBetween' && args.length === 2) return VS.solveAngleBetween(vecArg(args[0], 'A'), vecArg(args[1], 'B'), settings)
    }
  } catch {
    return null
  }
  return null
}

const SOLVER_FNS = new Set(['components', 'resolve', 'magnitude', 'magdir', 'direction', 'unit', 'angle', 'resultant', 'twoforces', 'equilibrium', 'torque', 'work', 'magforce', 'projection', 'add', 'subtract', 'dot', 'cross'])

function trySolverCommand(input: string): boolean {
  const m = input.match(/^\s*([A-Za-z]+)\s*\((.*)\)\s*$/)
  if (!m || !SOLVER_FNS.has(m[1].toLowerCase())) return false
  const fn = m[1].toLowerCase()
  const settings = scene().settings
  const args = splitArgs(m[2]).map((a) => parseNode(a))
  const num = (n: Node) => Number(evaluateNode(n))
  const namer = operandNamer()
  const v = (i: number, name: string) => namer.arg(args[i], name)
  let sol: VS.Solution | null = null
  switch (fn) {
    case 'components':
    case 'resolve':
      if (args.length === 2) sol = VS.solveComponents('A', num(args[0]), num(args[1]), '', settings)
      else if (args.length === 1) {
        // A 3-D vector's components are read off directly; resolving it at its heading in the
        // plane reported Ax = 4.24 for 3i + 4j + 5k.
        sol = VS.solveResolve(v(0, 'A'), settings)
      }
      break
    case 'magnitude':
    case 'magdir':
    case 'direction':
      sol = VS.solveMagnitudeDirection(v(0, 'A'), settings)
      break
    case 'unit':
      sol = VS.solveUnitVector(v(0, 'A'), settings)
      break
    case 'angle':
      sol = VS.solveAngleBetween(v(0, 'A'), v(1, 'B'), settings)
      break
    case 'dot':
      sol = VS.solveDot(v(0, 'A'), v(1, 'B'), settings)
      break
    case 'cross':
      sol = VS.solveCross(v(0, 'A'), v(1, 'B'), namer.letter('C'), settings)
      break
    case 'add':
      sol = VS.solveAddition(args.map((_, i) => v(i, String.fromCharCode(65 + i))), 'R', settings)
      break
    case 'subtract':
      sol = VS.solveSubtraction(v(0, 'A'), v(1, 'B'), 'R', settings)
      break
    case 'projection':
      sol = VS.solveProjection(v(0, 'B'), v(1, 'A'), settings)
      break
    case 'resultant':
    case 'twoforces':
      sol = VS.solveTwoForces(num(args[0]), num(args[1]), num(args[2]), 'N', settings)
      break
    case 'equilibrium':
      sol = VS.solveEquilibrium(args.map((_, i) => v(i, `F${i + 1}`)), settings)
      break
    case 'torque':
      sol = VS.solveTorque(v(0, 'r').v, v(1, 'F').v, settings)
      break
    case 'work':
      sol = VS.solveWork(v(0, 'F').v, v(1, 'd').v, settings)
      break
    case 'magforce':
      sol = VS.solveMagneticForce(num(args[0]), v(1, 'v').v, v(2, 'B').v, settings)
      break
  }
  if (!sol) throw new Error(`Wrong inputs for ${m[1]}. Type "help" for examples.`)
  const finalSol = sol
  scene().pushLog({
    input,
    kind: 'result',
    tex: finalSol.answers.map((a) => `${a.label} = ${a.tex}`).join(',\\quad '),
    solution: finalSol,
    visualize: finalSol.visual ? () => visualizeSolution(finalSol) : undefined
  })
  scene().showSolution(finalSol)
  return true
}

// ---------------------------------------------------------------------------
// CAS: solve, diff, integrate, limit, series, simplify, expand, factor
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Pure Math: factorise, divide, partial fractions, HCF/LCM, complex numbers.
// These run offline and instantly, and they write out their working, so they are tried before
// the SymPy worker. Anything they cannot do falls through to tryCas, which still gives an answer.
// ---------------------------------------------------------------------------

const PURE_WORDS: Record<string, JobId> = {
  factorise: 'factor',
  factorize: 'factor',
  factor: 'factor',
  expand: 'expand',
  divide: 'divide',
  partial: 'partial',
  partialfractions: 'partial',
  hcf: 'hcf',
  gcd: 'hcf',
  lcm: 'lcm',
  primes: 'primes',
  primefactors: 'primes',
  complex: 'complex',
  solve: 'solve'
}

/**
 * The Greek names the expression parser spells out (θ → theta), shown as the letter again. All of
 * them: a list of the common few left a student's sigma or rho rendered as the word. pi is a
 * constant and omicron has no KaTeX command, so neither is a name an unknown can carry.
 */
const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'
])

function tryPureMath(input: string): boolean {
  const m = input.match(/^\s*([a-z]+)\s*\((.*)\)\s*$/i)
  if (!m) return false
  const job = PURE_WORDS[m[1].toLowerCase().replace(/[\s_-]/g, '')]
  if (!job) return false

  const args = splitArgs(m[2])
  // A third argument has no meaning here, and sent on as it was, `x^3-1,x-1,3` reached SymPy as
  // one string and came back as a parser complaint rather than the shape the bar wants.
  if ((job === 'divide' || job === 'partial') && args.length > 2) throw new Error(`${m[1]}(numerator, denominator) or ${m[1]}(fraction)`)
  // solve(x^2-4, x) names the unknown; the pure solver works that out for itself.
  // divide(x^3-1, x-1) and partial(3x+5, (x+1)(x+2)) are the fraction written as two arguments.
  const body =
    job === 'hcf' || job === 'lcm'
      ? args.join(', ')
      : job === 'solve'
        ? args[0] ?? ''
        : (job === 'divide' || job === 'partial') && args.length === 2
          ? `(${args[0]})/(${args[1]})`
          : m[2]
  if (!body.trim()) return false

  const doc = runPure(job, body)
  if (doc.error) {
    // A fraction of plain numbers is arithmetic: the refusal itself says "the calculator will do
    // that one", so it does, and divide(10, 2) answers 5 as it did before the two-argument form.
    // "Plain" is decided by parsing, not by looking for letters: the e of 2e3 and the name pi
    // are numbers too, and divide(2e3, 4) was being sent to SymPy for a 500 the calculator had.
    if ((job === 'divide' || job === 'partial') && isPlainArithmetic(body)) {
      evaluatePlain(body, input)
      return true
    }
    // Not something the step engine can do. The Working panel's own fallback table
    // (math/pure/store.ts) says which jobs SymPy can take over, and the caller sends those on so
    // an answer still appears. The rest are tried as a plain calculation, which is where
    // complex(3, 4) is answered; only when that fails too is the refusal the last word, because
    // its reason ("needs a whole number") is worth more than `I don't know "x"`.
    if (casRequestFor(job, body, casInDegrees(scene().settings.angleUnit))) return false
    try {
      evaluatePlain(input)
    } catch {
      logError(input, doc.error)
    }
    return true
  }

  const s = scene()
  // The Working panel's maths field reads LaTeX, so the linear form typed here has to be
  // converted or 6x^2 arrives on screen as x^(2) with a stray bracket.
  const latex = linearToLatex(body)
  // A label is a word ("Quotient", "HCF =") or a symbol ("x_1 =", "theta_2 ="). The word goes in
  // \text{}; the symbol must not, because KaTeX refuses an underscore inside \text and every
  // solve line rendered red — and it still did for θ, which the parser spells "theta", until the
  // subscript was split off the name. The = stays where the label has one, so it reads x_1 = 3,
  // not x_1 3; and a label that is only the number itself (primes(7) → "7") is not repeated.
  const label = (text: string): string => {
    const eq = text.trim().endsWith('=')
    const bare = text.replace(/=/g, '').trim()
    if (/^-?\d+$/.test(bare)) return eq ? `${bare} = ` : ''
    const sym = /^([A-Za-z]+)(_\d+)?$/.exec(bare)
    const shown = !sym
      ? String.raw`\text{${bare}}`
      : (GREEK.has(sym[1]) ? '\\' + sym[1] : sym[1].length === 1 ? sym[1] : String.raw`\text{${sym[1]}}`) + (sym[2] ?? '')
    return eq ? `${shown} = ` : shown + String.raw`\;`
  }
  s.pushLog({
    input,
    kind: 'result',
    tex: doc.answers.map((a) => `${a.label === 'Answer' ? '' : label(a.label)}${a.tex}`).join(String.raw`,\quad `),
    working: () => {
      usePure.getState().run(job, body, latex)
      showPanel('working')
    }
  })
  usePure.getState().run(job, body, latex)
  showPanel('working')
  return true
}

async function tryCas(input: string): Promise<boolean> {
  const m = input.match(/^\s*(solve|nsolve|diff|derivative|d\/dx|integrate|integral|limit|series|simplify|expand|factor|factorise|factorize|divide|partial|partialfractions|exact)\s*\((.*)\)\s*$/i)
  if (!m) return false
  // The step engine spells it three ways; SymPy knows one.
  const op = m[1].toLowerCase().replace(/^factori[sz]e$/, 'factor')
  const args = splitArgs(m[2])
  const s = scene()
  // In DEG mode the calculator's own d/dx works in degrees; the algebra engine must agree.
  const deg = casInDegrees(s.settings.angleUnit)
  const id = s.pushLog({ input, kind: 'info', text: 'Solving… (the algebra engine takes a few seconds to start the first time)' })
  let payload: Record<string, unknown>
  let casOp = op
  switch (op) {
    case 'solve':
    case 'nsolve':
      casOp = 'solve'
      payload = { eqs: args.filter((a) => a.includes('=') || !/^[a-z]$/.test(a)), vars: args.filter((a) => /^[a-z]$/.test(a)) }
      break
    case 'diff':
    case 'derivative':
    case 'd/dx':
      casOp = 'diff'
      payload = { expr: args[0], var: args[1] ?? 'x', order: args[2] ? Number(args[2]) : 1 }
      break
    case 'integrate':
    case 'integral':
      casOp = 'integrate'
      payload = args.length >= 3 ? { expr: args[0], var: 'x', lower: args[1], upper: args[2] } : { expr: args[0], var: args[1] ?? 'x' }
      break
    case 'limit':
      payload = { expr: args[0], var: 'x', to: args[1] ?? '0' }
      break
    case 'series':
      payload = { expr: args[0], var: 'x', at: args[1] ?? '0', n: args[2] ?? 6 }
      break
    case 'divide':
    case 'partial':
    case 'partialfractions':
      // What the step engine refused (divide(sin(x), x)) goes to SymPy's apart, the same route
      // the Working panel takes, as the one fraction the two arguments stand for.
      casOp = 'apart'
      payload = { expr: args.length === 2 ? `(${args[0]})/(${args[1]})` : args.join(',') }
      break
    default:
      payload = { expr: args.join(',') }
  }
  payload.deg = deg
  const r = await cas(casOp, payload)
  if (r.error) {
    s.updateLog(id, { kind: 'error', text: r.error })
    return true
  }
  if (casOp === 'solve') {
    const rows = r.solutions ?? []
    if (!rows.length) {
      s.updateLog(id, { kind: 'result', text: 'No solution.' })
      return true
    }
    const texOut = rows
      .map((row) => Object.entries(row).map(([k, v]) => `${k} = ${v.latex}${v.numeric && !/^-?\d+$/.test(v.text) ? ` \\approx ${fmtNumeric(v.numeric, s.settings)}` : ''}`).join(',\\ '))
      .join('\\quad\\text{or}\\quad ')
    const single = args.length === 1 && rows.every((row) => Object.keys(row).length === 1 && 'x' in row)
    const roots = single ? rows.map((row) => row.x.numeric).filter((n) => n && n.im === undefined).map((n) => n!.re) : []
    s.updateLog(id, {
      kind: 'result',
      tex: texOut,
      text: undefined,
      visualize: single && args[0].includes('=')
        ? () => {
            const [l, rr] = args[0].split('=')
            visualizeGraph(`y = ${l} - (${rr})`, [`(${l}) - (${rr})`], 'explicit')
            roots.forEach((x0) => visualizePoint([x0, 0, 0]))
          }
        : undefined
    })
    return true
  }
  const numeric = r.numeric && casOp !== 'diff' && casOp !== 'series' && casOp !== 'expand' && casOp !== 'factor' ? ` \\approx ${fmtNumeric(r.numeric, s.settings)}` : ''
  const label = casOp === 'diff' ? `\\frac{d}{dx}\\left(${args[0]}\\right)` : casOp === 'integrate' ? (args.length >= 3 ? `\\int_{${args[1]}}^{${args[2]}}` : '\\int') + `${args[0]}\\,dx` : ''
  const isFunctionResult = (casOp === 'diff' || (casOp === 'integrate' && args.length < 3)) && /x/.test(r.text)
  const unitNote = calculusUnitNote(casOp, args[0] ?? '', deg)
  s.updateLog(id, {
    kind: 'result',
    text: undefined,
    tex: `${label ? label + ' = ' : ''}${r.latex}${numeric && !/^-?\d+$/.test(r.text) ? numeric : ''}${unitNote ? `\\quad\\text{(${unitNote})}` : ''}`,
    visualize: isFunctionResult ? () => visualizeGraph(`y = ${r.text}`, [r.text.replace(/\*\*/g, '^')], 'explicit') : undefined
  })
  return true
}

/** The decimal beside an exact answer, in the student's precision (rule 4), real or complex. */
const fmtNumeric = (n: { re: number; im?: number }, p: Precision) => (n.im === undefined ? texAt(n.re, p) : `${texAt(n.re, p)} ${n.im < 0 ? '-' : '+'} ${texAt(Math.abs(n.im), p)}i`)

// ---------------------------------------------------------------------------
// Plain expressions
// ---------------------------------------------------------------------------

/** True when the text is a calculation in numbers, constants and units alone, with nothing to solve for. */
function isPlainArithmetic(src: string): boolean {
  try {
    return isConstant(parseNode(src))
  } catch {
    return false
  }
}

/** `shown` is the line the log quotes when the maths evaluated is a rewrite of what was typed. */
function evaluatePlain(expr: string, shown = expr) {
  const input = shown
  const node = parseNode(expr)
  assertKnown(node)
  const kind = inferKind(node, kindOfName)
  const value = evaluateNode(node)
  const solution = solutionFor(node)
  const s = scene()
  if (kind === 'vector' || kind === 'point') {
    const v = toV3(value)
    s.pushLog({
      input,
      kind: 'result',
      tex: kind === 'vector' ? `${texIJK(v, s.settings)}${vectorExtras(v)}` : `(${v.map((c) => texPrecise(c, s.settings)).join(', ')})`,
      solution: solution ?? undefined,
      visualize: () => (kind === 'vector' ? (solution ? visualizeSolution(solution) : visualizeVector(v)) : visualizePoint(v))
    })
    return
  }
  // The student's precision, not a fixed ten digits (rule 4): with decimals set to 2, `1/3` used
  // to answer 0.3333333333 beside a panel showing |A| = 5.00. The ≈ tail after an exact form is
  // the one place the full display stays, the way the calculator's S⇔D key shows it.
  const text = typeof value === 'number' ? fmtPrecise(value, s.settings) : isUnit(value) ? `${fmtPrecise(plainNumber(value), s.settings)} ${value.formatUnits()}` : math.format(value, { precision: 10 })
  const id = s.pushLog({ input, kind: 'result', text: `= ${text}`, solution: solution ?? undefined })
  if (typeof value === 'number' && !Number.isInteger(value) && Number.isFinite(value) && isConstant(node)) {
    cas('exact', { expr: preprocess(expr), deg: casInDegrees(s.settings.angleUnit) }).then((r) => {
      if (!r.error && r.latex && !/\./.test(r.text) && r.text !== text) {
        s.updateLog(id, { text: undefined, tex: `= ${r.latex} \\approx ${tex(value, 10)}` })
      }
    })
  }
}

export const HELP = `Examples (press Enter after each):
  A = (3, 4)                 point
  A = <3, 4>   or  A = 3i + 4j   or   F = 10 N ∠ 30°     vector
  R = A + B                  live resultant (updates when you drag A or B)
  A · B    A × B    |A|    unit(A)    angle(A, B)    proj(B, A)     with steps
  components(10, 30)         resolve 10 at 30° into x and y parts
  resultant(5, 5, 120)       two forces and the angle between them
  equilibrium(A, B, C)       the force that balances them
  torque(r, F)   work(F, d)   magforce(q, v, B)
  Triangle((0,0), (4,0), (0,3))   Segment(P, Q)   Line(P, Q)   Circle(P, 3)
  Midpoint(P, Q)  Perpendicular(P, f)  Intersect(f, g)  Angle(P, Q, S)
  y = x^2 - 4      f(x) = sin(x)      x^2 + y^2 = 9      y > x^2
  r = 2cos(θ)      curve(cos(t), sin(t), 0, 2π)      z = sin(x)cos(y)
  k = 2  (makes a slider you can drag)
  solve(x^2 - 5x + 6 = 0)   diff(x^3)   integrate(x^2, 0, 3)   factor(x^2-1)
  delete A     undo     clear     2d / 3d     play / pause`
