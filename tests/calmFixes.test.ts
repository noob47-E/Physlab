// Calm fixes chosen by the owner from the learning research report (18 Oct, 09\research): a typed curve no longer marks
// every zero, turning point and crossing by itself (they show while the curve is selected or under the pointer, or for good
// from the right-click menu), and the welcome box offers every mode the Esc wheel offers, Lab Data included.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { WELCOME_TILES } from '../src/renderer/src/app/tour/Tour'
import { WHEEL_MODES } from '../src/renderer/src/app/modeWheelData'
import { resetGlobals } from './helpers/globals'

describe('a typed curve is drawn without a dot on every zero, turning point and crossing', () => {
  beforeEach(() => {
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    scene().setActiveSpace('graphing')
  })

  it('y = sin(x) starts with its roots and turning points marked only on demand', async () => {
    await runCommand('y = sin(x)')
    const g = scene().order.map((id) => scene().objects[id]).find((o) => o?.type === 'graph') as { showRoots?: boolean; showExtrema?: boolean }
    expect(g.showRoots).toBe(false)
    expect(g.showExtrema).toBe(false)
  })
})

describe('the welcome box', () => {
  it('offers every mode the Esc wheel offers, Lab Data included', () => {
    const tiles = new Set(WELCOME_TILES.map((t) => t.mode as string))
    for (const m of WHEEL_MODES) expect(tiles.has(m.id), m.label).toBe(true)
  })
})

describe("the simple Sandbox panel's energy line", () => {
  it('is left out for the lever (turning moments), and kept for the other experiments', async () => {
    const { simpleEnergyHidden } = await import('../src/renderer/src/panels/sandbox/EnergyLedger')
    expect(simpleEnergyHidden('seesaw')).toBe(true)
    expect(simpleEnergyHidden('pendulum')).toBe(false)
    expect(simpleEnergyHidden(null)).toBe(false)
  })
})
