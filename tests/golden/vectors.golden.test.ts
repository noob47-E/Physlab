import { beforeEach, describe, expect, it } from 'vitest'
import { evaluateVectorLine, exprSolution, solveOperation, OPERATIONS, cardLineTex } from '../../src/renderer/src/panels/vectorCalcStore'
import { resetGlobals } from '../helpers/globals'
import { scene } from '../../src/renderer/src/core/store'
import { expectGolden, goldenLine, seenOf } from './harness'
import { VECTOR_PAIRS, VECTOR_EXPRS, VECTOR_LINES } from './inputs/vectors'
import type { SceneSettings } from '../../src/renderer/src/core/types'
import type { V3 } from '../../src/renderer/src/math/vec'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
})

// The settings a new scene starts with (resetGlobals + newScene in beforeEach), as the panel reads them.
const settings = (): SceneSettings => scene().settings

const seenOp = (op: string, a: V3, b: V3): string =>
  seenOf(() => {
    const vs = [{ name: 'A', v: a }, { name: 'B', v: b }]
    const sol = solveOperation(op, vs, settings(), 2, 1.6e-19)
    if (!sol) return '(no solution)'
    const steps = sol.steps.map(s => [s.text, s.tex].filter(Boolean).join(' ')).join(' | ')
    const answers = sol.answers.map(a => `${a.label} = ${a.tex}`).join(', ')
    return `[${sol.title}] ${steps}  =>  ${answers}`
  })

const seenExpr = (expr: string, a: V3, b: V3): string =>
  seenOf(() => {
    const cards = [{ name: 'A', v: a }, { name: 'B', v: b }]
    const { sol } = exprSolution(expr, cards, settings())
    const steps = sol.steps.map(s => [s.text, s.tex].filter(Boolean).join(' ')).join(' | ')
    const answers = sol.answers.map(a => `${a.label} = ${a.tex}`).join(', ')
    return `[${sol.title}] ${steps}  =>  ${answers}`
  })

const seenCardLine = (a: V3): string =>
  seenOf(() => cardLineTex('A', a, 'length', settings()))

const seenEval = (expr: string): string =>
  seenOf(() => {
    const { out } = evaluateVectorLine(expr, { i: [1,0,0], j: [0,1,0], k: [0,0,1], A: [3,4,0] }, [], [])
    return JSON.stringify(out)
  })

function sweep(): string[] {
  const lines: string[] = []
  for (const [a, b] of VECTOR_PAIRS) {
    const aStr = JSON.stringify(a)
    const bStr = JSON.stringify(b)
    lines.push(goldenLine(`cardLineTex ${aStr}`, seenCardLine(a)))
    for (const op of Object.keys(OPERATIONS)) {
      lines.push(goldenLine(`op ${op} ${aStr} ${bStr}`, seenOp(op, a, b)))
    }
  }
  for (const expr of VECTOR_EXPRS) {
    lines.push(goldenLine(`exprSolution ${expr}`, seenExpr(expr, [3,4,0], [2,-1,0])))
  }
  for (const line of VECTOR_LINES) {
    lines.push(goldenLine(`evaluateVectorLine ${line}`, seenEval(line)))
  }
  return lines
}

describe('golden sweep: vectors', () => {
  it('is stable: two runs in a row give the same lines', () => {
    expect(sweep()).toEqual(sweep())
  })

  it('matches tests/golden/out/vectors.txt', () => {
    expectGolden('vectors', sweep())
  })
})
