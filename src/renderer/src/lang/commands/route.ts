// The command bar's router: runCommand tries each kind of line in turn; assignments and geometry commands live here with it.
// Out of commands.ts as a pure move (CLEANUP-PLAN.md CW10).

import type { MathNode } from 'mathjs'
import { Builder } from '../../core/factory'
import { scene } from '../../core/store'
import { isValidName } from '../../core/naming'
import { evaluateScene } from '../../core/evaluate'
import type { ObjId, SceneObject } from '../../core/types'
import { plainParseError } from '../../core/visualize'
import { inferKind, math, preprocess, splitArgs, toV3 } from '../../math/expr'
import { type V3 } from '../../math/vec'
import { isPieceCorner } from '../../math/lego'
import { sizesOf, type SolidKind } from '../../math/solidShape'
import { unknownFunctionSentence, unknownNameSentence } from '../../calc/errors'
import { unitRefusal } from '../../calc/units'
import { evaluatePlain, HELP, solutionFor, tryCas, tryPureMath, trySolverCommand } from './solve'
import { assertKnown, describeComputed, evaluateNode, freeLetterFor, GRAPH_VARS, isConstant, isUnitName, kindOfName, logError, parseNode, splitInputs, sumOperands, unknownSymbols, vectorExtras } from './common'
import { namedGraphs, tryGraph } from './graph'

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
    if (tryPointInSpace(input)) return
    if (tryPureMath(input)) return
    if (await tryCas(input)) return
    if (tryGraph(input)) return
    if (tryAssignment(input)) return
    if (tryGeometryCommand(input, undefined)) return
    if (trySolverCommand(input)) return
    evaluatePlain(input)
  } catch (e) {
    logError(input, friendlyError(e, input))
  }
}

/** The parser's own words, which a student is never shown: "Parenthesis ) expected (char 7)". */
const PARSER_WORDS = /\(char \d+\)|Value expected|Parenthesis [)\]] expected|Unexpected operator|Syntax ?error|End of (matrix|string)/i

function friendlyError(e: unknown, input = ''): string {
  const msg = e instanceof Error ? e.message : String(e)
  const unknown = msg.match(/Undefined symbol (\w+)/)?.[1]
  if (unknown) return unknownNameSentence(unknown, freeLetterFor('abcmn'))
  // f(2) after f(x) = x^2: the evaluator keeps no value for a graph, so it has no function f to call
  // and says "Undefined function f", which is neither a graph's nor a typo's way of putting it.
  const called = msg.match(/Undefined function (\S+)/)?.[1]
  if (called) return Object.keys(namedGraphs()).includes(called) ? `${called} is a graph, so it cannot be used as a number in a formula yet.` : unknownFunctionSentence(called)
  if (/Units do not match|in function to\b|Unit "[^"]+" not found/.test(msg)) {
    return unitRefusal(e, undefined, undefined, true)
  }
  if (/Unexpected end/.test(msg)) return 'The expression is incomplete. Check your brackets.'
  // mathjs reads 2 + 3 = 5 as an assignment to 2, and said so in its own words.
  if (/Invalid left hand side/.test(msg)) return `Only a name can stand on the left of =, as in k = 2. To solve an equation, type it inside solve( ): solve(${input}).`
  if (/Unexpected type of argument/.test(msg)) return 'A function was given the wrong kind of value — a vector or a point where it needs a number, for example.'
  if (PARSER_WORDS.test(msg)) {
    const why = plainParseError(msg)
    return `${why.charAt(0).toUpperCase()}${why.slice(1)}.`
  }
  return msg
}

// ---------------------------------------------------------------------------
// Assignments: name = expression | geometry command
// ---------------------------------------------------------------------------

/** The prime signs a name may carry (core/naming.ts), at the end of it. */
const PRIME_CHARS = /['′″‴⁗]+$/

/** How many primes a name carries: ' and ′ one each, ″ two, ‴ three, ⁗ four. */
const primesIn = (name: string): number => [...(name.match(PRIME_CHARS)?.[0] ?? '')].reduce((n, c) => n + ({ "'": 1, '′': 1, '″': 2, '‴': 3, '⁗': 4 }[c] ?? 0), 0)

/**
 * A full turn for every slider a line uses as an angle in degrees — the k of B = 3 ∠ k°, which
 * preprocess writes k deg. A slider's range comes from its value, so the cross-product lesson's
 * k = 60 stopped at 120 while the lesson says "Past 180°, C flips downward". The range only grows,
 * so the value and a wider range the slider already had stay inside it. It rides on the line's own
 * undo step: one undo takes back the line and the wider range together.
 */
function widenDegreeSliders(node: MathNode): void {
  const s = scene()
  const isDeg = (n: MathNode | undefined): boolean => n?.type === 'SymbolNode' && (n as unknown as { name: string }).name === 'deg'
  node.traverse((n) => {
    const op = n as MathNode & { fn?: string; args?: MathNode[] }
    if (n.type !== 'OperatorNode' || op.fn !== 'multiply' || op.args?.length !== 2) return
    let angle = isDeg(op.args[1]) ? op.args[0] : isDeg(op.args[0]) ? op.args[1] : undefined
    while (angle?.type === 'ParenthesisNode') angle = (angle as unknown as { content: MathNode }).content
    if (angle?.type !== 'SymbolNode') return
    const id = s.ev.names.get((angle as unknown as { name: string }).name)
    const o = id ? s.objects[id] : undefined
    if (o?.type !== 'number' || !o.slider || (o.slider.min <= 0 && o.slider.max >= 360)) return
    s.updateObject(o.id, (d) => {
      if (d.type !== 'number' || !d.slider) return
      d.slider.min = Math.min(d.slider.min, 0)
      d.slider.max = Math.max(d.slider.max, 360)
    }, false)
  })
}

function tryAssignment(input: string): boolean {
  // ′ ″ ‴ ⁗ as in core/naming.ts isValidName: after Z the app names points A′, A″ (Fix 11), and a
  // student must be able to move or redefine them from the bar like any other point.
  const m = input.match(/^\s*([A-Za-zͰ-Ͽ][\wͰ-Ͽ'′″‴⁗]*)\s*=(?!=)\s*(.+)$/)
  if (!m) return false
  const [, name, rhs] = m
  if (GRAPH_VARS.has(name) || name === 'z') return false
  if (!isValidName(name)) throw new Error(`"${name}" is a reserved name. Try another.`)
  // y'' = -y is a differential equation as a physics student writes one: a small letter with two
  // primes, and no such letter in the scene to carry them (the bar names points A′ and A″, and a
  // v′ beside a v is a name like any other). It cannot be solved, and the number it made could
  // only be wrong, so it is said in a sentence and nothing is made.
  if (primesIn(name) >= 2 && /^\p{Ll}/u.test(name) && !scene().ev.names.has(name.replace(PRIME_CHARS, ''))) {
    throw new Error(`${name} = ${rhs.trim()} looks like a differential equation, and the bar cannot solve those. Type the graph you expect instead, e.g. y = sin(x).`)
  }
  // A Lego piece's corners carry ordinary letters since Fix 17, so "E = (9, 9)" typed to make a
  // new point E would redefine one corner and bend the piece. It moves only as a whole.
  const taken = scene().ev.names.get(name)
  if (taken && isPieceCorner(taken, scene().objects)) throw new Error(`${name} is a corner of a piece. Slide, turn or flip the piece to move it, or choose another letter.`)
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

  // The object is tried on a copy of the scene first: a line that can never work (y is no value, a
  // needs itself) is refused with the scene as it was, where it was added and then reported, and what
  // it made stayed. A value that mends when something moves is kept and said below.
  const adds = existing ? replacement(existing, obj, b) : b.created
  const failed = errorOnTrial(adds, existing ?? obj.id)
  if (failed && !(MENDS_WHEN_THINGS_MOVE.test(failed) && !isConstant(node))) throw new Error(`${name}: ${failed}`)
  if (existing) scene().addObjects(adds, { select: true })
  else b.commit()
  widenDegreeSliders(node)

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

/** What stands in the scene once `obj` has redefined `existingId`: the object under the old id, and the helpers made with it. */
function replacement(existingId: ObjId, obj: SceneObject, b: Builder): SceneObject[] {
  const old = scene().objects[existingId]
  const replaced = { ...obj, id: existingId, name: old.name, color: old.type === obj.type ? old.color : obj.color } as SceneObject
  const others = b.created.filter((o) => o.id !== obj.id)
  // Children created alongside (e.g. helper points) that referenced the new id must point at the old id.
  const fixed = others.map((o) => remapIds(o, obj.id, existingId) as SceneObject)
  return [replaced, ...fixed]
}

function redefine(existingId: ObjId, obj: SceneObject, b: Builder) {
  scene().addObjects(replacement(existingId, obj, b), { select: true })
}

/**
 * The error `id` would have, found on a copy of the scene before the scene is touched. A line that
 * failed used to be added first and reported after, and what it made stayed: `y'' = -y` left a
 * number y'' beside "Undefined symbol y", and `a = a + y` turned a good a into a broken one.
 */
function errorOnTrial(adds: SceneObject[], id: ObjId): string | undefined {
  const s = scene()
  const objects = { ...s.objects }
  const order = [...s.order]
  for (const o of adds) {
    objects[o.id] = o
    if (!order.includes(o.id)) order.push(o.id)
  }
  return evaluateScene(objects, order, s.settings, s.time).errors.get(id)
}

/**
 * A value that is not a number for now, or hangs on an object that is not (1/k while the slider k
 * is at 0): moving something mends it, so the object stays and the error is said. Everything else
 * the evaluator reports is the definition's own and never mends.
 */
const MENDS_WHEN_THINGS_MOVE = /^(not a number|depends on an undefined object|.+ is undefined)$/

// ---------------------------------------------------------------------------
// Geometry commands
// ---------------------------------------------------------------------------

const GEO_ALIASES: Record<string, string> = {
  point: 'Point', segment: 'Segment', line: 'Line', ray: 'Ray', circle: 'Circle', polygon: 'Polygon', triangle: 'Triangle',
  midpoint: 'Midpoint', perpendicular: 'Perpendicular', parallel: 'Parallel', perpendicularbisector: 'PerpendicularBisector',
  perpbisector: 'PerpendicularBisector', anglebisector: 'AngleBisector', intersect: 'Intersect', intersection: 'Intersect',
  angle: 'Angle', vector: 'Vector', slider: 'Slider', tangent: 'Tangent', centroid: 'Centroid', circumcenter: 'Circumcenter',
  incenter: 'Incenter', orthocenter: 'Orthocenter', text: 'Text', square: 'Square', regularpolygon: 'RegularPolygon',
  // 3D-3B: a plane through three points, and the solids by their sizes.
  plane: 'Plane', cube: 'Cube', cuboid: 'Cuboid', prism: 'Prism', pyramid: 'Pyramid', sphere: 'Sphere', cylinder: 'Cylinder', cone: 'Cone'
}

/** 3D-3B: each solid command's kind, its sizes in order, and how a sentence asks for them. */
const SOLID_COMMANDS: Record<string, { kind: SolidKind; words: string; example: string }> = {
  Cube: { kind: 'cube', words: 'its side', example: 'Cube(4)' },
  Cuboid: { kind: 'cuboid', words: 'its length, width and height', example: 'Cuboid(5, 3, 4)' },
  Prism: { kind: 'prism', words: 'the side of its triangle and its height', example: 'Prism(4, 6)' },
  Pyramid: { kind: 'pyramid', words: 'the side of its square base and its height', example: 'Pyramid(4, 6)' },
  Sphere: { kind: 'sphere', words: 'its radius', example: 'Sphere(3)' },
  Cylinder: { kind: 'cylinder', words: 'its radius and height', example: 'Cylinder(2.5, 5)' },
  Cone: { kind: 'cone', words: 'its radius and height', example: 'Cone(3, 4)' }
}

/**
 * 3D-3B: in Geometry, P(1, 2, 3) is the point P = (1, 2, 3), as GeoGebra writes a point; Q(1, 2) one on the floor. Only a
 * capital name that is no command and no function the scene has, and two or three numbers: C(5, 2) elsewhere may be a
 * choice, and f(2) is the function.
 */
function tryPointInSpace(input: string): boolean {
  if (scene().activeSpace !== 'shapes') return false
  const m = input.match(/^\s*([A-Z][A-Za-z0-9_'′″‴⁗]*)\s*\((.*)\)\s*$/)
  if (!m) return false
  const [, name, inside] = m
  if (GEO_ALIASES[name.toLowerCase()]) return false
  const id = scene().ev.names.get(name)
  if (id && scene().objects[id]?.type !== 'point') return false
  const args = splitArgs(inside).map((x) => x.trim())
  if (args.length < 2 || args.length > 3) return false
  const constant = (x: string) => {
    try {
      return x !== '' && isConstant(parseNode(x))
    } catch {
      return false
    }
  }
  if (!args.every(constant)) return false
  return tryAssignment(`${name} = (${args.join(', ')})`)
}

/**
 * The most inputs a command reads, where it reads fewer than it was given without saying so:
 * Square(P, (1, 0), 3) dropped the 3 and built a square. The others refuse a wrong count already.
 */
const MOST_INPUTS: Partial<Record<string, number>> = { Square: 2, RegularPolygon: 3, Triangle: 3, Intersect: 3, Slider: 4, Text: 2, Plane: 3 }

/** Whether an input stands for a vector: a vector's name, or what it is made of (<1, 0>, 2A, A + B). */
function isVectorInput(text: string): boolean {
  const k = kindOfName(text)
  if (k !== undefined) return k === 'vector'
  try {
    return inferKind(parseNode(text), kindOfName) === 'vector'
  } catch {
    return false
  }
}

function tryGeometryCommand(src: string, name: string | undefined, fullInput = src): boolean {
  const m = src.match(/^\s*([A-Za-z]+)\s*\((.*)\)\s*$/)
  if (!m) return false
  const cmd = GEO_ALIASES[m[1].toLowerCase()]
  if (!cmd) return false
  // `angle(A, B)` with two vectors is a solver request, not a geometry angle — and so is one of two
  // vectors typed out: decided by the names alone, angle(<1, 0>, <0, 1>) was "Wrong inputs for Angle".
  // Vector( ) keeps the names-only rule: no solver reads it, and two vector names already end in
  // "Undefined function Vector", which typed vectors should not be sent to.
  const inputs = splitInputs(m[2])
  if (cmd === 'Angle' && inputs.length === 2 && inputs.every(isVectorInput)) return false
  const rawArgs = splitArgs(m[2])
  // Two vectors are no tail and tip: the command says what it takes, where it went on to "PhysLab does not know a
  // function called Vector" (H28).
  if (cmd === 'Vector' && rawArgs.length === 2 && rawArgs.every((a) => kindOfName(a) === 'vector')) {
    const [p, q] = rawArgs.map((a) => a.trim())
    throw new Error(`Vector( ) takes two points — its tail and its tip — or one vector, and ${p} and ${q} are vectors. For the vector from the tip of ${p} to the tip of ${q}, type ${q} - ${p}.`)
  }

  const b = new Builder()
  const names = scene().ev.names
  const objects = () => ({ ...scene().objects, ...Object.fromEntries(b.created.map((o) => [o.id, o])) })

  // Square(P) read a second point that was never typed and showed the student JavaScript's
  // "Cannot read properties of undefined (reading 'trim')". Every case reads its points through
  // ref, so one left out, or left blank as in Square(, P), is refused here in the command's words.
  const wrongInputs = `Wrong inputs for ${cmd}. Type "help" to see examples.`
  if (rawArgs.length > (MOST_INPUTS[cmd] ?? Infinity)) throw new Error(wrongInputs)
  const ref = (arg: string | undefined): ObjId => {
    if (!arg?.trim()) throw new Error(wrongInputs)
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

  const solid = SOLID_COMMANDS[cmd]
  if (solid) {
    const sizes = sizesOf(solid.kind)
    const given = a.map((x) => x.trim()).filter((x) => x !== '')
    if (given.length !== sizes.length) throw new Error(`${cmd} needs ${solid.words}, e.g. ${solid.example}.`)
    primary = b.solid(solid.kind, Object.fromEntries(sizes.map((s, i) => [s.key, given[i]])), [0, 0, 0], opts)
  }

  switch (cmd) {
    case 'Plane':
      if (a.length !== 3) throw new Error('Plane needs three points, e.g. Plane(A, B, C).')
      primary = b.plane(ref(a[0]), ref(a[1]), ref(a[2]), opts)
      break
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
      // 2 sides made a "polygon, area 0", 2.5 a triangle, and 0 or a negative number a polygon of two corners.
      if (!Number.isInteger(n) || n < 3) throw new Error('A regular polygon needs a whole number of sides, 3 or more.')
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
    case 'Orthocenter': {
      if (a.length !== 1) break
      const poly = ref(a[0])
      // The evaluator refuses anything else only after the point is made, so "B: needs a triangle"
      // was said about a point that stayed in the drawing as an error.
      const corners = scene().ev.values.get(poly)
      if (typeOf(poly) !== 'polygon' || (corners?.type === 'polygon' && corners.pts.length !== 3)) {
        const tri = freeLetterFor('TUVW')
        throw new Error(`${cmd} needs a triangle, and ${a[0].trim()} is not one. Make a triangle first, e.g. ${tri} = Triangle((0, 0), (4, 0), (0, 3)), then ${cmd}(${tri}).`)
      }
      primary = b.point({ kind: 'triangleCenter', poly, which: cmd.toLowerCase() as 'centroid' }, opts)
      break
    }
    case 'Text': {
      const text = a[0]?.replace(/^["']|["']$/g, '') ?? ''
      if (!text.trim()) throw new Error('Text needs something to show, e.g. Text("label").')
      // The position reads the scene's names like every other input: Text("hi", P) put the label at P.
      const pos = a[1] ? toV3(math.evaluate(preprocess(a[1]), { ...scene().ev.scope })) : ([0, 0, 0] as V3)
      primary = b.text(pos, text, opts)
      break
    }
  }

  if (!primary) throw new Error(wrongInputs)
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
