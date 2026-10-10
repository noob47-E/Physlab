// Golden sweep `pointer` (CLEANUP-PLAN.md §2): the Move tool's pure decisions — what a drag of each
// object moves, whether a press may drag it, what a click does to the selection, how the pointer
// tips write their numbers — and each tool's shelf label and whether it makes points on empty space.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { canDrag, collectFreePoints, selectionAfterClick, tipAngle, tipLength, tipNumber } from '../../src/renderer/src/render/pointerMath'
import { createsPointsOnEmpty, shelfFitLabel, TOOLS } from '../../src/renderer/src/render/tools'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { scene } from '../../src/renderer/src/core/store'
import type { V3 } from '../../src/renderer/src/math/vec'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf, freezeClock } from './harness'
import { CLICKS, SCENES, TIP_VALUES } from './inputs/pointer'

beforeAll(freezeClock)
beforeEach(resetGlobals)

async function sceneLines(): Promise<string[]> {
  const lines: string[] = []
  for (const sc of SCENES) {
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    scene().setActiveSpace(sc.space)
    for (const l of sc.lines) await runCommand(l)
    const s = scene()
    const errors = s.log.filter((e) => e.kind === 'error').map((e) => e.text)
    const objs = s.order.map((id) => {
      const o = s.objects[id]
      const free = new Map<string, V3>()
      collectFreePoints(o, s.objects, free)
      const moves = [...free.keys()].map((k) => s.objects[k]?.name ?? k).join('+') || '—'
      return `${o.name}(${o.type}) drag=${canDrag(o, s.objects) ? 'yes' : 'no'} moves=${moves}`
    })
    lines.push(goldenLine(`SCENE ${sc.name}`, [...(errors.length ? [`errors: ${errors.join(' / ')}`] : []), ...objs].join(' | ')))
  }
  return lines
}

function pureLines(): string[] {
  const lines: string[] = []
  for (const [sel, hit, shift, moved] of CLICKS)
    lines.push(goldenLine(`CLICK sel=[${sel}] on ${hit} shift=${shift} moved=${moved}`, seenOf(() => JSON.stringify(selectionAfterClick(sel, hit, shift, moved)))))
  const s = scene().settings
  for (const v of TIP_VALUES)
    lines.push(goldenLine(`TIP ${v}`, seenOf(() => `length ${tipLength(v, s)} | angle ${tipAngle(v, s)} | number ${tipNumber(v, s)}`)))
  for (const t of TOOLS) lines.push(goldenLine(`TOOL ${t.id}`, `label ${shelfFitLabel(t.id)} | points on empty space ${createsPointsOnEmpty(t.id)}`))
  return lines
}

async function sweep(): Promise<string[]> {
  return [...(await sceneLines()), ...pureLines()]
}

describe('golden sweep: pointer', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  })

  it('matches tests/golden/out/pointer.txt', async () => {
    expectGolden('pointer', await sweep())
  })
})
