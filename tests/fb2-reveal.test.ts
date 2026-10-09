// FB2 PS-7, 12, 1, 21: what a reveal or a picture note says.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRootsPart, format2AnswerTex } from '../src/renderer/src/questions/answerKinds'
import { playQuestion, showPicture } from '../src/renderer/src/questions/player'
import type { PQPart, PQQuestion } from '../src/renderer/src/questions/pqjson'

type RootsPart = Extract<PQPart, { type: 'roots' }>
const DP = { decimals: 2, precisionMode: 'dp' as const }
const PLAY = { ...DP, unit: 'm' as const, unitPerSquare: 1, angleUnit: 'deg' as const }
const LICENSE = { id: 'CC BY 4.0' as const, holder: 'PhysLab' }

describe('FB2 PS-7: a repeated root is revealed once, as the marker counts it', () => {
  const double: RootsPart = { type: 'roots', prompt: 'Solve.', answer: ['2', '2'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 }
  it('(x − 2)² reveals "2", and "2" typed back is right', () => {
    const tex = format2AnswerTex(double, {}, DP)
    expect(tex).not.toContain(',')
    expect(checkRootsPart('2', double, {}, DP).verdict).toBe('right')
  })
  it('with multiplicity set, both are revealed (the marker wants "2, 2")', () => {
    expect(format2AnswerTex({ ...double, multiplicity: true }, {}, DP)).toContain(',')
  })
  it('two different roots are both revealed', () => {
    expect(format2AnswerTex({ ...double, answer: ['2', '-3'] }, {}, DP)).toContain(',')
  })
})

describe('FB2 PS-12: a choice part with no right option says so on reveal (owner\'s words)', () => {
  const question = (correct: boolean): PQQuestion => ({
    id: 'fb2-choice',
    title: 'Choice',
    statement: 'Pick one.',
    license: LICENSE,
    variables: [],
    parts: [{ type: 'choice', prompt: 'Which?', choices: [{ text: 'A', correct }, { text: 'B', correct: false }], shuffle: false, marks: 1 }]
  })
  it('"Answer: none of the choices is right."', () => {
    const played = playQuestion(question(false), 1, PLAY)
    expect(played.parts[0].answerText).toBe('none of the choices is right.')
    expect(played.parts[0].answerTex).toBe('\\text{none of the choices is right.}')
  })
  it('a part with a right option still reveals it', () => {
    const played = playQuestion(question(true), 1, PLAY)
    expect(played.parts[0].answerText).toBe('A')
  })
})

describe('FB2 PS-1: the vector Practice hint button is off once the solution is shown', () => {
  it('both hint buttons use "revealed || all hints shown"', () => {
    const src = readFileSync(join(__dirname, '../src/renderer/src/panels/Practice.tsx'), 'utf8')
    expect(src).not.toContain('disabled={!revealed && hints >=')
    expect(src.match(/disabled=\{revealed \|\| hints >= (moves|steps)\.length\}/g)).toHaveLength(2)
  })
})

describe('FB2 PS-21: a picture note counts pieces and rows in whole numbers', () => {
  const SF = { ...PLAY, decimals: 2, precisionMode: 'sf' as const }
  it('"one curve in 2 pieces", never "2.0 pieces"', () => {
    const res = showPicture({ kind: 'piecewise', pieces: [{ from: 0, to: 1, expr: 'x' }, { from: 1, to: 2, expr: 'x^2' }] }, SF)
    expect(res.note).toBe('Drawn: one curve in 2 pieces.')
  })
})
