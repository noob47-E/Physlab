// A teacher's damaged .pqjson is refused in ONE plain sentence when it is opened, never later.
// parsePQFile used to check only the top level of each question and part, so a hand-edited
// `"choices": [null]`, a `"traps": {}` or a steps list that was a word got through the door and
// crashed Problem Sets (or the Question Author) when the question came up, while the same damage in
// a .phys file was refused at once by core/migrate.ts. Every test here hands the parser the TEXT of
// an edited file, the way the app meets it, and expects the sentence a teacher would read.

import { describe, expect, it } from 'vitest'
import { loadBundled, loadTeacherFile } from '../src/renderer/src/questions/bank'
import { parsePQFile, serializePQFile, type PQQuestion } from '../src/renderer/src/questions/pqjson'

type Q = Record<string, unknown> & { parts: Record<string, unknown>[] }
type Edit = (q: Q) => void

/** The shipped braking-train shape: a plain, valid question every edit below starts from. */
function train(): PQQuestion {
  return {
    id: 'train',
    title: 'A braking train',
    statement: 'A train moving at {v} m/s brakes to rest in {t} s.',
    variables: [
      { name: 'v', def: { kind: 'list', items: [24] }, unit: 'm/s' },
      { name: 't', def: { kind: 'list', items: [8] }, unit: 's' }
    ],
    parts: [{ type: 'number', prompt: 'Its acceleration', answer: '-v/t', unit: 'm/s²', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }],
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  }
}

/** A mutated train as text: the parser sees exactly what a hand-edited file would hold. */
const broken = (edit: Edit): string => {
  const q = JSON.parse(JSON.stringify(train())) as Q
  edit(q)
  return JSON.stringify({ app: 'PhysLab', format: 'pqjson', version: 2, questions: [q] })
}

const who = "Question 'A braking train'"
/** Replaces the question's parts with this one, so it is part 1 in the sentence. */
const onlyPart =
  (part: Record<string, unknown>): Edit =>
  (q) => {
    q.parts = [part]
  }
const choice = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'choice',
  prompt: 'Which is right?',
  choices: [
    { text: 'A', correct: true },
    { text: 'B', correct: false }
  ],
  shuffle: false,
  marks: 1,
  ...extra
})
const expression = (symbols: unknown): Record<string, unknown> => ({ type: 'expression', prompt: 'Write it.', answer: 'x^2', symbols, marks: 1 })
const withNumberPart = (extra: Record<string, unknown>): Edit => (q) => Object.assign(q.parts[0], extra)
const set = (field: string, value: unknown): Edit => (q) => {
  q[field] = value
}

const BAD_OPTION = `${who} has an option in part 1 that PhysLab cannot read: each option is a sentence marked right or wrong, and may say why.`
const NONE_RIGHT = `${who} has no option marked right in part 1.`
const NO_ANSWER = `${who} lets PhysLab make up the options in part 1 but does not give the right answer to make them from.`
const NO_KINDS = `${who} lets PhysLab make up the options in part 1 but does not list the kinds of wrong option to make.`
const BAD_TRAPS = `${who} lists the common mistakes in part 1 in a way PhysLab cannot read: each is a wrong value and a sentence saying why.`
const BAD_STEPS = `${who} has steps PhysLab cannot read: they are a level and a list of steps.`
const BAD_STEP = `${who} has a step PhysLab cannot read: the steps are a list, and each has a sentence to say.`
const BAD_MOTION = `${who} has a motion PhysLab cannot read: it is a list of stretches, each with a duration, and the graphs to draw.`
const BAD_SANDBOX = `${who} has a Sandbox scene PhysLab cannot read: it names a preset, and each push names a body and gives a force in three parts.`
const BAD_TAGS = `${who} lists its tags in a way PhysLab cannot read: they are a list of words.`
const BAD_RANGE = `${who} has a checking range in part 1 that is not two numbers, the smaller first.`
const BAD_WRITERS = `${who} lists the people who wrote it in a way PhysLab cannot read: they are a list of names.`
const badPicture = (kind: string): string => `${who} has a ${kind} picture that is missing something PhysLab needs to draw it.`
const badSymbol = (s: string): string => `${who} lets a student use '${s}' in part 1; a name is a letter, then letters, digits or underscores.`
const usedSymbol = (s: string): string => `${who} lets a student use '${s}' in part 1, but that already means something in maths.`

const refusals: [string, Edit, string][] = [
  // --- Q12: choice parts whose options are not options ---------------------------------------
  ['a choice whose only option is null', onlyPart(choice({ choices: [null] })), BAD_OPTION],
  ['options written as bare words', onlyPart(choice({ choices: ['Paris', 'London'] })), BAD_OPTION],
  ['an option with no right-or-wrong mark', onlyPart(choice({ choices: [{ text: 'A' }, { text: 'B', correct: true }] })), BAD_OPTION],
  ['an option whose mark is the word yes', onlyPart(choice({ choices: [{ text: 'A', correct: 'yes' }] })), BAD_OPTION],
  ['an option whose text is a number', onlyPart(choice({ choices: [{ text: 5, correct: true }] })), BAD_OPTION],
  ['an option whose reason is a number', onlyPart(choice({ choices: [{ text: 'A', correct: true, why: 5 }] })), BAD_OPTION],
  ['options written out with none marked right', onlyPart(choice({ choices: [{ text: 'A', correct: false }, { text: 'B', correct: false }] })), NONE_RIGHT],
  ['no options at all and none made up', onlyPart(choice({ choices: [] })), NONE_RIGHT],
  ['a bad option in a choice that also makes up its options', onlyPart(choice({ choices: [null], distractors: { correct: 'v', unit: 'none', rules: ['sign'] } })), BAD_OPTION],

  // --- Q13: made-up options without what they are made from ---------------------------------
  ['made-up options with only a unit', onlyPart(choice({ choices: [], distractors: { unit: 'm' } })), NO_ANSWER],
  ['made-up options whose right answer is a number', onlyPart(choice({ choices: [], distractors: { correct: 5, unit: 'm', rules: [] } })), NO_ANSWER],
  ['made-up options that are not a group of settings', onlyPart(choice({ choices: [], distractors: 'yes' })), NO_ANSWER],
  ['made-up options with no list of wrong kinds', onlyPart(choice({ choices: [], distractors: { correct: 'v*t', unit: 'm' } })), NO_KINDS],
  ['made-up options whose wrong kinds are numbers', onlyPart(choice({ choices: [], distractors: { correct: 'v*t', unit: 'm', rules: [1, 2] } })), NO_KINDS],

  // --- Q15: the optional fields of a part ---------------------------------------------------
  ['common mistakes written as a group, not a list', withNumberPart({ traps: {} }), BAD_TRAPS],
  ['common mistakes written as one word', withNumberPart({ traps: 'v' }), BAD_TRAPS],
  ['a common mistake with no reason', withNumberPart({ traps: [{ value: 'v*t' }] }), BAD_TRAPS],
  ['a common mistake whose wrong value is a number', withNumberPart({ traps: [{ value: 5, why: 'You added.' }] }), BAD_TRAPS],

  // --- Q15: steps ----------------------------------------------------------------------------
  ['steps written as one word', set('steps', 'worked'), BAD_STEPS],
  ['steps that are a list with no level', set('steps', [{ head: 'Use v = u + at' }]), BAD_STEPS],
  ['steps at a level that does not exist', set('steps', { level: 'expert', items: [{ head: 'Use v = u + at' }] }), `${who} gives its steps a level PhysLab does not know: expert; the levels are worked, half and solo.`],
  ['steps with no level at all', set('steps', { items: [{ head: 'Use v = u + at' }] }), `${who} does not say whether its steps are worked, half or solo.`],
  ['steps whose items are a word, not a list', set('steps', { level: 'worked', items: 'x' }), BAD_STEP],
  ['a step with no sentence', set('steps', { level: 'worked', items: [{ tex: 'x' }] }), BAD_STEP],
  ['a step whose maths is a number', set('steps', { level: 'worked', items: [{ head: 'Do it', tex: 5 }] }), BAD_STEP],
  ['an engine step with no job', set('steps', { level: 'worked', items: [{ head: 'Do it', auto: { engine: 'pure', input: 'x' } }] }), BAD_STEP],
  ['an engine step from an engine PhysLab does not have', set('steps', { level: 'worked', items: [{ head: 'Do it', auto: { engine: 'cas', job: 'x', input: 'x' } }] }), BAD_STEP],
  ['a vector step whose arguments are not a list', set('steps', { level: 'worked', items: [{ head: 'Do it', auto: { engine: 'vectors', solver: 'add', args: '1,2' } }] }), BAD_STEP],

  // --- Q15: pictures, by kind ----------------------------------------------------------------
  ['a picture of a kind PhysLab does not know', set('picture', { kind: 'blob' }), `${who} has a picture of a kind PhysLab does not know: blob.`],
  ['a picture with no kind', set('picture', { expr: 'x' }), `${who} has a picture that does not say what kind it is.`],
  ['a picture that is a word', set('picture', 'curve'), `${who} has a picture that does not say what kind it is.`],
  ['a curve whose formula is a number', set('picture', { kind: 'curve', expr: 5 }), badPicture('curve')],
  ['a piecewise picture with no pieces', set('picture', { kind: 'piecewise' }), badPicture('piecewise')],
  ['a shaded region with no lower curve', set('picture', { kind: 'between', upper: 'x', from: '0', to: '1' }), badPicture('between')],
  ['a tangent with no place', set('picture', { kind: 'tangent', expr: 'x^2' }), badPicture('tangent')],
  ['a normal curve with no spread', set('picture', { kind: 'normal', mean: '0' }), badPicture('normal')],
  ['an arrow whose parts are one word', set('picture', { kind: 'vectors', items: [{ name: 'F', v: '3,4' }] }), badPicture('vectors')],
  ['dots counted per row as a word', set('picture', { kind: 'dots', count: '12', perRow: '4' }), badPicture('dots')],
  ['compared curves with no label', set('picture', { kind: 'curves', items: [{ expr: 'x' }] }), badPicture('curves')],
  ['a number line mark with no value', set('picture', { kind: 'numberline', items: [{ label: 'a' }] }), badPicture('numberline')],

  // --- Q15: motion ---------------------------------------------------------------------------
  ['a motion with no stretches', set('motion', { plots: ['x-t'] }), BAD_MOTION],
  ['a motion whose stretches are a word', set('motion', { segments: 'rest', plots: ['x-t'] }), BAD_MOTION],
  ['a stretch of a kind PhysLab does not know', set('motion', { segments: [{ kind: 'jump', duration: '1' }], plots: ['x-t'] }), BAD_MOTION],
  ['a stretch whose duration is a number', set('motion', { segments: [{ kind: 'rest', duration: 1 }], plots: ['x-t'] }), BAD_MOTION],
  ['a steady stretch with no speed', set('motion', { segments: [{ kind: 'uniform', duration: '1' }], plots: ['x-t'] }), BAD_MOTION],
  ['a motion drawing a graph that does not exist', set('motion', { segments: [{ kind: 'rest', duration: '1' }], plots: ['speed'] }), BAD_MOTION],
  ['a motion that starts at a number, not a formula', set('motion', { x0: 0, segments: [{ kind: 'rest', duration: '1' }], plots: ['x-t'] }), BAD_MOTION],

  // --- Q15: the Sandbox scene ----------------------------------------------------------------
  // Q7: a force written with only x and y, the shape that came through to the player's `force[2]` as nothing.
  ['a push with a force of two parts (Q7)', set('sandbox', { preset: 'crate', actuators: [{ body: 'crate', force: ['10', '0'] }] }), BAD_SANDBOX],
  ['a push with a force of one part', set('sandbox', { preset: 'crate', actuators: [{ body: 'crate', force: ['10'] }] }), BAD_SANDBOX],
  ['a push with a force of four parts', set('sandbox', { preset: 'crate', actuators: [{ body: 'crate', force: ['5', '0', '0', '0'] }] }), BAD_SANDBOX],
  ['a push with no body', set('sandbox', { preset: 'crate', actuators: [{ force: ['5', '0', '0'] }] }), BAD_SANDBOX],
  ['a scene whose preset is a number', set('sandbox', { preset: 3, actuators: [] }), BAD_SANDBOX],
  ['a scene whose pushes are a word', set('sandbox', { preset: 'crate', actuators: 'push' }), BAD_SANDBOX],
  ['a scene whose recorded body is a number', set('sandbox', { preset: 'crate', actuators: [], record: 3 }), BAD_SANDBOX],

  // --- Q15: tags -----------------------------------------------------------------------------
  ['tags written as one word', set('tags', 'physics'), BAD_TAGS],
  ['tags with a number among them', set('tags', ['motion', 5]), BAD_TAGS],

  // --- Q14, the validation side: the letters a student may use -------------------------------
  ['a Greek letter among the letters a student may use', onlyPart(expression(['θ'])), badSymbol('θ')],
  ['a letter that starts with a digit', onlyPart(expression(['2x'])), badSymbol('2x')],
  ['a letter with a space in it', onlyPart(expression(['x y'])), badSymbol('x y')],
  ['a letter that is a function of maths', onlyPart(expression(['x', 'sin'])), usedSymbol('sin')],
  ['a letter that is Euler’s number', onlyPart(expression(['e'])), usedSymbol('e')],
  ['a letter that maths owns without listing it as reserved', onlyPart(expression(['phi'])), usedSymbol('phi')],

  // --- Q15: an expression part's checking range, read by neither parser -----------------------
  // The letters are sampled across it: one number or a group marked the exact answer wrong, and a
  // range of one point marked x³ right for x².
  ['an expression part checked across one number', onlyPart({ ...expression(['x']), sampleRange: 5 }), BAD_RANGE],
  ['an expression part checked across a word', onlyPart({ ...expression(['x']), sampleRange: '1,2' }), BAD_RANGE],
  ['an expression part checked across a group', onlyPart({ ...expression(['x']), sampleRange: {} }), BAD_RANGE],
  ['an expression part checked across one end only', onlyPart({ ...expression(['x']), sampleRange: [1] }), BAD_RANGE],
  ['an expression part checked at a single point', onlyPart({ ...expression(['x']), sampleRange: [0, 0] }), BAD_RANGE],
  ['an expression part checked up to a word', onlyPart({ ...expression(['x']), sampleRange: [1, 'a'] }), BAD_RANGE],

  // --- Q15: who wrote an imported question (Save for Numbas lists them: `.filter`, `n.trim()`) -----
  ['the people who wrote it given as one name', set('imported', { format: 'numbas', contributors: 'Clodagh Carroll' }), BAD_WRITERS],
  ['the people who wrote it with a number among them', set('imported', { format: 'numbas', contributors: [5] }), BAD_WRITERS],

  // --- A unit left out is said to be missing, never quoted back as "undefined" ------------------
  ['made-up options with no unit', onlyPart(choice({ choices: [], distractors: { correct: 'v', rules: ['sign'] } })), `${who} lets PhysLab make up the options in part 1 but does not give their unit.`],
  ['a number part with no unit', withNumberPart({ unit: undefined }), `${who} has a number part with no unit.`],
  ['a vector part with no unit', onlyPart({ type: 'vector', prompt: 'p', answer: ['1', '2'], tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }), `${who} has a vector part with no unit.`],
  ['a roots part with no unit', onlyPart({ type: 'roots', prompt: 'p', answer: ['1'], tolerance: { kind: 'absolute', value: 0.01 }, marks: 1 }), `${who} has a roots part with no unit.`]
]

describe('a damaged question file is refused when it is opened', () => {
  for (const [what, edit, sentence] of refusals) {
    it(`refuses ${what} in one sentence naming the question`, () => {
      expect(() => parsePQFile(broken(edit))).toThrow(sentence)
      try {
        parsePQFile(broken(edit))
      } catch (e) {
        // One sentence: exactly the one written above, with no JSON path, no field dump, no "undefined".
        expect((e as Error).message).toBe(sentence)
        expect(sentence).not.toMatch(/\bparts\[|\.tolerance|\bundefined\b|\bnull\b|\[object/)
      }
    })
  }

  it('is refused at the door a teacher uses (Open a question file), not later in Problem Sets', () => {
    expect(() => loadTeacherFile(broken(onlyPart(choice({ choices: [null] }))), 'cities.pqjson')).toThrow(BAD_OPTION)
    expect(() => loadTeacherFile(broken(onlyPart(choice({ choices: [], distractors: { unit: 'm' } }))), 'cities.pqjson')).toThrow(NO_ANSWER)
    expect(() => loadTeacherFile(broken(withNumberPart({ traps: {} })), 'cities.pqjson')).toThrow(BAD_TRAPS)
    expect(() => loadTeacherFile(broken(set('steps', { level: 'worked', items: 'x' })), 'cities.pqjson')).toThrow(BAD_STEP)
  })

  it('names the part by its place when a later part is the damaged one', () => {
    const edit: Edit = (q) => q.parts.push(choice({ choices: [null] }))
    expect(() => parsePQFile(broken(edit))).toThrow(`${who} has an option in part 2 that PhysLab cannot read: each option is a sentence marked right or wrong, and may say why.`)
  })
})

describe('what the app itself writes still opens', () => {
  const opens = (edit: Edit): PQQuestion => parsePQFile(broken(edit)).questions[0]

  it('every bundled question file loads, the sample crate with its made-up options included', () => {
    expect(loadBundled().questions.length).toBeGreaterThan(50)
    // The shape that stopped the first attempt: made-up options carry an empty list of written ones.
    const crate = loadBundled().questions.find((q) => q.parts.some((p) => p.type === 'choice' && p.distractors !== undefined && p.choices.length === 0))
    expect(crate).toBeDefined()
  })

  it('a choice with its options written out, one or several right, and a reason on some', () => {
    expect(opens(onlyPart(choice())).parts).toHaveLength(1)
    expect(opens(onlyPart(choice({ choices: [{ text: 'A', correct: true, why: 'Because.' }, { text: 'B', correct: true }] }))).parts).toHaveLength(1)
  })

  it('a choice that makes up its options needs no written ones, whatever they say', () => {
    const made = { correct: 'v*t', unit: 'm', rules: ['sign', 'reciprocal'] }
    expect(opens(onlyPart(choice({ choices: [], distractors: made }))).parts).toHaveLength(1)
    // The written options are ignored when the options are made up, so none of them has to be right.
    expect(opens(onlyPart(choice({ choices: [{ text: 'A', correct: false }], distractors: made }))).parts).toHaveLength(1)
    // An author who has not ticked a wrong kind yet is unfinished, not damaged.
    expect(opens(onlyPart(choice({ choices: [], distractors: { correct: 'v*t', unit: 'm', rules: [] } }))).parts).toHaveLength(1)
  })

  it('a made-up choice in a unit PhysLab does not know is still refused in the old unit sentence', () => {
    expect(() => parsePQFile(broken(onlyPart(choice({ choices: [], distractors: { correct: 'v', unit: 'furlong', rules: [] } }))))).toThrow(`${who} uses a unit PhysLab does not know: furlong.`)
  })

  it('common mistakes, a list of a wrong value and why', () => {
    expect(opens(withNumberPart({ traps: [{ value: 'v*2', why: 'You doubled it.' }] })).parts[0]).toMatchObject({ traps: [{ value: 'v*2' }] })
    expect(opens(withNumberPart({ traps: [] })).parts).toHaveLength(1)
  })

  it('worked steps at each level, with engine steps of both kinds', () => {
    for (const level of ['worked', 'half', 'solo']) {
      const items = [
        { head: 'Use v = u + at', tex: 'v = u + at', rule: 'Equation of motion', note: 'Take care with signs.', blank: true },
        { head: 'Differentiate', auto: { engine: 'pure', job: 'derive', input: 'x^2' } },
        { head: 'Add the arrows', auto: { engine: 'vectors', solver: 'add', args: ['1', '2'] } }
      ]
      expect(opens(set('steps', { level, items })).steps?.level).toBe(level)
    }
    expect(opens(set('steps', { level: 'solo', items: [] })).steps?.items).toEqual([])
  })

  it('a picture of each kind', () => {
    const pictures: Record<string, unknown>[] = [
      { kind: 'curve', expr: 'x^2', xMin: '-2', xMax: '2' },
      { kind: 'curve', expr: 'x^2' },
      { kind: 'piecewise', pieces: [{ expr: 'x', from: '0', to: '1' }, { expr: '1', from: '1', to: '2' }] },
      { kind: 'between', upper: 'x', lower: 'x^2', from: '0', to: '1', label: 'A' },
      { kind: 'tangent', expr: 'x^2', at: '1' },
      { kind: 'normal', mean: '0', sd: '1', from: '-1' },
      { kind: 'vectors', items: [{ name: 'F', v: ['3', '4'], tail: ['0', '0'], role: 'input' }, { name: 'R', v: ['1', '2', '3'], role: 'result' }] },
      { kind: 'dots', count: '12', perRow: 4 },
      { kind: 'curves', items: [{ expr: 'x', label: 'Train A', from: '0', to: '2' }] },
      { kind: 'numberline', items: [{ label: 'a', value: '3' }, { label: '', value: '4' }] }
    ]
    for (const picture of pictures) expect(opens(set('picture', picture)).picture).toMatchObject({ kind: picture.kind })
  })

  it('a motion with every kind of stretch and every graph', () => {
    const motion = {
      x0: '0',
      v0: 'v',
      segments: [
        { kind: 'rest', duration: '1' },
        { kind: 'uniform', duration: '2', v: '3' },
        { kind: 'accelerate', duration: 't', a: '-v/t' }
      ],
      plots: ['x-t', 'v-t', 'a-t'],
      sampleEvery: '0.5'
    }
    expect(opens(set('motion', motion)).motion?.segments).toHaveLength(3)
  })

  it('a Sandbox scene with pushes of three parts, and none at all', () => {
    const scene = { preset: 'crate', actuators: [{ body: 'crate', force: ['5', '0', '0'], from: '0', until: '2' }], record: 'crate' }
    expect(opens(set('sandbox', scene)).sandbox?.actuators).toHaveLength(1)
    expect(opens(set('sandbox', { preset: 'crate', actuators: [] })).sandbox?.actuators).toEqual([])
  })

  it('a Sandbox scene that names only its preset is the experiment with no pushes, never a hole the player maps over', () => {
    // tests/questionPictures.test.ts holds a teacher's file of exactly this shape; sandboxPlan reads `actuators.map`.
    expect(opens(set('sandbox', { preset: 'friction' })).sandbox).toEqual({ preset: 'friction', actuators: [] })
    // Said and wrong is still wrong: an empty list is filled in only where there was no list.
    expect(() => parsePQFile(broken(set('sandbox', { preset: 'friction', actuators: null })))).toThrow(BAD_SANDBOX)
  })

  it('tags that are words', () => {
    expect(opens(set('tags', ['motion', 'graphs'])).tags).toEqual(['motion', 'graphs'])
  })

  it('letters a student may use: single letters, short names, digits and underscores', () => {
    expect(opens(onlyPart(expression(['x', 'y', 't_1', 'theta', 'F2']))).parts).toHaveLength(1)
  })

  it('an expression part checked across a range of two numbers, the smaller first, as the bundled sample is', () => {
    expect(opens(onlyPart({ ...expression(['x']), sampleRange: [0, 3] })).parts[0]).toMatchObject({ sampleRange: [0, 3] })
    expect(opens(onlyPart({ ...expression(['x']), sampleRange: [-2, 0.5] })).parts).toHaveLength(1)
  })

  it('the people who wrote an imported question: a list of names, or none', () => {
    const imported = { format: 'numbas', contributors: ['Clodagh Carroll', 'Bill Foster'], itemUrl: 'https://numbas.mathcentre.ac.uk/question/7864/' }
    expect(opens(set('imported', imported)).imported).toEqual(imported)
    expect(opens(set('imported', { format: 'numbas', contributors: [] })).imported?.contributors).toEqual([])
    expect(opens(set('imported', { format: 'numbas' })).imported?.contributors).toBeUndefined()
  })

  it('a question written, saved and read back keeps all of these', () => {
    const q = train()
    q.picture = { kind: 'curve', expr: 'x^2' }
    q.tags = ['motion']
    const back = parsePQFile(serializePQFile({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [q] }))
    expect(back.questions[0]).toEqual(q)
  })
})
