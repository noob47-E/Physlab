// FB2 PS-17: a Lego part never showed its solution. "Show the full solution" revealed every other
// part, but LegoRow drew its Verdict with revealed={false} and no answer. The owner's wording
// (2026-10-09): "Answer: the target shape". The reveal text now comes from the played part, as a
// choice part's does, and the row passes the reveal through.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { playQuestion } from '../src/renderer/src/questions/player'
import type { PQQuestion } from '../src/renderer/src/questions/pqjson'

const SETTINGS = { decimals: 2, precisionMode: 'dp' as const, unit: 'm' as const, unitPerSquare: 1, angleUnit: 'deg' as const }

const question: PQQuestion = {
  id: 'fb2-lego',
  title: 'Fill the square',
  statement: 'Fit the pieces together.',
  license: { id: 'CC BY 4.0', holder: 'PhysLab' },
  variables: [],
  parts: [{ type: 'lego', prompt: 'Fill it.', target: [['0', '0'], ['2', '0'], ['2', '2'], ['0', '2']], pieces: 2, marks: 1 }]
}

describe('FB2 PS-17: a Lego part shows its solution on reveal', () => {
  it('the played Lego part carries the reveal text "the target shape"', () => {
    const played = playQuestion(question, 1, SETTINGS)
    expect(played.parts[0].answerText).toBe('the target shape')
  })

  it('LegoRow passes the reveal and that text to its Verdict', () => {
    const src = readFileSync(join(__dirname, '../src/renderer/src/panels/QuestionParts.tsx'), 'utf8')
    const lego = src.slice(src.indexOf('function LegoRow('), src.indexOf('function ChoiceRow('))
    expect(lego).toMatch(/function LegoRow\(\{[^}]*\brevealed\b/)
    expect(lego).not.toContain('revealed={false}')
    expect(lego).toContain('revealed={revealed} answer={p.answerText} />')
  })
})
