// The default Rubi section 1 checks (see rubi-verify.ts): the counts the integration-corpus doc states, the fields and ids
// of every item in the three files, and a fixed sample of 300 kept items re-verified at 40 digits. The full
// re-verification of every kept item is rubi-section1-01 to -09, run with PHYSLAB_RUBI_FULL=1 (npm run test:rubi-full).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../../helpers/repo'
import { checkItems, loadKept, sampleItems } from './rubi-verify'

const DIR = join(REPO_ROOT, 'tests', 'engine', 'integration')
const DOC = readFileSync(join(REPO_ROOT, 'docs', 'knowledge', 'integration-corpus.md'), 'utf8')

type Row = Record<string, unknown>

function readRows(name: string): Row[] {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8')) as Row[]
}

/** The number in the second cell of the doc's table row that starts with `| label |`. */
function docNumber(label: string): number {
  const line = DOC.split('\n').find((l) => l.startsWith(`| ${label} |`))
  if (line === undefined) throw new Error(`the doc has no table row for "${label}"`)
  return Number(line.split('|')[2].replace(/[*,\s]/g, ''))
}

/** The rows of the doc's function table: the function, lines with it first, lines naming it. */
function docFunctionRows(): { name: string; first: number; naming: number }[] {
  return DOC.split('\n').flatMap((line) => {
    const m = /^\| ([A-Za-z0-9]+)\b[^|]*\| ([\d,]+) \| ([\d,]+) \|\s*$/.exec(line)
    if (!m) return []
    const [, name = '', first = '', naming = ''] = m
    return [{ name, first: Number(first.replace(/,/g, '')), naming: Number(naming.replace(/,/g, '')) }]
  })
}

function countBy(rows: Row[], field: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    const key = String(row[field])
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

const isText = (v: unknown): boolean => typeof v === 'string'
const isName = (v: unknown): boolean => typeof v === 'string' && v.length > 0
const isInt = (v: unknown): boolean => Number.isInteger(v)

const KEPT: Record<string, (v: unknown) => boolean> = {
  integrand: isText,
  variable: (v) => v === 'x',
  antiderivative: isText,
  rubiSteps: isInt,
  validPoints: (v) => isInt(v) && (v as number) >= 3 && (v as number) <= 5,
  constantSet: (v) => v === 1 || v === 2,
}

const UNSUPPORTED: Record<string, (v: unknown) => boolean> = {
  function: isName,
  functions: (v) => Array.isArray(v) && v.length > 0 && v.every(isName),
  rubiSteps: isInt,
  integrandMathematica: isText,
  antiderivativeMathematica: isText,
}

const REJECTED: Record<string, (v: unknown) => boolean> = {
  category: isName,
  reason: isName,
  integrandMathematica: isText,
  antiderivativeMathematica: isText,
}

/** The fields of one item that fail their test, and the id and source that each item must carry. */
function badFields(item: Row, checks: Record<string, (v: unknown) => boolean>): string[] {
  const id = String(item.id)
  const source = String(item.source)
  const problems: string[] = []
  for (const [field, ok] of Object.entries(checks)) {
    if (!ok(item[field])) problems.push(`${id}: ${field} is ${JSON.stringify(item[field])}`)
  }
  if (!isName(item.id) || !id.startsWith(`${source}:`)) problems.push(`${id}: the id does not start with its source`)
  if (!source.startsWith('1 Algebraic functions/') || !source.endsWith('.m')) problems.push(`${id}: source ${source}`)
  return problems
}

describe('Rubi section 1: the files, the doc and a sample', () => {
  it('the three files hold the counts the doc states', () => {
    const kept = loadKept()
    const unsupported = readRows('section1-unsupported.json')
    const rejected = readRows('section1-rejected.json')
    expect(kept.length).toBe(docNumber('kept (verified)'))
    expect(unsupported.length).toBe(docNumber('unsupported (names a function mathjs cannot express)'))
    expect(rejected.length).toBe(docNumber('rejected'))
    expect(kept.length + unsupported.length + rejected.length).toBe(docNumber('**total test lines**'))
    expect(countBy(rejected, 'category')).toEqual({
      'few-valid-points': docNumber('few-valid-points'),
      split: docNumber('split'),
    })
  })

  it('the unsupported lines by function match the doc table', () => {
    const unsupported = readRows('section1-unsupported.json')
    const rows = docFunctionRows()
    expect(rows.length).toBe(9)
    expect(rows.reduce((sum, r) => sum + r.first, 0)).toBe(unsupported.length)
    for (const { name, first, naming } of rows) {
      expect(unsupported.filter((r) => r.function === name).length, `${name}, lines with it first`).toBe(first)
      expect(
        unsupported.filter((r) => Array.isArray(r.functions) && r.functions.includes(name)).length,
        `${name}, lines naming it`,
      ).toBe(naming)
    }
  })

  it('every item has the fields the converter writes, and each test line is in exactly one file', () => {
    const kept = readRows('section1.json')
    const unsupported = readRows('section1-unsupported.json')
    const rejected = readRows('section1-rejected.json')
    const problems: string[] = []
    for (const item of kept) problems.push(...badFields(item, KEPT))
    for (const item of unsupported) {
      problems.push(...badFields(item, UNSUPPORTED))
      if (!Array.isArray(item.functions) || !item.functions.includes(item.function)) {
        problems.push(`${String(item.id)}: function is not one of functions`)
      }
    }
    for (const item of rejected) problems.push(...badFields(item, REJECTED))
    expect(problems.slice(0, 20)).toEqual([])
    expect(problems.length).toBe(0)
    const ids = new Set([...kept, ...unsupported, ...rejected].map((item) => String(item.id)))
    expect(ids.size).toBe(kept.length + unsupported.length + rejected.length)
  })

  it('a fixed sample of the kept items, spread over the source files, re-verifies at 40 digits', () => {
    const kept = loadKept()
    const sample = sampleItems(kept)
    // 300 less one: source file 1.2.3.5 has seven kept items, not the eight its share asks for (see sampleItems).
    expect(sample.length).toBe(299)
    expect(new Set(sample.map((item) => item.source)).size).toBe(new Set(kept.map((item) => item.source)).size)
    expect(checkItems(sample)).toEqual([])
  }, 60_000)
})
