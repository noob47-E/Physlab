// Golden sweep `labels` (CLEANUP-PLAN.md §2): the text each object's label writes on the drawing
// (render/Labels.tsx measureText, short and full), for real objects made through the command bar,
// under two precision settings (2 d.p. and 3 s.f.). The other label writers named in §2 (overlay,
// Grid, recording, animMath, motion) export no pure text function today; CW3 moves their number
// writing into math/format.ts and adds them here when it does.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { measureText } from '../../src/renderer/src/render/Labels'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { scene } from '../../src/renderer/src/core/store'
import type { SceneSettings } from '../../src/renderer/src/core/types'
import { resetGlobals } from '../helpers/globals'
import { expectGolden, goldenLine, seenOf, freezeClock } from './harness'
import { SCENES } from './inputs/pointer'

beforeAll(freezeClock)
beforeEach(resetGlobals)

/** More scenes with numbers a label must write carefully: tiny, huge, negative, irrational. */
const EXTRA: { name: string; space: 'vectors' | 'shapes' | 'graphing'; lines: string[] }[] = [
  { name: 'tiny and huge vectors', space: 'vectors', lines: ['A = <1.6e-19, 0>', 'B = <3e8, 4e8>', 'C = 10 N ∠ 30°'] },
  { name: 'an irrational triangle', space: 'shapes', lines: ['Triangle((0,0), (1,0), (0.5, 0.866025403784))'] },
  { name: 'a negative point and a number', space: 'vectors', lines: ['P = (-3.75, 2.5)', 'k = 1/3'] }
]

const PRECISIONS: [string, Partial<SceneSettings>][] = [
  ['2 d.p.', { precisionMode: 'dp', decimals: 2 } as Partial<SceneSettings>],
  ['3 s.f.', { precisionMode: 'sf', decimals: 3 } as Partial<SceneSettings>]
]

async function sweep(): Promise<string[]> {
  const lines: string[] = []
  for (const sc of [...SCENES, ...EXTRA]) {
    for (const [pname, patch] of PRECISIONS) {
      resetGlobals()
      scene().newScene()
      scene().setSettings(patch)
      scene().setActiveSpace(sc.space)
      for (const l of sc.lines) await runCommand(l)
      const s = scene()
      for (const id of s.order) {
        const o = s.objects[id]
        const c = s.ev.values.get(id)
        lines.push(goldenLine(`${sc.name} | ${pname} | ${o.name}`, seenOf(() => `${measureText(o, c, s.settings, false)}  ||  ${measureText(o, c, s.settings, true)}`)))
      }
    }
  }
  return lines
}

describe('golden sweep: labels', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  })

  it('matches tests/golden/out/labels.txt', async () => {
    expectGolden('labels', await sweep())
  })
})
