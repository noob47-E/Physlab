// The bundled question sets load when Problem Sets opens, not with the panel's own code. These
// tests hold that in place: a failed load says one plain sentence (never an empty list or a file
// path), and the panel reaches the question bank only through the dynamic import.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundledSets, loadTeacherFile, type QuestionSet } from '../src/renderer/src/questions/bank'
import {
  bankLine,
  FAILED_LINE,
  LOADING_LINE,
  loadBank,
  loadBundledSets,
  pickSet,
  plainFailure,
  type BankModule
} from '../src/renderer/src/questions/bankLoad'
import { readSource, RENDERER_SRC } from './helpers/repo'

describe('the bundled question sets load when Problem Sets opens (CW11)', () => {
  it('the real loader gives the same sets as the static bank', async () => {
    expect(bundledSets().length).toBeGreaterThan(0)
    expect(await loadBundledSets()).toEqual({ status: 'ready', sets: bundledSets() })
  })

  it('a loader that rejects gives failed, and the line is the plain sentence', async () => {
    const state = await loadBundledSets(() => Promise.reject(new Error('chunk missing')))
    expect(state).toEqual({ status: 'failed' })
    expect(bankLine(state)).toBe(FAILED_LINE)
  })

  it('a bank whose bundled file fails its checks gives failed', async () => {
    // A bundled file that does not pass its checks makes bundledSets() throw; the panel must
    // show the failure sentence, not an empty list.
    const broken: BankModule = {
      bundledSets: () => {
        throw new Error('Question in sample.pqjson has no licence PhysLab may ship under.')
      },
      loadTeacherFile
    }
    expect(await loadBundledSets(async () => broken)).toEqual({ status: 'failed' })
  })

  it('the line is the loading sentence while loading, and nothing once the sets are there', () => {
    expect(LOADING_LINE).toBe('Loading the questions…')
    expect(bankLine({ status: 'loading' })).toBe('Loading the questions…')
    expect(bankLine({ status: 'ready', sets: bundledSets() })).toBeNull()
  })

  it('plainFailure replaces a chunk error with the plain sentence and keeps a good result', async () => {
    const chunkError = new Error('Failed to fetch dynamically imported module: app://x/bank-1.js')
    const err = await plainFailure(Promise.reject(chunkError)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(FAILED_LINE)
    expect(await plainFailure(Promise.resolve(5))).toBe(5)
  })

  it('loadBank resolves the bank module, and its loadTeacherFile reads a bundled file', async () => {
    const bank = await loadBank()
    const set = bank.loadTeacherFile(readSource('src/renderer/src/questions/bank/sample.pqjson'), 'sample.pqjson')
    expect(set.questions.length).toBeGreaterThan(0)
  })

  it('no renderer file reaches the bank except through the loader\'s one dynamic import', () => {
    // A value import of bank.ts from any module on Practice's path (or the start path) would put
    // all of the question text back into that chunk. Nothing else would notice: the build stays
    // green and the panel just opens slower. Type-only imports vanish in the build and are fine.
    const sourceFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const p = join(dir, name)
        return statSync(p).isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(name) ? [p] : []
      })
    const isBank = (file: string, spec: string): boolean => posix.normalize(posix.join(posix.dirname(file), spec)) === 'questions/bank'
    const valueImports: string[] = []
    const loads: string[] = []
    for (const path of sourceFiles(RENDERER_SRC)) {
      const file = relative(RENDERER_SRC, path).split(sep).join('/')
      const text = readFileSync(path, 'utf8')
      // `import … from` and `export … from`, over as many lines as the statement takes.
      for (const m of text.matchAll(/\b(?:import|export)\s+(type\s+)?[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
        if (isBank(file, m[2]) && !m[1]) valueImports.push(`${file}: ${m[0]}`)
      }
      for (const m of text.matchAll(/\bimport\s*['"]([^'"]+)['"]/g)) if (isBank(file, m[1])) valueImports.push(`${file}: ${m[0]}`)
      // `typeof import('./bank')` is a type; any other import('…bank') is a load.
      for (const m of text.matchAll(/(typeof\s+)?\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) if (isBank(file, m[2]) && !m[1]) loads.push(file)
    }
    expect(valueImports).toEqual([])
    expect(loads).toEqual(['questions/bankLoad.ts'])
    // And that one load goes through plainFailure, so a failure reaches the screen as the sentence.
    expect(readSource('src/renderer/src/questions/bankLoad.ts')).toContain("plainFailure(import('./bank'))")
  })
})

describe('the set Start plays while the bundled sets load (CW11)', () => {
  const set = (id: string): QuestionSet => ({ id, title: id, source: id.startsWith('bundled') ? 'bundled' : 'teacher', questions: [], report: [] })
  const teacher = set('teacher:forces.pqjson')

  it('a saved bundled choice picks nothing until the bundled sets are there, not the teacher\'s set', () => {
    expect(pickSet([teacher], 'bundled:all', { status: 'loading' })).toBeUndefined()
  })

  it('a saved teacher\'s set is picked while the bundled sets load', () => {
    expect(pickSet([teacher], teacher.id, { status: 'loading' })).toBe(teacher)
  })

  it('once loaded, or failed, it is the saved set, else the first, as before', () => {
    const all = set('bundled:all')
    expect(pickSet([all, teacher], 'bundled:all', { status: 'ready', sets: [all] })).toBe(all)
    expect(pickSet([all, teacher], 'bundled:gone', { status: 'ready', sets: [all] })).toBe(all)
    expect(pickSet([teacher], 'bundled:all', { status: 'failed' })).toBe(teacher)
    expect(pickSet([], 'bundled:all', { status: 'failed' })).toBeUndefined()
  })
})
