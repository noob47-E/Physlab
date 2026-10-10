// The desktop bridge and the "is this a result file" check. Pure text tests: no DOM, no Electron,
// no dialog. The bridge is read as window.physlab (declared once in src/renderer/src/globals.d.ts);
// the guard below keeps the old per-file casts from creeping back.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { isResultFileText } from '../src/renderer/src/questions/results'
import { RENDERER_SRC, readSource } from './helpers/repo'

type Files = typeof import('../src/renderer/src/app/files')

const REFUSAL = 'Class results are not part of PhysLab.'

describe('classResultsFileText (app/files.ts)', () => {
  let files: Files

  beforeAll(async () => {
    // app/files.ts reads the desktop bridge off `window` as it loads; a node test has none.
    vi.stubGlobal('window', {})
    try {
      files = await import('../src/renderer/src/app/files')
    } finally {
      vi.unstubAllGlobals()
    }
  }, 120_000)

  it('refuses any file named .pqresult, in any letter case, whatever it holds', () => {
    const names = ['class.pqresult', 'CLASS.PQRESULT', 'Set 1.PqResult', 'C:\\Users\\Aisha\\Desktop\\set1.pqresult', '/home/aisha/set1.pqresult']
    const texts = ['', 'not json at all', JSON.stringify(scene().serialize())]
    for (const name of names) {
      for (const text of texts) expect(files.classResultsFileText(name, text), `${name} / ${text.slice(0, 20)}`).toBe(REFUSAL)
    }
  })

  it('refuses a renamed result file by what is inside, with or without spaces around the colons', () => {
    const spaced = '{ "app" : "PhysLab",\n "format" : "pqresult",\n "version" : 1 }'
    expect(files.classResultsFileText('results.phys', spaced)).toBe(REFUSAL)
    expect(files.classResultsFileText('results.json', '{"app":"PhysLab","format":"pqresult","version":1}')).toBe(REFUSAL)
  })

  it('lets a project through whose label only contains the two marks as words', () => {
    // JSON.stringify escapes the quotes inside the label, so the marks are not keys in the file.
    const label = 'Two marks: "app": "PhysLab" and "format": "pqresult"'
    const labelled = JSON.stringify({ ...scene().serialize(), note: label })
    expect(labelled).toContain('\\"app\\": \\"PhysLab\\"')
    expect(files.classResultsFileText('lesson.phys', labelled)).toBeNull()
    expect(files.classResultsFileText('lesson.phys', JSON.stringify(scene().serialize()))).toBeNull()
  })

  it('lets a question file and a Numbas exam through', () => {
    const questions = readSource('src/renderer/src/questions/bank/sample.pqjson')
    const exam = '// Numbas version: exam_results_page_options\n{"name":"Forces","questions":[]}'
    expect(files.classResultsFileText('sample.pqjson', questions)).toBeNull()
    expect(files.classResultsFileText('forces.exam', exam)).toBeNull()
  })

  it('lets empty text and near-miss text through', () => {
    const texts = [
      '',
      '{"app":"PhysLab","format":"pqjson","version":1,"questions":[]}',
      '{"app":"Other","format":"pqresult"}',
      '{"format":"pqresult"}',
      '[]',
      'null',
      '{"app":'
    ]
    for (const text of texts) expect(files.classResultsFileText('notes.json', text), text).toBeNull()
  })
})

describe('isResultFileText (questions/results.ts)', () => {
  it('is true for a .pqresult name in any letter case, whatever the text', () => {
    for (const name of ['class.pqresult', 'CLASS.PQRESULT', 'Set 1.PqResult', '/home/aisha/set1.pqresult']) {
      for (const text of ['', 'plain words', '{"app":"PhysLab","format":"pqjson"}']) expect(isResultFileText(name, text), `${name} / ${text}`).toBe(true)
    }
  })

  it('is true for a renamed result file with both marks, with or without spaces around the colons', () => {
    expect(isResultFileText('results.phys', '{ "app" : "PhysLab", "format" : "pqresult" }')).toBe(true)
    expect(isResultFileText('results.txt', '{"app":"PhysLab","format":"pqresult","version":1}')).toBe(true)
  })

  it('is false for a project whose label only contains the marks as words', () => {
    const labelled = JSON.stringify({ ...scene().serialize(), note: 'Two marks: "app": "PhysLab" and "format": "pqresult"' })
    expect(isResultFileText('lesson.phys', labelled)).toBe(false)
  })

  it('needs both marks: one alone, a wrong app or a wrong format is not a result file', () => {
    for (const text of ['{"app":"PhysLab","format":"pqjson","version":1,"questions":[]}', '{"app":"Other","format":"pqresult"}', '{"format":"pqresult"}', '{"app":"PhysLab"}', '[]', 'null', '{"app":']) {
      expect(isResultFileText('notes.json', text), text).toBe(false)
    }
  })

  it('is false for a question file, a Numbas exam and empty text under an ordinary name', () => {
    const questions = readSource('src/renderer/src/questions/bank/sample.pqjson')
    expect(isResultFileText('sample.pqjson', questions)).toBe(false)
    expect(isResultFileText('forces.exam', '// Numbas version: exam_results_page_options\n{"name":"Forces","questions":[]}')).toBe(false)
    expect(isResultFileText('notes.json', '')).toBe(false)
    expect(isResultFileText('pqresult', '')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Task 1: window.physlab is declared once
// ---------------------------------------------------------------------------

/** Every .ts and .tsx file under the renderer's source folder, as paths relative to it ('/' separated). */
function rendererFiles(dir: string = RENDERER_SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...rendererFiles(full))
    else if (/\.tsx?$/.test(entry.name)) out.push(relative(RENDERER_SRC, full).split(sep).join('/'))
  }
  return out
}

// A file that still casts window to its own little bridge type. Each entry is on its way out, and
// the list only shrinks: a file leaves it when its cast goes, and a new cast is refused.
const CAST_LEFTOVERS = ['app/autosave.ts', 'app/theme.ts', 'app/TopBar.tsx']
const CAST = /window as unknown as \{\s*physlab\?:/
const READ_GLOBAL = 'Read window.physlab instead; it is declared once in src/renderer/src/globals.d.ts.'

describe('window.physlab is declared once', () => {
  it('globals.d.ts declares physlab? exactly once, on Window', () => {
    const globals = readSource('src/renderer/src/globals.d.ts')
    expect(globals.match(/physlab\?:/g) ?? [], READ_GLOBAL).toHaveLength(1)
    expect(globals).toMatch(/interface Window \{[\s\S]*physlab\?: import\('\.\.\/\.\.\/preload\/index'\)\.PhysLabBridge/)
  })

  it('only the listed leftover files still cast window to their own bridge type', () => {
    const casting = rendererFiles().filter((rel) => CAST.test(readFileSync(join(RENDERER_SRC, rel), 'utf8')))
    const unlisted = casting.filter((rel) => !CAST_LEFTOVERS.includes(rel))
    const gone = CAST_LEFTOVERS.filter((rel) => !casting.includes(rel))
    expect(unlisted, `A file casts window to its own physlab type. ${READ_GLOBAL} Files: ${unlisted.join(', ')}`).toEqual([])
    expect(gone, `These files no longer cast window, so take them off CAST_LEFTOVERS here (the list only shrinks). ${READ_GLOBAL} Files: ${gone.join(', ')}`).toEqual([])
  })
})
