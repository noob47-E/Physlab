import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import katex from 'katex'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { usePure } from '../src/renderer/src/math/pure/store'
import { addExpressionLine, expressionRows } from '../src/renderer/src/panels/expressionRows'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'
import { hidePanel, isPanelOpen, setDockApi, showBeside } from '../src/renderer/src/app/panels'
import { useApp } from '../src/renderer/src/app/modes'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { derivativeWorking, type DerivTree } from '../src/renderer/src/math/engine/sympy/calculusSteps'
import { repoPath } from './helpers/repo'

interface FakeGroup {
  id: string
}
interface FakePanel {
  id: string
  api: { group: FakeGroup; setActive: () => void; moveTo: (o: { group?: FakeGroup; position?: string }) => void }
}

function fakeDock(width: number, start: Record<string, string>) {
  const groups: Record<string, FakeGroup> = {}
  const group = (id: string) => (groups[id] ??= { id })
  const moves: { id: string; beside: string; position?: string }[] = []
  const added: { id: string; position: unknown }[] = []
  const active: string[] = []
  const panels: FakePanel[] = []
  const make = (id: string, g: FakeGroup): FakePanel => {
    const p: FakePanel = {
      id,
      api: {
        group: g,
        setActive: () => void active.push(id),
        moveTo: (o) => {
          moves.push({ id, beside: o.group!.id, position: o.position })
          p.api.group = group(`${id}-own`)
        }
      }
    }
    panels.push(p)
    return p
  }
  for (const [id, g] of Object.entries(start)) make(id, group(g))
  const api = {
    width,
    height: 800,
    panels,
    getPanel: (id: string) => panels.find((p) => p.id === id),
    addPanel: (o: { id: string; position: unknown }) => {
      added.push({ id: o.id, position: o.position })
      make(o.id, group(`${o.id}-own`))
    },
    removePanel: (p: FakePanel) => {
      const idx = panels.indexOf(p)
      if (idx !== -1) panels.splice(idx, 1)
    }
  }
  setDockApi(api as never)
  return { api, moves, added, active, groupOf: (id: string) => api.getPanel(id)?.api.group.id }
}

function solveLatex(input: string) {
  resetGlobals()
  usePure.setState({ working: null, input: '', inputLatex: '', history: [] })
  usePure.getState().runLatex(input, 'auto', { quiet: true })
  return usePure.getState().working
}

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

describe('Rigorous Solver Stress Testing: diverse equations across all families', () => {
  // 1. Linear equations
  const LINEAR_CASES = [
    '2x + 4 = 10',
    '3x - 7 = 2x + 4',
    '5x - 10 = 0',
    '-4x + 12 = 0',
    '7x + 2 = 30',
    '4x + 1 = 2x + 9',
    '12x - 8 = 4',
    String.raw`\frac{x}{2} + \frac{x}{3} = 5`,
    '5(x - 2) = 3(x + 4)'
  ]

  for (const eq of LINEAR_CASES) {
    it(`Linear equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.moves.length).toBeGreaterThan(0)
      expect(w?.answers.length).toBeGreaterThan(0)
      for (const m of w?.moves ?? []) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }

  // 2. Quadratic equations (factoring, formula, roots)
  const QUADRATIC_CASES = [
    'x^2 - 5x + 6 = 0',
    'x^2 - 4 = 0',
    'x^2 + 6x + 9 = 0',
    '2x^2 + 5x - 3 = 0',
    '3x^2 - 10x + 3 = 0',
    'x^2 - 2x + 1 = 0'
  ]

  for (const eq of QUADRATIC_CASES) {
    it(`Quadratic equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.answers.length).toBeGreaterThan(0)
      for (const m of w?.moves ?? []) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }

  // 3. Higher-degree equations
  const HIGHER_DEGREE_CASES = [
    'x^3 - 1 = 0',
    'x^3 - 6x^2 + 11x - 6 = 0',
    'x^4 - 5x^2 + 4 = 0'
  ]

  for (const eq of HIGHER_DEGREE_CASES) {
    it(`Higher degree equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.answers.length).toBeGreaterThan(0)
    })
  }

  // 4. Radical equations
  const RADICAL_CASES = [
    String.raw`\sqrt{x+1}=x-1`,
    String.raw`\sqrt{2x+3}=x`,
    String.raw`\sqrt{x}+2=x`,
    String.raw`\sqrt{x+5}=\sqrt{2x-1}`,
    String.raw`2\sqrt{x}=x`,
    String.raw`\sqrt{x-3}=-2`
  ]

  for (const eq of RADICAL_CASES) {
    it(`Radical equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.answers.length).toBeGreaterThan(0)
      for (const m of w?.moves ?? []) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }

  // 5. Rational equations
  const RATIONAL_CASES = [
    String.raw`\frac{1}{x}+\frac{1}{x-1}=2`,
    String.raw`\frac{2}{x+1}=\frac{3}{x-2}`,
    String.raw`\frac{x}{x-2}=\frac{2}{x-2}`
  ]

  for (const eq of RATIONAL_CASES) {
    it(`Rational equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.moves.length).toBeGreaterThan(0)
    })
  }

  // 6. Exponential and Logarithmic equations
  const EXP_LOG_CASES = [
    '2^{x}=8',
    '3^{2x-1}=27',
    '2^{x}=2^{3}',
    '5^{x-1}=25',
    String.raw`\log(x)=2`,
    String.raw`\log_{2}(x)=5`
  ]

  for (const eq of EXP_LOG_CASES) {
    it(`Exponential/Log equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.answers.length).toBeGreaterThan(0)
      for (const m of w?.moves ?? []) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }

  // 7. Trigonometric equations
  const TRIG_CASES = [
    String.raw`2\sin(x)=1`,
    String.raw`2\cos(x)+1=0`,
    String.raw`\tan(2x)=1`
  ]

  for (const eq of TRIG_CASES) {
    it(`Trigonometric equation: ${eq}`, () => {
      const w = solveLatex(eq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.answers.length).toBeGreaterThan(0)
      for (const m of w?.moves ?? []) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }

  // 8. Systems of linear equations
  const SYSTEM_CASES = [
    'x + y = 3, 2x - y = 0',
    'y = 2x + 1, x + y = 7'
  ]

  for (const sys of SYSTEM_CASES) {
    it(`System of equations: ${sys}`, () => {
      const w = solveLatex(sys)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.answers.length).toBeGreaterThanOrEqual(2)
    })
  }

  // 9. Inequalities
  const INEQUALITY_CASES = [
    '2x - 3 < 5',
    String.raw`-2x+1\geq 5`,
    String.raw`x^2-4\leq 0`
  ]

  for (const ineq of INEQUALITY_CASES) {
    it(`Inequality: ${ineq}`, () => {
      const w = solveLatex(ineq)
      expect(w).not.toBeNull()
      expect(w?.error).toBeUndefined()
      expect(w?.noWorking).toBeFalsy()
      expect(w?.checked).toBe('ok')
      expect(w?.answers.length).toBeGreaterThan(0)
    })
  }

  // 10. Offline Limits
  const LIMIT_CASES = [
    [String.raw`\lim_{x\to 1}\frac{x^2-1}{x-1}`, 'Cancelling a common factor'],
    [String.raw`\lim_{x\to 2}\frac{x^2-4}{x-2}`, 'Cancelling a common factor'],
    [String.raw`\lim_{x\to 0}\frac{\sin x}{x}`, 'Standard limit'],
    [String.raw`\lim_{x\to 0}\frac{1-\cos x}{x^2}`, "L'Hôpital's rule"],
    [String.raw`\lim_{x\to \infty}\frac{3x^2+1}{x^2-2}`, 'Dividing by the highest power'],
    [String.raw`\lim_{x\to 2}(x^2+3x)`, 'Putting the point in']
  ]

  for (const [limitInput, expectedMethod] of LIMIT_CASES) {
    it(`Offline Limit: ${limitInput}`, () => {
      const w = solveLatex(limitInput)
      expect(w).toBeDefined()
      expect(w?.checked).toBe('ok')
      expect(w?.method).toBe(expectedMethod)
      for (const m of w?.moves ?? []) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }

  // 11. Differentiation Questions (Calculus Engine)
  const DIFF_EVAL_CASES = [
    { latex: String.raw`\frac{d}{dx}\left(x^{3}\sin x\right)`, expected: '3x² sin(x) + x³ cos(x)' },
    { latex: String.raw`\frac{d}{dt}\left(t^{3}\right)`, expected: '3t²' },
    { latex: String.raw`\frac{d}{dx}\left(x^{2}+3x\right)`, expected: '2x + 3' },
    { latex: String.raw`\frac{d}{dx}\left(x^{4}-5x\right)`, expected: '4x³ − 5' },
    { latex: String.raw`\frac{d}{dx}\left(\sin x\right)`, expected: 'cos(x)' },
    { latex: String.raw`\frac{d}{dx}\left(\cos x\right)`, expected: '−sin(x)' }
  ]

  for (const c of DIFF_EVAL_CASES) {
    it(`Differentiation evaluation: ${c.latex}`, () => {
      const card = evaluateInput('COMP', c.latex, { vars: {}, ans: 0, angle: 'deg' })
      expect(card).toBeDefined()
      expect(card?.error).toBeUndefined()
      expect(card?.main).toBe(c.expected)
    })
  }

  const DIFF_FIXTURES = [
    { name: 'derivative-product', expectedMethod: 'Product rule' },
    { name: 'derivative-quotient', expectedMethod: 'Quotient rule' },
    { name: 'derivative-chain', expectedMethod: 'Chain rule' },
    { name: 'derivative-exp-chain', expectedMethod: 'Chain rule' },
    { name: 'derivative-polynomial', expectedMethod: undefined },
    { name: 'derivative-tan', expectedMethod: undefined }
  ]

  for (const f of DIFF_FIXTURES) {
    it(`Differentiation step-by-step working: ${f.name}`, () => {
      const file = JSON.parse(readFileSync(repoPath('tests', 'fixtures', 'calculus', `${f.name}.json`), 'utf8'))
      const w = derivativeWorking(file.result as DerivTree, file.payload.expr)
      expect(w).toBeDefined()
      expect(w.title).toBe('Differentiate')
      expect(w.error).toBeUndefined()
      expect(w.checked).toBe('ok')
      expect(w.method).toBe(f.expectedMethod)
      expect(w.moves.length).toBeGreaterThan(0)
      expect(w.answers.length).toBeGreaterThan(0)
      for (const m of w.moves) {
        const tex = m.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
      for (const a of w.answers) {
        const tex = a.tex
        if (tex) expect(() => katex.renderToString(tex, { throwOnError: true })).not.toThrow()
      }
    })
  }
})

describe('Rigorous Bug Fix Stress Testing', () => {
  it('Graphing arithmetic: handles 2+2, 10*5, sqrt(16), 3^2 + 4^2 smoothly', async () => {
    const expressions = ['2 + 2', '10 * 5', 'sqrt(16)', '3^2 + 4^2']
    for (const expr of expressions) {
      const res = await addExpressionLine(expr)
      expect(res.ok).toBe(true)
    }
    const rows = expressionRows(scene().objects, scene().order, scene().ev)
    const calcRows = rows.filter((r) => r.kind === 'calc')
    expect(calcRows.length).toBe(4)
    expect(calcRows[0].value).toBe(4)
    expect(calcRows[1].value).toBe(50)
    expect(calcRows[2].value).toBe(4)
    expect(calcRows[3].value).toBe(25)
  })

  it('Graphing arithmetic allows chaining variables into equations', async () => {
    const resA = await addExpressionLine('a = 2 + 2')
    expect(resA.ok).toBe(true)
    const resGraph = await addExpressionLine('y = a * x')
    expect(resGraph.ok).toBe(true)
    const graphs = Object.values(scene().objects).filter((o) => o.type === 'graph')
    expect(graphs.length).toBe(1)
  })

  it('Calculator mode: showBeside and hidePanel toggle viewport cleanly', () => {
    fakeDock(1600, { maths: 'centre', viewport: 'centre' })
    useApp.setState({ mode: 'calculator' })
    showBeside('viewport', 'maths')
    expect(isPanelOpen('viewport')).toBe(true)

    hidePanel('viewport')
    expect(isPanelOpen('viewport')).toBe(false)
  })
})
