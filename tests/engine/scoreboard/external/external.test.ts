import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { verifyItem, type ExternalItem } from './tools/verifier'

const HERE = __dirname
const CLASSES = [
  'expand',
  'factor over ℚ',
  'polynomial equations',
  '2x2 and 3x3 linear systems',
  'rational-expression simplification',
  'derivatives',
  'partial fractions',
]

function fileFor(cls: string): string {
  return path.join(HERE, cls.replace(/ℚ/g, 'Q').replace(/ /g, '_') + '.json')
}

function plant(cls: string, question: string, answer: string): ExternalItem {
  return {
    id: 'plant',
    class: cls,
    question,
    answer,
    source: { book: '', edition: '', chapter: '', section: '', 'exercise number': '', url: '' },
  }
}

describe('external holdout corpus: every kept item re-verifies exactly', () => {
  for (const cls of CLASSES) {
    const fp = fileFor(cls)
    if (!fs.existsSync(fp)) continue
    const items = JSON.parse(fs.readFileSync(fp, 'utf8')) as ExternalItem[]
    describe(path.basename(fp), () => {
      it('every item carries the class of its file', () => {
        for (const entry of items) expect(entry.class).toBe(cls)
      })
      for (const entry of items) {
        it(`verifies item ${entry.id}`, () => {
          expect(verifyItem(entry)).toBeNull()
        })
      }
    })
  }
})

describe('rejected.json', () => {
  it('gives a reason for every rejected item', () => {
    const rejected = JSON.parse(fs.readFileSync(path.join(HERE, 'rejected.json'), 'utf8')) as Array<{
      id: string
      class: string
      reason: string
    }>
    expect(rejected.length).toBeGreaterThan(0)
    for (const r of rejected) expect(r.reason.trim().length).toBeGreaterThan(0)
  })
})

// Plants: each check must pass what is right and refuse what is wrong. A check that cannot be made
// exactly refuses, so a radical or an unreadable root never passes by accident.
describe('plants: the exact checks refuse what they must refuse', () => {
  const mustPass: Array<[string, string, string]> = [
    ['expand', '(x+1)(x+2)', 'x^2+3x+2'],
    ['partial fractions', '1/(x^2-1)', '1/(2(x-1))-1/(2(x+1))'],
    ['derivatives', 'x^3', '3x^2'],
    ['derivatives', 'sin(x)', 'cos(x)'],
    ['derivatives', 'x/(x+1)', '1/(x+1)^2'],
    ['derivatives', 'exp(2x)', '2exp(2x)'],
    ['polynomial equations', 'x^2-5x+6=0', 'x = 2, x = 3'],
    ['polynomial equations', 'x^2-2=0', 'x = sqrt(2), x = -sqrt(2)'],
    ['polynomial equations', 'x^2-2=0', 'x = ±sqrt(2)'],
    ['polynomial equations', '(x-1)^2(x-2)=0', 'x = 1, x = 1, x = 2'],
    ['polynomial equations', 'x^2-2x+5=0', 'x = 1 ± 2i'],
    ['2x2 and 3x3 linear systems', 'x+y=3, x-y=1', '(2, 1)'],
    ['2x2 and 3x3 linear systems', 'x+y=3, x-y=1', 'x = 2, y = 1'],
  ]
  const mustFail: Array<[string, string, string]> = [
    ['expand', '(x+1)(x+2)', 'x^2+3x+3'],
    ['expand', 'x/(x-x)', '2'],
    ['rational-expression simplification', '4sqrt(3)+6sqrt(3)', '10sqrt(3)'],
    ['derivatives', 's(0)', 'x=0'],
    ["derivatives", "s'(2)", 't=2'],
    ['derivatives', 'x^3', '2x^2'],
    ['derivatives', 'x^3', '3x^2 + (x-0.37)(x-1.61)(x-2.29)(x-3.13)(x-4.07)'],
    ['derivatives', 'x/(x+1)', '1/(x+1)'],
    ['derivatives', 'x^3', '3x^2 + sin(pi*x)*(x-0.37)(x-1.61)(x-2.29)(x-3.13)(x-4.07)'],
    ['derivatives', 'sin(x)', 'cos(x) + sin(pi*x)*(x-0.37)*(x-1.61)*(x-2.29)*(x-3.13)*(x-4.07)'],
    ['polynomial equations', 'x^2-5x+6=0', 'x = 2'],
    ['polynomial equations', 'x^2-5x+6=0', 'x = 2, x = 2'],
    ['polynomial equations', 'x^2-5x+6=0', 'x = 2, x = 3, foo'],
    ['polynomial equations', 'x^2-2=0', 'x = sqrt(2)'],
    ['polynomial equations', '(x-1)^2(x-2)=0', 'x = 1, x = 2, x = 2'],
    ['2x2 and 3x3 linear systems', 'x+y=3, x-y=1', '(1, 2)'],
    ['2x2 and 3x3 linear systems', 'x+y=2, 2x+2y=4', '(1, 1)'],
  ]
  for (const [cls, q, a] of mustPass) {
    it(`accepts ${cls}: ${q} -> ${a}`, () => {
      expect(verifyItem(plant(cls, q, a))).toBeNull()
    })
  }
  for (const [cls, q, a] of mustFail) {
    it(`refuses ${cls}: ${q} -> ${a}`, () => {
      expect(verifyItem(plant(cls, q, a))).not.toBeNull()
    })
  }
})
