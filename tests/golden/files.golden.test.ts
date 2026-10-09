// Golden sweep `files` (CLEANUP-PLAN.md §2): every project text of formats 1 to 7 and every damaged
// one, opened (what the file reader makes of it, in full, or its refusal sentence) and saved again
// (does the saved file open to the same project); and every bundled question bank read, written and
// read back.

import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('../../src/renderer/src/math/cas', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expectGolden, goldenLine, seenOf } from './harness'
import { resetGlobals } from '../helpers/globals'
import { parseSceneFile } from '../../src/renderer/src/core/migrate'
import { useScene } from '../../src/renderer/src/core/store'
import { runCommand } from '../../src/renderer/src/lang/commands'
import { parsePQFile, serializePQFile } from '../../src/renderer/src/questions/pqjson'
import { FILES_CORPUS, V1_SCENES } from './inputs/files'

beforeEach(resetGlobals)

const BANK_DIR = join(__dirname, '../../src/renderer/src/questions/bank')

/**
 * Format-1 files made from real scenes: the objects the bar makes today, with what format 1 never
 * had taken out (the drawing each belongs to, the theme colour token), so v1ToV2 has to work out
 * each object's drawing (spacesForV1) from its type and from what uses it.
 */
async function v1Files(): Promise<{ name: string; text: string }[]> {
  const out: { name: string; text: string }[] = []
  for (const sc of V1_SCENES) {
    resetGlobals()
    useScene.getState().newScene()
    useScene.getState().setActiveSpace(sc.space)
    for (const l of sc.lines) await runCommand(l)
    const saved = useScene.getState().serialize() as unknown as { objects: Record<string, unknown>[] }
    const objects = saved.objects.map(({ space: _s, themed: _t, ...o }) => o)
    // Ids are made fresh on every run: each becomes o1, o2… in order, wherever the file names it.
    let text = JSON.stringify({ app: 'PhysLab', version: 1, objects })
    objects.forEach((o, i) => {
      text = text.split(JSON.stringify(o.id)).join(JSON.stringify(`o${i + 1}`))
    })
    out.push({ name: `v1 made from: ${sc.name}`, text })
  }
  return out
}

/** Each object's name and the drawing it opens in (— when it shows in every drawing). */
const spacesOf = (text: string): string =>
  seenOf(() => parseSceneFile(text).objects.map((o) => `${o.name}(${o.type}) in ${(o as { space?: string }).space ?? '—'}`).join(', '))

async function sweep(): Promise<string[]> {
  const lines: string[] = []
  for (const file of await v1Files()) lines.push(goldenLine(`SPACES ${file.name}`, spacesOf(file.text)))
  for (const file of [...FILES_CORPUS, ...(await v1Files())]) {
    lines.push(goldenLine(`OPEN ${file.name}`, seenOf(() => JSON.stringify(parseSceneFile(file.text)))))
    lines.push(goldenLine(`SAVE AGAIN ${file.name}`, seenOf(() => {
      const opened = parseSceneFile(file.text)
      resetGlobals()
      useScene.getState().newScene()
      useScene.getState().loadScene(opened)
      const saved = useScene.getState().serialize()
      const reopened = parseSceneFile(JSON.stringify(saved))
      const same = JSON.stringify(reopened.objects) === JSON.stringify(opened.objects)
      return `format ${saved.version}, ${saved.objects.length} objects, reopens ${same ? 'the same' : 'DIFFERENT'}`
    })))
  }

  lines.push(goldenLine('SAVE a new scene', seenOf(() => {
    resetGlobals()
    useScene.getState().newScene()
    const saved = useScene.getState().serialize()
    return `format ${saved.version}, ${saved.objects.length} objects`
  })))

  for (const name of readdirSync(BANK_DIR).filter((f) => f.endsWith('.pqjson')).sort()) {
    lines.push(goldenLine(`BANK ${name}`, seenOf(() => {
      const text = readFileSync(join(BANK_DIR, name), 'utf8')
      const read = parsePQFile(text)
      const written = serializePQFile(read)
      const again = serializePQFile(parsePQFile(written))
      return `${read.questions.length} questions, written and read back ${again === written ? 'the same' : 'DIFFERENT'}`
    })))
  }

  return lines
}

describe('golden sweep: files', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect(await sweep()).toEqual(await sweep())
  }, 120_000)

  it('matches tests/golden/out/files.txt', async () => {
    expectGolden('files', await sweep())
  }, 120_000)
})
