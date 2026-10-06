import { beforeEach, describe, expect, it } from 'vitest'
import { resetGlobals } from './helpers/globals'
import { authoredEarly, hasVisual, inferVisual, visualOf } from '../src/renderer/src/questions/autoVisual'
import type { PQQuestion, UnitId } from '../src/renderer/src/questions/pqjson'
import type { Variant } from '../src/renderer/src/questions/variables'

beforeEach(() => {
  resetGlobals()
})

function question(over: Partial<PQQuestion> = {}): PQQuestion {
  return {
    id: 'q',
    title: 'A question',
    statement: 'Answer it.',
    variables: [],
    parts: [{ type: 'number', prompt: 'How much?', answer: '1', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'PhysLab', source: 'PhysLab' },
    ...over
  }
}

function variant(values: Record<string, number> = {}): Variant {
  return { seed: 0, values, problems: [] }
}

function number(answer: string, prompt = 'Find it.', unit: UnitId = 'none') {
  return {
    type: 'number' as const,
    prompt,
    answer,
    unit,
    tolerance: { kind: 'absolute' as const, value: 0.0005 },
    marks: 1
  }
}

describe('Q30 a projectile is never read as one straight-line SUVAT stretch', () => {
  it('refuses the straight-line rule for a horizontal launch from a cliff', () => {
    const q = question({
      statement: 'A stone is thrown horizontally at 15 m/s from a cliff 20 m high. It hits the sea 2 s later.',
      parts: [number('1', 'How far does it travel?')]
    })
    expect(inferVisual(q, variant({}))?.rule).not.toBe('suvat')
  })

  it('refuses the straight-line rule for a launch at an angle', () => {
    const q = question({
      statement: 'A ball is projected at 20 m/s at an angle of 30° to the horizontal. It lands 40 m away 4 s later.',
      parts: [number('1')]
    })
    expect(inferVisual(q, variant({}))?.rule).not.toBe('suvat')
  })

  // The checker's probe: the angle guard alone also refused a slope's own angle, and a block
  // sliding along a slope inclined at 30° is one straight line, drawn before the guard came in.
  it('still draws a body moving along a slope whose angle is given', () => {
    for (const statement of [
      'A block is released from rest on a smooth slope inclined at 30° to the horizontal. It accelerates at 4.9 m/s² down the slope.',
      'A car starts from rest at the bottom of a hill inclined at an angle of 10° and accelerates up the hill at 2 m/s² for 5 s.'
    ]) {
      const auto = inferVisual(question({ statement, parts: [number('25', 'How far does it go in 5 s?', 'm')] }), variant({}))
      expect(auto?.rule, statement).toBe('suvat')
    }
  })

  // "Hill" and "ramp" are slopes too, so on a slope a launch at an angle, or anything leaving it
  // horizontally, is still a projectile.
  it('still refuses a projectile launched from a hill or off a ramp', () => {
    for (const statement of [
      'A stone is thrown horizontally at 15 m/s from the top of a hill 20 m high. It lands 2 s later.',
      'A ball is projected at 20 m/s at an angle of 30° to the horizontal from the top of a hill. It lands 40 m away 4 s later.',
      'A skier leaves a ramp horizontally at 20 m/s, 45 m above the ground, and lands 3 s later.'
    ]) {
      expect(inferVisual(question({ statement, parts: [number('1')] }), variant({}))?.rule, statement).not.toBe('suvat')
    }
  })
})

describe('Q31 a normal-probability region in display maths is read', () => {
  const normal = (maths: string, prompt = 'Find this probability.') =>
    inferVisual(question({ statement: `X is normally distributed with mean 50 and standard deviation 10.\n${maths}`, parts: [number('0.5', prompt)] }), variant({}))?.visual.picture

  // The checker's probe: only a typed "<" was read. LaTeX writes ≤ as \le or \leq (there is no
  // other way to type it), Numbas content writes \lt and \gt, and \left( brackets hide the "P(":
  // each shaded the whole bell and, once answered, called the probability 1.
  it('reads the comparators and brackets LaTeX writes them with', () => {
    expect(normal('$$P(X \\le 65)$$')).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
    expect(normal('$$P(X \\leq 65)$$')).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
    expect(normal('$$P(X \\gt 65)$$')).toEqual({ kind: 'normal', mean: '50', sd: '10', from: '65' })
    expect(normal('$$P\\left(40 \\lt X \\lt 60\\right)$$')).toEqual({ kind: 'normal', mean: '50', sd: '10', from: '40', to: '60' })
    expect(normal('$$\\Pr(X \\geq 65)$$')).toEqual({ kind: 'normal', mean: '50', sd: '10', from: '65' })
  })

  it('reads \\le in inline maths too, which the spoken words drop', () => {
    expect(normal('', 'Find \\(P(X \\le 65)\\).')).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
  })

  it('shades P(X < 65) when that region is its own $$ line', () => {
    const q = question({
      statement: 'X is normally distributed with mean 50 and standard deviation 10.\n$$P(X < 65)$$',
      parts: [number('0.9332', 'Find this probability.')]
    })
    const auto = inferVisual(q, variant({}))
    expect(auto?.rule).toBe('normal')
    expect(auto?.visual.picture).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
  })
})

describe('Q32 exact roots in authored curves are held back until earned', () => {
  it('catches a root that lands exactly on an authored curve sample', () => {
    const q = question({
      statement: 'The curve is drawn.',
      parts: [number('2', 'What is the positive root?')],
      picture: { kind: 'curve', expr: 'x^2 - 4' }
    })
    expect(authoredEarly(q, variant({})).picture).toBeUndefined()
  })

  it('still catches a root between samples', () => {
    const q = question({
      statement: 'The curve is drawn.',
      parts: [number('sqrt(5)', 'What is the positive root?')],
      picture: { kind: 'curve', expr: 'x^2 - 5' }
    })
    expect(authoredEarly(q, variant({})).picture).toBeUndefined()
  })
})

describe('Q33 a free-body force respects left and right', () => {
  it('draws a leftward pull as negative and friction against it as positive', () => {
    const q = question({
      statement: 'A 10 kg crate is pulled to the left along a horizontal floor by a 50 N force. The coefficient of friction is 0.2.',
      parts: [number('1')]
    })
    const auto = inferVisual(q, variant({}))
    expect(auto?.rule).toBe('freebody')
    const pic = auto?.visual.picture
    if (pic?.kind !== 'vectors') throw new Error('expected vectors')
    expect(pic.items.map((it) => [it.name, it.v.map(Number)])).toEqual([
      ['F', [-50, 0]],
      ['μmg', [19.62, 0]],
      ['mg', [0, -98.1]],
      ['N', [0, 98.1]]
    ])
  })

  // The checker's probe: any "left" or "right" turned the force round — a crate "left at rest"
  // was pulled to the left, and "left over" beside "forwards", or "right angles" beside "to the
  // left", read as both directions and lost the diagram. Only a direction said as one counts.
  it('reads "left" and "right" only as directions', () => {
    const force = (statement: string) => {
      const pic = inferVisual(question({ statement, parts: [number('1')] }), variant({}))?.visual.picture
      return pic?.kind === 'vectors' ? pic.items.find((it) => it.name === 'F')?.v.map(Number) : undefined
    }
    expect(force('A 10 kg crate is left at rest on a rough horizontal floor. A 50 N force then pulls it. The coefficient of friction is 0.2.')).toEqual([50, 0])
    expect(force('A 10 kg box is pushed forwards along a horizontal floor by a 50 N force. The coefficient of friction is 0.2. How much force is left over?')).toEqual([50, 0])
    expect(force('A 10 kg crate on a horizontal floor is pulled to the left by a 50 N force through a rope at right angles to the wall.')).toEqual([-50, 0])
    expect(force('A 10 kg crate on a horizontal floor is pulled towards the right by a 50 N force.')).toEqual([50, 0])
  })
})

describe('Q34 standalone μ and σ notation is read', () => {
  const normalFrom = (statement: string) =>
    question({
      statement,
      parts: [number('0.9332', 'Find the probability below 65.')]
    })

  it('reads a bare μ = 50 and σ = 10', () => {
    const auto = inferVisual(normalFrom('X is normally distributed with μ = 50 and σ = 10.'), variant({}))
    expect(auto?.rule).toBe('normal')
    expect(auto?.visual.picture).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
  })

  it('reads the same notation as inline maths', () => {
    const auto = inferVisual(normalFrom('X is normally distributed with \\(\\mu = 50\\) and \\(\\sigma = 10\\).'), variant({}))
    expect(auto?.rule).toBe('normal')
    expect(auto?.visual.picture).toEqual({ kind: 'normal', mean: '50', sd: '10', to: '65' })
  })

  it('never reads a variance σ² as the standard deviation', () => {
    for (const statement of ['X is normally distributed with μ = 50 and σ² = 25.', 'X is normally distributed with \\(\\mu = 50\\) and \\(\\sigma^2 = 25\\).']) {
      const pic = inferVisual(normalFrom(statement), variant({}))?.visual.picture
      expect(pic?.kind === 'normal' ? pic.sd : undefined, statement).not.toBe('25')
    }
  })
})

describe('Q35 the fallback number line reads display maths', () => {
  const marks = (statement: string, answer: string) => {
    const plan = visualOf(question({ statement, parts: [number(answer, 'Answer it.')] }), variant({}))
    const pic = plan.source === 'fallback' ? plan.auto.visual.picture : undefined
    return pic?.kind === 'numberline' ? pic.items.map((it) => it.value) : undefined
  }

  // The checker's probe: read as raw LaTeX, the maths gave its powers as numbers — x^2 put a 2 on
  // the line — and inline maths, already read in words, gained that mark too. Display maths is read
  // the way inline maths always was, in words.
  it('reads display maths as inline maths is read, and leaves inline maths as it was', () => {
    expect(marks('Solve \\(x^2 - 7x + 12 = 0\\) for the larger root.', '4')).toEqual(['7', '12', '0'])
    expect(marks('$$x^2 - 7x + 12 = 0$$', '4')).toEqual(['7', '12', '0'])
  })

  it('marks literal numbers that appear only in a display line', () => {
    const q = question({
      statement: '$$12+4$$',
      parts: [number('16', 'Answer it.')]
    })
    const plan = visualOf(q, variant({}))
    expect(plan.source).toBe('fallback')
    if (plan.source !== 'fallback') throw new Error('expected fallback')
    const pic = plan.auto.visual.picture
    expect(pic?.kind).toBe('numberline')
    if (pic?.kind !== 'numberline') throw new Error('expected numberline')
    expect(pic.items.map((it) => it.value)).toEqual(['12', '4'])
    expect(hasVisual(plan)).toBe(true)
  })
})
