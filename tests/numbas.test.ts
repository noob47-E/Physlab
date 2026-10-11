// Numbas .exam files in and out. If these pass, a Numbas question in the accepted subset
// becomes a PhysLab question whose numbers are the same numbers (JME → mathjs, read by the
// app's own calculator), a question outside it is refused with one plain sentence, no
// question without a pool licence gets in, and a PhysLab set survives the trip to `.exam`
// and back.

import katex from 'katex'
import { beforeEach, describe, expect, it } from 'vitest'
import { inDegrees, math, preprocess } from '../src/renderer/src/math/expr'
import { checkAnswer, expectedText } from '../src/renderer/src/math/checkAnswer'
import { shownValue, type MeasureSettings } from '../src/renderer/src/math/format'
import { resetGlobals } from './helpers/globals'
import { JmeRefusal, fromExam, jmeToMath, jmeToVariableDef, mathToJme, toExam } from '../src/renderer/src/questions/numbas'
import { checkPlayedPart, countedParts, playQuestion } from '../src/renderer/src/questions/player'
import { unitInPrompt } from '../src/renderer/src/questions/units'
import { parsePQFile, serializePQFile, type PQFile, type PQPart, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { drawVariables, substitute } from '../src/renderer/src/questions/variables'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { substituteTex, textLines } from '../src/renderer/src/questions/steps'
import { texToPlain } from '../src/renderer/src/math/pure/work'

beforeEach(resetGlobals)

/** What a drawn variable sees: the calculator in degrees, as questions/variables.ts evaluates. */
const evalDeg = (expr: string, scope: Record<string, number> = {}): number =>
  Number(inDegrees(() => math.evaluate(expr, { ...scope })))

describe('JME → mathjs', () => {
  it('translates the accepted subset to the mathjs the calculator reads', () => {
    const table: [string, string][] = [
      ['precround(x, 2)', 'round(x, 2)'],
      ['e^x', 'exp(x)'],
      ['exp(x)', 'exp(x)'],
      ['ln(x)', 'ln(x)'],
      ['log(x)', 'log(x)'],
      ['log(x, 2)', 'log(2, x)'],
      ['x^y', 'x ^ y'],
      ['a + b - c * d / f', 'a + b - c * d / f'],
      ['pi', 'pi'],
      ['sqrt(a) + abs(b) + sinh(c) + cosh(d) + tanh(f) + floor(g) + ceil(h)', 'sqrt(a) + abs(b) + sinh(c) + cosh(d) + tanh(f) + floor(g) + ceil(h)'],
      ['mod(a, b)', 'mod(a, b)'],
      ['if(a > b, a, b)', 'a > b ? a : b'],
      ['a = b and not (c <> d) or a <= b', 'a == b and not (c != d) or a <= b'],
      ['(a or b) and c', '(a or b) and c'],
      ['2x', '2 * x'],
      ['dec(x)', 'x - fix(x)'],
      ['trunc(x)', 'fix(x)'],
      ['-x^2', '-x ^ 2'],
      ['(a - b) - c', 'a - b - c'],
      ['a - (b - c)', 'a - (b - c)'],
      ['(a + b) * c', '(a + b) * c'],
      ['a^(b^c)', 'a ^ b ^ c'],
      ['(a^b)^c', '(a ^ b) ^ c'],
      ['1/2x', '1 / 2 * x']
    ]
    for (const [jme, expected] of table) expect(jmeToMath(jme, 'same'), jme).toBe(expected)
  })

  it('keeps the meaning of trig when the calculator draws in degrees', () => {
    // JME's sin takes radians; PhysLab draws a question's numbers in degrees. Plain arithmetic,
    // never mathjs's `x rad`: every free name in a formula is read as a variable when it is drawn.
    expect(jmeToMath('sin(x)')).toBe('sin(x * 180 / pi)')
    expect(jmeToMath('cos(a*b)')).toBe('cos((a * b) * 180 / pi)')
    expect(evalDeg(jmeToMath('sin(x)'), { x: Math.PI / 6 })).toBeCloseTo(0.5, 12)
    expect(evalDeg(jmeToMath('arcsin(x)'), { x: 0.5 })).toBeCloseTo(Math.PI / 6, 12)
    expect(jmeToMath('cos(radians(t))')).toBe('cos(t)')
    expect(evalDeg(jmeToMath('cos(radians(t))'), { t: 60 })).toBeCloseTo(0.5, 12)
    expect(jmeToMath('degrees(arctan(1))')).toBe('atan(1)')
    expect(evalDeg(jmeToMath('degrees(arctan(1))'))).toBeCloseTo(45, 12)
    expect(jmeToMath('sin(degrees(x))')).toBe('sin((x * 180 / pi) * 180 / pi)')
    expect(jmeToMath('radians(t)')).toBe('t * pi / 180')
    // An expression part keeps the names: the student types sin(x) in the same convention.
    expect(jmeToMath('sin(x) + arctan(y)', 'same')).toBe('sin(x) + atan(y)')
    expect(jmeToMath('sin(radians(x))', 'same')).toBe('sin(x * pi / 180)')
  })

  it('gives the same numbers as JME for the functions with different names', () => {
    expect(evalDeg(jmeToMath('precround(2.34567, 2)'))).toBe(2.35)
    expect(evalDeg(jmeToMath('siground(123456, 2)'))).toBe(120000)
    expect(evalDeg(jmeToMath('siground(0.012345, 3)'))).toBeCloseTo(0.0123, 12)
    expect(evalDeg(jmeToMath('siground(0, 3)'))).toBe(0)
    expect(evalDeg(jmeToMath('log(1000)'))).toBeCloseTo(3, 12)
    expect(evalDeg(jmeToMath('ln(e)'))).toBeCloseTo(1, 12)
    expect(evalDeg(jmeToMath('log(8, 2)'))).toBeCloseTo(3, 12)
    expect(evalDeg(jmeToMath('-x^2'), { x: 3 })).toBe(-9)
    expect(evalDeg(jmeToMath('e^2'))).toBeCloseTo(Math.exp(2), 12)
    expect(evalDeg(jmeToMath('if(3 > 2, 10, 20)'))).toBe(10)
    expect(evalDeg(jmeToMath('mod(7, 3)'))).toBe(1)
    expect(evalDeg(jmeToMath('1/2x'), { x: 4 })).toBe(2)
    expect(evalDeg(jmeToMath('2(x+1)'), { x: 4 })).toBe(10)
    // dec(x) is JME's signed fractional part, x − trunc(x): the bug this replaces emitted the
    // bare x, so dec(3.5) silently came in as 3.5 instead of Numbas's own 0.5.
    expect(evalDeg(jmeToMath('dec(3.5)'))).toBeCloseTo(0.5, 12)
    expect(evalDeg(jmeToMath('dec(-3.5)'))).toBeCloseTo(-0.5, 12)
    expect(evalDeg(jmeToMath('dec(4)'))).toBe(0)
  })

  it('turns random() into a range or a list', () => {
    expect(jmeToVariableDef('random(1..10)')).toEqual({ kind: 'range', from: 1, to: 10, step: 1 })
    expect(jmeToVariableDef('random(0.5..2.5#0.5)')).toEqual({ kind: 'range', from: 0.5, to: 2.5, step: 0.5 })
    expect(jmeToVariableDef('random(-5..5 except 0)')).toEqual({ kind: 'range', from: -5, to: 5, step: 1, exclude: [0] })
    expect(jmeToVariableDef('random(-5..5#1 except [0, 1])')).toEqual({ kind: 'range', from: -5, to: 5, step: 1, exclude: [0, 1] })
    expect(jmeToVariableDef('random(2, 3, 5)')).toEqual({ kind: 'list', items: [2, 3, 5] })
    expect(jmeToVariableDef('random([2, 3, 5])')).toEqual({ kind: 'list', items: [2, 3, 5] })
    expect(jmeToVariableDef('random(30)')).toEqual({ kind: 'list', items: [30] })
    expect(jmeToVariableDef('random([30])')).toEqual({ kind: 'list', items: [30] })
    expect(jmeToVariableDef('a * b + 1')).toEqual({ kind: 'expr', expr: 'a * b + 1' })
    expect(jmeToVariableDef('9.8')).toEqual({ kind: 'expr', expr: '9.8' })
  })

  it('refuses everything outside the subset, naming what it met', () => {
    const cases: [string, string][] = [
      ['list(1, 2)', 'the function list'],
      ['map(x^2, x, 1..5)', 'the function map'],
      ['repeat(random(1..5), 3)', 'the function repeat'],
      ['vector(1, 2)', 'the function vector'],
      ['matrix([1, 2], [3, 4])', 'the function matrix'],
      ['"hello"', 'a string'],
      ['latex(x)', 'the function latex'],
      ['x[1]', 'an index into a list'],
      ['[1, 2, 3]', 'a list'],
      ['a xor b', 'the word xor'],
      ['5!', 'a factorial'],
      ['random(1..n except 0)', 'a random range whose ends are not plain numbers, with except'],
      ['random(1..5) * 2', 'random inside a formula'],
      ['random(x, y)', 'a random choice from things that are not numbers'],
      ['infinity', 'infinity'],
      ['1..5', 'a range outside random']
    ]
    for (const [jme, what] of cases) {
      let caught: unknown
      try {
        jmeToVariableDef(jme)
      } catch (e) {
        caught = e
      }
      expect(caught, jme).toBeInstanceOf(JmeRefusal)
      expect((caught as JmeRefusal).what, jme).toBe(what)
    }
  })
})

// ---------------------------------------------------------------------------
// Reading an .exam
// ---------------------------------------------------------------------------

const CC_BY = 'Creative Commons Attribution 4.0 International'
const CC_BY_SA = 'Creative Commons Attribution-ShareAlike 4.0 International'

type Raw = Record<string, unknown>

/** A Numbas variable entry as the editor writes it. */
const v = (name: string, definition: string, description = ''): Raw => ({
  name,
  group: 'Ungrouped variables',
  definition,
  description,
  templateType: 'anything',
  can_override: false
})

/** A question in the editor's shape, with the keys a test does not name left at their defaults. */
function question(over: Raw): Raw {
  return {
    name: 'Braking train',
    statement: '<p>A train is braking.</p>',
    advice: '',
    rulesets: {},
    extensions: [],
    variables: {},
    ungrouped_variables: [],
    variable_groups: [],
    functions: {},
    preamble: { js: '', css: '' },
    parts: [],
    tags: [],
    metadata: { description: '', licence: CC_BY },
    contributors: [{ name: 'Ada Lovelace', profile_url: '' }],
    type: 'question',
    ...over
  }
}

/** The whole file, header line included, as the editor exports it. */
function exam(questions: Raw[], over: Raw = {}): string {
  const body = {
    name: 'Test exam',
    metadata: { description: '', licence: '' },
    duration: 0,
    percentPass: 0,
    question_groups: [{ name: 'Group', pickingStrategy: 'all-ordered', questions }],
    contributors: [],
    extensions: [],
    custom_part_types: [],
    resources: [],
    ...over
  }
  return `// Numbas version: finer_feedback_settings\n${JSON.stringify(body)}`
}

const TRAIN: Raw = {
  statement: '<p>A train moving at {u} m/s slows at {a} m/s² for {t} s.</p>',
  variables: {
    u: v('u', 'random(20..40#5)', 'initial speed'),
    a: v('a', 'random(0.5..2#0.5)'),
    t: v('t', 'random(2..8)'),
    vend: v('vend', 'u - a*t')
  },
  ungrouped_variables: ['u', 'a', 't', 'vend'],
  // Inside LaTeX only \var{…} shows a value; a bare {u} there is a LaTeX group.
  advice: '<p>Use \\(v = u + at\\) with the deceleration negative.</p><p>\\[v = \\var{u} - \\var{a} \\times \\var{t}\\]</p><p>So the final speed is {vend} m/s.</p>',
  parts: [
    {
      type: 'numberentry',
      marks: 2,
      prompt: '<p>What is its speed after {t} s?</p><p>Give your answer in m/s.</p>',
      minValue: 'vend - 0.5',
      maxValue: 'vend + 0.5',
      precisionType: 'none',
      steps: [{ type: 'information', prompt: '<p>Write down \\(v = u + at\\).</p>' }]
    },
    {
      type: 'jme',
      marks: 1,
      prompt: '<p>Write the speed as a function of time \\(s\\).</p>',
      answer: 'u - a*s',
      vsetRange: [0, 5],
      checkingType: 'absdiff',
      notation: 'basic',
      enabledFunctions: [],
      disabledFunctions: [],
      functionSets: []
    },
    {
      type: '1_n_2',
      marks: 0,
      maxMarks: 1,
      prompt: '<p>Is the train speeding up or slowing down?</p>',
      choices: ['<p>Speeding up</p>', '<p>Slowing down</p>'],
      matrix: [[0], [1]],
      distractors: ['<p>The acceleration is against the motion.</p>', ''],
      shuffleChoices: true
    }
  ]
}

describe('fromExam', () => {
  it('reads a licensed question in the subset into a PQ question the loader accepts', () => {
    const { file, report } = fromExam(exam([question(TRAIN)]))
    expect(report).toEqual([])
    expect(file.questions).toHaveLength(1)
    const q = file.questions[0]
    expect(q.title).toBe('Braking train')
    expect(q.statement).toBe('A train moving at {u} m/s slows at {a} m/s² for {t} s.')
    expect(q.variables.map((x) => x.name)).toEqual(['u', 'a', 't', 'vend'])
    expect(q.variables[0]).toEqual({ name: 'u', def: { kind: 'range', from: 20, to: 40, step: 5 }, description: 'initial speed' })
    expect(q.variables[3].def).toEqual({ kind: 'expr', expr: 'u - a * t' })
    expect(q.license).toEqual({ id: 'CC BY 4.0', holder: 'Ada Lovelace', found: CC_BY })
    expect(q.imported).toEqual({ format: 'numbas', contributors: ['Ada Lovelace'] })
    expect(q.id).toMatch(/^numbas-[0-9a-f]{8}$/)

    expect(q.parts).toHaveLength(3)
    const [n, e, c] = q.parts
    expect(n).toEqual({
      type: 'number',
      prompt: 'What is its speed after {t} s?',
      answer: 'vend',
      unit: 'm/s',
      tolerance: { kind: 'absolute', value: 0.5 },
      marks: 2
    })
    expect(e).toEqual({
      type: 'expression',
      prompt: 'Write the speed as a function of time \\(s\\).',
      answer: 'u - a * s',
      symbols: ['s'],
      sampleRange: [0, 5],
      marks: 1
    })
    expect(c).toEqual({
      type: 'choice',
      prompt: 'Is the train speeding up or slowing down?',
      choices: [
        { text: 'Speeding up', correct: false, why: 'The acceleration is against the motion.' },
        { text: 'Slowing down', correct: true }
      ],
      shuffle: true,
      marks: 1
    })

    // Advice paragraphs first, then the part's steps; a maths-only paragraph is the tex of the step before it.
    expect(q.steps).toEqual({
      level: 'worked',
      items: [
        { head: 'Use v = u + at with the deceleration negative.', tex: 'v = {u} - {a} \\times {t}', blank: false },
        { head: 'So the final speed is {vend} m/s.', blank: false },
        { head: 'Write down v = u + at.', blank: false }
      ]
    })

    // The boundary: the file the importer writes is a file the loader reads, and its numbers draw.
    const back = parsePQFile(serializePQFile(file))
    const variant = drawVariables(back.questions[0], 3)
    expect(variant.problems).toEqual([])
    expect(variant.values.vend).toBe(variant.values.u - variant.values.a * variant.values.t)
    expect(substitute(back.questions[0].statement, variant.values, {}, { decimals: 4, precisionMode: 'dp' })).not.toContain('{')
    expect(evalDeg(n.type === 'number' ? n.answer : '', variant.values)).toBe(variant.values.vend)
    // Same file, same ids; the same question twice in one file gets two ids, and the same two next time.
    expect(fromExam(exam([question(TRAIN)])).file.questions[0].id).toBe(q.id)
    const twice = fromExam(exam([question(TRAIN), question(TRAIN), question(TRAIN)])).file.questions.map((x) => x.id)
    expect(twice).toEqual([q.id, `${q.id}-2`, `${q.id}-3`])
    expect(fromExam(exam([question(TRAIN), question(TRAIN), question(TRAIN)])).file.questions.map((x) => x.id)).toEqual(twice)
  })

  it('draws a question with trig in a variable and a number answer: the boundary into the engine', () => {
    const q = question({
      variables: { x: v('x', 'random(1..5)'), y: v('y', 'sin(x)'), z: v('z', 'degrees(arcsin(1 / 2))') },
      ungrouped_variables: ['x', 'y', 'z'],
      parts: [{ type: 'numberentry', marks: 1, prompt: '<p>cos(x)?</p>', minValue: 'cos(x)', maxValue: 'cos(x)' }]
    })
    const { file, report } = fromExam(exam([q]))
    expect(report).toEqual([])
    const got = file.questions[0]
    expect(got.variables.map((w) => w.def)).toEqual([
      { kind: 'range', from: 1, to: 5, step: 1 },
      { kind: 'expr', expr: 'sin(x * 180 / pi)' },
      { kind: 'expr', expr: 'asin(1 / 2)' }
    ])
    const variant = drawVariables(got, 4)
    expect(variant.problems).toEqual([])
    expect(variant.values.y).toBeCloseTo(Math.sin(variant.values.x), 12)
    expect(variant.values.z).toBeCloseTo(30, 12)
    const part = got.parts[0]
    expect(part.type === 'number' && part.answer).toBe('cos(x * 180 / pi)')
    expect(evalDeg(part.type === 'number' ? part.answer : '', variant.values)).toBeCloseTo(Math.cos(variant.values.x), 12)
    // Out and back again is the identity, so the trip changes no question.
    const again = fromExam(toExam(file))
    expect(again.report).toEqual([])
    expect(again.file.questions[0].variables.map((w) => w.def)).toEqual(got.variables.map((w) => w.def))
    expect(again.file.questions[0].parts[0]).toEqual(part)
  })

  it('reads the lower-case keys older editors wrote, exact case first', () => {
    const q = question({
      variables: { a: v('a', 'random(1..5)') },
      parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minvalue: 'a', maxvalue: 'a', precisiontype: 'dp', precision: 2 }]
    })
    const { file } = fromExam(exam([q]))
    expect(file.questions[0].parts[0]).toMatchObject({ answer: 'a', tolerance: { kind: 'absolute', value: 0.005 } })
    // A unit named inside the prompt's own sentence is read and the sentence kept.
    const inline = question({
      variables: { a: v('a', 'random(1..5)') },
      parts: [{ type: 'numberentry', marks: 1, prompt: '<p>What is the force in N?</p>', minValue: 'a', maxValue: 'a' }]
    })
    expect(fromExam(exam([inline])).file.questions[0].parts[0]).toMatchObject({ prompt: 'What is the force in N?', unit: 'N' })
  })

  it('recovers a tolerance from the two bounds, or says it assumed one', () => {
    const part = (minValue: string, maxValue: string, extra: Raw = {}): Raw => ({ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue, maxValue, ...extra })
    const read = (p: Raw): { answer: string; tolerance: unknown; report: string[] } => {
      const { file, report } = fromExam(exam([question({ variables: { a: v('a', 'random(1..5)'), b: v('b', 'random(1..5)') }, parts: [p] })]))
      const got = file.questions[0].parts[0]
      return { answer: got.type === 'number' ? got.answer : '', tolerance: got.type === 'number' ? got.tolerance : null, report }
    }
    expect(read(part('0.99*a*b', '1.01*a*b'))).toMatchObject({ tolerance: { kind: 'relative', value: 0.01 }, report: [] })
    expect(read(part('a*b - 0.05', 'a*b + 0.05'))).toMatchObject({ answer: 'a * b', tolerance: { kind: 'absolute', value: 0.05 }, report: [] })
    // Equal bounds and no precision are an exact match. This line used to pin 2 % (the first
    // import's default, dadc316), which marked 101 right for an exact 100. Numbas marks a number
    // right between minValue and maxValue ("the smallest / largest value accepted as correct"), so
    // nothing lies between equal bounds but the one number; the wave head decided on 2026-10-03
    // that PhysLab reads it so, as e3132c0 had already made it read the matrix part. Exact keeps
    // the calculator's noise floor and a stated precision (see "an exact Numbas number box" below).
    expect(read(part('a', 'a'))).toMatchObject({ answer: 'a', tolerance: { kind: 'absolute', value: 0 }, report: [] })
    expect(read(part('a', 'a', { precisionType: 'none' }))).toMatchObject({ answer: 'a', tolerance: { kind: 'absolute', value: 0 }, report: [] })
    expect(read(part('a', 'a', { precisionType: 'sigfig', precision: 3 }))).toMatchObject({ tolerance: { kind: 'relative', value: 0.005 } })
    // The gap depends on b, so nothing holds for every variant: 2 % and a sentence.
    const odd = read(part('a - b', 'a + 2*b'))
    expect(odd.tolerance).toEqual({ kind: 'relative', value: 0.02 })
    expect(odd.report).toEqual(["Question 'Braking train', part 1: PhysLab could not read how close an answer must be, so it accepts 2 %."])
  })

  it('finds the unit a prompt asks for at its tail, and none when it names none', () => {
    const cases: [string, string][] = [
      ['What is the speed in m/s?', 'm/s'],
      ['Find the acceleration (in metres per second squared).', 'm/s²'],
      ['Give the force in \\(\\mathrm{N}\\).', 'N'],
      ['Find the speed in \\(\\mathrm{ms^{-1}}\\)', 'm/s'],
      ['Find the acceleration in \\(\\text{m s}^{-2}\\).', 'm/s²'],
      ['The momentum, in kg m/s:', 'kg·m/s'],
      ['What is the angle in degrees?', '°'],
      ['Temperature in °C?', '°C'],
      ['How many metres?', 'none'],
      ['What is the mass?', 'none'],
      ['Find x in the diagram.', 'none']
    ]
    for (const [prompt, unit] of cases) expect(unitInPrompt(prompt), prompt).toBe(unit)
  })

  it('makes a variable for an expression shown in the text, and leaves LaTeX groups alone', () => {
    const q = question({
      variables: { a: v('a', 'random(2..9)'), b: v('b', 'random(2..9)') },
      statement: '<p>The product is {a*b} and \\var{a+b} is the sum; the ratio is \\(\\frac{a}{b}\\) and \\(\\var{2a}\\).</p>',
      parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' }]
    })
    const { file, report } = fromExam(exam([q]))
    expect(report).toEqual([])
    const got = file.questions[0]
    expect(got.statement).toBe('The product is {shown1} and {shown2} is the sum; the ratio is \\(\\frac{ a}{ b}\\) and \\({shown3}\\).')
    expect(got.variables.slice(2)).toEqual([
      { name: 'shown1', def: { kind: 'expr', expr: 'a * b' }, description: 'Shown in the text: a*b' },
      { name: 'shown2', def: { kind: 'expr', expr: 'a + b' }, description: 'Shown in the text: a+b' },
      { name: 'shown3', def: { kind: 'expr', expr: '2 * a' }, description: 'Shown in the text: 2a' }
    ])
    const variant = drawVariables(got, 1)
    expect(variant.values.shown1).toBe(variant.values.a * variant.values.b)
    // The protected groups stay out of substitution; the chips go in.
    const text = substitute(got.statement, variant.values, {}, { decimals: 4, precisionMode: 'dp' })
    expect(text).toContain('\\frac{ a}{ b}')
    expect(text).not.toContain('{shown')
  })

  it('reads a gapfill as its gaps, with the lead text on the first, and an information part into the statement', () => {
    const q = question({
      variables: { a: v('a', 'random(1..9)') },
      parts: [
        { type: 'information', marks: 0, prompt: '<p>Take g = 9.8 m/s².</p>' },
        {
          type: 'gapfill',
          marks: 0,
          prompt: '<p>The value is [[0]] and its double is [[1]].</p>',
          gaps: [
            { type: 'numberentry', marks: 1, prompt: '', minValue: 'a', maxValue: 'a' },
            { type: 'numberentry', marks: 1, prompt: '<p>The double</p>', minValue: '2a', maxValue: '2a' }
          ]
        }
      ]
    })
    const { file, report } = fromExam(exam([q]))
    expect(report).toEqual([])
    const got = file.questions[0]
    expect(got.statement).toBe('A train is braking.\nTake g = 9.8 m/s².')
    expect(got.parts.map((p) => p.prompt)).toEqual(['The value is ___ and its double is ___.', 'The double'])
    expect(got.parts.map((p) => (p.type === 'number' ? p.answer : ''))).toEqual(['a', '2 * a'])
  })

  it('skips each question outside the subset with one plain sentence naming the reason', () => {
    const base = { variables: { a: v('a', 'random(1..5)') }, parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' }] }
    const cases: [Raw, string][] = [
      [{ parts: [{ type: 'patternmatch', marks: 1, prompt: '<p>M</p>' }] }, 'uses a patternmatch part PhysLab does not read'],
      [{ parts: [{ type: 'm_n_x', marks: 1, prompt: '<p>M</p>' }] }, 'uses a m_n_x part PhysLab does not read'],
      [{ parts: [{ type: 'patternmatch', marks: 1, prompt: '<p>M</p>' }] }, 'uses a patternmatch part PhysLab does not read'],
      [{ parts: [{ type: 'extension', marks: 1, prompt: '<p>M</p>' }] }, 'uses a extension part PhysLab does not read'],
      [{ variables: { a: v('a', 'map(x^2, x, 1..3)') } }, 'variable a uses the function map, which PhysLab does not know'],
      [{ variables: { a: v('a', 'random(1..n except 2)'), n: v('n', '5') } }, 'variable a uses a random range whose ends are not plain numbers, with except, which PhysLab does not know'],
      [{ statement: '<p>See <img src="a.png"> the picture.</p>' }, 'has a picture or table PhysLab cannot show'],
      [{ statement: '<table><tr><td>1</td></tr></table>' }, 'has a picture or table PhysLab cannot show'],
      [{ rulesets: { std: ['all'] } }, 'uses Numbas scripting'],
      [{ functions: { f: { parameters: [], type: 'number', language: 'jme', definition: '1' } } } , 'uses Numbas scripting'],
      [{ extensions: ['geogebra'] }, 'uses Numbas scripting'],
      [{ preamble: { js: 'question.foo = 1;', css: '' } }, 'uses Numbas scripting'],
      [{ statement: '<p>Factorise \\(\\simplify{x^2 + {a}x}\\).</p>' }, 'uses \\simplify, which PhysLab cannot show'],
      [{ statement: '<p>The value {q} is missing.</p>' }, 'shows {q} in its text, but there is no variable called q'],
      [{ parts: [{ type: 'jme', marks: 1, prompt: '<p>f?</p>', answer: 'vector(1, 2)' }] }, 'part 1 uses the function vector, which PhysLab does not know'],
      [{ parts: [{ type: '1_n_2', marks: 1, prompt: '<p>?</p>', choices: 'map(x, x, 1..3)', matrix: [[1]] }] }, 'part 1 makes its choices with Numbas scripting'],
      [{ parts: [{ type: '1_n_2', marks: 1, prompt: '<p>?</p>', choices: ['<p>a</p>', '<p>b</p>'], matrix: 'map(1, x, 1..2)' }] }, 'part 1 marks its choices with Numbas scripting'],
      [{ parts: [{ type: '1_n_2', marks: 1, prompt: '<p>?</p>', choices: ['<p>a</p>', '<p>b</p>'], matrix: [[0], [0]] }] }, 'part 1 has no right answer among its choices'],
      [{ variables: { e: v('e', 'random(1..5)') } }, "uses 'e' as a variable name, but that already means something in maths"],
      [{ parts: [] }, 'has no part PhysLab can ask']
    ]
    for (const [over, reason] of cases) {
      const { file, report } = fromExam(exam([question({ ...base, ...over })]))
      expect(file.questions, reason).toEqual([])
      expect(report, reason).toEqual([`Question 'Braking train' was skipped: it ${reason}.`])
    }
  })

  it('refuses every licence outside the pool, quoting what it found, and falls back to the exam licence', () => {
    const ok = { variables: { a: v('a', 'random(1..5)') }, parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' }] }
    const licensed = (licence: string | null): Raw => question({ ...ok, metadata: { description: '', licence } })
    const nc = fromExam(exam([licensed('Creative Commons Attribution-NonCommercial 4.0 International')]))
    expect(nc.file.questions).toEqual([])
    expect(nc.report).toEqual(["Question 'Braking train' is licensed 'Creative Commons Attribution-NonCommercial 4.0 International', which PhysLab may not bundle."])
    expect(fromExam(exam([licensed('None specified')])).report).toEqual(["Question 'Braking train' names no licence, which PhysLab may not bundle."])
    expect(fromExam(exam([licensed(null)])).report).toEqual(["Question 'Braking train' names no licence, which PhysLab may not bundle."])
    expect(fromExam(exam([licensed('All rights reserved')])).report[0]).toContain("is licensed 'All rights reserved'")
    // The exam's own licence covers a question that says nothing, and its contributors credit one that names none.
    const inherited = fromExam(exam([question({ ...ok, metadata: { description: '', licence: '' }, contributors: [] })], {
      metadata: { description: '', licence: CC_BY_SA },
      contributors: [{ name: 'Grace Hopper', profile_url: '' }, { name: 'Alan Turing', profile_url: '' }]
    }))
    expect(inherited.report).toEqual([])
    expect(inherited.file.questions[0].license).toEqual({ id: 'CC BY-SA 4.0', holder: 'Grace Hopper, Alan Turing', found: CC_BY_SA })
    // Attribution needs someone to attribute.
    const nobody = fromExam(exam([question({ ...ok, contributors: [] })]))
    expect(nobody.file.questions).toEqual([])
    expect(nobody.report).toEqual(["Question 'Braking train' names no author to credit, which PhysLab may not bundle."])
    // A nameless question is called by its number here, as it is everywhere else in the report.
    expect(fromExam(exam([question({ ...ok, name: '', contributors: [] })])).report).toEqual(["Question 'Question 1' names no author to credit, which PhysLab may not bundle."])
    expect(fromExam(exam([licensed('All rights reserved'), { ...licensed('All rights reserved'), name: '' }])).report[1]).toContain("Question 'Question 2' is licensed")
    // The licence is judged before anything else: a scripted NC question is refused for its licence.
    const both = fromExam(exam([question({ ...ok, rulesets: { std: ['all'] }, metadata: { description: '', licence: 'Creative Commons Attribution-NoDerivatives 4.0 International' } })]))
    expect(both.report[0]).toContain('NoDerivatives')
  })

  it('tells the teacher what it assumed, and keeps going past a bad question', () => {
    const zero = question({
      name: 'Zero marks',
      variables: { a: v('a', 'random(1..5)') },
      parts: [
        { type: 'numberentry', marks: 0, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' },
        { type: 'jme', marks: 1, prompt: '<p>a?</p>', answer: 'a*x', checkingType: 'dp', checkingAccuracy: 2 }
      ]
    })
    const bad = question({ name: 'Bad', parts: [{ type: 'patternmatch', marks: 1, prompt: '<p>M</p>' }] })
    const { file, report } = fromExam(exam([bad, zero, 'not a question' as unknown as Raw]))
    expect(file.questions.map((q) => q.title)).toEqual(['Zero marks'])
    expect(file.questions[0].parts.map((p) => p.marks)).toEqual([1, 1])
    expect(report).toEqual([
      "Question 'Bad' was skipped: it uses a patternmatch part PhysLab does not read.",
      "Question 'Zero marks', part 1 was worth 0 marks in Numbas; PhysLab counts it as 1.",
      "Question 'Zero marks', part 2 is checked to a number of decimal places in Numbas; PhysLab checks it as an expression.",
      'Question 3 was skipped: it is not a question PhysLab can read.'
    ])
  })

  it('reads a flat questions list, tags, entities and line breaks, and refuses what is not an exam', () => {
    const q = question({
      variables: { a: v('a', 'random(1..5)') },
      statement: '<p>Speed &amp; time.<br>Second line &nbsp; here &#960; &#x3B8;.</p><ul><li>one</li><li>two</li></ul><p>\\[E = mc^2\\]</p>',
      tags: ['physics', 'kinematics'],
      parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' }]
    })
    const flat = JSON.stringify({ name: 'Old', questions: [q] })
    const { file } = fromExam(flat)
    expect(file.questions[0].statement).toBe('Speed & time.\nSecond line here π θ.\none\ntwo\n$$E = mc^2$$')
    expect(file.questions[0].tags).toEqual(['physics', 'kinematics'])
    expect(() => fromExam('// Numbas version: x\n{not json')).toThrow('This is not a Numbas exam file.')
    expect(() => fromExam('[1, 2]')).toThrow('This is not a Numbas exam file.')
    expect(fromExam('{}').file.questions).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Maths between dollar signs
// ---------------------------------------------------------------------------

describe('fromExam: maths written between dollar signs', () => {
  const SETTINGS = { decimals: 4, precisionMode: 'dp' as const, unit: 'm' as const, unitPerSquare: 1, angleUnit: 'deg' as const }
  const names = (q: PQQuestion): string[] => q.variables.map((x) => x.name)
  const ASK_M: Raw = { type: 'numberentry', marks: 1, prompt: '<p>m?</p>', minValue: 'm', maxValue: 'm' }

  // Most of the public Numbas bank writes inline maths as $…$, which Numbas reads exactly like
  // \(…\). Read as plain text instead, every LaTeX group in it — the -1 of ms^{-1}, the bounds of
  // \int_{0}^{1} — was taken for a Numbas {…} value and became a made-up variable "shownN" that
  // the student then saw in place of the maths. These two are verbatim from the bank.

  it('keeps a unit written as $\\mathrm{ms^{-1}}$ as maths (Q4 Constant Acceleration, numbas question 15331)', () => {
    const q = question({
      name: 'Q4 Constant Acceleration',
      statement:
        '<p>A&nbsp;train&nbsp;travelling at $\\var{u_A}\\,\\mathrm{ms^{-1}}$ passes point <em>A</em> and&nbsp;starts to accelerate with constant acceleration.</p>\n<p>$\\var{t_1}\\,$ seconds later, its speed is $\\var{v1}\\,\\mathrm{ms^{-1}}$</p>',
      variables: {
        a1: v('a1', '(v1-u_A)/t_1'),
        u_A: v('u_A', 'random(10..15#1)'),
        v1: v('v1', 'floor(u_A+alpha*u_A)'),
        alpha: v('alpha', 'random(1.2,1.25,1.3,1.35,1.4,1.45,1.5)'),
        t_1: v('t_1', 'random(40..60#5)')
      },
      ungrouped_variables: ['u_A', 't_1', 'a1', 'alpha', 'v1'],
      parts: [
        {
          type: 'gapfill',
          marks: 0,
          prompt: '<p>the acceleration of the train&nbsp;= [[0]] $ms^{-2}$</p>',
          gaps: [{ type: 'numberentry', marks: '2', minValue: 'a1', maxValue: 'a1', precisionType: 'sigfig', precision: '3' }]
        }
      ]
    })
    const { file, report } = fromExam(exam([q]))
    expect(report).toEqual([])
    const got = file.questions[0]
    expect(names(got)).toEqual(['u_A', 't_1', 'a1', 'alpha', 'v1'])
    expect(got.statement).toBe(
      'A train travelling at \\({u_A}\\,\\mathrm{ms^{-1}}\\) passes point A and starts to accelerate with constant acceleration.\n' +
        '\\({t_1}\\,\\) seconds later, its speed is \\({v1}\\,\\mathrm{ms^{-1}}\\)'
    )
    expect(got.parts[0].prompt).toBe('the acceleration of the train = ___ \\(ms^{-2}\\)')

    // Through to what the student reads: the drawn speed, then the unit, as maths.
    const variant = drawVariables(got, 7)
    expect(variant.problems).toEqual([])
    const [line] = textLines(got.statement, { values: variant.values, units: {}, settings: SETTINGS })
    expect(line[1]).toEqual({ tex: `${variant.values.u_A}\\,\\mathrm{ms^{-1}}`, display: false })
  })

  it('keeps the bounds of $\\int_{0}^{1}$ and the n + 1 of a formula as LaTeX (Basic Integration, numbas question 33536)', () => {
    const q = question({
      name: 'Basic Integration',
      statement: '<p>Find the following definite integrals.</p>',
      advice: '<p>$\\int_a^bx^n=\\frac{b^{n+1}-a^{n+1}}{n+1}$</p>',
      variables: {
        n: v('n', 'random(2..10#1)', '<p>the power on x</p>'),
        b: v('b', 'random(4..8#1)', '<p>upper bound of integration</p>'),
        a: v('a', 'random(0..3#1)', '<p>lower bound of integration</p>')
      },
      ungrouped_variables: ['a', 'b', 'n'],
      parts: [
        { type: 'numberentry', marks: 1, prompt: '<p>$\\int_{0}^{1}{x^{\\var{n}}}$</p>', minValue: '1/(n+1)', maxValue: '1/(n+1)' },
        { type: 'numberentry', marks: 1, prompt: '<p>$\\int_{\\var{a}}^{\\var{b}}{x^{\\var{n}}}$</p>', minValue: '(b^(n+1)-a^(n+1))/(n+1)', maxValue: '(b^(n+1)-a^(n+1))/(n+1)' }
      ]
    })
    const { file, report } = fromExam(exam([q]))
    expect(report).toEqual([])
    const got = file.questions[0]
    expect(names(got)).toEqual(['a', 'b', 'n'])
    expect(got.parts.map((p) => p.prompt)).toEqual(['\\(\\int_{0}^{1}{x^{{n}}}\\)', '\\(\\int_{{a}}^{{b}}{x^{{n}}}\\)'])
    // The worked formula keeps its letters: n + 1 is not replaced by whatever n + 1 came to. Its words
    // are spoken with the ∫ kept and each n + 1 bracketed ("b^n+1-a^n+1n+1" was what texToPlain's
    // stripped braces made of it, the same formula read three ways at once).
    expect(got.steps?.items.map((s) => s.head)).toEqual(['∫_a^bx^n=(b^(n+1)-a^(n+1))/(n+1)'])

    const variant = drawVariables(got, 3)
    expect(variant.problems).toEqual([])
    const [[prompt]] = textLines(got.parts[0].prompt, { values: variant.values, units: {}, settings: SETTINGS })
    expect(prompt).toEqual({ tex: `\\int_{0}^{1}{x^{${variant.values.n}}}`, display: false })
  })

  it('finds maths the way Numbas does: $$, $, \\(, \\[ and \\begin, never an escaped \\$ or a $ in a tag', () => {
    const vars = { m: v('m', 'random(2..5)'), n: v('n', 'random(2..5)'), p: v('p', 'random(2..5)') }
    const read = (statement: string): PQQuestion => {
      const { file, report } = fromExam(exam([question({ variables: vars, ungrouped_variables: ['m', 'n', 'p'], statement, parts: [ASK_M] })]))
      expect(report, statement).toEqual([])
      return file.questions[0]
    }
    const table: [string, string][] = [
      // Display maths in the middle of a paragraph gets a line of its own, as \[…\] always has.
      ['<p>Energy: $$E = \\var{m}c^{2}$$ in joules.</p>', 'Energy:\n$$E = {m}c^{2}$$\nin joules.'],
      // An align environment needs no other delimiter; its <br>s are only line breaks in the editor.
      ['<p>\\begin{align}<br/>v &amp;= u + at \\\\<br/>&amp;= \\var{m}\\end{align}</p>', '$$\\begin{align} v &= u + at \\\\ &= {m}\\end{align}$$'],
      // A group that happens to be a variable's name stays LaTeX; only \\var shows a value.
      ['<p>$x^{n}$ where $n = \\var{n}$.</p>', '\\(x^{ n}\\) where \\(n = {n}\\).'],
      // Two spans back to back, the closing dollar of one straight against the opening of the next.
      ['<p>Write $\\sin$$x$ as $\\sin(x)$.</p>', 'Write \\(\\sin\\)\\(x\\) as \\(\\sin(x)\\).'],
      // A dollar sign: escaped, or inside an attribute, or with no partner before the paragraph ends.
      ['<p>It costs \\$\\var{p}, or \\$5 for <span title="a > b, $x">two</span> and $\\var{m}$ each.</p>', 'It costs ${p}, or $5 for two and \\({m}\\) each.'],
      ['<p>Costs $5.</p><p>Or $6.</p>', 'Costs $5.\nOr $6.'],
      ['<p>Cost = $<br/>per stem, or \\$5 a bunch</p>', 'Cost = $\nper stem, or $5 a bunch'],
      // Numbas reads the rest as maths, where \var still shows its value: the page reads "costs $12".
      ['<p>A stem costs $\\var{p} today.</p>', 'A stem costs ${p} today.'],
      // An empty display is nothing to show.
      ['<p>\\[\\]Then $m$.</p>', 'Then \\(m\\).']
    ]
    for (const [html, want] of table) expect(read(html).statement, html).toBe(want)
    // No LaTeX group became a variable anywhere above.
    for (const [html] of table) expect(names(read(html)), html).toEqual(['m', 'n', 'p'])

    // A value worked out in the text still gets its own variable, $…$ or not.
    const shown = read('<p>The total is $\\var{2m}$.</p>')
    expect(shown.statement).toBe('The total is \\({shown1}\\).')
    expect(shown.variables[3]).toEqual({ name: 'shown1', def: { kind: 'expr', expr: '2 * m' }, description: 'Shown in the text: 2m' })
  })

  it('sends a dollar sign in the words out as \\$, so it comes back a dollar sign and not maths', () => {
    const q: PQQuestion = { ...SET.questions[0], statement: 'A ticket costs $5, or $8 with \\(v = u + at\\) on it.' }
    const text = toExam({ ...SET, questions: [q] })
    expect(JSON.parse(text.slice(text.indexOf('\n') + 1)).question_groups[0].questions[0].statement).toBe(
      '<p>A ticket costs \\$5, or \\$8 with \\(v = u + at\\) on it.</p>'
    )
    expect(fromExam(text).file.questions[0].statement).toBe(q.statement)
  })

  it('skips a question whose $…$ PhysLab cannot show, or whose maths never closes, with one sentence', () => {
    const cases: [string, string][] = [
      ['<p>$\\simplify{{m}x+{n}}$</p>', 'uses \\simplify, which PhysLab cannot show'],
      // SUVAT equations question 6 (numbas question 13916) asks for its answer as a fraction.
      ['<p>$v = \\var[fractionNumbers]{m/n}$</p>', 'shows a value with \\var[fractionNumbers], which PhysLab cannot show'],
      ['<p>So v = \\var[fractionNumbers]{m/n}.</p>', 'shows a value with \\var[fractionNumbers], which PhysLab cannot show'],
      ['<p>So \\(f(x) = \\var{m}x</p>', 'opens maths with \\( but never closes it in the same paragraph'],
      // Capacity questions (numbas question 77746): Numbas itself showed this line as raw LaTeX.
      ['<p>One slot duration: $1500\\cdot T_b=1500\\cdot 10^{-6}</p>', 'opens maths with $ but never closes it in the same paragraph'],
      // Kept as words it would start a line PhysLab reads as display maths.
      ['<p>$$5 each</p>', 'opens maths with $$ but never closes it in the same paragraph'],
      ['<p>\\[x = 1</p><p>y = 2\\]</p>', 'opens maths with \\[ but never closes it in the same paragraph'],
      ['<p>\\begin{align}x &amp;= 1</p>', 'opens maths with \\begin{align} but never closes it in the same paragraph']
    ]
    for (const [statement, why] of cases) {
      const { file, report } = fromExam(exam([question({ variables: { m: v('m', 'random(2..5)'), n: v('n', 'random(2..5)') }, statement, parts: [ASK_M] })]))
      expect(file.questions, statement).toEqual([])
      expect(report, statement).toEqual([`Question 'Braking train' was skipped: it ${why}.`])
    }
  })
})

// ---------------------------------------------------------------------------
// Writing an .exam, and the trip there and back
// ---------------------------------------------------------------------------

describe('mathToJme', () => {
  it('undoes the import translation and leaves the rest as mathjs prints it', () => {
    const table: [string, string][] = [
      ['round(x, 2)', 'precround(x, 2)'],
      ['fix(x)', 'trunc(x)'],
      ['log(2, x)', 'log(x, 2)'],
      ['log(x)', 'log(x)'],
      ['ln(x)', 'ln(x)'],
      ['number(format(x, 3))', 'siground(x, 3)'],
      ['sin(x * 180 / pi)', 'sin(x)'],
      ['cos((a * b) * 180 / pi)', 'cos(a * b)'],
      ['sin(x rad)', 'sin(x)'],
      ['cos((a * b) rad)', 'cos(a * b)'],
      ['asin(x) * pi / 180', 'arcsin(x)'],
      ['t * pi / 180', 'radians(t)'],
      ['t * 180 / pi', 'degrees(t)'],
      // PhysLab's own sin(th) is in degrees; Numbas must be told, or it marks the answer wrong.
      ['10 * sin(th)', '10 * sin(radians(th))'],
      ['sin(a * b)', 'sin(radians(a * b))'],
      ['asin(a / 2)', 'degrees(arcsin(a / 2))'],
      ['sin(x°)', 'sin(radians(x))'],
      ['x°', 'radians(x)'],
      ['2 × 3', '2 * 3'],
      ['(a + b) × c', '(a + b) * c'],
      ['x == 0 ? 1 : 2', 'if(x = 0, 1, 2)'],
      ['a != b and not c', 'a <> b and not c'],
      ['u - a * t', 'u - a * t'],
      ['(a + b) * c', '(a + b) * c'],
      ['2x', '2 * x'],
      ['u² + √a', 'u ^ 2 + sqrt(a)'],
      ['exp(x)', 'exp(x)']
    ]
    for (const [expr, jme] of table) expect(mathToJme(expr), expr).toBe(jme)
    // An expression part is typed in the convention it is checked in, so its trig keeps its name.
    expect(mathToJme('sin(x) + asin(y)', 'same')).toBe('sin(x) + arcsin(y)')
    // And back again: what a PhysLab author wrote is what comes home, trig in degrees included.
    const home = ['u - a * t', 'sin(x * 180 / pi)', 'sin((a * b) * 180 / pi)', 'asin(x) * pi / 180', '10 * sin(th)', 'asin(a / 2)']
    for (const expr of [...home, 'round(x, 2)', 'log(2, x)', 'x == 0 ? 1 : 2', 'number(format(x, 3))']) {
      expect(jmeToMath(mathToJme(expr)), expr).toBe(expr)
    }
    expect(jmeToMath(mathToJme('sin(x) + asin(y)', 'same'), 'same')).toBe('sin(x) + asin(y)')
  })
})

/** The braking-train question as a PhysLab author would save it. */
const SET: PQFile = {
  app: 'PhysLab',
  format: 'pqjson',
  version: 1,
  questions: [
    {
      id: 'train-1',
      title: 'Braking train',
      statement: 'A train moving at {u} slows at {a} for {t}.\nIts speed is \\(v = u - at\\), so\n$$v = {u} - {a} \\times {t}$$',
      variables: [
        { name: 'u', def: { kind: 'range', from: 20, to: 40, step: 5 }, unit: 'm/s', description: 'initial speed' },
        { name: 'a', def: { kind: 'range', from: 0.5, to: 2, step: 0.5 }, unit: 'm/s²' },
        { name: 't', def: { kind: 'range', from: -8, to: 8, step: 1, exclude: [0] }, unit: 's' },
        { name: 'pick', def: { kind: 'list', items: [2, 3, 5] } },
        { name: 'th', def: { kind: 'list', items: [30] }, unit: '°' },
        { name: 'h', def: { kind: 'expr', expr: '10 * sin(th)' }, unit: 'm' },
        { name: 'vend', def: { kind: 'expr', expr: 'u - a * t' }, unit: 'm/s' },
        { name: 'theta', def: { kind: 'expr', expr: 'asin(a / 2) * pi / 180' } }
      ],
      parts: [
        {
          type: 'number',
          prompt: 'What is its speed after {t}?',
          answer: 'vend',
          unit: 'm/s',
          tolerance: { kind: 'relative', value: 0.02 },
          kind: 'number',
          traps: [{ value: 'u + a * t', why: 'The train is slowing, so the acceleration is negative.' }],
          marks: 2
        },
        {
          type: 'number',
          prompt: 'How far does it go?',
          answer: 'u * t - a * t ^ 2 / 2',
          unit: 'm',
          tolerance: { kind: 'absolute', value: 0.5 },
          marks: 1
        },
        { type: 'expression', prompt: 'Speed as a function of time s.', answer: 'u - a * s', symbols: ['s'], sampleRange: [0, 5], marks: 1 },
        {
          type: 'choice',
          prompt: 'Speeding up or slowing down?',
          choices: [
            { text: 'Speeding up', correct: false, why: 'The acceleration is against the motion.' },
            { text: 'Slowing down', correct: true }
          ],
          shuffle: true,
          marks: 1
        },
        {
          type: 'choice',
          prompt: 'Which are true? (pick all)',
          choices: [
            { text: 'v falls', correct: true },
            { text: 'v rises', correct: false },
            { text: 'a is constant', correct: true }
          ],
          shuffle: false,
          marks: 2
        }
      ],
      steps: {
        level: 'half',
        items: [
          { head: 'Write down v = u + at with the deceleration negative.', tex: 'v = {u} - {a} \\times {t}', blank: true },
          { head: 'So the final speed is {vend}.', blank: false }
        ]
      },
      picture: { kind: 'curve', expr: 'u - a * x', xMin: '0', xMax: 't' },
      motion: { segments: [{ kind: 'accelerate', duration: 't', a: '-a' }], v0: 'u', plots: ['v-t'] },
      license: { id: 'CC BY 4.0', holder: 'PhysLab' },
      tags: ['kinematics']
    }
  ]
}

describe('toExam', () => {
  it('writes the version line and an exam a Numbas reader recognises', () => {
    const text = toExam(SET)
    expect(text.startsWith('// Numbas version: finer_feedback_settings\n')).toBe(true)
    const exam = JSON.parse(text.slice(text.indexOf('\n') + 1))
    expect(exam.metadata.licence).toBe('Creative Commons Attribution 4.0 International')
    const q = exam.question_groups[0].questions[0]
    expect(q.name).toBe('Braking train')
    expect(q.statement).toBe('<p>A train moving at {u} slows at {a} for {t}.</p><p>Its speed is \\(v = u - at\\), so</p><p>\\[v = \\var{u} - \\var{a} \\times \\var{t}\\]</p>')
    expect(q.variables.u).toMatchObject({ name: 'u', definition: 'random(20..40#5)', description: 'initial speed' })
    expect(q.variables.a.definition).toBe('random(0.5..2#0.5)')
    expect(q.variables.t.definition).toBe('random(-8..8 except [0])')
    expect(q.variables.pick.definition).toBe('random([2, 3, 5])')
    expect(q.variables.th.definition).toBe('random([30])')
    expect(q.variables.h.definition).toBe('10 * sin(radians(th))')
    expect(q.variables.vend.definition).toBe('u - a * t')
    expect(q.variables.theta.definition).toBe('arcsin(a / 2)')
    expect(q.ungrouped_variables).toEqual(['u', 'a', 't', 'pick', 'th', 'h', 'vend', 'theta'])
    expect(q.metadata.licence).toBe('Creative Commons Attribution 4.0 International')
    expect(q.contributors).toEqual([{ name: 'PhysLab', profile_url: '' }])
    expect(q.tags).toEqual(['kinematics'])
    expect(q.rulesets).toEqual({})
    expect(q.functions).toEqual({})
    expect(q.extensions).toEqual([])
    expect(q.advice).toBe('<p>Write down v = u + at with the deceleration negative.</p><p>\\[v = \\var{u} - \\var{a} \\times \\var{t}\\]</p><p>So the final speed is {vend}.</p>')

    const [n1, n2, e, c1, c2] = q.parts
    expect(n1).toMatchObject({ type: 'numberentry', marks: 2, minValue: '(vend) - abs(vend) * (0.02)', maxValue: '(vend) + abs(vend) * (0.02)', precisionType: 'none' })
    expect(n1.prompt).toBe('<p>What is its speed after {t}?</p><p>Give your answer in m/s.</p>')
    expect(n2).toMatchObject({ minValue: '(u * t - a * t ^ 2 / 2) - 0.5', maxValue: '(u * t - a * t ^ 2 / 2) + 0.5' })
    expect(e).toMatchObject({ type: 'jme', answer: 'u - a * s', vsetRange: [0, 5], checkingType: 'absdiff', marks: 1 })
    expect(c1).toMatchObject({ type: '1_n_2', shuffleChoices: true, choices: ['<p>Speeding up</p>', '<p>Slowing down</p>'], matrix: [[0], [1]], marks: 1, maxMarks: 1 })
    expect(c1.distractors).toEqual(['<p>The acceleration is against the motion.</p>', ''])
    expect(c2).toMatchObject({ type: 'm_n_2', matrix: [[1], [0], [1]], marks: 2, maxMarks: 2 })

    // Nothing Numbas cannot read is invented into a part: it is said in the description.
    expect(q.metadata.description).toBe(
      'PhysLab draws the curve y = u - a * x from 0 to t. PhysLab animates a motion (accelerate at -a for t) and plots v-t. ' +
        'PhysLab knows a wrong answer for part 1: u + a * t — The train is slowing, so the acceleration is negative.'
    )
  })

  it('keeps the licence string it found, and says what a rule-made choice part was', () => {
    const q: PQQuestion = {
      ...SET.questions[0],
      parts: [{ type: 'choice', prompt: 'Pick', choices: [], distractors: { correct: 'vend', unit: 'm/s', rules: ['sign', 'g-10'] }, shuffle: true, marks: 1 }],
      license: { id: 'CC BY-SA 4.0', holder: 'Ada Lovelace', found: 'Creative Commons Attribution-ShareAlike 4.0 International' },
      imported: { format: 'numbas', contributors: ['Ada Lovelace', 'Alan Turing'] }
    }
    const text = toExam({ ...SET, questions: [q] })
    const exam = JSON.parse(text.slice(text.indexOf('\n') + 1))
    const out = exam.question_groups[0].questions[0]
    expect(out.parts).toEqual([])
    expect(out.metadata.licence).toBe('Creative Commons Attribution-ShareAlike 4.0 International')
    expect(out.contributors.map((c: { name: string }) => c.name)).toEqual(['Ada Lovelace', 'Alan Turing'])
    // A CC0 question that names nobody is not handed to Numbas with a contributor called ''.
    const nobody = toExam({ ...SET, questions: [{ ...q, imported: undefined, license: { id: 'CC0 1.0', holder: '' } }] })
    expect(JSON.parse(nobody.slice(nobody.indexOf('\n') + 1)).question_groups[0].questions[0].contributors).toEqual([])
    expect(out.metadata.description).toContain('PhysLab makes the choices for part 1 from the right answer vend with the rules sign, g-10.')
  })

  it('orders a negative answer\'s relative bounds so a plain Numbas install can mark it', () => {
    // a*(1-t)/a*(1+t) flips for a negative a (e.g. -10 * 0.95 = -9.5 > -10 * 1.05 = -10.5), leaving
    // Numbas's between-check with no satisfying value; the bounds must stay ordered either way.
    const q: PQQuestion = {
      ...SET.questions[0],
      parts: [{ type: 'number', prompt: 'v?', answer: '-10', unit: 'm/s', tolerance: { kind: 'relative', value: 0.05 }, marks: 1 }]
    }
    const text = toExam({ ...SET, questions: [q] })
    const exam = JSON.parse(text.slice(text.indexOf('\n') + 1))
    const part = exam.question_groups[0].questions[0].parts[0]
    expect(part.minValue).toBe('(-10) - abs(-10) * (0.05)')
    expect(part.maxValue).toBe('(-10) + abs(-10) * (0.05)')
    expect(math.evaluate(part.minValue)).toBeLessThan(math.evaluate(part.maxValue))
    expect(math.evaluate(part.minValue)).toBeCloseTo(-10.5, 12)
    expect(math.evaluate(part.maxValue)).toBeCloseTo(-9.5, 12)
    // Reading the exam back recovers the same answer and tolerance.
    const back = fromExam(text).file.questions[0].parts[0]
    expect(back).toMatchObject({ answer: '-10', tolerance: { kind: 'relative', value: 0.05 } })
  })

  it('escapes HTML in text and maths, so a < in a prompt survives the trip', () => {
    const q: PQQuestion = {
      ...SET.questions[0],
      statement: 'Find x when \\(x < 3\\) & \\(y > 2\\).',
      parts: [{ type: 'number', prompt: 'x?', answer: 'u', unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
    }
    const text = toExam({ ...SET, questions: [q] })
    expect(text).toContain('\\\\(x &lt; 3\\\\) &amp; \\\\(y &gt; 2\\\\)')
    expect(fromExam(text).file.questions[0].statement).toBe('Find x when \\(x < 3\\) & \\(y > 2\\).')
  })

  it('round-trips a PhysLab set through .exam and back for the subset fields', () => {
    const { file, report } = fromExam(toExam(SET))
    expect(report).toEqual([])
    expect(file.questions).toHaveLength(1)
    const back = file.questions[0]
    const orig = SET.questions[0]
    expect(back.title).toBe(orig.title)
    expect(back.statement).toBe(orig.statement)
    expect(back.tags).toEqual(orig.tags)
    expect(back.license).toEqual({ id: 'CC BY 4.0', holder: 'PhysLab', found: 'Creative Commons Attribution 4.0 International' })
    expect(back.imported).toEqual({ format: 'numbas', contributors: ['PhysLab'] })
    // Variables: name and definition survive; a unit has no home in Numbas.
    expect(back.variables.map((v) => ({ name: v.name, def: v.def }))).toEqual(orig.variables.map((v) => ({ name: v.name, def: v.def })))
    expect(back.variables[0].description).toBe('initial speed')
    // Parts: type, prompt, answer, unit, tolerance, symbols, choices, marks.
    expect(back.parts).toHaveLength(orig.parts.length)
    orig.parts.forEach((p, i) => {
      const b = back.parts[i]
      expect(b.type, `part ${i + 1}`).toBe(p.type)
      expect(b.prompt, `part ${i + 1}`).toBe(p.prompt)
      expect(b.marks, `part ${i + 1}`).toBe(p.marks)
      if (p.type === 'number' && b.type === 'number') {
        expect(b.answer).toBe(p.answer)
        expect(b.unit).toBe(p.unit)
        expect(b.tolerance).toEqual(p.tolerance)
      }
      if (p.type === 'expression' && b.type === 'expression') {
        expect(b.answer).toBe(p.answer)
        expect(b.symbols).toEqual(p.symbols)
        expect(b.sampleRange).toEqual(p.sampleRange)
      }
      if (p.type === 'choice' && b.type === 'choice') {
        expect(b.choices).toEqual(p.choices)
        expect(b.shuffle).toBe(p.shuffle)
      }
    })
    // Steps: head and tex; the fading marks are PhysLab's own and come back as 'worked'.
    expect(back.steps?.items.map((s) => ({ head: s.head, tex: s.tex }))).toEqual(orig.steps!.items.map((s) => ({ head: s.head, tex: s.tex })))
    expect(back.steps?.level).toBe('worked')
    // And the file it makes is one the loader takes, with numbers that draw.
    const loaded = parsePQFile(serializePQFile(file))
    const variant = drawVariables(loaded.questions[0], 5)
    expect(variant.problems).toEqual([])
    expect(variant.values.vend).toBe(variant.values.u - variant.values.a * variant.values.t)
    expect(variant.values.theta).toBeCloseTo(Math.asin(variant.values.a / 2), 12)
    // A one-value list comes home as itself, and the author's degree-convention sin still gives 5.
    expect(variant.values.th).toBe(30)
    expect(variant.values.h).toBeCloseTo(5, 12)
  })
})

describe('ranges whose ends are other variables', () => {
  it('import as randomRange, which variables.ts draws, and go back out as JME\'s own range', () => {
    expect(jmeToVariableDef('random(a..b)')).toEqual({ kind: 'expr', expr: 'randomRange(a, b)' })
    expect(jmeToVariableDef('random(v1 + 1..v1 + 5#2)')).toEqual({ kind: 'expr', expr: 'randomRange(v1 + 1, v1 + 5, 2)' })
    expect(mathToJme('randomRange(a, b)')).toBe('random(a..b)')
    expect(mathToJme('randomRange(v1 + 1, v1 + 5, 2)')).toBe('random((v1 + 1)..(v1 + 5)#2)')
    expect(jmeToVariableDef(mathToJme('randomRange(v1 + 1, v1 + 5, 2)'))).toEqual({ kind: 'expr', expr: 'randomRange(v1 + 1, v1 + 5, 2)' })
  })

  it('bring a question in whose second speed must beat the first, with numbers that draw', () => {
    const text = exam([
      question({
        statement: '<p>A car at {v1} m/s is overtaken by one at {v2} m/s.</p>',
        variables: { v1: v('v1', 'random(10..20)'), v2: v('v2', 'random(v1 + 1..v1 + 5)') },
        ungrouped_variables: ['v1', 'v2'],
        parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How much faster, in m/s?</p>', minValue: 'v2 - v1', maxValue: 'v2 - v1' }]
      })
    ])
    const { file, report } = fromExam(text)
    expect(report).toEqual([])
    const q = parsePQFile(serializePQFile(file)).questions[0]
    for (let seed = 1; seed <= 20; seed++) {
      const { values, problems } = drawVariables(q, seed)
      expect(problems, `seed ${seed}`).toEqual([])
      expect(values.v2 - values.v1, `seed ${seed}`).toBeGreaterThanOrEqual(1)
      expect(values.v2 - values.v1, `seed ${seed}`).toBeLessThanOrEqual(5)
    }
  })
})

describe('a command\'s argument in LaTeX', () => {
  it('is LaTeX, not a chip, so the bundled braking train goes to .exam and comes back whole', () => {
    const bundled = loadBundled()
    const train = bundled.questions.find((x) => x.id === 'physlab-sample-braking-train')!
    const text = toExam({ ...bundled, questions: [train] })
    // The file is JSON, so each backslash of \mathrm\var is written twice.
    expect(text).not.toContain('\\\\mathrm\\\\var')
    expect(text).toContain('\\\\mathrm{avg}')
    const { file, report } = fromExam(text)
    expect(report).toEqual([])
    const back = file.questions[0]
    // A display line comes back trimmed inside its $$; nothing else about it changes.
    const trimmed = (s: string): string => s.replace(/\$\$([\s\S]*?)\$\$/g, (_m, tex: string) => `$$${tex.trim()}$$`)
    expect(back.statement).toBe(trimmed(train.statement))
    expect(back.steps?.items.map((s) => s.tex)).toEqual(train.steps!.items.map((s) => s.tex))
    const variant = drawVariables(parsePQFile(serializePQFile(file)).questions[0], 4)
    expect(variant.problems).toEqual([])
  })

  it('stays LaTeX in PhysLab too, even when a variable has that name', () => {
    const tex = substituteTex('v_{\\mathrm{v}} = {v}', { v: 12 }, { v: 'm/s' }, { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' })
    expect(tex).toBe('v_{\\mathrm{v}} = 12\\,\\mathrm{m/s}')
  })
})

// ---------------------------------------------------------------------------
// The · key on its way to Numbas (N16)
// ---------------------------------------------------------------------------

const MEASURE: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

/** What a drawn variable sees, preprocess first so a typed · is read: the calculator in degrees, as questions/variables.ts evaluates. */
const evalTyped = (expr: string, scope: Record<string, number> = {}): number => evalDeg(preprocess(expr), scope)

/** The verdict Practice gives a typed answer to one part of a question: the same draw, the same marking. */
function verdictFor(q: PQQuestion, part: number, typed: string, seed = 1): string {
  const played = playQuestion(q, seed, MEASURE)
  return checkPlayedPart(played.parts[part], typed, played, MEASURE).verdict
}

/** The parts of an exported file's first question, as a Numbas reader gets them. */
const exportedParts = (text: string): Record<string, unknown>[] => JSON.parse(text.slice(text.indexOf('\n') + 1)).question_groups[0].questions[0].parts

/** One PhysLab question as a file, ready for toExam. */
const fileOf = (q: PQQuestion): PQFile => ({ app: 'PhysLab', format: 'pqjson', version: 2, questions: [q] })

/** What Practice plays after a question has gone out to .exam and come back: written, read, saved and loaded. */
const throughExam = (q: PQQuestion): PQQuestion => parsePQFile(serializePQFile(fromExam(toExam(fileOf(q))).file)).questions[0]

describe('the · key on its way to Numbas', () => {
  // JME has no dot() for a number beside anything: its reference lists "dot(x, y) … vector, vector →
  // number", "matrix, vector", "vector, matrix" and "matrix, matrix", and its "x * y" takes "number,
  // vector → vector" and "vector, number → vector" but not two vectors. PhysLab's · is a product that
  // multiplies numbers and scales a vector (math/expr.ts dot); only two vectors make a dot product.
  // Every name in a question is a number (variables.ts draws each one with Number(…)), so a · that
  // reaches a Numbas file has to be written *.
  const doubling = (answer: string): PQQuestion => ({
    id: 'twice-a',
    title: 'Twice A',
    statement: 'A is {A}.',
    variables: [{ name: 'A', def: { kind: 'list', items: [7] } }],
    parts: [{ type: 'number', prompt: 'What is 2A?', answer, unit: 'none', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })
  it('a question whose answer is 2·A is written with a product Numbas can run, and comes back marking the same answers', () => {
    const out = toExam(fileOf(doubling('2·A')))
    const [part] = exportedParts(out)
    expect(part.minValue).toBe('(2 * A) - abs(2 * A) * (0.02)')
    expect(part.maxValue).toBe('(2 * A) + abs(2 * A) * (0.02)')
    // PhysLab reads its own file again: the question is not skipped for a function it does not know.
    const { file, report } = fromExam(out)
    expect(report).toEqual([])
    const back = parsePQFile(serializePQFile(file)).questions[0]
    expect(back.parts[0]).toMatchObject({ answer: '2 * A', tolerance: { kind: 'relative', value: 0.02 } })
    // A is 7: 14 is right; the unscaled 7 and a number outside the 2 % band are not.
    expect(verdictFor(back, 0, '14')).toBe('right')
    expect(verdictFor(back, 0, '7')).toBe('wrong')
    expect(verdictFor(back, 0, '15')).toBe('wrong')
    // A second trip writes the same bounds.
    const [again] = exportedParts(toExam(file))
    expect([again.minValue, again.maxValue]).toEqual([part.minValue, part.maxValue])
  })

  it('writes every · between numbers as *, bracketed where the grouping needs it, and the JME works out what PhysLab does', () => {
    const table: [string, string][] = [
      ['2·A', '2 * A'],
      ['A·2', 'A * 2'],
      // ⋅ is the same key.
      ['2⋅A', '2 * A'],
      ['m·g·h', 'm * g * h'],
      // k is a spring constant in a question, never the unit vector k.
      ['k·x', 'k * x'],
      ['1/2·m·v^2', '1 / 2 * m * v ^ 2'],
      ['a - b·c', 'a - b * c'],
      ['(a + b)·c', '(a + b) * c'],
      ['a·(b + c)', 'a * (b + c)'],
      ['m·g·sin(th)', 'm * g * sin(radians(th))'],
      // A dot() typed as a call keeps its grouping inside a quotient or a power: x/dot(y, z) is x/(y·z).
      ['x/dot(y, z)', 'x / (y * z)'],
      ['dot(y, z)^2', '(y * z) ^ 2']
    ]
    const scope = { A: 3, a: 2, b: 5, c: 7, m: 2, g: 9.8, h: 3, v: 4, k: 50, x: 0.2, y: 2, z: 5, th: 30 }
    for (const [typed, jme] of table) {
      expect(mathToJme(typed), typed).toBe(jme)
      // What Numbas works out from that text, read back through the importer, is the number PhysLab gave.
      expect(evalDeg(jmeToMath(jme), scope), typed).toBeCloseTo(evalTyped(typed, scope), 12)
    }
  })

  it('keeps JME’s own dot() for two vectors, the one case it has a signature for, and * for a number beside a vector', () => {
    expect(mathToJme('vec(1, 2)·vec(3, 4)')).toMatch(/^dot\(/)
    expect(mathToJme('[1, 2]·[3, 4]')).toMatch(/^dot\(/)
    expect(mathToJme('2·vec(3, 4)')).toMatch(/^2 \* /)
    expect(mathToJme('vec(3, 4)·2')).toMatch(/ \* 2$/)
  })
})

// ---------------------------------------------------------------------------
// A Numbas number box whose bounds are equal (A08-3)
// ---------------------------------------------------------------------------

describe('a Numbas number box with equal bounds and no precision', () => {
  // Numbas marks a number right when it lies between minValue and maxValue, so equal bounds mean
  // that one number. PhysLab used to loosen it to its own 2 %, which marked 101 right for an exact
  // 100; the matrix part has read the same JSON as exact since e3132c0.
  const boxQuestion = (min: string, max: string): PQQuestion =>
    parsePQFile(
      serializePQFile(
        fromExam(exam([question({ parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How many?</p>', minValue: min, maxValue: max, precisionType: 'none' }] })])).file
      )
    ).questions[0]

  it('marks 100 right and 101 and 99 wrong', () => {
    const q = boxQuestion('100', '100')
    expect(q.parts[0]).toMatchObject({ type: 'number', answer: '100', tolerance: { kind: 'absolute', value: 0 } })
    expect(verdictFor(q, 0, '100')).toBe('right')
    expect(verdictFor(q, 0, '101')).toBe('wrong')
    expect(verdictFor(q, 0, '99')).toBe('wrong')
  })

  it('takes 1/3 typed as 1/3 or as the revealed answer, and not a rounded 0.33', () => {
    const q = boxQuestion('1/3', '1/3')
    const played = playQuestion(q, 1, MEASURE)
    expect(verdictFor(q, 0, '1/3')).toBe('right')
    // The answer under the box, typed back, is marked right with nothing at all to forgive it.
    const revealed = played.parts[0].answerText ?? ''
    expect(revealed).not.toBe('')
    expect(checkPlayedPart(played.parts[0], revealed, played, MEASURE).verdict).toBe('right')
    expect(verdictFor(q, 0, '0.33')).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// An expression part keeps its own angle factors on the way out (A08-2)
// ---------------------------------------------------------------------------

describe('an expression part on its way to Numbas keeps its own angle factors', () => {
  // An expression part is marked in radians and its trig keeps its names (trig 'same'), so jmeToMath
  // never writes a `* 180 / pi` or `* pi / 180` there: the ones mathToJme meets are the author's own.
  // Taking them off (sin(x * 180 / pi) → sin(x), asin(x) * pi / 180 → arcsin(x)) wrote a different
  // function, both in the file and in the question PhysLab read back from it.
  const asExpression = (answer: string, sampleRange: [number, number]): PQQuestion => ({
    id: 'angle-factors',
    title: 'Angle factors',
    statement: 'Write the function of x.',
    variables: [],
    parts: [{ type: 'expression', prompt: 'The function of x.', answer, symbols: ['x'], sampleRange, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })

  it('writes sin(x * 180 / pi) and asin(x) * pi / 180 with their factors and reads them back unchanged', () => {
    expect(mathToJme('sin(x * 180 / pi)', 'same')).toBe('sin(degrees(x))')
    expect(mathToJme('asin(x) * pi / 180', 'same')).toBe('radians(arcsin(x))')
    for (const expr of ['sin(x * 180 / pi)', 'asin(x) * pi / 180']) {
      expect(jmeToMath(mathToJme(expr, 'same'), 'same'), expr).toBe(expr)
    }
    // A number part is the other convention (degrees, converted at the border) and still strips them.
    expect(mathToJme('sin(x * 180 / pi)')).toBe('sin(x)')
    expect(mathToJme('asin(x) * pi / 180')).toBe('arcsin(x)')
  })

  it('marks the same functions after the trip: sin(x * 180 / pi) is right and sin(x) is not', () => {
    const sine = throughExam(asExpression('sin(x * 180 / pi)', [1, 2]))
    expect(verdictFor(sine, 0, 'sin(x * 180 / pi)')).toBe('right')
    expect(verdictFor(sine, 0, 'sin(x)')).toBe('wrong')
    const arc = throughExam(asExpression('asin(x) * pi / 180', [0, 0.9]))
    expect(verdictFor(arc, 0, 'asin(x) * pi / 180')).toBe('right')
    expect(verdictFor(arc, 0, 'asin(x)')).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// random() of a list with except (H1)
// ---------------------------------------------------------------------------

describe('random() of a list with except', () => {
  // The JME reference: "list, anything → list - exclude the given element", "list, list → list".
  // The importer read the list and dropped the except, so a value the author took out was still drawn.
  const withVariable = (definition: string): string =>
    exam([question({ variables: { a: v('a', definition) }, ungrouped_variables: ['a'], parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' }] })])

  it('leaves the excluded values out of the list', () => {
    expect(jmeToVariableDef('random([1, 2, 3] except 2)')).toEqual({ kind: 'list', items: [1, 3] })
    expect(jmeToVariableDef('random([1, 2, 3, 4] except [2, 3])')).toEqual({ kind: 'list', items: [1, 4] })
    // A number the list does not hold takes nothing out.
    expect(jmeToVariableDef('random([1, 2, 3] except 7)')).toEqual({ kind: 'list', items: [1, 2, 3] })
  })

  it('never draws an excluded value, whatever the seed', () => {
    const q = parsePQFile(serializePQFile(fromExam(withVariable('random([1, 2, 3] except 2)')).file)).questions[0]
    const seen = new Set<number>()
    for (let seed = 1; seed <= 60; seed++) seen.add(drawVariables(q, seed).values.a)
    expect([...seen].sort()).toEqual([1, 3])
  })

  it('refuses a list with nothing left in one sentence', () => {
    let caught: unknown
    try {
      jmeToVariableDef('random([1, 2] except [1, 2])')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(JmeRefusal)
    expect((caught as JmeRefusal).what).toBe('a random choice with every value taken out by except')
    const { file, report } = fromExam(withVariable('random([1, 2] except [1, 2])'))
    expect(file.questions).toEqual([])
    expect(report).toHaveLength(1)
    expect(report[0]).toContain('a random choice with every value taken out by except')
  })
})

// ---------------------------------------------------------------------------
// JME function names are not case-sensitive (H5)
// ---------------------------------------------------------------------------

describe('JME function names in any case', () => {
  // Numbas folds a name to lower case when it looks it up (jme.normaliseName, unless the scope is
  // case-sensitive), so Random(1..5) and Sin(x) run there; the importer refused them as unknown
  // functions. Only a call is folded: a variable keeps the case it was written in.
  it('reads Random(1..5) as random(1..5) and Sin(x) as sin(x)', () => {
    expect(jmeToVariableDef('Random(1..5)')).toEqual({ kind: 'range', from: 1, to: 5, step: 1 })
    expect(jmeToVariableDef('RANDOM(2, 3, 5)')).toEqual({ kind: 'list', items: [2, 3, 5] })
    expect(jmeToMath('Sin(x)')).toBe(jmeToMath('sin(x)'))
    expect(jmeToMath('Sin(x)')).toBe('sin(x * 180 / pi)')
    expect(jmeToMath('SQRT(x) + Abs(y) + If(a > b, 1, 2)', 'same')).toBe('sqrt(x) + abs(y) + (a > b ? 1 : 2)')
  })

  it('leaves a variable name as it was written', () => {
    expect(jmeToMath('X + x * Y')).toBe('X + x * Y')
  })

  it('brings in a question written with Random(…) and Abs(…), draws it and marks it', () => {
    const text = exam([
      question({
        variables: { a: v('a', 'Random(1..5)') },
        ungrouped_variables: ['a'],
        parts: [{ type: 'numberentry', marks: 1, prompt: '<p>One more than a?</p>', minValue: 'Abs(a) + 1', maxValue: 'Abs(a) + 1', precisionType: 'none' }]
      })
    ])
    const { file, report } = fromExam(text)
    expect(report).toEqual([])
    const q = parsePQFile(serializePQFile(file)).questions[0]
    expect(q.variables[0].def).toEqual({ kind: 'range', from: 1, to: 5, step: 1 })
    const a = drawVariables(q, 3).values.a
    expect(verdictFor(q, 0, String(a + 1), 3)).toBe('right')
    expect(verdictFor(q, 0, String(a), 3)).toBe('wrong')
  })
})

// ---------------------------------------------------------------------------
// An escaped brace in plain words (H3)
// ---------------------------------------------------------------------------

describe('an escaped brace in the words of a question', () => {
  // Numbas's util.splitbrackets skips the character after a backslash, so \{ and \} outside maths
  // are not the ends of a value: they are braces. The importer read \{1, 2, 3\} as a value to work
  // out ("the symbol ,") and skipped the question.
  const asked = (statement: string): Raw =>
    question({
      statement,
      variables: { a: v('a', 'random(1..5)') },
      ungrouped_variables: ['a'],
      parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a' }]
    })

  it('imports "the set \\{1, 2, 3\\}" as words and shows the braces', () => {
    const { file, report } = fromExam(exam([asked('<p>Write down the set \\{1, 2, 3\\} on the board.</p>')]))
    expect(report).toEqual([])
    expect(file.questions[0].statement).toBe('Write down the set {1, 2, 3} on the board.')
  })

  it('keeps \\{a\\} as the letter in braces while {a} still shows the value', () => {
    const { file, report } = fromExam(exam([asked('<p>The set \\{a\\} has {a} in it.</p>')]))
    expect(report).toEqual([])
    const q = parsePQFile(serializePQFile(file)).questions[0]
    const shown = substitute(q.statement, { a: 3 }, { a: undefined }, MEASURE)
    // The space inside the braces keeps the player from filling the letter in, as in maths.
    expect(shown).toBe('The set { a} has 3 in it.')
  })

  it('reads two backslashes before a brace as a backslash and then a value, as Numbas does', () => {
    const { file, report } = fromExam(exam([asked('<p>Take {a} and {a * 2} then \\\\{a}.</p>')]))
    expect(report).toEqual([])
    expect(file.questions[0].statement).toBe('Take {a} and {shown1} then \\\\{a}.')
  })
})

// ---------------------------------------------------------------------------
// A dollar sign with only a comment after it (H6)
// ---------------------------------------------------------------------------

describe('a lone dollar sign followed by a comment', () => {
  // A `$` nothing closes is a dollar sign unless LaTeX follows it in its paragraph (then its author
  // never closed some maths, and the question is skipped). A comment or a line break between is only
  // the editor's layout: the words inside a comment are not on the page, so a backslash in one is no LaTeX.
  const costing = (statement: string): string =>
    exam([question({ statement, parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How much?</p>', minValue: '5', maxValue: '5', precisionType: 'dp', precision: 0 }] })])

  it('keeps the dollar as a dollar when the comment after it holds a backslash', () => {
    const { file, report } = fromExam(costing('<p>It costs $ <!-- \\LaTeX --> 5.</p>'))
    expect(report).toEqual([])
    expect(file.questions[0].statement).toBe('It costs $ 5.')
  })

  it('does the same across a comment with braces in it and a line break', () => {
    const { file, report } = fromExam(costing('<p>It costs $<!-- \\frac{1}{2} --><br>5.</p>'))
    expect(report).toEqual([])
    expect(file.questions[0].statement).toBe('It costs $\n5.')
  })

  it('still skips a dollar that LaTeX follows in its paragraph, past a comment', () => {
    const { file, report } = fromExam(costing('<p>It costs $ <!-- a note --> \\frac{1}{2}.</p>'))
    expect(file.questions).toEqual([])
    expect(report).toEqual(["Question 'Braking train' was skipped: it opens maths with $ but never closes it in the same paragraph."])
  })
})

// ---------------------------------------------------------------------------
// A vector or a set of roots keeps its unit through .exam (H2)
// ---------------------------------------------------------------------------

describe('a vector or roots part with a unit, out to .exam and back', () => {
  // toExam writes "Give your answer in m." once, as the last line of the gap-fill's prompt, and the
  // boxes have no prompt of their own. The importer put that line into the first box's words and
  // gave every box the unit 'none', so the unit was lost and a sentence was left in the first prompt.
  const gapped = (part: PQPart): PQQuestion => ({
    id: 'gapped',
    title: 'Gapped',
    statement: 'Answer in the boxes.',
    variables: [],
    parts: [part],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  })
  const units = (q: PQQuestion): string[] => q.parts.map((p) => (p.type === 'number' ? p.unit : p.type))

  it('brings a vector in metres back as three boxes in metres with no unit line in the words', () => {
    const back = throughExam(gapped({ type: 'vector', prompt: 'The push', answer: ['1', '2', '3'], unit: 'm', tolerance: { kind: 'absolute', value: 0.1 }, marks: 3 }))
    expect(units(back)).toEqual(['m', 'm', 'm'])
    expect(back.parts.map((p) => p.prompt).join('\n')).not.toContain('Give your answer in')
    expect(back.parts[0].prompt).toBe('The push\n___ i + ___ j + ___ k')
    // The unit is in the marking too: a student who types it is right.
    expect(verdictFor(back, 0, '1 m')).toBe('right')
    expect(verdictFor(back, 2, '3 m')).toBe('right')
  })

  it('brings a set of roots in seconds back the same way', () => {
    const back = throughExam(gapped({ type: 'roots', prompt: 'Find the roots', answer: ['2', '3'], unit: 's', tolerance: { kind: 'absolute', value: 0.01 }, marks: 2 }))
    expect(units(back)).toEqual(['s', 's'])
    expect(back.parts.map((p) => p.prompt).join('\n')).not.toContain('Give your answer in')
    expect(back.parts[0].prompt).toBe('Find the roots\n___, ___')
    expect(verdictFor(back, 0, '2 s')).toBe('right')
    expect(verdictFor(back, 1, '3 s')).toBe('right')
  })

  it('leaves the boxes of a vector with no unit without one', () => {
    const none = throughExam(gapped({ type: 'vector', prompt: 'Components', answer: ['1', '2'], unit: 'none', tolerance: { kind: 'absolute', value: 0.1 }, marks: 2 }))
    expect(units(none)).toEqual(['none', 'none'])
    expect(none.parts[0].prompt).toBe('Components\n___ i + ___ j')
  })

  it('gives a box with no unit of its own the line\'s unit, and lets a box that names one keep it', () => {
    const text = exam([
      question({
        parts: [
          {
            type: 'gapfill',
            marks: 0,
            prompt: '<p>Speed [[0]] and time [[1]]</p><p>Give your answer in m.</p>',
            gaps: [
              { type: 'numberentry', marks: 1, prompt: '', minValue: '5', maxValue: '5', precisionType: 'dp', precision: 0 },
              { type: 'numberentry', marks: 1, prompt: '<p>How long, in s?</p>', minValue: '2', maxValue: '2', precisionType: 'dp', precision: 0 }
            ]
          }
        ]
      })
    ])
    const own = parsePQFile(serializePQFile(fromExam(text).file)).questions[0]
    expect(units(own)).toEqual(['m', 's'])
  })
})

// ---------------------------------------------------------------------------
// A step with two display equations (H7)
// ---------------------------------------------------------------------------

describe('the display maths of a Numbas step', () => {
  // readSteps made one PhysLab step of each Numbas step: all its words as the head, and only the
  // first display line as its maths. A second equation in the same step was dropped without a word.
  const withSteps = (prompt: string): PQQuestion => {
    const text = exam([
      question({
        variables: { a: v('a', 'random(1..5)') },
        ungrouped_variables: ['a'],
        parts: [{ type: 'numberentry', marks: 1, prompt: '<p>a?</p>', minValue: 'a', maxValue: 'a', steps: [{ type: 'information', prompt }] }]
      })
    ])
    const { file, report } = fromExam(text)
    expect(report).toEqual([])
    return file.questions[0]
  }
  const shown = (q: PQQuestion): [string, string | undefined][] => (q.steps?.items ?? []).map((s) => [s.head, s.tex])
  const renders = (tex: string): void => {
    expect(() => katex.renderToString(tex, { displayMode: true, throwOnError: true, strict: 'ignore' }), tex).not.toThrow()
  }

  it('keeps both equations of a step, in order, each with the words before it, and each renders', () => {
    const q = withSteps('<p>Use</p>$$x=1$$<p>and</p>$$y=2$$')
    expect(shown(q)).toEqual([
      ['Use', 'x=1'],
      ['and', 'y=2']
    ])
    for (const s of q.steps?.items ?? []) renders(s.tex ?? '')
  })

  it('keeps two equations that have no words between them, and words after the last one', () => {
    const q = withSteps('<p>$$x=1$$</p><p>$$y=2$$</p><p>Then add them.</p>')
    expect((q.steps?.items ?? []).map((s) => s.tex)).toEqual(['x=1', 'y=2', undefined])
    expect(q.steps?.items[2].head).toBe('Then add them.')
  })

  it('still reads a step of several paragraphs of words as one step with one head', () => {
    expect(shown(withSteps('<p>First.</p><p>Second.</p>'))).toEqual([['First. Second.', undefined]])
    expect(shown(withSteps('<p>First.</p><p>Second.</p>$$x=1$$'))).toEqual([['First. Second.', 'x=1']])
  })
})

// ---------------------------------------------------------------------------
// Display maths in a choice (H9)
// ---------------------------------------------------------------------------

describe('display maths in a choice part', () => {
  // A choice's text and its "why" are plain sentences: inline maths is spoken (texToPlain), but a
  // display line such as $$F=ma$$ went through the same step untouched and showed its dollar signs.
  const choicePart = (choices: string[], distractors: string[]): Raw => ({
    type: '1_n_2',
    marks: 1,
    maxMarks: 1,
    prompt: '<p>Which is Newton\'s second law?</p>',
    choices,
    matrix: choices.map((_c, k) => [k === 0 ? 1 : 0]),
    distractors,
    shuffleChoices: false
  })
  const imported = (part: Raw): { text: string; why?: string }[] => {
    const { file, report } = fromExam(exam([question({ parts: [part] })]))
    expect(report).toEqual([])
    const got = file.questions[0].parts[0]
    return got.type === 'choice' ? got.choices : []
  }

  it('speaks a choice that is display maths, so no dollar signs reach the student', () => {
    const [first, second] = imported(choicePart(['<p>$$F=ma$$</p>', '<p>$$E=mc^2$$</p>'], ['', '']))
    expect(first.text).toBe(texToPlain('F=ma'))
    expect(first.text).not.toContain('$')
    expect(second.text).toBe(texToPlain('E=mc^2'))
  })

  it('speaks display maths in the why of a wrong choice, between its words', () => {
    const [, second] = imported(choicePart(['<p>It is $$F=ma$$.</p>', '<p>It is not.</p>'], ['', '<p>Force is not $$a=F/m$$ upside down.</p>']))
    expect(second.why).toBe(`Force is not ${texToPlain('a=F/m')} upside down.`)
    expect(second.why).not.toContain('$')
  })

  it('still speaks inline maths in a choice as before', () => {
    const [first] = imported(choicePart(['<p>Use $v=u+at$ here.</p>', '<p>No.</p>'], ['', '']))
    expect(first.text).toBe(`Use ${texToPlain('v=u+at')} here.`)
  })
})

// ---------------------------------------------------------------------------
// HTML entities in the words of a question (H11)
// ---------------------------------------------------------------------------

describe('named HTML entities in the words of a question', () => {
  // The text reader knew 27 entity names; any other (&euro;, &uuml;, &phi;…) reached the student as
  // typed, so "M&uuml;ller" showed its ampersand. The cached bank uses 86 names, all of them HTML 4's.
  const worded = (statement: string): string => {
    const { file, report } = fromExam(exam([question({ statement, parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How much?</p>', minValue: '5', maxValue: '5', precisionType: 'dp', precision: 0 }] })]))
    expect(report).toEqual([])
    return file.questions[0].statement
  }

  it('reads the euro sign, an umlaut and a Greek letter', () => {
    expect(worded('<p>It costs &euro;1000, says M&uuml;ller, and &phi; is an angle.</p>')).toBe('It costs €1000, says Müller, and φ is an angle.')
  })

  it('reads the Latin-1 letters, Greek letters, quotes and maths symbols a question uses', () => {
    const table: [string, string][] = [
      ['&auml;', 'ä'], ['&ouml;', 'ö'], ['&Uuml;', 'Ü'], ['&szlig;', 'ß'], ['&oslash;', 'ø'], ['&aring;', 'å'], ['&aelig;', 'æ'],
      ['&egrave;', 'è'], ['&eacute;', 'é'], ['&agrave;', 'à'], ['&ntilde;', 'ñ'], ['&pound;', '£'], ['&sdot;', '⋅'], ['&ne;', '≠'],
      ['&rsquo;', '’'], ['&ldquo;', '“'], ['&rdquo;', '”'], ['&Delta;', 'Δ'], ['&sigma;', 'σ'], ['&infin;', '∞'], ['&rArr;', '⇒'],
      ['&equiv;', '≡'], ['&asymp;', '≈'], ['&sup2;', '²'], ['&frac12;', '½'], ['&there4;', '∴']
    ]
    for (const [entity, glyph] of table) expect(worded(`<p>x ${entity} y</p>`), entity).toBe(`x ${glyph} y`)
  })

  it('still reads numeric entities, and leaves an unknown name, a bare ampersand and an inherited name as typed', () => {
    expect(worded('<p>&#8364;5 and &#x3C6; and &amp;euro;</p>')).toBe('€5 and φ and &euro;')
    expect(worded('<p>AT&T, &notanentity; and &constructor; stay</p>')).toBe('AT&T, &notanentity; and &constructor; stay')
  })
})

// ---------------------------------------------------------------------------
// The conditions on an exact number box (A08-3, accepted by the wave head on 2026-10-03)
// ---------------------------------------------------------------------------

const at = (decimals: number, precisionMode: 'dp' | 'sf'): MeasureSettings => ({ ...MEASURE, decimals, precisionMode })
/** questionReveal.test.ts's P21 precisions: a fresh install's 2 d.p., then those that round a whole or a 2-s.f. answer. */
const REVEAL_PRECISIONS = [at(2, 'dp'), at(0, 'dp'), at(1, 'dp'), at(1, 'sf'), at(2, 'sf'), at(3, 'sf')]

/** One Numbas number box with these bounds and precision fields, imported, saved and loaded as Practice gets it. */
function numberBox(min: string, max: string, fields: Raw = {}): { q: PQQuestion; report: string[] } {
  const { file, report } = fromExam(exam([question({ parts: [{ type: 'numberentry', marks: 1, prompt: '<p>How many?</p>', minValue: min, maxValue: max, ...fields }] })]))
  return { q: parsePQFile(serializePQFile(file)).questions[0], report }
}

/**
 * Where the answer revealed for part 0 is not marked right when typed back, as questionReveal.test.ts
 * checks it: under the box, on the full solution's Answer card, and through the vector-style reveal,
 * at each precision a student may use.
 */
function revealedWrong(q: PQQuestion): string[] {
  const out: string[] = []
  for (const s of REVEAL_PRECISIONS) {
    const played = playQuestion(q, 1, s)
    const p = countedParts(played)[0]
    const where = `${q.parts[0].type === 'number' ? q.parts[0].answer : '?'} at ${s.decimals} ${s.precisionMode}`
    const box = checkPlayedPart(p, p.answerText ?? '', played, s).verdict
    if (box !== 'right') out.push(`${where}: under the box "${p.answerText}" typed back is ${box}`)
    const tex = played.full.answers[p.index].tex
    const card = checkPlayedPart(p, String(shownValue(tex)), played, s).verdict
    if (card !== 'right') out.push(`${where}: Answer card ${tex} typed back is ${card}`)
    const bare = { ...p.field!, unit: undefined }
    const vector = checkAnswer(expectedText(bare, s), bare, s).verdict
    if (vector !== 'right') out.push(`${where}: vector-style reveal "${expectedText(bare, s)}" typed back is ${vector}`)
  }
  return out
}

describe('an exact Numbas number box keeps the noise floor, its stated precision and its reveal', () => {
  it('1: is compared with the calculator\'s noise floor, never a raw ===: 1/3 typed as 1/3, 0.1+0.2 typed as 0.3', () => {
    const third = numberBox('1/3', '1/3').q
    expect(verdictFor(third, 0, '1/3')).toBe('right')
    expect(verdictFor(third, 0, '0.34')).toBe('wrong')
    const sum = numberBox('0.1+0.2', '0.1+0.2').q
    expect(verdictFor(sum, 0, '0.3')).toBe('right')
    expect(verdictFor(sum, 0, '0.34')).toBe('wrong')
  })

  it('2: takes the answer typed at the precision the file states: 22/7 to 2 d.p. takes 3.14, 100π to 3 s.f. takes 314', () => {
    // The editor writes the precision as a string, "2": the importer reads it as the number it spells.
    const dp = numberBox('22/7', '22/7', { precisionType: 'dp', precision: '2' }).q
    expect(dp.parts[0]).toMatchObject({ tolerance: { kind: 'absolute', value: 0.005 } })
    expect(verdictFor(dp, 0, '3.14')).toBe('right')
    expect(verdictFor(dp, 0, '3.2')).toBe('wrong')
    const sf = numberBox('pi*100', 'pi*100', { precisionType: 'sigfig', precision: 3 }).q
    expect(verdictFor(sf, 0, '314')).toBe('right')
    expect(verdictFor(sf, 0, '320')).toBe('wrong')
  })

  it('2: a precision it cannot read (a variable\'s name, an expression, none given) is not taken for exact: 2 % and a sentence', () => {
    // 14 questions of the cached bank write the precision as a variable's name: "precision": "precision".
    const cases: [Raw, string][] = [
      [{ precisionType: 'dp', precision: 'precision' }, 'decimal places'],
      [{ precisionType: 'sigfig', precision: 'n + 1' }, 'significant figures'],
      [{ precisionType: 'dp' }, 'decimal places']
    ]
    for (const [fields, words] of cases) {
      const { q, report } = numberBox('pi', 'pi', fields)
      const where = JSON.stringify(fields)
      expect(q.parts[0], where).toMatchObject({ tolerance: { kind: 'relative', value: 0.02 } })
      expect(report, where).toEqual([`Question 'Braking train', part 1: PhysLab could not read how many ${words} it asks for, so it accepts 2 %.`])
      expect(verdictFor(q, 0, '3.14'), where).toBe('right')
      expect(verdictFor(q, 0, '3.5'), where).toBe('wrong')
    }
  })

  it('3: has its revealed answer, typed back, marked right at every precision, in all three places it is shown', () => {
    for (const bound of ['1/3', '0.1+0.2', '100', 'pi', '2.675']) {
      expect(revealedWrong(numberBox(bound, bound).q), bound).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// Imported LaTeX spoken into plain characters (H12)
// ---------------------------------------------------------------------------

describe('imported LaTeX in a step head or a choice is spoken in plain characters', () => {
  // spoken() ran the maths of a step head, a choice or a distractor through texToPlain, which is
  // meant for PhysLab's own sentences: it deletes every command it does not know (μ, ∩, ≤, \sin …)
  // and strips every brace, and spoken kept every {identifier} as if it were a value chip.
  const stepQuestion = (prompt: string, variables: Record<string, string> = {}, over: Raw = {}): PQQuestion => {
    const names = Object.keys(variables)
    const part = { type: 'numberentry', marks: 1, prompt: '<p>How much?</p>', minValue: '5', maxValue: '5', precisionType: 'dp', precision: 0, steps: [{ type: 'information', prompt }] }
    const { file, report } = fromExam(
      exam([question({ variables: Object.fromEntries(names.map((n) => [n, v(n, variables[n])])), ungrouped_variables: names, parts: [part], ...over })])
    )
    expect(report).toEqual([])
    return file.questions[0]
  }
  /** What the student reads for one formula that makes a step head by itself. */
  const head = (tex: string, variables: Record<string, string> = {}): string => stepQuestion(`<p>$${tex}$</p>`, variables).steps?.items[0].head ?? ''
  const R = String.raw
  const draw = { a: 'random(1..5)' }

  it('keeps the μ and the Greek letters of the pool\'s friction and stress steps (q14313, q28920)', () => {
    expect(head(R`F_{MAX} = \mu R`)).toBe('F_MAX = μR')
    expect(head(R`(\sigma_x, \tau_{xy})`)).toBe('(σ_x, τ_xy)')
    expect(head(R`\Delta x = \Omega \alpha`)).toBe('Δx = Ω α')
    expect(head(R`\varepsilon, \vartheta, \varpi, \varrho, \varsigma, \varphi`)).toBe('ε, ϑ, ϖ, ϱ, ς, φ')
  })

  it('reads a set with its braces and an intersection with its symbol (q16543)', () => {
    expect(head(R`A=\{-1,-3,-9\}`)).toBe('A={-1,-3,-9}')
    expect(head(R`A \cap B`)).toBe('A ∩ B')
    expect(head(R`\left\{ x \right\}`)).toBe('{ x }')
  })

  it('turns function names, relations, sets, arrows, degrees and double-struck letters into characters', () => {
    const table: [string, string][] = [
      [R`\sin\theta`, 'sin θ'],
      [R`\sin x + \cos x`, 'sin x + cos x'],
      [R`\tan(x)`, 'tan(x)'],
      [R`\ln x`, 'ln x'],
      [R`\arctan 1`, 'arctan 1'],
      [R`x \le 2 \pm 1`, 'x ≤ 2 ± 1'],
      [R`a \geq b, c \ne d, e \approx f`, 'a ≥ b, c ≠ d, e ≈ f'],
      [R`x \in \mathbb{R}`, 'x ∈ ℝ'],
      [R`n \in \mathbb{N}, \mathbb{Z}, \mathbb{Q}, \mathbb{C}`, 'n ∈ ℕ, ℤ, ℚ, ℂ'],
      [R`A \subseteq B \cup C`, 'A ⊆ B ∪ C'],
      [R`x \notin A`, 'x ∉ A'],
      [R`f: A \to B`, 'f: A → B'],
      [R`p \Rightarrow q`, 'p ⇒ q'],
      // texToPlain takes \right off the front of \rightarrow and leaves the word "arrow".
      [R`a \rightarrow b`, 'a → b'],
      [R`a \leftrightarrow b`, 'a ↔ b'],
      [R`90^\circ`, '90°'],
      [R`90^{\circ} C`, '90° C'],
      [R`x_1 + x_{12}`, 'x₁ + x₁₂'],
      [R`F_{MAX}`, 'F_MAX'],
      [R`\mathrm{kg} \cdot \mathbf{F}`, 'kg · F'],
      [R`\operatorname{rank}(A)`, 'rank(A)'],
      [R`1, 2, \ldots, n`, '1, 2, …, n'],
      // texToPlain takes \cdot off the front of \cdots and leaves "·s".
      [R`a_1 + \cdots + a_n`, 'a₁ + … + a_n'],
      [R`-\infty \lt x \gt \emptyset`, '-∞ < x > ∅'],
      [R`95\%`, '95%'],
      [R`\forall x \exists y`, '∀ x ∃ y'],
      [R`\angle ABC \perp DE \parallel FG`, '∠ ABC ⊥ DE ∥ FG'],
      [R`p \ q`, 'p q']
    ]
    for (const [tex, plain] of table) expect(head(tex), tex).toBe(plain)
  })

  it('brackets a sub- or superscript of more than one symbol, so n + 1 is not read as n and then + 1', () => {
    expect(head(R`y_{n-1} = y_{n} + x^{n+1}`)).toBe('y_(n-1) = y_n + x^(n+1)')
    expect(head(R`x^{\frac{1}{2}}`)).toBe('x^(1/2)')
    expect(head(R`10^{-6} \cdot e^{x}`)).toBe('10^-6 · e^x')
    expect(head(R`\sum_{i=1}^{n} i`)).toBe('∑_(i=1)^n i')
  })

  it('keeps a real variable as a chip, filled with its value, and reads any other {name} as LaTeX grouping', () => {
    const q = stepQuestion(R`<p>$F = \var{a} \mu$</p>`, draw)
    const kept = q.steps?.items[0].head ?? ''
    expect(kept).toBe('F = {a} μ')
    expect(substitute(kept, { a: 3 }, { a: undefined }, MEASURE)).toMatch(/^F = 3(\.0+)? μ$/)
    // A group round a variable's own name is still a group (chipLatex puts a space in it), and a name that is no variable's never was a chip.
    expect(head(R`F_{a}`, draw)).toBe('F_a')
    expect(head(R`F_{MAX}`, { MAX: 'random(1..5)' })).toBe('F_MAX')
    expect(head(R`(1+i)^{n}`)).toBe('(1+i)^n')
    // An escaped brace round a variable's name must not become a chip the player would fill in.
    expect(head(R`\{a\}`, draw)).toBe('{ a}')
  })

  it('leaves no environment name, alignment mark or line break in the head of a display equation (advice of Moles of a substance 2)', () => {
    const advice = R`<p>$$\begin{align} 2x &= 6 \\ x &= 3 \end{align}$$</p>`
    const { file, report } = fromExam(exam([question({ advice, parts: [{ type: 'numberentry', marks: 1, prompt: '<p>x?</p>', minValue: '3', maxValue: '3', precisionType: 'dp', precision: 0 }] })]))
    expect(report).toEqual([])
    const [step] = file.questions[0].steps?.items ?? []
    expect(step.head).toBe('2x = 6 x = 3')
    // KaTeX still gets the equation exactly as written.
    expect(step.tex).toBe(R`\begin{align} 2x &= 6 \\ x &= 3 \end{align}`)
    expect(() => katex.renderToString(step.tex ?? '', { displayMode: true, throwOnError: true, strict: 'ignore' })).not.toThrow()
  })

  it('does not touch the tex of a display equation: it is drawn from the LaTeX as written', () => {
    const q = stepQuestion(R`<p>Use</p>$$F_{MAX} = \mu R$$`)
    expect(q.steps?.items).toMatchObject([{ head: 'Use', tex: R`F_{MAX} = \mu R` }])
    expect(stepQuestion(R`$$F_{MAX} = \mu R$$`).steps?.items).toMatchObject([{ head: 'F_MAX = μR', tex: R`F_{MAX} = \mu R` }])
  })

  it('speaks the maths of a choice and of its why too', () => {
    const part = {
      type: '1_n_2',
      marks: 1,
      maxMarks: 1,
      prompt: '<p>Which is right?</p>',
      choices: [R`<p>$x \in \mathbb{R}$</p>`, R`<p>$$A \cap B$$</p>`],
      matrix: [[1], [0]],
      distractors: ['', R`<p>That is $F_{MAX} = \mu R$, not a set.</p>`],
      shuffleChoices: false
    }
    const { file, report } = fromExam(exam([question({ parts: [part] })]))
    expect(report).toEqual([])
    const got = file.questions[0].parts[0]
    expect(got.type === 'choice' ? got.choices.map((c) => [c.text, c.why]) : []).toEqual([
      ['x ∈ ℝ', undefined],
      ['A ∩ B', 'That is F_MAX = μR, not a set.']
    ])
  })

  // Found by reading every changed head of the 272-question pool once the first fix was in.
  it('keeps the strike-through of \\not: \\not\\in is ∉ and never ∈ (Functions: surjective)', () => {
    expect(head(R`\frac{1}{2} \not\in \operatorname{Domain}(f_1) = \mathbb Z`)).toBe('1/2 ∉ Domain(f₁) = ℤ')
    expect(head(R`a \not= b, A \not\subset B, x \not\le y`)).toBe('a ≠ b, A ⊄ B, x ≰ y')
    // A symbol with no struck form of its own keeps the word.
    expect(head(R`x \not\perp y`)).toBe('x not ⊥ y')
  })

  it('reads {a \\over b} as a fraction, \\leqslant as ≤, a bar over a letter as its mean, and keeps a variable\'s letter out of the brackets (Mohr\'s Circle, Roots of sin(z)=a, SIR questions)', () => {
    expect(head(R`\tan(2\theta)={\tau_{xy} \over \sigma_x-\sigma_m}`)).toBe('tan(2θ)=(τ_xy)/(σ_x-σ_m)')
    expect(head(R`\theta={1 \over 2} x`)).toBe('θ=(1/2) x')
    expect(head(R`-1 \leqslant \sin x \leqslant 1, y \geqslant 0`)).toBe('-1 ≤ sin x ≤ 1, y ≥ 0')
    expect(head(R`(x_i - \bar{x})^2 + \overline{A}`)).toBe('(x_i - x\u0304)² + A\u0304')
    // g is a variable here: chipLatex puts a space in the group round it, which must not show as "W/( g)".
    expect(head(R`m = \frac{W}{g}`, { g: 'random(1..5)' })).toBe('m = W/g')
    expect(head(R`y_n^{(h)} = C a^n`)).toBe('y_n^(h) = C a^n')
  })

  it('reads \\binom and \\choose as C(n, r), not as the product "nr", and \\star as * (Binomial Distribution, Confidence interval)', () => {
    expect(head(R`P(X=r)=\binom{n}{r}p^{r}q^{n-r}`)).toBe('P(X=r)=C(n, r)p^rq^(n-r)')
    expect(head(R`{n \choose r}`)).toBe('C(n, r)')
    // The chips of a variable stay chips: filled in, it reads C(5, 2).
    expect(head(R`P(X=2) = \binom{\var{n}}{2}`, { n: 'random(3..6)' })).toBe('P(X=2) = C({n}, 2)')
    expect(head(R`MoE=z^\star\times SE`)).toBe('MoE=z^*× SE')
  })

  it('reads a fraction inside a fraction, a space before the brace and TeX\'s one-character arguments, not as numbers run together (Geometric series)', () => {
    expect(head(R`\frac {a_6}{a_3} = k^3`)).toBe('a₆/a₃ = k³')
    // "1/42" was what the stripped braces made of a quarter over two.
    expect(head(R`\frac {\frac 1 4}{2} = k^3`)).toBe('(1/4)/2 = k³')
    expect(head(R`k = \frac 1 2, \frac12 x, \dfrac{3}{10}x`)).toBe('k = 1/2, (1/2) x, (3/10)x')
    expect(head(R`\frac{1}{1+\frac{1}{x}}`)).toBe('1/(1+1/x)')
    // A side that already has its brackets does not get a second pair.
    expect(head(R`\frac{x}{(1-y)}`)).toBe('x/(1-y)')
  })

  // H12 follow-up: what a checker still found reading wrongly once the first fix was in.
  it('reads a one-character Greek argument of a fraction as a fraction, not as a product ("π2", "αβ")', () => {
    expect(head(R`\frac\pi2`)).toBe('π/2')
    expect(head(R`\frac\alpha\beta`)).toBe('α/β')
    expect(head(R`\frac{\pi}{2}`)).toBe('π/2')
  })

  it('reads a fraction whose parts hold a group, bracketing a part of more than one word or term ("distancetime")', () => {
    expect(head(R`v = \frac{\text{distance}}{\text{time}}`)).toBe('v = distance/time')
    expect(head(R`\frac{\text{total distance}}{\text{time taken}}`)).toBe('(total distance)/(time taken)')
    expect(head(R`\frac{a + b}{c + d}`)).toBe('(a + b)/(c + d)')
    expect(head(R`\frac{\left(x\right)}{y_{n}}`)).toBe('(x)/(y_n)')
  })

  it('brackets a fraction followed by a power, a script, a Greek letter or a value chip ("2/3²", "3/4π")', () => {
    expect(head(R`\frac{2}{3}^2`)).toBe('(2/3)²')
    expect(head(R`\frac{2}{3}^{n}`)).toBe('(2/3)^n')
    expect(head(R`\frac{3}{4}\pi`)).toBe('(3/4)π')
    expect(head(R`\frac{1}{2}\var{a}`, draw)).toBe('(1/2){a}')
  })

  it('reads a square root with its whole argument, a bare root and a cube or nth root ("√b²-4ac", "2", "[3]x")', () => {
    expect(head(R`\sqrt{b^2-4ac}`)).toBe('√(b²-4ac)')
    expect(head(R`\sqrt2`)).toBe('√2')
    expect(head(R`\sqrt{x}`)).toBe('√x')
    expect(head(R`\sqrt{x^2}`)).toBe('√(x²)')
    expect(head(R`\sqrt[3]{x}`)).toBe('∛x')
    expect(head(R`\sqrt[4]{x}`)).toBe('∜x')
    expect(head(R`\sqrt[5]{x+1}`)).toBe('⁵√(x+1)')
    expect(head(R`\sqrt[n]{x}`)).toBe('ⁿ√x')
    expect(head(R`x = \frac{-b \pm \sqrt{b^2-4ac}}{2}`)).toBe('x = (-b ± √(b²-4ac))/2')
    expect(head(R`\sqrt{\var{a}}`, draw)).toBe('√{a}')
  })

  it('keeps the letter under \\vec, \\hat and \\dot, and puts no brackets round a lone value chip', () => {
    expect(head(R`\vec{F} = m\vec{a}`)).toBe('F⃗ = ma⃗')
    expect(head(R`\hat{n}, \hat\theta, \dot x, \ddot{x}, \tilde{y}`)).toBe('n̂, θ̂, ẋ, ẍ, ỹ')
    expect(head(R`\vec{AB}`)).toBe('AB')
    expect(head(R`\frac{\var{a}}{2}`, draw)).toBe('{a}/2')
  })

  it('keeps a mixed number\'s whole part apart from its fraction ("21/2" for two and a half)', () => {
    expect(head(R`2\frac12`)).toBe('2 1/2')
    expect(head(R`3\frac{1}{4} m`)).toBe('3 1/4 m')
    expect(head(R`x = 2 \frac{1}{2}`)).toBe('x = 2 1/2')
  })

  it('brackets a bottom of a number and a letter, so x/2a is not read as (x/2)·a', () => {
    expect(head(R`\frac{x}{2a}`)).toBe('x/(2a)')
    expect(head(R`\frac{1}{2\pi}`)).toBe('1/(2π)')
    expect(head(R`\frac{2a}{b}`)).toBe('2a/b')
    expect(head(R`\frac{a_6}{a_3}`)).toBe('a₆/a₃')
  })

  // Found by the batch-3 checker's probes.
  it('brackets a fraction written straight after a letter, a power, a chip or a bracket: {a}1/2 would read 41/2', () => {
    expect(head(R`\var{a}\frac{1}{2}`, { a: 'random(2..5)' })).toBe('{a}(1/2)')
    expect(head(R`x^2\frac{1}{2}`)).toBe('x²(1/2)')
    expect(head(R`10^{3}\frac{1}{2}`)).toBe('10³(1/2)')
    expect(head(R`f(2)\frac{1}{2}`)).toBe('f(2)(1/2)')
    expect(head(R`\frac{a}{b}\frac{c}{d}`)).toBe('(a/b)(c/d)')
    // A mixed number and a fraction after an operator stay as they were.
    expect(head(R`-2\frac{1}{2} + \frac{1}{2}`)).toBe('-2 1/2 + 1/2')
  })

  it('brackets a power of more than one term: e^{2x} is e^(2x), never e^2x', () => {
    expect(head(R`e^{2x}`)).toBe('e^(2x)')
    expect(head(R`e^{i\pi}`)).toBe('e^(iπ)')
    expect(head(R`e^{kt} + x^{n} + 10^{-3}`)).toBe('e^(kt) + x^n + 10^-3')
    // A subscript is a label: τ_xy stays as it is.
    expect(head(R`\tau_{xy}`)).toBe('τ_xy')
  })

  it('keeps the dotless i and j of a unit vector under its hat', () => {
    expect(head(R`\hat{\imath} + \hat{\jmath}`)).toBe('ı̂ + ȷ̂')
  })
})

// ---------------------------------------------------------------------------
// Maths in a question's title (H13)
// ---------------------------------------------------------------------------

describe('a question title with maths between dollar signs', () => {
  // The title was copied as typed, so the pool showed "Acceleration and weight: apply $F=ma$ and $W=mg$".
  const titled = (name: string): string => {
    const part = { type: 'numberentry', marks: 1, prompt: '<p>How much?</p>', minValue: '5', maxValue: '5', precisionType: 'dp', precision: 0 }
    const { file, report } = fromExam(exam([question({ name, parts: [part] })]))
    expect(report).toEqual([])
    return file.questions[0].title
  }

  it('speaks the maths of the title, as a step\'s words are spoken (q14115)', () => {
    expect(titled('Acceleration and weight: apply $F=ma$ and $W=mg$')).toBe('Acceleration and weight: apply F=ma and W=mg')
    expect(titled('Logarithms: a multiple of $2\\pi i$ is not the answer')).toBe('Logarithms: a multiple of 2πi is not the answer')
    expect(titled('Powers: \\(x^2\\) and $$E=mc^2$$ and $F_{MAX} = \\mu R$')).toBe('Powers: x² and E=mc² and F_MAX = μR')
  })

  it('leaves a price, a lone dollar sign and a title with no maths exactly as typed, and reads \\$ as a dollar sign', () => {
    expect(titled('Costs $5')).toBe('Costs $5')
    expect(titled('From $5 to $10 a day')).toBe('From $5 to $10 a day')
    expect(titled('Gain of $5 for $x^2$')).toBe('Gain of $5 for x²')
    expect(titled('Costs \\$5 and \\$6')).toBe('Costs $5 and $6')
    expect(titled('Braking train')).toBe('Braking train')
  })
})

// ---------------------------------------------------------------------------
// A blank precision on a number or matrix box (H14)
// ---------------------------------------------------------------------------

describe('a blank precision on a Numbas number or matrix box', () => {
  // Number('') and Number(null) are 0, so a box that asks for decimal places or significant figures
  // without saying how many was read as "to 0": for sig figs a band of 500 % that took 10 for π.
  const UNREADABLE: [string, string][] = [
    ['dp', 'decimal places'],
    ['sigfig', 'significant figures']
  ]
  const sentence = (words: string): string[] => [`Question 'Braking train', part 1: PhysLab could not read how many ${words} it asks for, so it accepts 2 %.`]
  const matrixBox = (fields: Raw): { tolerance: unknown; report: string[] } => {
    const part = {
      type: 'matrix', marks: 1, prompt: '<p>Find the matrix.</p>', correctAnswer: 'matrix([1,2],[3,4])', correctAnswerFractions: false, numRows: 2, numColumns: 2,
      allowResize: false, tolerance: 0, markPerCell: false, allowFractions: false, precisionType: 'none', precision: 0, variableReplacements: [],
      variableReplacementStrategy: 'originalfirst', adaptiveMarkingPenalty: 0, ...fields
    }
    const { file, report } = fromExam(exam([question({ parts: [part] })]))
    return { tolerance: (file.questions[0].parts[0] as { tolerance: unknown }).tolerance, report }
  }

  it('number: "", a blank string and null are an unreadable precision, 2 % and a sentence, as a variable\'s name is', () => {
    for (const [precisionType, words] of UNREADABLE) {
      for (const precision of ['', '  ', null]) {
        const where = `${precisionType} ${JSON.stringify(precision)}`
        const { q, report } = numberBox('pi', 'pi', { precisionType, precision })
        expect(q.parts[0], where).toMatchObject({ tolerance: { kind: 'relative', value: 0.02 } })
        expect(report, where).toEqual(sentence(words))
        expect(verdictFor(q, 0, '3.14'), where).toBe('right')
        expect(verdictFor(q, 0, '3.5'), where).toBe('wrong')
        expect(verdictFor(q, 0, '10'), where).toBe('wrong')
      }
    }
  })

  it('number: a stated 0 or "0" is still a precision of 0', () => {
    for (const precision of [0, '0']) {
      const dp = numberBox('pi', 'pi', { precisionType: 'dp', precision })
      expect(dp.q.parts[0], String(precision)).toMatchObject({ tolerance: { kind: 'absolute', value: 0.5 } })
      expect(dp.report).toEqual([])
      expect(numberBox('pi', 'pi', { precisionType: 'sigfig', precision }).q.parts[0], String(precision)).toMatchObject({ tolerance: { kind: 'relative', value: 5 } })
    }
  })

  it('matrix: "", a blank string, null and a variable\'s name are an unreadable precision, 2 % and the same sentence', () => {
    for (const [precisionType, words] of UNREADABLE) {
      for (const precision of ['', '  ', null, 'precision']) {
        const where = `${precisionType} ${JSON.stringify(precision)}`
        const { tolerance, report } = matrixBox({ precisionType, precision })
        expect(tolerance, where).toEqual({ kind: 'relative', value: 0.02 })
        expect(report, where).toEqual(sentence(words))
      }
    }
  })

  it('matrix: a stated 0 or "0" stays 0, and no precision restriction stays exact with no sentence', () => {
    for (const precision of [0, '0']) {
      expect(matrixBox({ precisionType: 'dp', precision }), String(precision)).toEqual({ tolerance: { kind: 'absolute', value: 0.5 }, report: [] })
      expect(matrixBox({ precisionType: 'sigfig', precision }).tolerance, String(precision)).toEqual({ kind: 'relative', value: 5 })
    }
    expect(matrixBox({})).toEqual({ tolerance: { kind: 'absolute', value: 0 }, report: [] })
  })
})

// ---------------------------------------------------------------------------
// The unit line of a gap-fill none of whose gaps takes a unit (H15)
// ---------------------------------------------------------------------------

describe('a gap-fill whose gaps take no unit keeps its "Give your answer in" line', () => {
  // readParts takes the closing "Give your answer in m." line out of a gap-fill's prompt and gives
  // the unit to the number boxes that name none (H2). When no box took it (every gap an expression,
  // or each number box naming a unit of its own) the sentence was gone and the unit was said nowhere.
  const jmeGap = (): Raw => ({ type: 'jme', marks: 1, prompt: '', answer: 'x', vsetRange: [0, 5], checkingType: 'absdiff', notation: 'basic', enabledFunctions: [], disabledFunctions: [], functionSets: [] })
  const numberGap = (over: Raw = {}): Raw => ({ type: 'numberentry', marks: 1, prompt: '', minValue: '5', maxValue: '5', precisionType: 'dp', precision: 0, ...over })
  const gapfill = (gaps: Raw[], prompt: string): PQPart[] => {
    const { file, report } = fromExam(exam([question({ parts: [{ type: 'gapfill', marks: 0, prompt, gaps }] })]))
    expect(report).toEqual([])
    return file.questions[0].parts
  }
  const LINE = '<p>Give your answer in m.</p>'

  it('keeps the sentence in the prompt when the only gap is an expression', () => {
    expect(gapfill([jmeGap()], `<p>Find it.</p><p>[[0]]</p>${LINE}`).map((p) => p.prompt)).toEqual(['Find it.\n___\nGive your answer in m.'])
  })

  it('keeps it when the number box names a unit of its own, after the words of the gap-fill and before the box\'s own', () => {
    const parts = gapfill([numberGap({ prompt: '<p>How long, in s?</p>' })], `<p>Find it [[0]]</p>${LINE}`)
    expect(parts.map((p) => p.prompt)).toEqual(['Find it ___\nGive your answer in m.\nHow long, in s?'])
    expect(parts[0]).toMatchObject({ type: 'number', unit: 's' })
  })

  it('still takes the line away, and gives the box the unit, when a number box took it', () => {
    const parts = gapfill([jmeGap(), numberGap()], `<p>Find it.</p><p>[[0]] and [[1]]</p>${LINE}`)
    expect(parts.map((p) => p.prompt)).toEqual(['Find it.\n___ and ___', ''])
    expect(parts[1]).toMatchObject({ type: 'number', unit: 'm' })
  })

  it('leaves a closing line that names no unit of PhysLab\'s where it was', () => {
    expect(gapfill([numberGap()], '<p>Find it [[0]]</p><p>Give your answer in furlongs.</p>').map((p) => p.prompt)).toEqual(['Find it ___\nGive your answer in furlongs.'])
  })
})

describe('split submodule exports (CW10a)', () => {
  it('re-exports all public APIs from numbas submodules and executes without top-level side effects', async () => {
    const barrel = await import('../src/renderer/src/questions/numbas')
    const jme = await import('../src/renderer/src/questions/numbas/jme')
    const imp = await import('../src/renderer/src/questions/numbas/import')
    const exp = await import('../src/renderer/src/questions/numbas/export')
    const marking = await import('../src/renderer/src/questions/numbas/marking')

    expect(barrel.fromExam).toBe(imp.fromExam)
    expect(barrel.toExam).toBe(exp.toExam)
    expect(barrel.jmeToMath).toBe(jme.jmeToMath)
    expect(barrel.jmeToVariableDef).toBe(jme.jmeToVariableDef)
    expect(barrel.mathToJme).toBe(jme.mathToJme)
    expect(barrel.JmeRefusal).toBe(jme.JmeRefusal)
    expect(typeof marking.readCarried).toBe('function')
    expect(typeof marking.writeCarried).toBe('function')
  })
})

describe('P-FIX-REVIEWS CW10a fixes (M1, M2, S1, S2)', () => {
  it('CW10a M1: an .exam with a large numeric entity imports without throwing RangeError', () => {
    const file = loadBundled()
    const q = file.questions[0]
    const exam = toExam({ ...file, questions: [q] }, 'Entity test')
    const rawExam = exam.replace(/<p>[^<]*<\/p>/, '<p>Entity test &#99999999; and &#x110000;</p>')
    expect(() => fromExam(rawExam)).not.toThrow()
    const imported = fromExam(rawExam)
    expect(imported.file.questions.length).toBeGreaterThan(0)
  })

  it('CW10a M2: expression part exports the exact 5 JME options and no showPrecisionHint', () => {
    const file = loadBundled()
    const exprQ = file.questions.find((q) => q.parts.some((p) => p.type === 'expression'))!
    const exam = toExam({ ...file, questions: [exprQ] }, 'Expr export test')
    const json = JSON.parse(exam.replace(/^\/\/[^\n]*\n/, ''))
    const part = json.question_groups[0].questions[0].parts.find((p: { type: string }) => p.type === 'jme')
    expect(part.singleLetterVariables).toBe(false)
    expect(part.allowUnknownFunctions).toBe(true)
    expect(part.implicitFunctionComposition).toBe(false)
    expect(part.caseSensitive).toBe(false)
    expect(part.valueGenerators).toEqual([])
    expect(part.showPrecisionHint).toBeUndefined()
  })

  it('CW10a S1/S2: decodes OElig, oelig, Scaron, scaron, Yuml, circ, tilde and old lang/rang', () => {
    const file = loadBundled()
    const q = file.questions[0]
    const exam = toExam({ ...file, questions: [q] }, 'Entities test')
    const rawExam = exam.replace(/<p>[^<]*<\/p>/, '<p>&OElig; &oelig; &Scaron; &scaron; &Yuml; &circ; &tilde; &lang; &rang;</p>')
    const imported = fromExam(rawExam)
    const stmt = imported.file.questions[0].statement
    expect(stmt).toContain('Œ œ Š š Ÿ ˆ ˜ 〈 〉')
  })
})

