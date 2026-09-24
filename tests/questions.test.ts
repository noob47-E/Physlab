// The question engine core: a .pqjson file into typed questions, a seed into one set of
// variable values, and the licence gate that decides what PhysLab may bundle. If these pass, a
// teacher's question always draws the same numbers for the same seed, a bad file is refused
// with one plain sentence, and no question without a pool licence gets in.

import { beforeEach, describe, expect, it } from 'vitest'
import { setAngleMode } from '../src/renderer/src/math/expr'
import { resetGlobals } from './helpers/globals'
import {
  blankQuestion,
  parsePQFile,
  serializePQFile,
  RESERVED_NAMES,
  UNIT_IDS,
  type PQFile,
  type PQQuestion,
  type PQVariable
} from '../src/renderer/src/questions/pqjson'
import {
  cycleSentence,
  drawVariables,
  orderVariables,
  previewVariants,
  randomRange,
  substitute,
  unknownSentence
} from '../src/renderer/src/questions/variables'
import {
  isShippable,
  licenseFromNumbas,
  NUMBAS_LICENCE_STRINGS,
  POOL_NOTICE_TEXT,
  refusalSentence
} from '../src/renderer/src/questions/license'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const range = (name: string, from: number, to: number, step = 1, exclude?: number[]): PQVariable => ({
  name,
  def: exclude ? { kind: 'range', from, to, step, exclude } : { kind: 'range', from, to, step }
})
const expr = (name: string, e: string): PQVariable => ({ name, def: { kind: 'expr', expr: e } })

function question(variables: PQVariable[], over: Partial<PQQuestion> = {}): PQQuestion {
  return {
    id: 'q-1',
    title: 'A ball thrown up',
    statement: 'A ball leaves the ground at {u}.',
    variables,
    parts: [
      { type: 'number', prompt: 'How high does it go?', answer: 'u^2/(2*g)', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 2 }
    ],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' },
    ...over
  }
}

const file = (questions: PQQuestion[]): PQFile => ({ app: 'PhysLab', format: 'pqjson', version: 1, questions })
const text = (questions: PQQuestion[]): string => JSON.stringify(file(questions))

/** The shape of a question as a file might hold it — fields optional, ids and units any string — for the refusal cases. */
interface LooseQuestion {
  title?: string
  license?: { id: string; holder: string }
  variables: { name: string; unit?: string; def: { kind: string; from?: number; to?: number; step?: number; items?: number[] } }[]
  parts: { type: string; unit?: string; marks: number }[]
}

/** A copy of a valid question with one field changed. */
function mutate(change: (q: LooseQuestion) => void): string {
  const q = JSON.parse(JSON.stringify(question([range('u', 5, 20)]))) as LooseQuestion
  change(q)
  return JSON.stringify({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] })
}

const PRECISION = { decimals: 4, precisionMode: 'dp' as const }

// The angle mode is a global the calculator keeps; a question must draw the same numbers whatever it was left at.
beforeEach(resetGlobals)

// ---------------------------------------------------------------------------
// parsePQFile
// ---------------------------------------------------------------------------

describe('parsePQFile', () => {
  it('accepts a minimal valid file and hands back the typed questions', () => {
    const q = question([range('u', 5, 20)])
    const parsed = parsePQFile(text([q]))
    expect(parsed.version).toBe(1)
    expect(parsed.questions).toHaveLength(1)
    expect(parsed.questions[0].title).toBe('A ball thrown up')
    expect(parsed.questions[0].parts[0].marks).toBe(2)
  })

  it('refuses text that is not JSON, or JSON that is not a PhysLab question file', () => {
    expect(() => parsePQFile('not json at all')).toThrow('This is not a PhysLab question file.')
    expect(() => parsePQFile('{"app":"Other","format":"pqjson","version":1,"questions":[]}')).toThrow('This is not a PhysLab question file.')
    expect(() => parsePQFile('{"app":"PhysLab","format":"phys","version":1,"questions":[]}')).toThrow('This is not a PhysLab question file.')
    expect(() => parsePQFile('[]')).toThrow('This is not a PhysLab question file.')
  })

  it('refuses a newer format with the version in the sentence', () => {
    // Format 2 is read since 0.9 (tests/pqjson2.test.ts); 3 is the first one this PhysLab does not know.
    expect(() => parsePQFile('{"app":"PhysLab","format":"pqjson","version":3,"questions":[]}')).toThrow(
      'This question file is format 3; this PhysLab reads formats 1 and 2.'
    )
    // "1" in quotes is not a format at all, so it is not told "format 1; this PhysLab reads formats 1 and 2".
    expect(() => parsePQFile('{"app":"PhysLab","format":"pqjson","version":"1","questions":[]}')).toThrow(
      'This is not a PhysLab question file.'
    )
  })

  it('refuses a question that says nothing about its licence', () => {
    expect(() => parsePQFile(mutate((q) => delete q.license))).toThrow(
      "Question 'A ball thrown up' says nothing about its licence, so PhysLab cannot use it."
    )
    // A licence object with no id in it says nothing either; it is not "licensed ''".
    expect(() => parsePQFile(mutate((q) => (q.license = {} as { id: string; holder: string })))).toThrow(
      "Question 'A ball thrown up' says nothing about its licence, so PhysLab cannot use it."
    )
    expect(() => parsePQFile(mutate((q) => (q.license = { id: ' ', holder: 'Ada' })))).toThrow(
      "Question 'A ball thrown up' says nothing about its licence, so PhysLab cannot use it."
    )
  })

  it('refuses a licence id outside the three in the pool', () => {
    expect(() => parsePQFile(mutate((q) => (q.license = { id: 'CC BY-NC 4.0', holder: 'Ada' })))).toThrow(
      "Question 'A ball thrown up' is licensed 'CC BY-NC 4.0', which PhysLab may not bundle."
    )
  })

  it('refuses a unit PhysLab does not know, on a variable or a part', () => {
    expect(() => parsePQFile(mutate((q) => (q.variables[0].unit = 'furlong')))).toThrow(
      "Question 'A ball thrown up' uses a unit PhysLab does not know: furlong."
    )
    expect(() => parsePQFile(mutate((q) => (q.parts[0].unit = 'ft')))).toThrow(
      "Question 'A ball thrown up' uses a unit PhysLab does not know: ft."
    )
  })

  it("refuses the reserved variable name 'pi' and a name that is not a name", () => {
    expect(() => parsePQFile(mutate((q) => (q.variables[0].name = 'pi')))).toThrow(
      "Question 'A ball thrown up' uses 'pi' as a variable name, but that already means something in maths."
    )
    expect(() => parsePQFile(mutate((q) => (q.variables[0].name = '2u')))).toThrow("has a variable named '2u'")
    expect(() => parsePQFile(mutate((q) => (q.variables[0].name = 'u-1')))).toThrow("has a variable named 'u-1'")
    for (const name of ['e', 'i', 'sqrt', 'sin', 'log', 'Infinity']) expect(RESERVED_NAMES.has(name)).toBe(true)
  })

  it('refuses two variables with the same name', () => {
    expect(() => parsePQFile(text([question([range('u', 1, 5), range('u', 2, 6)])]))).toThrow(
      "Question 'A ball thrown up' names two variables 'u'."
    )
  })

  it('refuses a part worth 0 marks, and one worth a negative number', () => {
    expect(() => parsePQFile(mutate((q) => (q.parts[0].marks = 0)))).toThrow(
      "Question 'A ball thrown up' has a part worth 0 marks; every part must be worth more than 0."
    )
    expect(() => parsePQFile(mutate((q) => (q.parts[0].marks = -1)))).toThrow('worth −1 marks')
  })

  it('refuses a range that cannot be drawn from, and an empty list of parts', () => {
    expect(() => parsePQFile(mutate((q) => (q.variables[0].def.step = 0)))).toThrow('in steps of 0, which PhysLab cannot draw from.')
    expect(() => parsePQFile(mutate((q) => (q.variables[0].def.from = 30)))).toThrow('a range from 30 to 20')
    expect(() => parsePQFile(mutate((q) => (q.parts = [])))).toThrow("Question 'A ball thrown up' has no parts to answer.")
  })

  it('refuses a part of a kind it does not know, and an empty list of values', () => {
    // A matrix part is format 2's (tests/pqjson2.test.ts); an essay is still no kind PhysLab knows.
    expect(() => parsePQFile(mutate((q) => (q.parts[0].type = 'essay')))).toThrow('a part of a kind PhysLab does not know: essay.')
    expect(() => parsePQFile(mutate((q) => (q.variables[0].def = { kind: 'list', items: [] })))).toThrow("an empty list to choose from")
  })

  it('names the question by number when the file gave it no title', () => {
    expect(() => parsePQFile(mutate((q) => { delete q.title; delete q.license }))).toThrow(
      'Question 1 says nothing about its licence, so PhysLab cannot use it.'
    )
  })

  it('accepts every unit in UNIT_IDS', () => {
    for (const unit of UNIT_IDS) {
      expect(() => parsePQFile(mutate((q) => (q.parts[0].unit = unit)))).not.toThrow()
    }
  })
})

describe('blankQuestion and serializePQFile', () => {
  it('starts an author with a licensed question worth one mark, checked to 2 %', () => {
    const q = blankQuestion()
    expect(q.id).not.toBe('')
    expect(q.id).not.toBe(blankQuestion().id)
    expect(q.license).toEqual({ id: 'CC BY 4.0', holder: '' })
    expect(q.parts).toHaveLength(1)
    expect(q.parts[0].marks).toBe(1)
    expect(q.parts[0].type === 'number' && q.parts[0].tolerance).toEqual({ kind: 'relative', value: 0.02 })
  })

  it('writes two-space JSON in a stable key order that parses back to the same file', () => {
    const q = question([range('u', 5, 20)])
    const shuffled = { questions: [q], version: 1, format: 'pqjson', app: 'PhysLab' } as unknown as PQFile
    const a = serializePQFile(file([q]))
    const b = serializePQFile(shuffled)
    expect(a).toBe(b)
    expect(a.startsWith('{\n  "app": "PhysLab",\n  "format": "pqjson",\n  "version": 1,')).toBe(true)
    expect(parsePQFile(a)).toEqual(file([q]))
  })
})

// ---------------------------------------------------------------------------
// orderVariables
// ---------------------------------------------------------------------------

describe('orderVariables', () => {
  const chain = [expr('d', 'c + 1'), expr('c', '2*b'), expr('b', 'a^2'), range('a', 1, 5)]

  it('orders a four-variable chain d←c←b←a as a, b, c, d whatever the input order', () => {
    expect(orderVariables(chain)).toEqual({ order: ['a', 'b', 'c', 'd'] })
    expect(orderVariables([...chain].reverse())).toEqual({ order: ['a', 'b', 'c', 'd'] })
    expect(orderVariables([chain[2], chain[0], chain[3], chain[1]])).toEqual({ order: ['a', 'b', 'c', 'd'] })
  })

  it('keeps the author\'s order among variables that are ready together', () => {
    expect(orderVariables([range('m', 1, 2), range('g', 9, 10), expr('w', 'm*g')])).toEqual({ order: ['m', 'g', 'w'] })
    expect(orderVariables([range('g', 9, 10), range('m', 1, 2), expr('w', 'm*g')])).toEqual({ order: ['g', 'm', 'w'] })
  })

  it('reports a cycle, and the sentence names both variables in loop order', () => {
    const r = orderVariables([expr('a', 'b + 1'), expr('b', 'a * 2')])
    expect(r).toEqual({ cycle: ['a', 'b'] })
    expect('cycle' in r && cycleSentence(r.cycle)).toBe('a depends on b, which depends on a — a variable cannot use itself.')
    expect(cycleSentence(['a'])).toBe('a depends on a — a variable cannot use itself.')
    expect(cycleSentence(['a', 'b', 'c'])).toBe('a depends on b, which depends on c, which depends on a — a variable cannot use itself.')
  })

  it('reports a name that is no variable, and the sentence says who used what', () => {
    const r = orderVariables([range('a', 1, 2), expr('c', 'a * q')])
    expect(r).toEqual({ unknown: { name: 'c', uses: 'q' } })
    expect('unknown' in r && unknownSentence(r.unknown)).toBe('c uses q, but there is no variable called q.')
  })

  it('does not mistake pi, e or a function for a missing variable', () => {
    expect(orderVariables([range('r', 1, 2), expr('A', 'pi * r^2'), expr('k', 'e^r + sqrt(r) + tau')])).toEqual({ order: ['r', 'A', 'k'] })
  })
})

// ---------------------------------------------------------------------------
// drawVariables
// ---------------------------------------------------------------------------

describe('drawVariables', () => {
  const three = question([range('a', 1, 10), range('b', 1, 10), range('c', 1, 10), expr('s', 'a + b + c')])

  it('gives deep-equal values for the same seed, and a formula moved before its inputs changes nothing', () => {
    expect(drawVariables(three, 7)).toEqual(drawVariables(three, 7))
    expect(drawVariables(three, 7)).not.toEqual(drawVariables(three, 8))
    // The stream is consumed in the worked-out order, so where the author lists `s` cannot matter.
    const [a, b, c, s] = three.variables
    expect(drawVariables(question([s, a, b, c]), 7).values).toEqual(drawVariables(three, 7).values)
    expect(drawVariables(three, 7).problems).toEqual([])
  })

  it('spreads 10 000 seeds over a 10×10×10 space without throwing', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 10_000; seed++) {
      const v = drawVariables(three, seed)
      expect(v.problems).toEqual([])
      expect(v.values.s).toBe(v.values.a + v.values.b + v.values.c)
      seen.add(`${v.values.a},${v.values.b},${v.values.c}`)
    }
    expect(seen.size).toBeGreaterThanOrEqual(900)
  })

  it('never draws an excluded value, and stays inside the range', () => {
    const q = question([range('n', 1, 9, 1, [5])])
    for (let seed = 0; seed < 2_000; seed++) {
      const v = drawVariables(q, seed)
      expect(v.values.n).not.toBe(5)
      expect(v.values.n).toBeGreaterThanOrEqual(1)
      expect(v.values.n).toBeLessThanOrEqual(9)
      expect(Number.isInteger(v.values.n)).toBe(true)
      expect(v.problems).toEqual([])
    }
  })

  it('says so when every value is excluded, instead of looping for ever', () => {
    const v = drawVariables(question([range('n', 1, 3, 1, [1, 2, 3])]), 3)
    expect(v.problems).toEqual(['n could not avoid the excluded values.'])
  })

  it('rounds a decimal step cleanly: step 0.25 gives at most two decimals, step 0.1 never 0.30000000000000004', () => {
    const q = question([range('x', 0, 5, 0.25), range('y', 0, 1, 0.1)])
    const ys = new Set<number>()
    for (let seed = 0; seed < 500; seed++) {
      const v = drawVariables(q, seed)
      expect(String(v.values.x)).toMatch(/^\d+(\.\d{1,2})?$/)
      expect(String(v.values.y)).toMatch(/^\d(\.\d)?$/)
      ys.add(v.values.y)
    }
    // (1 − 0)/0.1 is 9.999999999999998 in doubles; the last value must still be reachable.
    expect(ys.has(1)).toBe(true)
  })

  it('draws the one value of a range whose ends meet, and seed 0 and negative seeds are valid', () => {
    const q = question([range('g', 9.8, 9.8)])
    expect(drawVariables(q, 0).values.g).toBe(9.8)
    expect(drawVariables(q, -5).values.g).toBe(9.8)
    expect(drawVariables(three, -1)).toEqual(drawVariables(three, -1))
  })

  it('picks from a list and ignores an exclude on it', () => {
    const q = question([{ name: 'k', def: { kind: 'list', items: [2, 3, 5, 7] } }])
    for (let seed = 0; seed < 50; seed++) expect([2, 3, 5, 7]).toContain(drawVariables(q, seed).values.k)
  })

  it('evaluates a formula that uses a later-listed variable', () => {
    const v = drawVariables(question([expr('KE', 'm*u^2/2'), range('u', 2, 2), range('m', 3, 3)]), 1)
    expect(v.values.KE).toBe(6)
    expect(v.problems).toEqual([])
  })

  it('works a formula out in degrees whatever the calculator was last switched to', () => {
    const q = question([range('theta', 30, 30), expr('vy', '10*sin(theta)')])
    expect(drawVariables(q, 7).values.vy).toBeCloseTo(5, 9)
    setAngleMode('rad')
    expect(drawVariables(q, 7).values.vy).toBeCloseTo(5, 9)
    expect(drawVariables(q, 7)).toEqual(drawVariables(q, 7))
  })

  it('flags a half-typed range (step 0, or from past to) instead of drawing NaN or `from` silently', () => {
    const zero = drawVariables(question([range('x', 1, 5, 0)]), 3)
    expect(zero.values.x).toBeNaN()
    expect(zero.problems).toEqual(['x has a range from 1 to 5 in steps of 0, which PhysLab cannot draw from.'])
    const backwards = drawVariables(question([range('x', 9, 2, 1)]), 3)
    expect(backwards.values.x).toBeNaN()
    expect(backwards.problems).toEqual(['x has a range from 9 to 2 in steps of 1, which PhysLab cannot draw from.'])
  })

  it('reads a formula the way the calculator does: u², √, θ and the proper minus', () => {
    const q = question([range('u', 4, 4), range('theta', 30, 30), expr('a', 'u² − √u'), expr('b', '2*cos(θ)')])
    const v = drawVariables(q, 1)
    expect(v.problems).toEqual([])
    expect(v.values.a).toBe(14)
    expect(v.values.b).toBeCloseTo(Math.sqrt(3), 9)
    // θ in a formula is the variable called theta, so it is not an unknown name.
    expect(orderVariables(q.variables)).toEqual({ order: ['u', 'theta', 'a', 'b'] })
  })

  it('flags 1/b when b can be 0, naming b and its value, in at least one of ten preview rows', () => {
    const q = question([{ name: 'b', def: { kind: 'list', items: [0, 1, 2] } }, expr('a', '1/b')])
    const rows = previewVariants(q)
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => r.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const flagged = rows.filter((r) => r.problems.length > 0)
    expect(flagged.length).toBeGreaterThan(0)
    for (const r of flagged) {
      expect(r.values.b).toBe(0)
      expect(r.problems).toEqual(['a = 1/b is infinite or undefined when b = 0.'])
    }
  })

  it('says in words when a formula cannot be read, and reports a cycle or an unknown name as one problem', () => {
    expect(drawVariables(question([expr('a', '2 +* 3')]), 1).problems).toEqual(['PhysLab could not read the formula for a.'])
    const cyc = drawVariables(question([expr('a', 'b'), expr('b', 'a')]), 1)
    expect(cyc.values).toEqual({})
    expect(cyc.problems).toEqual(['a depends on b, which depends on a — a variable cannot use itself.'])
    const unk = drawVariables(question([expr('c', 'q + 1')]), 1)
    expect(unk.values).toEqual({})
    expect(unk.problems).toEqual(['c uses q, but there is no variable called q.'])
  })
})

// ---------------------------------------------------------------------------
// randomRange: a draw whose ends are other variables
// ---------------------------------------------------------------------------

describe('randomRange', () => {
  // Numbas writes random(a..b) with variable ends (a second speed that must beat the first); a
  // PhysLab range is three typed numbers, so such a draw is the formula randomRange(a, b, step).
  it('draws between variable ends, from the same seeded stream, and orders after its ends', () => {
    const q = question([expr('v2', 'randomRange(v1 + 1, v1 + 5, 1)'), range('v1', 2, 8)])
    const order = orderVariables(q.variables)
    expect(order).toEqual({ order: ['v1', 'v2'] })
    const seen = new Set<number>()
    for (let seed = 1; seed <= 400; seed++) {
      const { values, problems } = drawVariables(q, seed)
      expect(problems).toEqual([])
      const gap = values.v2 - values.v1
      expect(gap).toBeGreaterThanOrEqual(1)
      expect(gap).toBeLessThanOrEqual(5)
      expect(Number.isInteger(gap)).toBe(true)
      seen.add(gap)
      // Same seed, same numbers: the draw inside the formula is not Math.random.
      expect(drawVariables(q, seed).values).toEqual(values)
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('steps in decimals without drift, and says in words when the ends cannot be drawn from', () => {
    const r = () => 0.99999
    expect(randomRange(r, 0, 0.3, 0.1)).toBe(0.3)
    expect(randomRange(() => 0, 2, 2, 1)).toBe(2)
    expect(randomRange(r, 5, 1, 1)).toBeNull()
    expect(randomRange(r, 0, 1, 0)).toBeNull()
    const q = question([range('a', 5, 5), expr('b', 'randomRange(a, 1)')])
    const { values, problems } = drawVariables(q, 3)
    expect(Number.isNaN(values.b)).toBe(true)
    expect(problems).toEqual(['b is drawn from 5 to 1 in steps of 1, which PhysLab cannot draw from.'])
  })
})

// ---------------------------------------------------------------------------
// substitute
// ---------------------------------------------------------------------------

describe('substitute', () => {
  it('writes a tiny known value through fmtSci, never as 0', () => {
    const out = substitute('The charge is {q}.', { q: 1.6e-19 }, { q: 'C' }, PRECISION)
    expect(out).toBe('The charge is 1.6×10^-19 C.')
    expect(out).not.toContain(' 0 C')
    expect(substitute('{n}', { n: 2.5e6 }, {}, PRECISION)).toBe('2.5×10^6')
  })

  it('appends the unit label with a space, but a degree sign sits against the number', () => {
    expect(substitute('Speed {u} at {theta}.', { u: 12.5, theta: 30 }, { u: 'm/s', theta: '°' }, PRECISION)).toBe('Speed 12.5 m/s at 30°.')
    expect(substitute('{t}', { t: 4 }, { t: 'none' }, PRECISION)).toBe('4')
    expect(substitute('{t}', { t: 4 }, {}, PRECISION)).toBe('4')
  })

  it('leaves an unknown chip exactly as typed and uses the same numbers inside $$…$$', () => {
    expect(substitute('{u} and {v}', { u: 3 }, {}, PRECISION)).toBe('3 and {v}')
    // A formula that failed is stored as NaN; the chip stays as typed rather than reading "undefined m".
    expect(substitute('It is {x} away.', { x: NaN }, { x: 'm' }, PRECISION)).toBe('It is {x} away.')
    expect(substitute('$$ s = {u} t $$', { u: 3 }, { u: 'm/s' }, PRECISION)).toBe('$$ s = 3 m/s t $$')
  })

  it('follows the student\'s precision, in decimal places or significant figures', () => {
    expect(substitute('{x}', { x: 2 / 3 }, {}, { decimals: 2, precisionMode: 'dp' })).toBe('0.67')
    expect(substitute('{x}', { x: 2 / 3 }, {}, { decimals: 3, precisionMode: 'sf' })).toBe('0.667')
    expect(substitute('{x}', { x: -1.5 }, { x: 'N' }, PRECISION)).toBe('−1.5 N')
  })
})

// ---------------------------------------------------------------------------
// The licence gate
// ---------------------------------------------------------------------------

describe('licence gate', () => {
  it('maps exactly the two Numbas strings and nothing else', () => {
    expect(licenseFromNumbas('Creative Commons Attribution 4.0 International')).toBe('CC BY 4.0')
    expect(licenseFromNumbas('Creative Commons Attribution-ShareAlike 4.0 International')).toBe('CC BY-SA 4.0')
    expect(licenseFromNumbas('  Creative Commons Attribution 4.0 International\n')).toBe('CC BY 4.0')
    for (const found of [
      'Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International',
      'Creative Commons Attribution-NoDerivatives 4.0 International',
      'Creative Commons Attribution-NonCommercial 4.0 International',
      'Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International',
      'All rights reserved',
      'None specified',
      'Creative Commons Attribution 4.0 International.',
      'creative commons attribution 4.0 international',
      'constructor',
      '',
      null,
      undefined
    ]) {
      expect(licenseFromNumbas(found)).toBeNull()
    }
    expect(Object.keys(NUMBAS_LICENCE_STRINGS)).toHaveLength(2)
  })

  it('quotes what was found in the refusal, and says so when nothing was', () => {
    expect(refusalSentence('Kinematics 3', 'All rights reserved')).toBe(
      "Question 'Kinematics 3' is licensed 'All rights reserved', which PhysLab may not bundle."
    )
    expect(refusalSentence('Kinematics 3', 'Creative Commons Attribution-NonCommercial 4.0 International')).toContain(
      "'Creative Commons Attribution-NonCommercial 4.0 International'"
    )
    const none = "Question 'Kinematics 3' names no licence, which PhysLab may not bundle."
    expect(refusalSentence('Kinematics 3', null)).toBe(none)
    expect(refusalSentence('Kinematics 3', '')).toBe(none)
    expect(refusalSentence('Kinematics 3', 'None specified')).toBe(none)
  })

  it('ships only the three pool licences, and only CC0 without a holder', () => {
    expect(isShippable({ id: 'CC BY 4.0', holder: 'Ada' })).toBe(true)
    expect(isShippable({ id: 'CC BY-SA 4.0', holder: 'Ada' })).toBe(true)
    expect(isShippable({ id: 'CC0 1.0', holder: '' })).toBe(true)
    expect(isShippable({ id: 'CC BY 4.0', holder: '' })).toBe(false)
    expect(isShippable({ id: 'CC BY-SA 4.0', holder: '   ' })).toBe(false)
    expect(isShippable({ id: 'CC BY-NC 4.0', holder: 'Ada' } as never)).toBe(false)
    expect(isShippable(undefined)).toBe(false)
  })

  it('has a NOTICE paragraph for each licence, and the BY-SA one mentions GPLv3 compatibility', () => {
    expect(Object.keys(POOL_NOTICE_TEXT).sort()).toEqual(['CC BY 4.0', 'CC BY-SA 4.0', 'CC0 1.0'])
    for (const t of Object.values(POOL_NOTICE_TEXT)) expect(t.length).toBeGreaterThan(80)
    expect(POOL_NOTICE_TEXT['CC BY-SA 4.0']).toContain('GPL')
  })
})
