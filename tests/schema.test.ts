// CW5, file formats checked at the door (CLEANUP-PLAN.md §2 "CW5"). Each door — a .phys project,
// a .pqjson question file, a Numbas .exam — is fed 500 damaged copies of real files. None may
// throw anything but one plain sentence: no TypeError, no "undefined", no stack.

import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { useScene } from '../src/renderer/src/core/store'
import { parsePQFile, serializePQFile } from '../src/renderer/src/questions/pqjson'
import { parseSceneFile } from '../src/renderer/src/core/migrate'
import { fromExam, toExam } from '../src/renderer/src/questions/numbas'
import { FILES_CORPUS } from './golden/inputs/files'
import { fuzz } from './helpers/fileFuzz'

const BANK_DIR = join(__dirname, '../src/renderer/src/questions/bank')
const banks = readdirSync(BANK_DIR)
  .filter((f) => f.endsWith('.pqjson'))
  .map((f) => readFileSync(join(BANK_DIR, f), 'utf8'))

const goodProjects = FILES_CORPUS.filter((f) => !f.name.startsWith('damaged')).map((f) => f.text)

const openProject = (text: string): void => useScene.getState().loadScene(JSON.parse(text))
const openQuestions = (text: string): void => void parsePQFile(text)
const openExam = (text: string): void => void fromExam(text)
const exams = (): string[] => banks.slice(0, 3).map((b) => toExam(parsePQFile(b)).replace(/^[^\n]*\n/, ''))

describe('CW5: 500 damaged files per format — none crashes', () => {
  // CW5-1: a format-1 project (before 0.3.11) with an object that has no `def` crashes the format-1
  // step (v1ToV2 reads def.kind) instead of opening as the same object does in format 7.
  it.fails('CW5-1: .phys, opened and evaluated', () => {
    expect(fuzz(goodProjects, openProject).crash.slice(0, 5)).toEqual([])
  }, 30_000)

  it('.pqjson', () => {
    expect(fuzz(banks, openQuestions).crash.slice(0, 5)).toEqual([])
  }, 30_000)

  it('.exam', () => {
    const found = fuzz(exams(), openExam)
    expect([...found.crash, ...found.words].slice(0, 5)).toEqual([])
  }, 30_000)
})

describe('CW5: a refusal names what is wrong in words', () => {
  it('.phys refusals', () => {
    expect(fuzz(goodProjects, openProject).words.slice(0, 5)).toEqual([])
  }, 30_000)

  // CW5-2: a question file refused for a damaged unit, variable, mark or rung prints the damaged
  // value as JavaScript writes it: "uses a unit PhysLab does not know: [object Object].", "chooses
  // 'a12' in a way PhysLab does not know: undefined.", "a part worth null marks", "on rung [object Object]".
  it.fails('CW5-2: .pqjson refusals', () => {
    expect(fuzz(banks, openQuestions).words.slice(0, 5)).toEqual([])
  }, 30_000)
})

describe('CW5: the Calculator history kept in storage', () => {
  /** The history a fresh start reads: calcStore reads it once, when it is loaded. */
  async function historyFrom(stored: string | null): Promise<unknown[]> {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'physlab.calc.history' ? stored : null), setItem: () => {} })
    const { useCalc } = await import('../src/renderer/src/calc/calcStore')
    vi.unstubAllGlobals()
    return useCalc.getState().history
  }
  const item = { input: '1+1', result: '2', mode: 'COMP' }

  it('reads a saved list as it was, at most 100 items, and nothing from anything else', async () => {
    expect(await historyFrom(JSON.stringify([item]))).toEqual([item])
    expect(await historyFrom(JSON.stringify(Array.from({ length: 120 }, () => item)))).toHaveLength(100)
    for (const s of [null, '', 'null', '{}', '5', '"x"', '{bad']) expect(await historyFrom(s)).toEqual([])
  }, 30_000)

  // CW5-4: an item is not checked, so a damaged entry (null, a number) reaches the history drawer,
  // which reads h.mode and h.input from it and fails to draw when opened.
  it.fails('CW5-4: a damaged item in the saved list is left out', async () => {
    expect(await historyFrom(JSON.stringify([null, 5, item]))).toEqual([item])
  }, 30_000)
})

describe('CW5: the leads, one file each', () => {
  // CW5-1, the smallest case: format 7 opens a point with no `def` (it is drawn as an error);
  // format 1 crashes on it with a raw TypeError.
  it('a format-7 object with no def opens', () => {
    expect(() => parseSceneFile('{"app":"PhysLab","version":7,"objects":[{"id":"1","type":"point","name":"A"}]}')).not.toThrow()
  })
  it.fails('CW5-1: a format-1 object with no def opens as it does in format 7', () => {
    expect(() => parseSceneFile('{"app":"PhysLab","version":1,"objects":[{"id":"1","type":"point","name":"A"}]}')).not.toThrow()
  })

  // CW5-3: the importer keeps any two finite numbers as an expression part's sampling range, so
  // [1, 1] or [5, 1] comes in; the question file's own check refuses both, so the imported set,
  // saved as .pqjson, does not open again.
  it.fails('CW5-3: an imported expression part with an empty range still opens once saved', () => {
    const bank = parsePQFile(banks.find((b) => b.includes('"type":"expression"') || b.includes('"type": "expression"'))!)
    const q = bank.questions.find((x) => x.parts.some((p) => p.type === 'expression'))!
    const exam = JSON.parse(toExam({ ...bank, questions: [q] }).replace(/^[^\n]*\n/, '')) as Record<string, unknown>
    const text = JSON.stringify(exam).replace(/"vsetRange":\[[^\]]*\]/g, '"vsetRange":[1,1]')
    expect(text).toContain('"vsetRange":[1,1]')
    const imported = fromExam(text).file
    expect(imported.questions).toHaveLength(1)
    expect(() => parsePQFile(serializePQFile(imported))).not.toThrow()
  }, 30_000)

  // CW5-5: the label preferences kept in storage are read whole: any key (the precision, the
  // units) and any value (measureLabels: 123) is applied at start, although only the label
  // preferences are ever written there.
  it.fails('CW5-5: only the label preferences, with values they can take, are read from storage', async () => {
    vi.resetModules()
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'physlab.labelPrefs' ? '{"decimals":4,"measureLabels":123}' : null), setItem: () => {} })
    const store = await import('../src/renderer/src/core/store')
    vi.unstubAllGlobals()
    const now = store.useScene.getState().settings
    expect(now.decimals).toBe(store.DEFAULT_SETTINGS.decimals)
    expect(now.measureLabels).toBe(store.DEFAULT_SETTINGS.measureLabels)
  }, 30_000)
})
