// G2c (wave head, 18 Oct; Azure's review of G2b): the Expressions add box.
//
// 1. The panel ran its own copy of the add logic, not the tested addExpressionLine: it judged a line by the LAST Console entry, so an
//    older line's error could roll back a good graph, and it rolled back every line that was not a graph (a = 3 too).
// 2. A refused line cleared the box and, with the Console hidden and putBack restoring the log, said nothing: the student's text was
//    gone without a reason. The box keeps the text now and the reason shows under it.
// 3. A line that draws nothing (2 + 3) was "accepted" by addExpressionLine and vanished into the hidden Console.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { addExpressionLine } from '../src/renderer/src/panels/expressionRows'
import { scene } from '../src/renderer/src/core/store'
import { readSource } from './helpers/repo'
import { resetGlobals } from './helpers/globals'

beforeEach(() => {
  resetGlobals()
  scene().newScene()
  scene().clearLog()
  scene().setActiveSpace('graphing')
})

const graphs = () => Object.values(scene().objects).filter((o) => o.type === 'graph')

describe('G2c: the add box judges a line by what that line did', () => {
  it('a good line is kept even when the Console ends with an older line’s error', async () => {
    scene().pushLog({ input: 'old', kind: 'error', text: 'An older line went wrong.' })
    const res = await addExpressionLine('y = 2x')
    expect(res.ok).toBe(true)
    expect(graphs()).toHaveLength(1)
  })

  it('a refused line comes back with its own reason, and the scene and the Console are as they were', async () => {
    scene().pushLog({ input: 'old', kind: 'info', text: 'Before.' })
    const logBefore = scene().log.length
    const res = await addExpressionLine('y = a * / 2', ['a'])
    expect(res.ok).toBe(false)
    expect(res.reason).toBeTruthy()
    expect(res.reason).not.toBe('empty')
    expect(graphs()).toHaveLength(0)
    expect(Object.values(scene().objects).filter((o) => o.type === 'number')).toHaveLength(0)
    expect(scene().log.length).toBe(logBefore)
  })

  it('a simple arithmetic line like 2 + 3 is evaluated and kept as a calculation row', async () => {
    const res = await addExpressionLine('2 + 3')
    expect(res.ok).toBe(true)
    const nums = Object.values(scene().objects).filter((o) => o.type === 'number')
    expect(nums.length).toBe(1)
    expect(nums[0].expr).toBe('2 + 3')
  })

  it('a line that neither draws nor computes is refused in words: foobar', async () => {
    const res = await addExpressionLine('foobar')
    expect(res.ok).toBe(false)
    expect(res.reason).toBeTruthy()
  })

  it('a line that makes something other than a graph is still kept: a = 3', async () => {
    const res = await addExpressionLine('a = 3')
    expect(res.ok).toBe(true)
    expect(Object.values(scene().objects).some((o) => o.type === 'number' && o.name === 'a')).toBe(true)
  })
})

describe('G2c: the panel', () => {
  const src = readSource('src/renderer/src/panels/Expressions.tsx')
  const addLine = src.slice(src.indexOf('const addLine'), src.indexOf('return (', src.indexOf('const addLine')))

  it('adds through addExpressionLine, the tested route, and runs no command of its own', () => {
    expect(addLine).toMatch(/await addExpressionLine\(text, offers\)/)
    expect(addLine).not.toMatch(/runCommand\(/)
  })

  it('clears the box only when the line was kept, and shows the reason under it otherwise', () => {
    expect(addLine).toMatch(/if \(res\.ok\) \{[\s\S]*setDraft\(''\)/)
    expect(addLine).toMatch(/setAddProblem\(res\.reason/)
    expect(src).toMatch(/\{addProblem && \(\s*<div role="status"/)
  })
})
