// Another company's product names are never written anywhere in PhysLab (owner, 2026-10-02: "stop using this name,
// make your own calculator name"). Behaviour is described in our own words — "the PhysLab Calculator", "a scientific
// calculator", "the ×10ˣ (standard form) key". This reads the source, the tests and the docs and fails with the file
// and line of every match. The allow-list is empty and stays empty.
//
// The pattern is put together from pieces, so this file does not match itself.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from './helpers/repo'

const PRODUCT = new RegExp(['fx-?' + '991', 'cas' + 'io(?!n)', 'class' + 'wiz'].join('|'), 'i')
const TEXT_FILE = /\.(?:ts|tsx|js|mjs|cjs|json|md|css|html|txt|ps1|sh|yml|yaml)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', '.crew', 'out', 'dist', 'release', 'coverage'])

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (TEXT_FILE.test(name)) out.push(p)
  }
  return out
}

describe('no other company’s product names', () => {
  it('src, tests, docs and the repo’s own documents never name them', () => {
    const roots = ['src', 'tests', 'docs'].map((d) => join(REPO_ROOT, d))
    const docs = ['README.md', 'AGENTS.md', 'HISTORY.md', 'CONTRIBUTING.md'].map((f) => join(REPO_ROOT, f)).filter(existsSync)
    const found: string[] = []
    for (const file of [...roots.flatMap(files), ...docs]) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (PRODUCT.test(line)) found.push(`${relative(REPO_ROOT, file).split(sep).join('/')}:${i + 1}`)
        })
    }
    expect(found).toEqual([])
  })

  it('the pattern catches the forms it is for and leaves ordinary words alone', () => {
    for (const bad of ['fx' + '-991EX', 'FX' + '991', 'Cas' + 'io', 'cas' + 'ioToMath', 'Class' + 'Wiz']) expect(PRODUCT.test(bad), bad).toBe(true)
    for (const ok of ['occasionally', 'occasional', 'occasion', 'casing', 'classic', 'fx = 2']) expect(PRODUCT.test(ok), ok).toBe(false)
  })
})
