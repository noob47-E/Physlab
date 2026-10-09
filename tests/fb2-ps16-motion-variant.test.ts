// FB2 PS-16 (checked, REFUTED): the lead said "Show readings in Lab Data" on a new variant of the
// same motion question re-used the last variant's table, so a student read old numbers and was
// marked wrong. The table is keyed by the problem's id, which is `${q.id}#${seed}`: a new variant
// gets its own table with its own readings. This test pins that.
import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { scene } from '../src/renderer/src/core/store'
import { useLab } from '../src/renderer/src/lab/labStore'
import { playQuestion, showMotion } from '../src/renderer/src/questions/player'
import type { PQMotion, PQQuestion } from '../src/renderer/src/questions/pqjson'
import type { MeasureSettings } from '../src/renderer/src/math/format'

const SETTINGS: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

const motion: PQMotion = {
  segments: [
    { kind: 'uniform', duration: '5', v: 'v' },
    { kind: 'accelerate', duration: 't', a: '-v / t' }
  ],
  plots: ['x-t', 'v-t'],
  sampleEvery: '1'
}

const question: PQQuestion = {
  id: 'fb2-train',
  title: 'Braking train',
  statement: 'A train at {v} m/s brakes for {t} s.',
  license: { id: 'CC BY 4.0', holder: 'PhysLab' },
  variables: [
    { name: 'v', def: { kind: 'range', from: 10, to: 30, step: 1 } },
    { name: 't', def: { kind: 'range', from: 2, to: 6, step: 1 } }
  ],
  parts: [{ type: 'number', prompt: 'Distance?', answer: 'v * 5 + v * t / 2', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
  motion
}

describe('FB2 PS-16 (refuted): a new variant of a motion question gets its own Lab Data table', () => {
  beforeEach(() => {
    resetGlobals()
    scene().newScene()
    useLab.getState().setTables([])
  })

  it('two seeds with different numbers make two tables, each with its own variant\'s readings', () => {
    const first = playQuestion(question, 1, SETTINGS)
    let seed = 2
    while (playQuestion(question, seed, SETTINGS).variant.values.v === first.variant.values.v) seed++
    const second = playQuestion(question, seed, SETTINGS)

    const before = useLab.getState().tables.length
    expect(showMotion(motion, first, SETTINGS).rows).toBeGreaterThan(0)
    const shown = showMotion(motion, second, SETTINGS)
    expect(shown.rows).toBeGreaterThan(0)

    const tables = useLab.getState().tables.slice(before)
    expect(tables).toHaveLength(2)
    expect(useLab.getState().currentId).toBe(tables[1].id)
    const last = tables[1].rows[tables[1].rows.length - 1]
    const { v, t } = second.variant.values
    expect(last[1]).toBeCloseTo(v * 5 + (v * t) / 2, 2)
  })
})
