// Guard (CLEANUP-PLAN.md CW13): the knowledge notes name only files and helpers that exist. A note that sends the
// next reader to a function that was renamed, split out or deleted costs them the search it was written to save.
// Every file path a note names must exist, and every code name it puts in backticks (camelCase, PascalCase,
// UPPER_CASE or a call) must appear somewhere in the source, the tests or the scripts.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../helpers/repo'

const DOCS = join(REPO_ROOT, 'docs/knowledge')
const notes = readdirSync(DOCS).filter((f) => f.endsWith('.md'))

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'out' || f.startsWith('.')) continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|mjs|js|cjs|css|json|py)$/.test(f)) out.push(p)
  }
  return out
}
// The code of the app and its tests, comments left out: a helper that is gone may live on in a comment.
const corpus = ['src', 'tests', 'scripts', 'electron.vite.config.ts', 'vite.web.config.ts', 'eslint.config.js']
  .map((p) => join(REPO_ROOT, p))
  .filter(existsSync)
  .flatMap((p) => (statSync(p).isDirectory() ? walk(p) : [p]))
  // Not this file: its self-test names helpers that must not exist.
  .filter((p) => !p.endsWith('docLinks.test.ts'))
  .map((p) =>
    readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/?\*|#)/.test(l))
      .join('\n')
  )
  .join('\n')

/** Every file of the repo, by its path from the root ('/'-separated). */
const repoFiles = ['src', 'tests', 'scripts', 'docs', 'build', 'resources']
  .map((p) => join(REPO_ROOT, p))
  .filter(existsSync)
  .flatMap((p) => walkAll(p))
  .map((p) => relative(REPO_ROOT, p).replace(/\\/g, '/'))
  .concat(readdirSync(REPO_ROOT).filter((f) => statSync(join(REPO_ROOT, f)).isFile()))
function walkAll(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === 'out') continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walkAll(p, out)
    else out.push(p)
  }
  return out
}
/**
 * Files the notes cite that live beside the repo, not in it: the planning documents (PhysLab-research) and the
 * question-bank harvest's script (PhysLab-content\numbas\scripts).
 */
const OUTSIDE = new Set(['CLEANUP-PLAN.md', 'OWNER-APPROVALS.md', 'WAVE.md', 'AUDIT-FOLD.md', 'BROWSER-CHECKS-OWED.md', 'TOUR-OPTIONS.md', 'bundleImporter.mjs'])
/** A path a note names: the file itself, or written short — a name or a tail of a path inside the area it describes. */
const exists = (p: string): boolean => OUTSIDE.has(p.split('/').pop()!) || repoFiles.some((f) => f === p || f.endsWith('/' + p))
/** A test file named without its ending (`casBoot` for tests/casBoot.test.ts). */
const isTestName = (name: string): boolean => repoFiles.some((f) => /^tests\//.test(f) && f.split('/').pop() === `${name}.test.ts`)

/** Paths: a run of path characters ending in a known extension. */
const PATH = /(?<![\w/.-])((?:[\w-]+\/)*[\w.-]+\.(?:tsx?|mjs|cjs|js|md|txt|json|css|py))(?=[^\w/]|$)/g
/** Code names: backticked, an identifier that reads as code, with or without a call and a dotted owner. */
const CODE = /`((?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*))(?:\([^`]*\))?`/g
const looksLikeCode = (name: string): boolean => /[a-z][A-Z]|^[A-Z][a-z]+[A-Z]|^[A-Z][A-Z0-9]*_[A-Z0-9_]+$|^[a-z]+_[a-z_]+$/.test(name)

const missingIn = (note: string): string[] => missingInText(readFileSync(join(DOCS, note), 'utf8'))

function missingInText(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(PATH)) {
    const p = m[1]
    if (/^https?:|^www\./.test(p) || p.includes('*') || p.startsWith('.')) continue
    if (!exists(p)) out.push(`path ${p}`)
  }
  for (const m of text.matchAll(CODE)) {
    const name = m[2]
    if (!looksLikeCode(name) || isTestName(name)) continue
    if (!new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(corpus)) out.push(`name ${m[1]}`)
  }
  return [...new Set(out)]
}

describe('guard: the knowledge notes name only what exists', () => {
  it('catches a file and a helper that do not exist, and passes ones that do', () => {
    expect(missingInText('See `math/noSuchFile.ts` and `noSuchHelperAnywhere()`.')).toEqual(['path math/noSuchFile.ts', 'name noSuchHelperAnywhere'])
    expect(missingInText('See `math/noise.ts` (`isNoise`), run.ts and `casBoot`.')).toEqual([])
  })

  it.each(notes)('%s', (note) => {
    expect(missingIn(note), relative(REPO_ROOT, join(DOCS, note))).toEqual([])
  })
})
