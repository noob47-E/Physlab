// P-GCALC GC6: the ready-made example pictures draw, through the command bar, with no error.

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { EXAMPLES } from '../src/renderer/src/panels/Examples'
import { runCommand } from '../src/renderer/src/lang/commands'
import { scene } from '../src/renderer/src/core/store'
import { resetGlobals } from './helpers/globals'

const PICTURES = ['A smiley face', 'A flower', 'Waves that move', 'A shaded window']

describe('the example pictures', () => {
  it('are all there, in Graphs & functions, Basic', () => {
    for (const t of PICTURES) expect(EXAMPLES.find((e) => e.title === t), t).toMatchObject({ area: 'Graphs & functions', level: 'Basic' })
  })

  for (const title of PICTURES)
    it(`${title} draws with no error and leaves graphs in the Graphing drawing`, async () => {
      const ex = EXAMPLES.find((e) => e.title === title)!
      resetGlobals()
      scene().newScene()
      scene().clearLog()
      scene().setActiveSpace('graphing')
      for (const c of ex.commands) await runCommand(c)
      expect(scene().log.filter((l) => l.kind === 'error')).toEqual([])
      const graphs = Object.values(scene().objects).filter((o) => o.type === 'graph' && o.space === 'graphing')
      expect(graphs.length).toBe(ex.commands.filter((c) => !/^[a-z] = -?\d+(\.\d+)?$/.test(c)).length)
      expect(`${ex.what} ${ex.tryThis}`).not.toMatch(/\^/)
      expect(ex.tryThis).toMatch(/Save it with File ▸ Export the drawing as an image…$/)
    })
})
