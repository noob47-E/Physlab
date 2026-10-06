// An expression part must read a typed angle the way every number box of the same question
// does: inside sin, cos or tan, an angle written in numbers alone (30, 2*30, 45/1.5) or with a
// degree sign (30°, 30 deg) is in degrees. A student who copied θ = 30° from the question as
// F*cos(30)*x was marked wrong (cos 30 read as 30 radians), and F*cos(30°)*x was told "The
// answer should only use x." An argument with a letter in it — the sampled x, a question
// variable, π — keeps its radian reading, which tests/questionParts.test.ts pins.

import { describe, expect, it } from 'vitest'
import { checkExpressionPart, WRONG_MESSAGE } from '../src/renderer/src/questions/parts'
import type { PQPart } from '../src/renderer/src/questions/pqjson'
import { getAngleMode, setAngleMode } from '../src/renderer/src/math/expr'

type ExpressionPart = Extract<PQPart, { type: 'expression' }>

function expressionPart(answer: string, symbols: string[] = ['x']): ExpressionPart {
  return { type: 'expression', prompt: 'Write the work done as a formula in x.', answer, symbols, marks: 1 }
}

// A pull of F = 30 N at θ = 30° to the floor, over a distance x.
const values = { F: 30, theta: 30 }
const units = { F: 'N' as const, theta: '°' as const }
const work = expressionPart('F*cos(theta)*x')

describe('an angle typed in numbers alone is in degrees, as in the number boxes', () => {
  it('marks F*cos(30)*x right when the question says θ = 30°', () => {
    expect(checkExpressionPart('F*cos(30)*x', work, values, units).verdict).toBe('right')
  })

  it("matches a teacher's x*sin(30) with a typed x/2, and the other way round", () => {
    expect(checkExpressionPart('x/2', expressionPart('x*sin(30)'), {}).verdict).toBe('right')
    expect(checkExpressionPart('x*sin(30)', expressionPart('x/2'), {}).verdict).toBe('right')
  })

  it('reads (30), 2*30, 45/1.5 and −60 as degrees too, and sec 60 as 2', () => {
    for (const typed of ['x*sin((30))', 'x*cos(2*30)', 'x*sin(45/1.5)', 'x*cos(-60)']) {
      expect(checkExpressionPart(typed, expressionPart('x/2'), {}).verdict, typed).toBe('right')
    }
    expect(checkExpressionPart('x*sec(60)', expressionPart('2*x'), {}).verdict).toBe('right')
  })

  it('still marks a wrong angle wrong: F*sin(30)*x is not F*cos(30)*x', () => {
    const c = checkExpressionPart('F*sin(30)*x', work, values, units)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe(WRONG_MESSAGE)
  })

  it('keeps the radian reading for an argument with a letter in it', () => {
    expect(checkExpressionPart('F*cos(theta)*x', work, values, units).verdict).toBe('right')
    expect(checkExpressionPart('2*sin(x)*cos(x)', expressionPart('sin(2x)'), {}).verdict).toBe('right')
    expect(checkExpressionPart('cos(x)', expressionPart('sin(x + pi/2)'), {}).verdict).toBe('right')
    expect(checkExpressionPart('2*sin(x)', expressionPart('sin(2x)'), {}).verdict).toBe('wrong')
    expect(checkExpressionPart('x/2', expressionPart('x*sin(pi/6)'), {}).verdict).toBe('right')
  })

  it('does not depend on the angle mode the calculator was left in, and leaves that mode alone', () => {
    const before = getAngleMode()
    try {
      for (const mode of ['deg', 'rad'] as const) {
        setAngleMode(mode)
        expect(checkExpressionPart('F*cos(30)*x', work, values, units).verdict, mode).toBe('right')
        expect(getAngleMode()).toBe(mode)
      }
    } finally {
      setAngleMode(before)
    }
  })
})

describe('an angle typed with a degree sign is read as degrees, not as a stray letter', () => {
  it('marks F*cos(30°)*x and F*cos(30 deg)*x right', () => {
    expect(checkExpressionPart('F*cos(30°)*x', work, values, units).verdict).toBe('right')
    expect(checkExpressionPart('F*cos(30 deg)*x', work, values, units).verdict).toBe('right')
    expect(checkExpressionPart('x*sin(30°)', expressionPart('x/2'), {}).verdict).toBe('right')
    expect(checkExpressionPart('x*cos(2*30°)', expressionPart('x/2'), {}).verdict).toBe('right')
  })

  it('still marks a wrong angle in degrees wrong', () => {
    const c = checkExpressionPart('F*sin(30°)*x', work, values, units)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe(WRONG_MESSAGE)
  })

  it('does not let a deg outside a trig angle pass: x*deg, x°, x*deg/deg', () => {
    // 1.5 deg / deg works out to the plain number 1.5, so a deg let through anywhere would have
    // ticked x*deg/deg for the answer x.
    for (const typed of ['x*deg', 'x°', 'x*deg/deg']) {
      const c = checkExpressionPart(typed, expressionPart('x'), {})
      expect(c.verdict, typed).toBe('wrong')
      expect(c.message, typed).toBe('The answer should only use x.')
    }
  })

  it('does not tick a degree sign on the sampled letter: sin(x°) is not sin(x)', () => {
    expect(checkExpressionPart('sin(x°)', expressionPart('sin(x)'), {}).verdict).toBe('wrong')
  })

  it('reads a degree sign in an angle that also has a letter: F*sin(90° − θ)*x, cos(x + 90°)', () => {
    // The letter keeps its radian reading and 90° is the π/2 it stands for. Left as 90 deg, the
    // degree sign typed straight after a number was called a letter the part does not use, and the
    // complementary angle of every textbook was told "The answer should only use x."
    expect(checkExpressionPart('F*sin(90° − θ)*x', work, values, units).verdict).toBe('right')
    expect(checkExpressionPart('F*cos(θ + 0°)*x', work, values, units).verdict).toBe('right')
    expect(checkExpressionPart('cos(x + 90°)', expressionPart('-sin(x)'), {}).verdict).toBe('right')
    // The author's side too: cos(θ + 30°) with θ = 30° is cos 60°, a half.
    expect(checkExpressionPart('F*x/2', expressionPart('F*cos(theta + 30°)*x'), values, units).verdict).toBe('right')
    const c = checkExpressionPart('F*cos(90° − θ)*x', work, values, units)
    expect(c.verdict).toBe('wrong')
    expect(c.message).toBe(WRONG_MESSAGE)
  })
})

describe('a listed symbol is read the way typed text is', () => {
  // A hand-edited file may list "θ"; the typed θ is read as theta, so every answer — even the
  // exact one — was told "The answer should only use θ."
  const p = expressionPart('F*cos(θ)', ['θ'])

  it('marks F*cos(θ) and F*cos(theta) right when the part lists θ', () => {
    expect(checkExpressionPart('F*cos(θ)', p, { F: 30 }).verdict).toBe('right')
    expect(checkExpressionPart('F*cos(theta)', p, { F: 30 }).verdict).toBe('right')
  })

  it('still marks a wrong formula in θ wrong, and names θ as the author wrote it', () => {
    const wrong = checkExpressionPart('F*sin(θ)', p, { F: 30 })
    expect(wrong.verdict).toBe('wrong')
    expect(wrong.message).toBe(WRONG_MESSAGE)
    const stray = checkExpressionPart('F*cos(t)', p, { F: 30 })
    expect(stray.verdict).toBe('wrong')
    expect(stray.message).toBe('The answer should only use θ.')
  })
})
