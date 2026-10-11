// The command bar's solvers: vector problems with steps, the algebra engine (solve, diff, integrate …), Pure Maths, and plain expressions.
// Out of commands.ts as a pure move (CLEANUP-PLAN.md CW10).

import type { MathNode } from 'mathjs'
import { scene } from '../../core/store'
import { freeCapitals } from '../../core/naming'
import { visualizeGraph, visualizePoint, visualizeSolution, visualizeVector } from '../../core/visualize'
import { ask, useEngineStatus, type EngineJob, type EngineRequest } from '../../math/engine'
import { casWaitNote, followCasStart } from '../../ui/casStatus'
import { inferKind, isUnit, math, plainNumber, preprocess, splitArgs, toV3 } from '../../math/expr'
import { fmtPrecise, texIJK, texPrecise, type Precision } from '../../math/format'
import { type V3 } from '../../math/vec'
import * as VS from '../../math/vectorSolver'
import { linearToLatex, runPure, type JobId } from '../../math/pure/run'
import { normalRefusal, parseNormalQuery } from '../../math/pure/zscore'
import { calculusUnitNote, casInDegrees } from '../../calc/angle'
import { orderRoots } from '../../calc/roots'
import { formatComplex } from '../../calc/format'
import { isNoise } from '../../math/noise'
import { calculusJobFor, engineRequestFor, spelledOut, usePure } from '../../math/pure/store'
import { showPanel } from '../../app/panels'
import { assertKnown, evaluateNode, isConstant, isGeo, kindOfName, logError, type Node, parseNode, splitInputs, sumOperands, texAt, vectorExtras } from './common'

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

/** The most inputs each of them reads; add and equilibrium take any number. cross(A, r, F) answered A × r and left F out without a word. */
const MOST_SOLVER_INPUTS: Partial<Record<string, number>> = {
  components: 2, resolve: 2, magnitude: 1, magdir: 1, direction: 1, unit: 1, angle: 2, dot: 2, cross: 2, subtract: 2, projection: 2, resultant: 3, twoforces: 3, torque: 2, work: 2, magforce: 3
}

export function trySolverCommand(input: string): boolean {
  const m = input.match(/^\s*([A-Za-z]+)\s*\((.*)\)\s*$/)
  if (!m || !SOLVER_FNS.has(m[1].toLowerCase())) return false
  const fn = m[1].toLowerCase()
  const settings = scene().settings
  // cross(A) and resultant(5) read an input that was never typed and showed the student
  // JavaScript's "Cannot read properties of undefined (reading 'type')"; a blank one, as in
  // resultant(, 5, 3), was answered "R = undefined N". Every case reads its inputs through num and
  // v, so one left out or left blank is refused there in the command's words — and so is a line
  // with none at all, where add() and equilibrium() answered a sum and a balance of nothing.
  const wrongInputs = `Wrong inputs for ${m[1]}. Type "help" for examples.`
  // A vector typed in angle brackets is one input: angle(<1, 0>, <0, 1>) was read as "<1", "0>", …
  const args = splitInputs(m[2]).map((a) => (a ? parseNode(a) : undefined))
  if (!args.length || args.length > (MOST_SOLVER_INPUTS[fn] ?? Infinity)) throw new Error(wrongInputs)
  const given = (n: Node | undefined): Node => {
    if (!n) throw new Error(wrongInputs)
    return n
  }
  const num = (n: Node | undefined) => Number(evaluateNode(given(n)))
  const namer = operandNamer()
  const v = (i: number, name: string) => namer.arg(given(args[i]), name)
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
  if (!sol) throw new Error(wrongInputs)
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
// the algebra engine. Anything they cannot do falls through to tryCas, which still gives an answer.
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
  solve: 'solve',
  // prove(sin 2x = 2 sin x cos x). A plain calculation such as mathjs's identity(3) still works:
  // a refused identity with no algebra-engine fallback is tried as a calculation below.
  prove: 'trigidentity',
  identity: 'trigidentity'
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

/**
 * The standard normal table, from the bar: `normal(...)` is shorthand for `P(...)`, `invnorm(...)`
 * and `phi(...)` are read as themselves, and a bare `P(...)` is tried only when what is inside
 * names Z or X with a comparison — `parseNormalQuery` says no to anything else, so a student's own
 * function called p (`p(2)`, `p(x) = x^2`) is left for the rest of the bar to read as a function,
 * never hijacked. Tried outside the generic `word(args)` dispatch below because a distribution
 * query can carry a trailing "= 0.05" or a comma-joined "X ~ N(50, 10^2)" that the generic pattern
 * (the whole line is one word and one bracket) does not allow.
 */
function tryNormalQuery(input: string): boolean {
  const shorthand = /^normal\s*\((.*)\)$/i.exec(input.trim())
  const direct = parseNormalQuery(input)
  const query = direct ?? (shorthand ? parseNormalQuery(`P(${shorthand[1]})`) : null)
  if (!query) {
    // "1 - P(Z < 1.96)" holds a question but is not one: refused in words, never answered with
    // the arithmetic dropped (and not handed on, since the calculator cannot read P(Z < 1.96)).
    const why = normalRefusal(input)
    if (why) logError(input, why)
    return why !== null
  }
  const src = direct ? input : `P(${shorthand![1]})`
  const doc = runPure('normal', src)
  const s = scene()
  if (doc.error) {
    logError(input, doc.error)
    return true
  }
  // In LaTeX a bare "~" is a non-breaking space, so "X ~ N(50, 5^2)" would show in the Maths field
  // as "X N(50, 5²)". \sim is the "is distributed as" sign, and parseNormalQuery reads it back.
  // x_1 in P(x_1 < X < x_2) arrives escaped as x\_1, which the field would show as "x_1": it is
  // the subscript x₁.
  const latex = linearToLatex(src)
    .replace(/\s*~\s*/g, '\\sim ')
    .replace(/([a-zA-Z])\\_(\d)/g, '$1_{$2}')
  s.pushLog({
    input,
    kind: 'result',
    tex: doc.answers.map((a) => (a.label !== 'Answer' ? `\\text{${a.label}} = ${a.tex}` : a.tex)).join(String.raw`,\quad `),
    working: () => {
      usePure.getState().run('normal', src, latex)
      showPanel('maths')
    }
  })
  usePure.getState().run('normal', src, latex)
  showPanel('maths')
  return true
}

export function tryPureMath(input: string): boolean {
  if (tryNormalQuery(input)) return true
  const m = input.match(/^\s*([a-z]+)\s*\((.*)\)\s*$/i)
  if (!m) return false
  const job = PURE_WORDS[m[1].toLowerCase().replace(/[\s_-]/g, '')]
  if (!job) return false

  const args = splitArgs(m[2])
  // A third argument has no meaning here, and sent on as it was, `x^3-1,x-1,3` reached the algebra engine as
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
    // are numbers too, and divide(2e3, 4) was being sent to the algebra engine for a 500 the calculator had.
    if ((job === 'divide' || job === 'partial') && isPlainArithmetic(body)) {
      evaluatePlain(body, input)
      return true
    }
    // Not something the step engine can do. The Working panel's own fallback table
    // (math/pure/store.ts) says which jobs the algebra engine can take over, and the caller sends those on so
    // an answer still appears. The rest are tried as a plain calculation, which is where
    // complex(3, 4) is answered; only when that fails too is the refusal the last word, because
    // its reason ("needs a whole number") is worth more than `I don't know "x"`.
    if (engineRequestFor(job, body, casInDegrees(scene().settings.angleUnit))) return false
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
  // A trig identity is not mathjs syntax (sin 2x would come back as sin(2)·x), so the field gets
  // the proof's own LaTeX of what it read instead.
  const latex = job === 'trigidentity' ? doc.input : linearToLatex(body)
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
      showPanel('maths')
    }
  })
  usePure.getState().run(job, body, latex)
  showPanel('maths')
  return true
}

export async function tryCas(input: string): Promise<boolean> {
  const m = input.match(/^\s*(solve|nsolve|diff|derivative|d\/dx|integrate|integral|limit|series|simplify|expand|factor|factorise|factorize|divide|partial|partialfractions|exact)\s*\((.*)\)\s*$/i)
  if (!m) return false
  // The step engine spells it three ways; the algebra engine knows one.
  const op = m[1].toLowerCase().replace(/^factori[sz]e$/, 'factor')
  const args = splitArgs(m[2])
  const s = scene()
  // In DEG mode the calculator's own d/dx works in degrees; the algebra engine must agree.
  const deg = casInDegrees(s.settings.angleUnit)
  // On the first use the line names the load stage as it moves, so it never reads as a freeze; it
  // lets go of the status before the answer replaces it (followCasStart in ui/casStatus.ts).
  const id = s.pushLog({ input, kind: 'info', text: `Solving… ${casWaitNote(useEngineStatus.getState())}`.trim() })
  followCasStart(useEngineStatus, (note) => s.updateLog(id, { text: `Solving… ${note}` }))
  let payload: Omit<EngineRequest, 'deg'>
  let casOp = op
  switch (op) {
    case 'solve':
    case 'nsolve': {
      casOp = 'solve'
      // solve({x + y = 3, x - y = 1}, {x, y}): splitArgs keeps a braced list whole, so each argument
      // has its braces taken off and is split at its own commas before the pieces are sorted
      // (with the braces left on, "{x" was once sent as an equation with no letters at all). The two
      // braces are taken off without checking they are one pair: {a, b} * {c, d} = 1 is split at
      // "b} * {c". A paired strip is parked for the owner (CW6a-4).
      const items = args.flatMap((a) => splitArgs(a.replace(/^\s*\{/, '').replace(/\}\s*$/, ''))).map((a) => a.trim()).filter(Boolean)
      const isLetter = (a: string): boolean => /^[a-z]$/.test(a)
      payload = { eqs: items.filter((a) => a.includes('=') || !isLetter(a)), vars: items.filter(isLetter) }
      break
    }
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
      // A term count that is not a whole number (3.5, or left empty after its comma) is refused, as
      // it always was: it goes as NaN, which the engine cannot count with.
      payload = { expr: args[0], var: 'x', at: args[1] ?? '0', n: args[2] === undefined ? 6 : /^\s*\d+\s*$/.test(args[2]) ? Number(args[2]) : NaN }
      break
    case 'divide':
    case 'partial':
    case 'partialfractions':
      // What the step engine refused (divide(sin(x), x)) goes to the algebra engine's apart, the same route
      // the Working panel takes, as the one fraction the two arguments stand for.
      casOp = 'apart'
      payload = { expr: args.length === 2 ? `(${args[0]})/(${args[1]})` : args.join(',') }
      break
    default:
      payload = { expr: args.join(',') }
  }
  const r = await ask(casOp as Exclude<EngineJob, 'integralSteps' | 'diffSteps'>, { ...payload, deg })
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
    const texOut = solveRowsTex(rows, s.settings)
    const single = args.length === 1 && rows.every((row) => Object.keys(row).length === 1 && 'x' in row)
    const roots = single ? rows.map((row) => row.x.numeric).filter((n) => n && n.im === undefined).map((n) => n!.re) : []
    s.updateLog(id, {
      kind: 'result',
      tex: texOut,
      text: undefined,
      visualize: single && args[0].includes('=')
        ? () => {
            const [l, rr] = args[0].split('=')
            // Pressed again, the graph already drawn is shown, and its roots are already marked.
            if (visualizeGraph(`y = ${l} - (${rr})`, [`(${l}) - (${rr})`], 'explicit', { reuse: true })) roots.forEach((x0) => visualizePoint([x0, 0, 0]))
          }
        : undefined
    })
    return true
  }
  const numeric = r.numeric && casOp !== 'diff' && casOp !== 'series' && casOp !== 'expand' && casOp !== 'factor' ? ` \\approx ${fmtNumeric(r.numeric, s.settings)}` : ''
  // The space after \int is not decoration: \int glued to integrate(x^2)'s x read as the unknown
  // command \intx, and every indefinite integral from the bar rendered as a red KaTeX error.
  // The label names the letter the answer was worked in: diff(t^3, t) = 3t² used to read d/dx, and
  // diff(θ^2, θ) = 2θ read d/dx(θ²), which is 0. θ and theta are one letter, written \theta, as in
  // the working behind the same line (spelledOut spells θ theta for it).
  const byLetter = spelledOut((args[1] ?? '').trim())
  const letter =
    casOp === 'integrate' && args.length >= 3
      ? 'x'
      : /^[A-Za-z]$/.test(byLetter)
        ? byLetter
        : GREEK.has(byLetter)
          ? `\\${byLetter}`
          : 'x'
  // diff(x^3, x, 2) = 6x is the second derivative, so it reads d²/dx², not d/dx(x³) = 6x, which is
  // false (GLM #24). An order the label cannot write truthfully (0, or not a whole number) gets none.
  const order = casOp === 'diff' && args[2] ? Number(args[2]) : 1
  const dBy = order === 1 ? `\\frac{d}{d${letter}}` : Number.isInteger(order) && order >= 2 ? `\\frac{d^{${order}}}{d${letter}^{${order}}}` : ''
  const label = casOp === 'diff' ? (dBy ? `${dBy}\\left(${args[0]}\\right)` : '') : casOp === 'integrate' ? (args.length >= 3 ? `\\int_{${args[1]}}^{${args[2]}}` : '\\int ') + `${args[0]}\\,d${letter}` : ''
  const isFunctionResult = (casOp === 'diff' || (casOp === 'integrate' && args.length < 3)) && /x/.test(r.text)
  const unitNote = calculusUnitNote(casOp, args[0] ?? '', deg)
  // An indefinite integral carries its + C, as its working and every textbook do; the engine leaves
  // it off, so the bar said ∫x eˣ dx = (x − 1)eˣ while "Show the working" said (x − 1)eˣ + C.
  // An integral the engine could not do comes back still written as one, and gets no + C.
  const plusC = casOp === 'integrate' && args.length < 3 && !/\\int/.test(r.latex) ? ' + C' : ''
  // The answer stays the engine's own; its steps are one tap away in the Working panel (spec decision 3:
  // no calculus words for the step engine, which runs first and would take diff/integrate over).
  const steps = calculusJobFor(casOp, args)
  s.updateLog(id, {
    kind: 'result',
    text: undefined,
    tex: `${label ? label + ' = ' : ''}${r.latex}${plusC}${numeric && !/^-?\d+$/.test(r.text) ? numeric : ''}${unitNote ? `\\quad\\text{(${unitNote})}` : ''}`,
    visualize: isFunctionResult ? () => void visualizeGraph(`y = ${r.text}`, [r.text], 'explicit', { reuse: true }) : undefined,
    working: steps
      ? () => {
          usePure.getState().run(steps.job, steps.input, linearToLatex(steps.input))
          showPanel('maths')
        }
      : undefined
  })
  return true
}

/**
 * The decimal beside an exact answer, in the student's precision (rule 4), real or complex. A complex
 * one is written by the same formatter as on the Maths screen (2i, never 0 + 2i or 0 + 1i).
 */
const fmtNumeric = (n: { re: number; im?: number }, p: Precision) => formatComplex(n.re, n.im ?? 0, (v) => texAt(v, p), 'tex')

/** One value of an engine's solve row (EngineValue in math/engine/types.ts). */
type SolveValue = { latex: string; text: string; numeric: { re: number; im?: number } | null }

/** A decimal beside a value that is already whole says nothing: x = 3, x = −2 + 3i. */
const isWholeValue = (v: SolveValue): boolean => /^-?\d+$/.test(v.text) || (!!v.numeric && Number.isInteger(v.numeric.re) && Number.isInteger(v.numeric.im ?? 0))

/**
 * The bar's answer line for the engine's solve rows: each letter with its exact value, and the
 * decimal beside a value that is not whole. The engine lists roots in an order of its own (−2i before 2i),
 * so the roots of one unknown are put in the order every other route uses: real roots smallest
 * first, then each conjugate pair with the +i root first. (A quadratic reaches the engine only when the
 * Solve job refuses it; the Solve job's own answers keep their formula order.) Pure, so the line can
 * be compared with the other routes that answer the same equation (x = ?, Equations mode, the Solve job).
 */
export function solveRowsTex(rows: Record<string, SolveValue>[], p: Precision): string {
  const valueOf = (row: Record<string, SolveValue>): { re: number; im: number } | null => {
    const n = Object.values(row)[0].numeric
    return n ? { re: n.re, im: n.im ?? 0 } : null
  }
  // A system's solution (x and y in one row) has no single root to order by: the engine's order stays.
  const ordered = rows.every((row) => Object.keys(row).length === 1) ? orderRoots(rows, valueOf) : rows
  return ordered
    .map((row) => Object.entries(row).map(([k, v]) => `${k} = ${v.latex}${v.numeric && !isWholeValue(v) ? ` \\approx ${fmtNumeric(v.numeric, p)}` : ''}`).join(',\\ '))
    .join('\\quad\\text{or}\\quad ')
}

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
export function evaluatePlain(expr: string, shown = expr) {
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
  // in the same precision: it was kept at ten places on purpose, and read "= 1/3 ≈ 0.3333333333"
  // at 2 d.p. (the wave head overruled that, polish H16).
  const text = typeof value === 'number' ? fmtPrecise(value, s.settings) : isUnit(value) ? `${fmtPrecise(plainNumber(value), s.settings)} ${value.formatUnits()}` : math.format(value, { precision: 10 })
  const id = s.pushLog({ input, kind: 'result', text: `= ${text}`, solution: solution ?? undefined })
  if (typeof value === 'number' && !Number.isInteger(value) && Number.isFinite(value) && isConstant(node)) {
    ask('exact', { expr: preprocess(expr), deg: casInDegrees(s.settings.angleUnit) }).then((r) => {
      // An exact form is shown only when it is the number beside it: the engine takes an odd root of a negative
      // number as its principal value, so it gave (−8)^(−1/3), which is −0.5 here, as 1/4 − (√3/4)i.
      const complex = r.numeric?.im !== undefined && !isNoise(r.numeric.im, r.numeric.re)
      if (!r.error && r.latex && !/\./.test(r.text) && r.text !== text && !complex) {
        s.updateLog(id, { text: undefined, tex: `= ${r.latex} \\approx ${texPrecise(value, s.settings)}` })
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
  piecewise(x^2 from -3 to 0, x from 0 to 2, 2 from 2 to 4)     one curve in pieces
  between(x^2, x + 2, -1, 2)   shade between two curves      tangent(x^2, 1)   the tangent at a point
  k = 2  (makes a slider you can drag)
  solve(x^2 - 5x + 6 = 0)   diff(x^3)   integrate(x^2, 0, 3)   factor(x^2-1)
  P(Z < 1.96)   P(45 < X < 60), X ~ N(50, 5^2)     the standard normal table, with steps
  invnorm(0.975)   invnorm(0.9), X ~ N(50, 10^2)     the z (or x) for a given area
  prove(sin 2x = 2 sin x cos x)   a trig identity, proved one named step at a time
  delete A     undo     clear     2d / 3d     play / pause`
