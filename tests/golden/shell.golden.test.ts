import { beforeAll, describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { expectGolden, goldenLine, seenOf, freezeClock } from './harness'
import { resetGlobals } from '../helpers/globals'
import { useScene } from '../../src/renderer/src/core/store'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { clampPrecision, scaleFromText } from '../../src/renderer/src/app/topBarInputs'
import { SHELL_PRECISION_INPUTS, SHELL_SCALE_INPUTS } from './inputs/shell'

beforeAll(freezeClock)
beforeEach(() => {
  resetGlobals()
  useScene.getState().newScene()
})

async function sweep(): Promise<string[]> {
  resetGlobals()
  useScene.getState().newScene()
  // A new scene keeps the space the last one was in, and changing space marks it changed: start
  // every run in Vectors, the app's first space, with nothing to save.
  useScene.getState().setActiveSpace('vectors')
  useScene.setState({ dirty: false })
  const lines: string[] = []
  
  for (const input of SHELL_PRECISION_INPUTS) {
    lines.push(goldenLine(`clampPrecision ${input.val} ${input.mode}`, seenOf(() => clampPrecision(input.val, input.mode).toString())))
  }
  
  for (const input of SHELL_SCALE_INPUTS) {
    lines.push(goldenLine(`scaleFromText "${input}"`, seenOf(() => String(scaleFromText(input)))))
  }

  const stateStr = () => {
    const s = useScene.getState()
    return `objects: ${s.order.length}, dirty: ${s.dirty}, activeSpace: ${s.activeSpace}`
  }
  
  lines.push(goldenLine('SESSION initial', seenOf(() => stateStr())))
  
  lines.push(goldenLine('SESSION setActiveSpace graphing', seenOf(() => {
    useScene.getState().setActiveSpace('graphing')
    return stateStr()
  })))
  
  await runCommand('A = (0, 0)')
  lines.push(goldenLine('SESSION add point A = (0, 0)', seenOf(() => stateStr())))
  
  lines.push(goldenLine('SESSION undo', seenOf(() => {
    useScene.getState().undo()
    return stateStr()
  })))
  
  lines.push(goldenLine('SESSION redo', seenOf(() => {
    useScene.getState().redo()
    return stateStr()
  })))
  
  lines.push(goldenLine('SESSION setSettings', seenOf(() => {
    useScene.getState().setSettings({ decimals: 3 })
    const s = useScene.getState()
    return `decimals: ${s.settings.decimals}, dirty: ${s.dirty}`
  })))
  
  lines.push(goldenLine('SESSION clearDrawing', seenOf(() => {
    useScene.getState().clearDrawing()
    return stateStr()
  })))
  
  return lines
}

describe('golden sweep: shell', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  })

  it('matches tests/golden/out/shell.txt', async () => {
    expectGolden('shell', await sweep())
  })
})
