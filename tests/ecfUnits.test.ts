import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { answerValue, markWithECF } from '../src/renderer/src/questions/ecf'
import { checkPlayedPart, playQuestion, type Played } from '../src/renderer/src/questions/player'
import { parsePQFile, serializePQFile, type ECF, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'

beforeEach(() => resetGlobals())

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

function throughFile(q: PQQuestion): PQQuestion {
  const text = serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] })
  return parsePQFile(text).questions[0]
}

const IN_CM: PQPart = {
  type: 'number',
  prompt: 'Its length in cm',
  answer: 'd * 100',
  unit: 'cm',
  tolerance: { kind: 'relative', value: 0.02 },
  marks: 1
}

/**
 * d = 0.5 m. Part (a) asks for d in cm, so the right answer is 50 cm. Part (b) asks for
 * 2d in m, so the right answer is 1 m, and carries part (a) forward into d.
 */
function unitECF(strategy: ECF['strategy'], first: PQPart = IN_CM): PQQuestion {
  return throughFile({
    id: 'unit-ecf',
    title: 'Lengths with mixed units',
    statement: 'A rod is {d} long.',
    variables: [{ name: 'd', def: { kind: 'list', items: [0.5] }, unit: 'm' }],
    parts: [
      first,
      {
        type: 'number',
        prompt: 'Twice its length in m',
        answer: '2 * d',
        unit: 'm',
        tolerance: { kind: 'relative', value: 0.02 },
        marks: 2,
        ecf: { uses: [{ part: 0, variable: 'd' }], strategy, penalty: 0 }
      }
    ],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })
}

function sit(q: PQQuestion, answers: string[]) {
  const played: Played = playQuestion(q, 1, S)
  const earlier = new Map<number, number>()
  return played.parts.map((p, i) => {
    const answer = answers[i] ?? ''
    const c = markWithECF(p, answer, played, earlier, S, (values) =>
      checkPlayedPart(p, answer, { ...played, variant: { ...played.variant, values } }, S)
    )
    const x = answerValue(p.part, answer)
    if (x !== null) earlier.set(i, x)
    return c
  })
}

describe('Q3 ECF earlier answer is compared and carried in the variable’s unit', () => {
  it('originalfirst: a correct 50 cm is not carried into d = 0.5 m, so 100 m is still wrong', () => {
    const [a, b] = sit(unitECF('originalfirst'), ['50 cm', '100'])
    expect(a.verdict).toBe('right')
    expect(b).toMatchObject({ verdict: 'wrong', marks: 0 })
    expect(b.ecfNote).toBeUndefined()
  })

  it('alwaysreplace: a correct 50 cm is not carried into d = 0.5 m, so the true 1 m is right with no note', () => {
    const [, b] = sit(unitECF('alwaysreplace'), ['50 cm', '1'])
    expect(b).toMatchObject({ verdict: 'right', marks: 2 })
    expect(b.ecfNote).toBeUndefined()
  })

  // A wrong part (a) is carried in the variable's unit too: 60 cm is d = 0.6 m, so 2d = 1.2 m.
  // Put into d unconverted it was 60 m, and the student's right 1.2 was marked wrong.
  it('a wrong 60 cm is carried into d as 0.6 m, so 1.2 m is right by error carried forward, noted in cm', () => {
    const [, b] = sit(unitECF('originalfirst'), ['60 cm', '1.2'])
    expect(b).toMatchObject({ verdict: 'right', marks: 2, ecfNote: 'Marked using your answer to part (a): 60 cm' })
  })

  // The note shows the student's own number, which is in the unit of the part they typed it in. A
  // roots part asked in cm was noted in d's metres: "60 m" for the 60 cm carried as 0.6 m.
  it('the note gives a roots part’s answer in that part’s unit, not the variable’s', () => {
    const root: PQPart = {
      type: 'roots',
      prompt: 'The positive root of x² = d², in cm',
      answer: ['d * 100'],
      unit: 'cm',
      tolerance: { kind: 'relative', value: 0.02 },
      marks: 1
    }
    const [, b] = sit(unitECF('originalfirst', root), ['60', '1.2'])
    expect(b).toMatchObject({ verdict: 'right', marks: 2, ecfNote: 'Marked using your answer to part (a): 60 cm' })
  })

  // H1: a roots part (a) answered within its own 2 % band is right, so under alwaysreplace nothing is
  // carried from it — its band was taken as 0, and 50.5 cm was carried as d = 0.505 m with a note.
  it('alwaysreplace: a roots answer right within its own band is not carried forward', () => {
    const root: PQPart = {
      type: 'roots',
      prompt: 'The positive root of x² = d², in cm',
      answer: ['d * 100'],
      unit: 'cm',
      tolerance: { kind: 'relative', value: 0.02 },
      marks: 1
    }
    const [a, b] = sit(unitECF('alwaysreplace', root), ['50.5', '1'])
    expect(a.verdict).toBe('right')
    expect(b).toMatchObject({ verdict: 'right', marks: 2 })
    expect(b.ecfNote).toBeUndefined()
  })
})
