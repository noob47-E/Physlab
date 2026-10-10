// CW3 bug found (not fixed here: it changes what a student sees). A vector typed with a unit of two
// words keeps only the first: `T = 10 N m ∠ 30°` (a torque) is stored with the unit N, so its label
// reads "10 N ∠ 30°" where it should read "10 N m ∠ 30°". Marked it.fails, so the suite stays green
// and the bug stays proved; the fix batch after the clean-up removes the mark. (Were a two-word unit
// kept, render/Labels.tsx's components would then need its unit-cutting regex replaced too: it cuts
// only the last word.)

import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { measureText } from '../../src/renderer/src/render/Labels'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { scene } from '../../src/renderer/src/core/store'
import { resetGlobals } from '../helpers/globals'

describe('a vector typed with a two-word unit', () => {
  it.fails('keeps the whole unit in its label', async () => {
    resetGlobals()
    scene().newScene()
    scene().setActiveSpace('vectors')
    await runCommand('T = 10 N m ∠ 30°')
    const s = scene()
    const id = s.order.find((k) => s.objects[k].name === 'T')!
    expect(measureText(s.objects[id], s.ev.values.get(id), s.settings, false)).toBe('10 N m ∠ 30°')
  })
})
