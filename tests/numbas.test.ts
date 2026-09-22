// Numbas .exam files in and out. If these pass, a Numbas question in the accepted subset
// becomes a PhysLab question whose numbers are the same numbers (JME → mathjs, read by the
// app's own calculator), a question outside it is refused with one plain sentence, no
// question without a pool licence gets in, and a PhysLab set survives the trip to `.exam`
// and back.

import { beforeEach, describe, expect, it } from 'vitest'
import { inDegrees, math } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'
import { JmeRefusal, fromExam, jmeToMath, jmeToVariableDef, mathToJme, toExam, unitInPrompt } from '../src/renderer/src/questions/numbas'
import { parsePQFile, serializePQFile, type PQFile, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { drawVariables, substitute } from '../src/renderer/src/questions/variables'

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
      ['dec(x)', 'x'],
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
      ['random(1..n)', 'a random range whose ends are not plain numbers'],
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
    expect(read(part('a', 'a'))).toMatchObject({ answer: 'a', tolerance: { kind: 'relative', value: 0.02 }, report: [] })
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
      [{ parts: [{ type: 'matrix', marks: 1, prompt: '<p>M</p>' }] }, 'uses a matrix part PhysLab does not read'],
      [{ parts: [{ type: 'm_n_x', marks: 1, prompt: '<p>M</p>' }] }, 'uses a m_n_x part PhysLab does not read'],
      [{ parts: [{ type: 'patternmatch', marks: 1, prompt: '<p>M</p>' }] }, 'uses a patternmatch part PhysLab does not read'],
      [{ parts: [{ type: 'extension', marks: 1, prompt: '<p>M</p>' }] }, 'uses a extension part PhysLab does not read'],
      [{ variables: { a: v('a', 'map(x^2, x, 1..3)') } }, 'variable a uses the function map, which PhysLab does not know'],
      [{ variables: { a: v('a', 'random(1..n)'), n: v('n', '5') } }, 'variable a uses a random range whose ends are not plain numbers, which PhysLab does not know'],
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
    const bad = question({ name: 'Bad', parts: [{ type: 'matrix', marks: 1, prompt: '<p>M</p>' }] })
    const { file, report } = fromExam(exam([bad, zero, 'not a question' as unknown as Raw]))
    expect(file.questions.map((q) => q.title)).toEqual(['Zero marks'])
    expect(file.questions[0].parts.map((p) => p.marks)).toEqual([1, 1])
    expect(report).toEqual([
      "Question 'Bad' was skipped: it uses a matrix part PhysLab does not read.",
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
    expect(n1).toMatchObject({ type: 'numberentry', marks: 2, minValue: '(vend) * (1 - 0.02)', maxValue: '(vend) * (1 + 0.02)', precisionType: 'none' })
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
