// G4: the engine switch. A request belongs to a class (the scoreboard's seven); a class answered by Giac has every
// answer proved by its G2 checker before it is shown, and anything short of a proof falls back to SymPy — never to a
// wrong answer. A class may be given to Giac only with the scoreboard's evidence: ≥ 92 % right and 0 WRONG on the
// gating corpus AND on the external holdout.

import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { classOf, ENGINE_FOR_CLASS, GATE, routedAsk, type EngineClass } from '../../src/renderer/src/math/engine/switch'
import type { EngineJob, EngineRequest, EngineResult, MathEngine } from '../../src/renderer/src/math/engine/types'
import { repoPath } from '../helpers/repo'

const req = (r: Partial<EngineRequest>): EngineRequest => ({ deg: false, ...r })

describe('classOf: which scoreboard class a request is', () => {
  const cases: [EngineJob, Partial<EngineRequest>, EngineClass | null][] = [
    ['expand', { expr: '(x + 1)*(x - 2)' }, 'expand'],
    ['expand', { expr: '(a + b)^2' }, null], // the evidence is in one letter only
    ['expand', { expr: 'sin(x)*(x + 1)' }, null],
    ['factor', { expr: 'x^2 - 1' }, 'factor over Q'],
    ['factor', { expr: 'x^2 - y^2' }, null],
    ['factor', { expr: 'x((b)^(2)-a)+6((b)^(2)-a)' }, null], // the external item in several letters never reaches Giac (G4b review)
    ['factor', { expr: 'x^2 - 2*sqrt(2)' }, null],
    ['solve', { eqs: ['x^2 - 3*x + 2 = 0'], vars: ['x'] }, 'polynomial equations'],
    ['solve', { eqs: ['x^3 = x'] }, 'polynomial equations'],
    ['solve', { eqs: ['sin(x) = 0.5'], vars: ['x'] }, null],
    ['solve', { eqs: ['1/x = 2'], vars: ['x'] }, null],
    ['solve', { eqs: ['x + y = 3', 'x - y = 1'], vars: [] }, 'linear systems'],
    ['solve', { eqs: ['x*y = 3', 'x - y = 1'], vars: [] }, null],
    ['solve', { eqs: ['x = 1', '2*x = 2'], vars: [] }, null], // one letter: outside the evidence (2 or 3 letters)
    ['solve', { eqs: ['a + b + c + d = 1', 'a - b = 0', 'c - d = 0', 'a + d = 2'], vars: [] }, null], // four letters
    ['solve', { eqs: ['x + y + z = 6', 'x - y = 0', 'y - z = 0'], vars: [] }, 'linear systems'],
    ['simplify', { expr: '(x^2 - 1)/(x - 1)' }, 'rational simplification'],
    ['simplify', { expr: 'sin(x)^2 + cos(x)^2' }, null],
    ['simplify', { expr: '(x^2 - y^2)/(x - y)' }, null],
    ['diff', { expr: 'x^3', var: 'x', order: 1 }, 'derivatives'],
    ['diff', { expr: 'x^3', var: 'x', order: 2 }, null],
    ['diff', { expr: 'x^3', var: 'x', order: 1, at: '2' }, null],
    ['apart', { expr: '1/(x*(x + 1))' }, 'partial fractions'],
    ['apart', { expr: '1/(x*(y + 1))' }, null],
    ['integrate', { expr: 'x', var: 'x' }, null],
    ['eval', { expr: '2 + 3' }, null]
  ]
  it.each(cases)('%s %j → %s', (job, r, cls) => expect(classOf(job, req(r))).toBe(cls))
  it('degrees mode is never a class: trig answers depend on it', () => {
    expect(classOf('expand', req({ expr: '(x + 1)^2', deg: true }))).toBe('expand')
    expect(classOf('simplify', req({ expr: 'sin(x)/x', deg: true }))).toBe(null)
  })
})

/** A stand-in engine that answers from a table, and counts its calls. */
function fake(name: string, answer: (job: EngineJob, r: EngineRequest) => EngineResult | Error): MathEngine & { calls: number } {
  const e = {
    name,
    jobs: new Set<EngineJob>(['expand', 'factor', 'solve', 'simplify', 'diff', 'apart']),
    calls: 0,
    ask: vi.fn(async (job: EngineJob, r: EngineRequest) => {
      e.calls++
      const a = answer(job, r)
      if (a instanceof Error) throw a
      return a
    })
  }
  return e as unknown as MathEngine & { calls: number }
}
const text = (t: string): EngineResult => ({ latex: t, text: t, numeric: null })

describe('routedAsk: Giac only where switched, proved before shown, SymPy behind it', () => {
  const r = req({ expr: '(x + 1)*(x - 2)' })
  it('a class left on SymPy never asks Giac', async () => {
    const sympy = fake('sympy', () => text('x^2 - x - 2'))
    const giac = fake('giac', () => text('x^2 - x - 2'))
    const ask = routedAsk({ sympy, giac }, { expand: 'sympy' })
    expect((await ask('expand', r)).text).toBe('x^2 - x - 2')
    expect(giac.calls).toBe(0)
  })
  it('a switched class shows Giac’s answer when its checker proves it, and asks SymPy nothing', async () => {
    const sympy = fake('sympy', () => text('x^2 - x - 2'))
    const giac = fake('giac', () => text('x^2 - x - 2'))
    const ask = routedAsk({ sympy, giac }, { expand: 'giac' })
    expect((await ask('expand', r)).text).toBe('x^2 - x - 2')
    expect([giac.calls, sympy.calls]).toEqual([1, 0])
  })
  it('a wrong Giac answer is never shown: SymPy answers instead', async () => {
    const sympy = fake('sympy', () => text('x^2 - x - 2'))
    const giac = fake('giac', () => text('x^2 - x + 2'))
    const ask = routedAsk({ sympy, giac }, { expand: 'giac' })
    expect((await ask('expand', r)).text).toBe('x^2 - x - 2')
    expect(sympy.calls).toBe(1)
  })
  it('an answer the checker cannot prove, an error, or a throw also falls back', async () => {
    const sympy = fake('sympy', () => text('3*x^2'))
    // 3x² + 0·sin x is proved right since G2B; sin² x + cos² x − 1 needs an identity between functions, so it is not.
    for (const g of [() => text('3*x^2 + sin(x)^2 + cos(x)^2 - 1'), () => ({ ...text(''), error: 'stopped' }), () => new Error('worker died')]) {
      const giac = fake('giac', g)
      const ask = routedAsk({ sympy, giac }, { derivatives: 'giac' })
      expect((await ask('diff', req({ expr: 'x^3', var: 'x', order: 1 }))).text).toBe('3*x^2')
    }
  })
  it('an answer that comes with an error is never shown, even with right text (review case)', async () => {
    const sympy = fake('sympy', () => text('x^2 - 1'))
    const giac = fake('giac', () => ({ ...text('x^2 - 1'), error: 'stopped' }))
    await routedAsk({ sympy, giac }, { expand: 'giac' })('expand', req({ expr: '(x - 1)*(x + 1)' }))
    expect(sympy.calls).toBe(1)
  })
  it('a Giac answer that never comes falls back after the time limit (review case)', async () => {
    const sympy = fake('sympy', () => text('x^2 - x - 2'))
    const giac = { ...fake('giac', () => text('')), ask: () => new Promise<EngineResult>(() => {}) } as unknown as MathEngine
    const ask = routedAsk({ sympy, giac }, { expand: 'giac' }, {}, 50)
    expect((await ask('expand', r)).text).toBe('x^2 - x - 2')
  })
  it('a request outside every class goes where ENGINE_FOR sends its job', async () => {
    const sympy = fake('sympy', () => text('1/2'))
    const giac = fake('giac', () => text('1/2'))
    const ask = routedAsk({ sympy, giac }, { 'rational simplification': 'giac' })
    await ask('simplify', req({ expr: 'sin(x)^2 + cos(x)^2' }))
    expect(giac.calls).toBe(0)
  })
  it('a switched linear system: a right family is shown, a wrong one falls back', async () => {
    const eqs = ['x + y = 1', '2*x + 2*y = 2']
    const family = (y: string): EngineResult => ({ latex: '', text: '', numeric: null, solutions: [{ x: { latex: '', text: `1 - ${y}`, numeric: null } }] })
    const sympy = fake('sympy', () => family('y'))
    const ok = fake('giac', () => family('y'))
    expect((await routedAsk({ sympy, giac: ok }, { 'linear systems': 'giac' })('solve', req({ eqs, vars: [] }))).solutions?.[0].x.text).toBe('1 - y')
    expect(sympy.calls).toBe(0)
    const bad = fake('giac', () => family('2*y'))
    await routedAsk({ sympy, giac: bad }, { 'linear systems': 'giac' })('solve', req({ eqs, vars: [] }))
    expect(sympy.calls).toBe(1)
  })
})

describe('the gate: a class is Giac’s only with the scoreboard’s evidence', () => {
  const results = (file: string) => {
    const path = repoPath('tests', 'engine', 'scoreboard', 'results', file)
    return fs.existsSync(path) ? (JSON.parse(fs.readFileSync(path, 'utf8')) as { corpora: Record<string, Record<string, { total: number; right: number; wrong: number }>> }) : null
  }
  it('the rule is G4’s: at least 92 % right and no WRONG', () => {
    expect(GATE).toEqual({ minRight: 0.92, maxWrong: 0 })
  })
  it('every class switched to Giac passes on the gating corpus and on the external holdout', () => {
    const scored = results('giac.json')
    const external = results('giac-external.json')
    for (const [cls, engine] of Object.entries(ENGINE_FOR_CLASS)) {
      if (engine !== 'giac') continue
      for (const [name, file] of [['gating', scored?.corpora.gating], ['external', external?.corpora.external]] as const) {
        const s = file?.[cls]
        expect(s, `${cls}: no ${name} result`).toBeTruthy()
        expect(s!.wrong, `${cls}: WRONG on ${name}`).toBe(0)
        expect(s!.right / s!.total, `${cls}: % right on ${name}`).toBeGreaterThanOrEqual(GATE.minRight)
      }
    }
  })
})
