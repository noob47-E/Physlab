// PQJSON format 2: the file a question with a vector, matrix, roots, function, proof or Lego part,
// a stated uncertainty, an answer carried forward or a condition is saved in. A file is written as
// version 2 only when a question needs it, so a plain file still opens in 0.7.0; the parser reads
// both and refuses anything wrong in ONE sentence naming the question. Every test crosses the
// file boundary: an object into text, text back into questions.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'
import { renameVariable, unanswered, variableInUse } from '../src/renderer/src/questions/authoring'
import { toExam } from '../src/renderer/src/questions/numbas'
import {
  formatVersionOf,
  isFormat1Part,
  parsePQFile,
  serializePQFile,
  type PQFile,
  type PQPart,
  type PQQuestion
} from '../src/renderer/src/questions/pqjson'

const SAMPLE = readSource('src/renderer/src/questions/bank/sample.pqjson')

/** The braking train, format 1: v and t given, s asked (the shipped sample's shape). */
function train(): PQQuestion {
  return {
    id: 'train',
    title: 'A braking train',
    statement: 'A train moving at {v} m/s brakes to rest in {t} s.',
    variables: [
      { name: 'v', def: { kind: 'list', items: [24] }, unit: 'm/s' },
      { name: 't', def: { kind: 'list', items: [8] }, unit: 's' },
      { name: 'a', def: { kind: 'expr', expr: '-v/t' }, unit: 'm/s²' }
    ],
    parts: [
      { type: 'number', prompt: 'Its acceleration', answer: '-v/t', unit: 'm/s²', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 },
      { type: 'number', prompt: 'How far it goes', answer: 'v*t + a*t^2/2', unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 2 }
    ],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  }
}

const fileOf = (...questions: PQQuestion[]): PQFile => ({ app: 'PhysLab', format: 'pqjson', version: 1, questions })
const text = (...questions: PQQuestion[]): string => serializePQFile(fileOf(...questions))
const versionLine = (t: string): string | undefined => /"version": (\d+)/.exec(t)?.[1]

describe('format 1 stays format 1', () => {
  it('round-trips the bundled sample byte for byte and says version 1', () => {
    const once = serializePQFile(parsePQFile(SAMPLE))
    expect(versionLine(once)).toBe('1')
    expect(serializePQFile(parsePQFile(once))).toBe(once)
    expect(formatVersionOf(parsePQFile(SAMPLE))).toBe(1)
  })

  it('round-trips a plain question byte for byte', () => {
    const t = text(train())
    expect(versionLine(t)).toBe('1')
    expect(serializePQFile(parsePQFile(t))).toBe(t)
  })
})

describe('any format-2 field makes the file version 2', () => {
  const vector: PQPart = { type: 'vector', prompt: 'F', answer: ['3', '4'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
  const cases: [string, (q: PQQuestion) => PQQuestion][] = [
    ['a vector part', (q) => ({ ...q, parts: [...q.parts, vector] })],
    ['a matrix part', (q) => ({ ...q, parts: [...q.parts, { type: 'matrix', prompt: 'M', answer: [['1', '0'], ['0', '1']], tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 }] })],
    ['a roots part', (q) => ({ ...q, parts: [...q.parts, { type: 'roots', prompt: 'x', answer: ['2', '-3'], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 }] })],
    [
      'a function part',
      (q) => ({
        ...q,
        parts: [...q.parts, { type: 'function', prompt: 'y', x: 'x', y: 'y', ode: "y'' + y = 0", initial: [{ at: '0', order: 0, value: '0' }, { at: '0', order: 1, value: '1' }], model: 'sin(x)', marks: 2 }]
      })
    ],
    ['a proof part', (q) => ({ ...q, parts: [...q.parts, { type: 'proof', prompt: 'Prove it.', model: 'Because.', selfCheck: ['I said why.'], marks: 0 }] })],
    ['a Lego part', (q) => ({ ...q, parts: [...q.parts, { type: 'lego', prompt: 'Fill it.', target: [['0', '0'], ['4', '0'], ['4', '2'], ['0', '2']], pieces: 2, marks: 1 }] })],
    ['a stated uncertainty', (q) => ({ ...q, parts: [{ ...(q.parts[0] as Extract<PQPart, { type: 'number' }>), tolerance: { kind: 'stated', uref: '0.01' } }, q.parts[1]] })],
    ['an answer carried forward', (q) => ({ ...q, parts: [q.parts[0], { ...q.parts[1], ecf: { uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 } }] })],
    ['a part shown only sometimes', (q) => ({ ...q, parts: [q.parts[0], { ...q.parts[1], showIf: 'v > 10' }] })],
    ['a condition on the variants', (q) => ({ ...q, condition: { when: 'v > t', maxRuns: 100 } })],
    ['a rung', (q) => ({ ...q, rung: 2 })],
    ['a deeper question', (q) => ({ ...q, deeper: 'train-2' })],
    ['a list of changes to an import', (q) => ({ ...q, imported: { format: 'numbas', changes: ['PhysLab added a picture.'] } })],
    // Kinds and rules later tracks add (QV1's pictures, QZ's z-score rules) are format 2 without this file hearing of them.
    ['a picture kind format 1 does not have', (q) => ({ ...q, picture: { kind: 'dots', count: '5' } as unknown as PQQuestion['picture'] })],
    [
      'a distractor rule format 1 does not have',
      (q) => ({
        ...q,
        parts: [
          ...q.parts,
          { type: 'choice', prompt: 'P', choices: [], shuffle: true, distractors: { correct: '0.5', unit: 'none', rules: ['z-sign' as never] }, marks: 1 }
        ]
      })
    ]
  ]

  for (const [what, add] of cases) {
    it(`${what}: written as version 2, read back unchanged`, () => {
      const q = add(train())
      const t = text(q)
      expect(versionLine(t)).toBe('2')
      const back = parsePQFile(t)
      expect(back.version).toBe(2)
      expect(serializePQFile(back)).toBe(t)
    })
  }

  it('drops back to version 1 once the last format-2 field is gone', () => {
    const q = { ...train(), rung: 3 as const }
    expect(versionLine(text(q))).toBe('2')
    const { rung: _gone, ...plain } = q
    expect(versionLine(text(plain))).toBe('1')
  })

  it('reads a version-1 file that already holds a format-2 field, and saves it as version 2', () => {
    const t = text({ ...train(), rung: 4 }).replace('"version": 2', '"version": 1')
    const back = parsePQFile(t)
    expect(back.questions[0].rung).toBe(4)
    expect(versionLine(serializePQFile(back))).toBe('2')
  })
})

describe('the parser', () => {
  it('refuses format 3 in one sentence, the way 0.7.0 refused format 2', () => {
    expect(() => parsePQFile('{"app":"PhysLab","format":"pqjson","version":3,"questions":[]}')).toThrow(
      /^This question file is format 3; this PhysLab reads formats 1 and 2\.$/
    )
  })

  /** A mutated train as text: the parser sees exactly what a hand-edited file would hold. */
  const broken = (edit: (q: Record<string, unknown> & { parts: Record<string, unknown>[] }) => void): string => {
    const q = JSON.parse(JSON.stringify(train())) as Record<string, unknown> & { parts: Record<string, unknown>[] }
    edit(q)
    return JSON.stringify({ app: 'PhysLab', format: 'pqjson', version: 2, questions: [q] })
  }
  const who = "Question 'A braking train'"
  const vectorPart = { type: 'vector', prompt: 'F', answer: ['3', '4'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }

  const refusals: [string, (q: Record<string, unknown> & { parts: Record<string, unknown>[] }) => void, string][] = [
    ['a vector with one component', (q) => q.parts.push({ ...vectorPart, answer: ['3'] }), `${who} has a vector part whose answer is not two or three components.`],
    ['a vector with a stated uncertainty', (q) => q.parts.push({ ...vectorPart, tolerance: { kind: 'stated', uref: '0.1' } }), `${who} asks for a stated uncertainty on a vector part; only a number part can be marked that way.`],
    ['a vector with no tolerance', (q) => q.parts.push({ ...vectorPart, tolerance: undefined }), `${who} has a vector part that does not say how close an answer must be.`],
    ['a vector in an unknown unit', (q) => q.parts.push({ ...vectorPart, unit: 'furlong' }), `${who} uses a unit PhysLab does not know: furlong.`],
    ['a ragged matrix', (q) => q.parts.push({ type: 'matrix', prompt: 'M', answer: [['1', '2'], ['3']], tolerance: { kind: 'absolute', value: 0.1 }, marks: 1 }), `${who} has a matrix part whose answer is not rows of entries, all the same length.`],
    ['a matrix setting that is not yes or no', (q) => q.parts.push({ type: 'matrix', prompt: 'M', answer: [['1']], tolerance: { kind: 'absolute', value: 0.1 }, allowFractions: 'yes', marks: 1 }), `${who} has a matrix part with a setting that is neither yes nor no.`],
    ['roots that are not a list', (q) => q.parts.push({ type: 'roots', prompt: 'x', answer: '2, -3', unit: 'none', tolerance: { kind: 'absolute', value: 0.1 }, marks: 1 }), `${who} has a roots part whose answer is not a list of roots.`],
    ['a function part with no = sign', (q) => q.parts.push({ type: 'function', prompt: 'y', x: 'x', y: 'y', ode: "y''", initial: [], model: 'sin(x)', marks: 1 }), `${who} has a function part whose equation does not have one = sign.`],
    ['a function part naming y twice', (q) => q.parts.push({ type: 'function', prompt: 'y', x: 'y', y: 'y', ode: 'y = 0', initial: [], model: '0', marks: 1 }), `${who} has a function part that does not name its variable and its function.`],
    ['a function part with a second-derivative start', (q) => q.parts.push({ type: 'function', prompt: 'y', x: 'x', y: 'y', ode: 'y = 0', initial: [{ at: '0', order: 2, value: '1' }], model: '0', marks: 1 }), `${who} has a function part with a starting condition PhysLab cannot read.`],
    ['a function part checked on a backwards range', (q) => q.parts.push({ type: 'function', prompt: 'y', x: 'x', y: 'y', ode: 'y = 0', initial: [], model: '0', sampleRange: [2, 1], marks: 1 }), `${who} has a function part whose checking range is not two numbers, the smaller first.`],
    ['a proof worth marks', (q) => q.parts.push({ type: 'proof', prompt: 'Prove.', model: 'So.', selfCheck: [], marks: 2 }), `${who} gives a proof part 2 marks; a proof is shown, never marked, so it is worth 0.`],
    ['a proof with no model', (q) => q.parts.push({ type: 'proof', prompt: 'Prove.', model: '', selfCheck: [], marks: 0 }), `${who} has a proof part with no model proof.`],
    ['a Lego target of two corners', (q) => q.parts.push({ type: 'lego', prompt: 'Fill.', target: [['0', '0'], ['1', '0']], pieces: 2, marks: 1 }), `${who} has a Lego part whose target outline is not three or more corners.`],
    ['a Lego part with no pieces', (q) => q.parts.push({ type: 'lego', prompt: 'Fill.', target: [['0', '0'], ['1', '0'], ['0', '1']], pieces: 0, marks: 1 }), `${who} has a Lego part that does not say how many pieces it has.`],
    ['a stated number part with no reference uncertainty', (q) => (q.parts[0].tolerance = { kind: 'stated' }), `${who} has a number part marked against the student's own uncertainty, but gives no uncertainty for its own answer.`],
    ['a stated number part with a cap of 0', (q) => (q.parts[0].tolerance = { kind: 'stated', uref: '0.01', maxRelU: 0 }), `${who} has a number part whose largest accepted uncertainty is not a number above 0.`],
    ['an answer carried from a later part', (q) => (q.parts[0].ecf = { uses: [{ part: 1, variable: 'a' }], strategy: 'originalfirst', penalty: 0 }), `${who} has part 1 use the answer to part 2, which does not come before it.`],
    ['an answer carried into a name that is not a variable', (q) => (q.parts[1].ecf = { uses: [{ part: 0, variable: 'acc' }], strategy: 'originalfirst', penalty: 0 }), `${who} carries an answer into 'acc' in part 2, but 'acc' is not one of its variables.`],
    ['an unknown carry-forward strategy', (q) => (q.parts[1].ecf = { uses: [{ part: 0, variable: 'a' }], strategy: 'sometimes', penalty: 0 }), `${who} carries an answer forward into part 2 in a way PhysLab does not know: sometimes.`],
    ['a penalty above the part marks', (q) => (q.parts[1].ecf = { uses: [{ part: 0, variable: 'a' }], strategy: 'alwaysreplace', penalty: 3 }), `${who} takes 3 marks off part 2 for a carried-forward answer, which the part cannot give.`],
    ['a carry-forward that names nothing', (q) => (q.parts[1].ecf = { uses: [], strategy: 'originalfirst', penalty: 0 }), `${who} carries an earlier answer into part 2 but does not say which.`],
    ['an empty showIf', (q) => (q.parts[1].showIf = ' '), `${who} shows part 2 only under a condition, but the condition is empty.`],
    ['a condition with no number of tries', (q) => (q.condition = { when: 'v > t' }), `${who} keeps only some of its variants but does not say which: it needs a condition and a whole number of tries.`],
    ['rung 6', (q) => (q.rung = 6), `${who} is on rung 6; the rungs go from 1 to 5.`],
    ['a deeper link with no id', (q) => (q.deeper = ''), `${who} points to a deeper question but does not say which one.`],
    ['changes that are not sentences', (q) => (q.imported = { format: 'numbas', changes: [3] }), `${who} lists the changes made to it, but not as sentences.`]
  ]

  for (const [what, edit, sentence] of refusals) {
    it(`refuses ${what} in one sentence`, () => {
      expect(() => parsePQFile(broken(edit))).toThrow(sentence)
      try {
        parsePQFile(broken(edit))
      } catch (e) {
        // One sentence: a capital, one full stop at the end, and no JSON path anywhere.
        expect((e as Error).message).toBe(sentence)
        expect(sentence).not.toMatch(/\bparts\[|\.tolerance|\bundefined\b/)
      }
    })
  }

  it('accepts a proof at 0 marks, roots with no real roots, and a function part with its range', () => {
    const ok = broken((q) => {
      q.parts.push({ type: 'proof', prompt: 'Prove.', model: 'So.', selfCheck: ['I said why.'], marks: 0 })
      q.parts.push({ type: 'roots', prompt: 'x² + 1 = 0', answer: [], unit: 'none', tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 })
      q.parts.push({ type: 'function', prompt: 'y', x: 'x', y: 'y', ode: "y'' + y = 0", initial: [{ at: '0', order: 1, value: '1' }], model: 'sin(x)', sampleRange: [0.1, 1], marks: 2 })
    })
    expect(parsePQFile(ok).questions[0].parts.map((p) => p.type)).toEqual(['number', 'number', 'proof', 'roots', 'function'])
  })
})

describe('code written for format 1 meets a format-2 part', () => {
  const q: PQQuestion = {
    ...train(),
    variables: [...train().variables, { name: 'F', def: { kind: 'list', items: [10] }, unit: 'N' }],
    parts: [...train().parts, { type: 'vector', prompt: 'The push', answer: ['F', '0'], unit: 'N', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
  }

  it('tells the kinds apart', () => {
    expect(q.parts.map(isFormat1Part)).toEqual([true, true, false])
    const stated: PQPart = { ...(q.parts[0] as Extract<PQPart, { type: 'number' }>), tolerance: { kind: 'stated', uref: '0.1' } }
    expect(isFormat1Part(stated)).toBe(false)
  })

  it('renames a variable inside a vector answer, and the renamed file still reads', () => {
    const renamed = renameVariable(q, 'F', 'P')
    expect((renamed.parts[2] as Extract<PQPart, { type: 'vector' }>).answer).toEqual(['P', '0'])
    expect(parsePQFile(text({ ...renamed, variables: renamed.variables })).questions[0].parts[2]).toMatchObject({ answer: ['P', '0'] })
  })

  it('sees a vector with an empty component as not yet answered', () => {
    expect(unanswered(q.parts[2])).toBe(false)
    expect(unanswered({ ...(q.parts[2] as Extract<PQPart, { type: 'vector' }>), answer: ['F', ' '] })).toBe(true)
  })

  it('leaves a format-2 part Numbas cannot ask out of a Numbas file with a sentence, keeping the rest', () => {
    // A vector goes out as number boxes (QE3, tests/numbas2.test.ts); a Lego part has no Numbas form at all.
    const lego: PQPart = { type: 'lego', prompt: 'Fill it.', target: [['0', '0'], ['2', '0'], ['0', '2']], pieces: 2, marks: 1 }
    const exam = toExam(fileOf({ ...q, parts: [...q.parts.slice(0, 2), lego] }))
    expect(exam).toContain("PhysLab's part 3 fills a shape with Lego pieces, which Numbas cannot ask, so it is left out.")
    expect((exam.match(/"type": ?"numberentry"/g) ?? []).length).toBe(2)
  })
})

describe('renaming a variable reaches every format-2 field that names it', () => {
  type NumberPart = Extract<PQPart, { type: 'number' }>
  // k is used in ONE place only in each case, so the rename and variableInUse have nothing else to find.
  const withK = (change: (q: PQQuestion) => PQQuestion): PQQuestion =>
    change({ ...train(), variables: [...train().variables, { name: 'k', def: { kind: 'list', items: [2] } }] })
  const second = (q: PQQuestion): NumberPart => q.parts[1] as NumberPart
  const withPart = (q: PQQuestion, extra: Partial<NumberPart>): PQQuestion => ({ ...q, parts: [q.parts[0], { ...second(q), ...extra } as PQPart] })
  const reread = (q: PQQuestion): PQQuestion => parsePQFile(text(q)).questions[0]

  const cases: [string, PQQuestion, (q: PQQuestion) => unknown][] = [
    ['an answer carried forward', withK((q) => withPart(q, { ecf: { uses: [{ part: 0, variable: 'k' }], strategy: 'originalfirst', penalty: 0 } })), (q) => second(q).ecf?.uses[0].variable],
    ['the condition that shows a part', withK((q) => withPart(q, { showIf: 'k > 1' })), (q) => second(q).showIf],
    ["the variants' condition", withK((q) => ({ ...q, condition: { when: 'k > 1', maxRuns: 10 } })), (q) => q.condition?.when],
    ['a stated reference uncertainty', withK((q) => withPart(q, { tolerance: { kind: 'stated', uref: 'k/1000' } })), (q) => (second(q).tolerance as { uref: string }).uref]
  ]

  for (const [where, q, field] of cases) {
    it(`follows the new name in ${where}, and the saved file opens again`, () => {
      expect(variableInUse(q, 'k')).toBe(true)
      const renamed = renameVariable(q, 'k', 'kk')
      expect(JSON.stringify(field(renamed))).toContain('kk')
      const back = reread(renamed)
      expect(field(back)).toEqual(field(renamed))
      expect(variableInUse(back, 'kk')).toBe(true)
    })
  }

  it('reproduces the reported file: a, used in ecf, showIf and the condition, renamed to acc', () => {
    const q: PQQuestion = { ...withPart(train(), { showIf: 'a > 1', ecf: { uses: [{ part: 0, variable: 'a' }], strategy: 'originalfirst', penalty: 0 } }), condition: { when: 'a > 1', maxRuns: 5 } }
    const renamed = reread(renameVariable(q, 'a', 'acc'))
    expect(second(renamed)).toMatchObject({ showIf: 'acc > 1', ecf: { uses: [{ part: 0, variable: 'acc' }] } })
    expect(renamed.condition?.when).toBe('acc > 1')
  })
})
