// Question Author: a teacher's question set travels in the .phys file (format 5), is exported as
// a .pqjson the Practice panel plays, and is never thrown away by the crash-recovery check. Every
// test crosses a boundary: a file into migrate, the store into a file, a file into the player.

import { describe, expect, it, vi } from 'vitest'
import { FILE_VERSION, migrate, parseSceneFile } from '../src/renderer/src/core/migrate'
import { blankSceneFile, scene } from '../src/renderer/src/core/store'
import { describeWork, hasWork } from '../src/renderer/src/app/autosave'
import { produce } from 'immer'
import { newQuestion, readWrittenHere, rememberWrittenHere, typedField, useAuthor } from '../src/renderer/src/questions/authorStore'
import { loadBundled, loadTeacherFile } from '../src/renderer/src/questions/bank'
import { serializePQFile, UNIT_IDS, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { toExam } from '../src/renderer/src/questions/numbas'
import { isCorrect } from '../src/renderer/src/math/checkAnswer'
import {
  blankPart,
  blocksStatement,
  broughtInFrom,
  changeLicence,
  changePartType,
  chipPieces,
  chipKatex,
  chipTex,
  exportName,
  formulaLatex,
  joinImported,
  nameProblem,
  nextVariableName,
  numberListText,
  parseLetters,
  parseNumberList,
  piecesText,
  previewAutoStep,
  previewRows,
  pureInputFromLatex,
  pureInputLatex,
  questionFile,
  questionProblems,
  readFormula,
  renameChips,
  renameVariable,
  solverLabel,
  statementBlocks,
  suggestAutoStep,
  texForEditor,
  texFromEditor,
  textPieces,
  textPiecesText,
  UNIT_GROUPS,
  variableInUse,
  writtenHereIds
} from '../src/renderer/src/questions/authoring'
import { evaluateInVariables } from '../src/renderer/src/questions/parts'
import { checkPlayedPart, playQuestion } from '../src/renderer/src/questions/player'
import { stepsToWorking } from '../src/renderer/src/questions/steps'
import { drawVariables } from '../src/renderer/src/questions/variables'
import type { MeasureSettings } from '../src/renderer/src/math/format'

/** The bundled braking train: a complete question with a licence, variables, a part and steps. */
const train = (): PQQuestion => structuredClone(loadBundled().questions.find((q) => q.id === 'physlab-sample-braking-train')!)

/** A format-4 file as 0.9 wrote it before Question Author: no question set. */
const v4 = () => ({ app: 'PhysLab', version: 4, objects: [], settings: {} })

describe('format 5: the question set in a .phys file', () => {
  it('steps a format-4 file up to format 5 and changes nothing else', () => {
    const raw = v4()
    const out = migrate(raw)
    expect(FILE_VERSION).toBe(5)
    expect(out.version).toBe(5)
    expect({ ...out, version: 4 }).toEqual(raw)
    expect(raw.version).toBe(4)
    expect(out.questions).toBeUndefined()
  })

  it('keeps a question through the step, and a half-written one too', () => {
    const half: PQQuestion = { ...train(), id: 'half', title: 'Still writing', parts: [], variables: [{ name: 'u', def: { kind: 'range', from: 5, to: 1, step: 0 } }] }
    const out = parseSceneFile(JSON.stringify({ ...v4(), questions: [train(), half] }))
    expect(out.version).toBe(5)
    expect(out.questions).toEqual([train(), half])
    // An empty holder is a teacher who has not typed a name yet, not a damaged file.
    const unnamed = { ...train(), license: { id: 'CC BY 4.0', holder: '' } }
    expect(parseSceneFile(JSON.stringify({ ...v4(), version: 5, questions: [unnamed] })).questions![0].license.holder).toBe('')
  })

  it('refuses a question with no licence, or one PhysLab may not use, whatever the format', () => {
    const { license: _l, ...bare } = train()
    for (const version of [4, 5]) {
      expect(() => parseSceneFile(JSON.stringify({ ...v4(), version, questions: [bare] }))).toThrow(
        "Question 'A braking train' in this file says nothing about its licence, so PhysLab cannot use it."
      )
    }
    const nc = { ...train(), license: { id: 'CC BY-NC 4.0', holder: 'Someone' } }
    expect(() => parseSceneFile(JSON.stringify({ ...v4(), version: 5, questions: [nc] }))).toThrow("is licensed 'CC BY-NC 4.0', which PhysLab may not use.")
  })

  it('refuses a question the Author panel could not draw, naming it', () => {
    const damaged = [
      { ...train(), parts: 'none' },
      { ...train(), variables: [{ name: 'u' }] },
      { ...train(), steps: { level: 'worked', items: [{ tex: 'x' }] } },
      // One level further down: what a variable's row and a part's card read on their first render.
      { ...train(), variables: [{ name: 'u', def: { kind: 'list' } }] },
      { ...train(), variables: [{ name: 'u', def: { kind: 'range', from: 1, to: '9', step: 1 } }] },
      { ...train(), variables: [{ name: 'u', def: { kind: 'expr' } }] },
      { ...train(), variables: [{ name: 'u', def: { kind: 'dice' } }] },
      { ...train(), parts: [{ type: 'number', prompt: 'How far?', answer: 'u', unit: 'm', marks: 1 }] },
      { ...train(), parts: [{ type: 'number', prompt: 'How far?', answer: 'u', unit: 'm', tolerance: { kind: 'relative' }, marks: 1 }] },
      { ...train(), parts: [{ type: 'expression', prompt: 'Write it.', answer: 'x', marks: 1 }] },
      { ...train(), parts: [{ type: 'choice', prompt: 'Pick one.', choices: [{ text: 'A' }], shuffle: false, marks: 1 }] },
      { ...train(), parts: [{ type: 'essay', prompt: 'Say why.', marks: 1 }] }
    ]
    for (const q of damaged) {
      expect(() => parseSceneFile(JSON.stringify({ ...v4(), version: 5, questions: [q] }))).toThrow("Question 'A braking train' in this file is damaged.")
    }
    expect(() => parseSceneFile(JSON.stringify({ ...v4(), version: 5, questions: {} }))).toThrow('The question set in this file is damaged.')
    // Every part the panel starts, of each type, still opens.
    for (const t of ['number', 'expression', 'choice'] as const) {
      const q = { ...newQuestion('Ms Khan'), parts: [changePartType(blankPart(), t)] }
      expect(parseSceneFile(JSON.stringify({ ...v4(), version: 5, questions: [q] })).questions).toEqual([q])
    }
  })
})

describe('the question set is saved with the project', () => {
  it('goes into the file, comes back out, and File ▸ New clears it', () => {
    scene().newScene()
    expect(scene().serialize().questions).toBeUndefined()
    useAuthor.getState().add(train())
    expect(scene().dirty).toBe(true)
    const text = JSON.stringify(scene().serialize())
    scene().newScene()
    expect(useAuthor.getState().questions).toEqual([])
    scene().loadScene(parseSceneFile(text))
    expect(useAuthor.getState().questions).toEqual([train()])
    expect(scene().dirty).toBe(false)
    // Moving between questions is not a change to the project.
    useAuthor.getState().select(0)
    expect(scene().dirty).toBe(false)
    useAuthor.getState().edit((q) => {
      q.title = 'A braking lorry'
    })
    expect(scene().dirty).toBe(true)
    expect(scene().serialize().questions![0].title).toBe('A braking lorry')
    scene().newScene()
  })

  it('undoes a removed part, marks the project changed, and redoes it; a file opened starts afresh', () => {
    scene().newScene()
    const two: PQQuestion = { ...train(), parts: [train().parts[0], { ...train().parts[0], prompt: 'And the second?' }] }
    scene().loadScene(parseSceneFile(JSON.stringify({ ...v4(), version: 5, questions: [two] })))
    expect(scene().dirty).toBe(false)
    expect(useAuthor.getState().past).toEqual([])
    useAuthor.getState().edit((d) => void d.parts.splice(0, 1))
    expect(useAuthor.getState().questions[0].parts).toHaveLength(1)
    scene().markSaved('A braking train.phys')
    expect(scene().dirty).toBe(false)
    useAuthor.getState().undo()
    expect(useAuthor.getState().questions[0].parts).toEqual(two.parts)
    expect(scene().dirty).toBe(true)
    useAuthor.getState().redo()
    expect(useAuthor.getState().questions[0].parts.map((p) => p.prompt)).toEqual(['And the second?'])
    // Removing a question comes back too, with the teacher where they were.
    useAuthor.getState().add(newQuestion('Ms Khan'))
    useAuthor.getState().remove(0)
    useAuthor.getState().undo()
    expect(useAuthor.getState().questions).toHaveLength(2)
    expect(useAuthor.getState().current).toBe(1)
    scene().newScene()
    expect(useAuthor.getState().past).toEqual([])
    expect(useAuthor.getState().future).toEqual([])
  })

  it('folds typing into one field into one undo step, but not a button pressed or another field typed straight after', () => {
    scene().newScene()
    useAuthor.getState().setQuestions([train()])
    const title = train().title
    const edit = useAuthor.getState().edit
    // Typing a title letter by letter is one step; Ctrl+Z gives back the title as it was, which
    // the Title box (controlled, not keyed on the question alone) then shows and Save writes.
    for (const t of ['A', 'A l', 'A lorry']) edit((d) => void (d.title = t))
    expect(useAuthor.getState().past).toHaveLength(1)
    // Straight after: another field typed into, then a part added by a button, are steps of their own.
    edit((d) => void (d.license.holder = 'Ms Khan'))
    edit((d) => void d.parts.push(structuredClone(train().parts[0])))
    expect(useAuthor.getState().past).toHaveLength(3)
    useAuthor.getState().undo()
    expect(useAuthor.getState().questions[0].parts).toHaveLength(train().parts.length)
    expect(useAuthor.getState().questions[0].license.holder).toBe('Ms Khan')
    useAuthor.getState().undo()
    expect(useAuthor.getState().questions[0].license.holder).toBe(train().license.holder)
    expect(useAuthor.getState().questions[0].title).toBe('A lorry')
    useAuthor.getState().undo()
    expect(useAuthor.getState().questions[0].title).toBe(title)
    expect(scene().serialize().questions![0].title).toBe(title)
    scene().newScene()
  })

  it('names the one text field an edit changed, and nothing for a structural change', () => {
    const q = train()
    expect(typedField(q, produce(q, (d) => void (d.parts[0].prompt = 'How far?')), q.id)).toBe(`${q.id}/parts/0/prompt`)
    expect(typedField(q, produce(q, (d) => void d.parts.pop()), q.id)).toBeNull()
    expect(typedField(q, produce(q, (d) => void ((d.title = 'x'), (d.license.holder = 'y'))), q.id)).toBeNull()
  })

  it('counts as work for crash recovery, even one question only just started', () => {
    const blank = blankSceneFile()
    expect(hasWork({ ...blank, questions: [] })).toBe(false)
    expect(hasWork({ ...blank, questions: [newQuestion('Ms Khan')] })).toBe(true)
    expect(hasWork({ ...blank, questions: [train()] })).toBe(true)
    expect(describeWork({ ...blank, questions: [train(), newQuestion('')] })).toBe('2 questions in Question Author')
  })

  it('starts a new question under CC BY 4.0 with the teacher as holder', () => {
    const q = newQuestion('Ms Khan')
    expect(q.license).toEqual({ id: 'CC BY 4.0', holder: 'Ms Khan' })
    expect(q.parts[0]).toMatchObject({ type: 'number', tolerance: { kind: 'relative', value: 0.02 } })
  })
})

const SETTINGS = { decimals: 2, precisionMode: 'dp' } as MeasureSettings

/** FIG. 5 of the design: u a range, t a range that can be 0, a worked out from both. */
const fig5 = (): PQQuestion => ({
  ...newQuestion('Ms Khan'),
  title: 'Slowing down',
  statement: 'A car slows from {u} to rest in {t}.',
  variables: [
    { name: 'u', def: { kind: 'range', from: 10, to: 30, step: 2 }, unit: 'm/s' },
    { name: 't', def: { kind: 'range', from: 0, to: 10, step: 1 }, unit: 's' },
    { name: 'a', def: { kind: 'expr', expr: '(0 - u) / t' }, unit: 'm/s²' }
  ],
  parts: [{ type: 'number', prompt: 'Find its acceleration.', answer: 'a', unit: 'm/s²', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }]
})

describe('chips: the teacher never types a brace', () => {
  it('splits a sentence into words and chips and joins it back unchanged', () => {
    const text = 'A train moving at {v} stops {t} later.'
    expect(chipPieces(text)).toEqual([{ text: 'A train moving at ' }, { chip: 'v' }, { text: ' stops ' }, { chip: 't' }, { text: ' later.' }])
    expect(piecesText(chipPieces(text))).toBe(text)
    for (const q of loadBundled().questions) expect(piecesText(chipPieces(q.statement))).toBe(q.statement)
    expect(renameChips(text, 'v', 'u')).toBe('A train moving at {u} stops {t} later.')
  })

  it('reads a formula built in the maths field, letters side by side as a product', () => {
    const r = readFormula('\\frac{u^2}{2a}', ['u', 'a'])
    expect(r.problem).toBeUndefined()
    expect(evaluateInVariables(r.expr!, { u: 24, a: 3 })).toBeCloseTo(96, 12)
    expect(evaluateInVariables(readFormula('\\frac{1}{2}vt', ['v', 't']).expr!, { v: 24, t: 8 })).toBeCloseTo(96, 12)
    expect(readFormula('\\sin x+k', ['k'], ['x']).problem).toBeUndefined()
    expect(readFormula('u+q', ['u'])).toEqual({ problem: 'There is no variable called q.' })
    expect(readFormula('', ['u'])).toEqual({ expr: '' })
    expect(readFormula('3\\pm u', ['u']).problem).toMatch(/Choose \+ or −/)
  })

  it('shows every bundled answer in the maths field and reads it back to the same numbers', () => {
    for (const q of loadBundled().questions) {
      const names = q.variables.map((v) => v.name)
      const values = drawVariables(q, 3).values
      for (const p of q.parts) {
        if (p.type !== 'number') continue
        const back = readFormula(formulaLatex(p.answer, names), names)
        expect(back.problem, `${q.title}: ${p.answer}`).toBeUndefined()
        expect(evaluateInVariables(back.expr!, values)).toBeCloseTo(evaluateInVariables(p.answer, values), 9)
      }
    }
  })

  it('draws a chip in a step as a framed letter and a typed letter stays a letter', () => {
    for (const q of loadBundled().questions) {
      const names = q.variables.map((v) => v.name)
      for (const st of q.steps?.items ?? []) for (const tex of [st.tex, st.rule]) if (tex) expect(texFromEditor(texForEditor(tex, names), names)).toBe(tex)
    }
    expect(texForEditor('s = \\frac{{v}}{2} \\times {t}', ['v', 't'])).toBe('s = \\frac{\\enclose{roundedbox}{\\mathstrut v}}{2} \\times \\enclose{roundedbox}{\\mathstrut t}')
    // The v the teacher typed under a fraction bar is the letter; the framed t is the number.
    const tex = texFromEditor('a = \\frac{1}{v}\\times\\enclose{roundedbox}{\\mathstrut t}', ['v', 't'])
    const q: PQQuestion = {
      ...train(),
      variables: [
        { name: 'v', def: { kind: 'list', items: [7] } },
        { name: 't', def: { kind: 'list', items: [5] } }
      ],
      steps: { level: 'worked', items: [{ head: 'Here.', tex }] }
    }
    const shown = stepsToWorking(q, drawVariables(q, 1), SETTINGS).moves[0].tex!
    expect(shown).toContain('\\mathit{v}')
    expect(shown).not.toContain('7')
    expect(shown).toContain('5')
  })
})

describe('variables and the ten-variant preview', () => {
  it('names a variable in words and picks a free letter', () => {
    expect(nameProblem('', [])).toBe('Give this variable a name.')
    expect(nameProblem('2x', [])).toBe('A name is a letter, then letters or digits.')
    expect(nameProblem('pi', [])).toMatch(/already means something in maths/)
    expect(nameProblem('u', ['u'])).toBe('There is already a variable called u.')
    expect(nameProblem('u', [])).toBeNull()
    expect(nextVariableName(['a', 'b'])).toBe('c')
    expect(nextVariableName([])).not.toMatch(/^[eitx]$/)
  })

  it('marks the variant that divides by zero and offers the fix of FIG. 5', () => {
    const rows = previewRows(fig5(), SETTINGS)
    expect(rows).toHaveLength(10)
    const bad = rows.filter((r) => r.problems.length > 0)
    expect(bad.length).toBeGreaterThan(0)
    for (const r of bad) {
      expect(r.values.find((v) => v.name === 't')!.text).toBe('0 s')
      expect(r.fix?.text).toBe('t can be 0 — start it at 1?')
    }
    const good = rows.find((r) => r.problems.length === 0)!
    expect(good.answers[0]!.text).toMatch(/m\/s²$/)
    const fixed = bad[0].fix!.apply(fig5())
    expect(fixed.variables[1].def).toEqual({ kind: 'range', from: 1, to: 10, step: 1 })
    expect(previewRows(fixed, SETTINGS).every((r) => r.problems.length === 0)).toBe(true)
    expect(questionProblems(fixed, 0, SETTINGS)).toEqual([])
  })

  it('says what fails as a student writes the formula, never as the file stores it', () => {
    const [u] = fig5().variables
    const q: PQQuestion = {
      ...fig5(),
      variables: [u, { name: 't', def: { kind: 'range', from: 0, to: 3, step: 1 } }, { name: 'a', def: { kind: 'expr', expr: 'u ^ 2 / (2 * t)' } }]
    }
    const said = previewRows(q, SETTINGS).flatMap((r) => r.problems.filter((p) => p.startsWith('a = ')))
    expect(said.length).toBeGreaterThan(0)
    for (const p of said) {
      expect(p).toBe('a = u²/(2t) is infinite or undefined when t = 0.')
      expect(p).not.toMatch(/[*^]/)
    }
  })

  it('leaves 0 out of a range through 0 or a list, rather than moving its ends', () => {
    const [u, , a] = fig5().variables
    const through: PQQuestion = { ...fig5(), variables: [u, { name: 't', def: { kind: 'range', from: -3, to: 3, step: 1 } }, a] }
    const fix = previewRows(through, SETTINGS, 60).find((r) => r.fix)!.fix!
    expect(fix.text).toBe('t can be 0 — never draw 0?')
    expect(fix.apply(through).variables[1].def).toEqual({ kind: 'range', from: -3, to: 3, step: 1, exclude: [0] })
    const listed: PQQuestion = { ...fig5(), variables: [u, { name: 't', def: { kind: 'list', items: [0, 2, 4] } }, a] }
    const lfix = previewRows(listed, SETTINGS, 60).find((r) => r.fix)!.fix!
    expect(lfix.apply(listed).variables[1].def).toEqual({ kind: 'list', items: [2, 4] })
  })

  it('offers every unit once, grouped by what it measures', () => {
    const all = UNIT_GROUPS.flatMap((g) => g.units)
    expect([...all].sort()).toEqual([...UNIT_IDS].sort())
  })
})

describe('what a question needs before it leaves PhysLab', () => {
  it('names a missing title, licence holder, prompt and answer', () => {
    const q: PQQuestion = { ...newQuestion(''), title: '' }
    expect(questionProblems(q, 2, SETTINGS)).toEqual([
      'Question 3 needs a title.',
      'Question 3 needs the name of whoever holds its licence — yours, if you wrote it.',
      'Question 3 needs a question to ask.',
      'Question 3 needs its answer.'
    ])
    expect(questionProblems(train(), 0, SETTINGS)).toEqual([])
  })

  it('finds numbers that fail beyond the ten the preview shows', () => {
    // t = 50 is one draw in a hundred: none of the preview's ten draws it, seed 114 does.
    const [u] = fig5().variables
    const rare: PQQuestion = {
      ...fig5(),
      variables: [u, { name: 't', def: { kind: 'range', from: 1, to: 100, step: 1 } }, { name: 'a', def: { kind: 'expr', expr: 'u / (t - 50)' } }]
    }
    expect(previewRows(rare, SETTINGS).every((r) => r.problems.length === 0)).toBe(true)
    const problems = questionProblems(rare, 0, SETTINGS)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^Question 'Slowing down': some numbers a student may be given do not work\. a = u\/\(t − 50\) is infinite or undefined when u = \d+ and t = 50\.$/)
  })

  it('gives an imported question a new id only when the set already has its id', () => {
    let n = 0
    const fresh = () => `new-${++n}`
    const [a, b] = joinImported([train()], [train(), { ...train(), id: 'other' }], fresh)
    expect(a.id).toBe('new-1')
    expect(b.id).toBe('other')
  })
})

describe('steps from the engine', () => {
  it('suggests the Pure Math job the calculator would pick, and its working shows', () => {
    expect(suggestAutoStep('x^2 - 5x + 6')).toEqual({ job: 'factor', label: 'Factorise' })
    expect(suggestAutoStep('2x + 3 = 11').job).toBe('solve')
    const q: PQQuestion = { ...train(), variables: [{ name: 'k', def: { kind: 'list', items: [6] } }] }
    const moves = previewAutoStep(q, { head: '', auto: { engine: 'pure', job: 'factor', input: 'x^2 - 5x + {k}' } }, SETTINGS)
    expect(moves.length).toBeGreaterThan(1)
    expect(moves[0].head).not.toBe('PhysLab could not work this step out.')
    expect(solverLabel('solveMagnitudeDirection')).toBe('Magnitude and direction')
  })

  it("gives a vector solver the student's number where the teacher put a variable's chip", () => {
    const q: PQQuestion = {
      ...train(),
      variables: [
        { name: 'F', def: { kind: 'range', from: 20, to: 60, step: 1 } },
        { name: 'th', def: { kind: 'range', from: 10, to: 80, step: 5 } }
      ]
    }
    const { values } = drawVariables(q, 1)
    const vec = (args: string[]) => previewAutoStep(q, { head: '', auto: { engine: 'vectors', solver: 'solveComponents', args } }, SETTINGS)
    // The panel stores what its chip line holds: the vector's name in words, then chips.
    const withChips = vec(['F', '{F}', '{th}', 'N'])
    expect(withChips[0].head).not.toBe('PhysLab could not work this step out.')
    expect(withChips).toEqual(vec(['F', String(values.F), String(values.th), 'N']))
    // Typed bare, F is a word (the vector's name), never the number: that is why the input has chips.
    expect(vec(['F', 'F', '{th}', 'N'])).not.toEqual(withChips)
  })
})

describe('the statement, renaming and the small readers', () => {
  it('splits every bundled statement into sentences and formula lines and joins it back unchanged', () => {
    for (const q of loadBundled().questions) {
      expect(blocksStatement(statementBlocks(q.statement)), q.title).toBe(q.statement)
      for (const p of q.parts) expect(textPiecesText(textPieces(p.prompt))).toBe(p.prompt)
    }
    expect(statementBlocks(train().statement)).toEqual([
      { kind: 'text', text: 'A train moving at {v} puts its brakes on and slows down evenly, stopping {t} later.' },
      { kind: 'formula', tex: 's = \\tfrac{1}{2}\\,v\\,t' }
    ])
    // An empty formula line shows nothing, so it is not written.
    expect(blocksStatement([{ kind: 'text', text: 'Hello {v}.' }, { kind: 'formula', tex: ' ' }])).toBe('Hello {v}.')
    expect(textPieces('Find \\(x^{k}\\) when x = {x}.')).toEqual([{ text: 'Find ' }, { tex: 'x^{k}' }, { text: ' when x = ' }, { chip: 'x' }, { text: '.' }])
  })

  it('renames a variable everywhere it is used, and the renamed question plays the same numbers', () => {
    const renamed = renameVariable(train(), 'v', 'u')
    expect(renamed.statement).toBe('A train moving at {u} puts its brakes on and slows down evenly, stopping {t} later.\n$$ s = \\tfrac{1}{2}\\,v\\,t $$')
    const part = renamed.parts[0]
    expect(part.type === 'number' && part.answer).toBe('u * t / 2')
    expect(part.type === 'number' && part.traps!.map((t) => t.value)).toEqual(['u * t', 'u / t'])
    const [s1, s2] = renamed.steps!.items
    expect(s1.head).toContain('from {u} to 0')
    expect(s1.tex).toBe('v_{\\mathrm{avg}} = \\frac{{u} + 0}{2}')
    // The rule's v is the letter in a textbook formula, never the chip.
    expect(s1.rule).toBe(train().steps!.items[0].rule)
    expect(s2.tex).toBe('s = v_{\\mathrm{avg}}\\,t = \\frac{{u}}{2} \\times {t}')
    for (const seed of [1, 2, 3]) {
      const before = playQuestion(train(), seed, SETTINGS)
      const after = playQuestion(renamed, seed, SETTINGS)
      expect(after.parts.map((p) => p.answerTex)).toEqual(before.parts.map((p) => p.answerTex))
      expect(after.problems).toEqual([])
    }
  })

  it('knows whether a variable is still used before it is removed', () => {
    const q: PQQuestion = { ...train(), variables: [...train().variables, { name: 'w', def: { kind: 'list', items: [1] } }] }
    expect(variableInUse(q, 'v')).toBe(true)
    expect(variableInUse(q, 't')).toBe(true)
    expect(variableInUse(q, 'w')).toBe(false)
  })

  it('reads a list of numbers the way the calculator would, and says what is wrong in words', () => {
    expect(parseNumberList('2, 4, 6')).toEqual({ items: [2, 4, 6] })
    expect(parseNumberList('1.5; -3, 2^3')).toEqual({ items: [1.5, -3, 8] })
    expect(parseNumberList('')).toEqual({ problem: 'Write at least one number.' })
    expect(parseNumberList('2, x')).toEqual({ problem: 'x is not a number.' })
    expect(numberListText([2, 4.5, -3])).toBe('2, 4.5, −3')
  })

  it('turns a part into another type and keeps its prompt and marks', () => {
    const p = { ...blankPart(), prompt: 'How far?', marks: 3 }
    expect(changePartType(p, 'choice')).toMatchObject({ type: 'choice', prompt: 'How far?', marks: 3, shuffle: true })
    expect(changePartType({ ...p, answer: 'v*t' } as never, 'expression')).toMatchObject({ type: 'expression', answer: 'v*t', symbols: ['x'] })
    expect(blankPart()).toMatchObject({ type: 'number', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 })
  })
})

describe("an engine step's input with chips", () => {
  it('reads the maths field into the calculator text with a chip where each number goes', () => {
    expect(pureInputFromLatex('x^2-5x+\\enclose{roundedbox}{\\mathstrut k}', ['k'])).toEqual({ input: 'x^(2)-5x+{k}' })
    // Against a digit or a letter the chip keeps brackets: 3{k} would read 36 for k = 6.
    expect(pureInputFromLatex('3\\enclose{roundedbox}{\\mathstrut k}x+1', ['k'])).toEqual({ input: '3({k})x+1' })
    expect(pureInputFromLatex('2x+\\enclose{roundedbox}{\\mathstrut b}=11', ['b'])).toEqual({ input: '2x+{b}=11' })
    expect(pureInputFromLatex('', ['k'])).toEqual({ input: '' })
    // The real maths field hands its chip back with drawing options of its own; \boxed and \fbox
    // are read too. (A \boxed chip came back from the field's unstyled LaTeX as a bare letter,
    // which is why the buttons insert \enclose.)
    expect(pureInputFromLatex('x+\\enclose{roundedbox}[shadow="none", solid currentColor]{k}', ['k'])).toEqual({ input: 'x+{k}' })
    expect(texFromEditor('0=\\enclose{roundedbox}[shadow="none", solid currentColor]{u}^2-2\\times\\enclose{roundedbox}[shadow="none", solid currentColor]{a}\\times s', ['u', 'a'])).toBe(
      '0={u}^2-2\\times {a}\\times s'
    )
    expect(pureInputFromLatex('x+\\boxed{k}', ['k'])).toEqual({ input: 'x+{k}' })
    expect(texFromEditor('s = \\boxed{v} + \\fbox{t}', ['v', 't'])).toBe('s = {v} + {t}')
    expect(chipTex('v')).toBe('\\enclose{roundedbox}{\\mathstrut v}')
    // Everywhere KaTeX sets the maths, the chip is a plain box.
    expect(texForEditor('s = {v}', ['v'], chipKatex)).toBe('s = \\boxed{v}')
    expect(pureInputLatex('x + {k}', ['k'], chipKatex)).toBe('x+\\boxed{k}')
  })

  it('shows a stored input in the maths field with its chips framed, and reads it back the same', () => {
    for (const input of ['x^2 - 5x + {k}', '2x + {b} = 11', '3({k})x + 1']) {
      const tex = pureInputLatex(input, ['k', 'b'])
      expect(tex).toMatch(/\\enclose\{roundedbox\}\{\\mathstrut [kb]\}/)
      expect(tex).not.toMatch(/\d{5}/)
      const back = pureInputFromLatex(tex, ['k', 'b'])
      expect(back.problem).toBeUndefined()
      const values = { k: 6, b: 5 }
      const q: PQQuestion = { ...train(), variables: [{ name: 'k', def: { kind: 'list', items: [6] } }, { name: 'b', def: { kind: 'list', items: [5] } }] }
      const job = suggestAutoStep(input.replace(/\{(\w+)\}/g, (_, n: string) => String(values[n as 'k' | 'b']))).job
      const a = previewAutoStep(q, { head: '', auto: { engine: 'pure', job, input } }, SETTINGS)
      const b = previewAutoStep(q, { head: '', auto: { engine: 'pure', job, input: back.input! } }, SETTINGS)
      expect(b.map((m) => m.tex)).toEqual(a.map((m) => m.tex))
    }
  })

  it('factorises x² − 5x + k for k = 6 into (x − 2)(x − 3)', () => {
    const q: PQQuestion = { ...train(), variables: [{ name: 'k', def: { kind: 'list', items: [6] } }] }
    const input = pureInputFromLatex('x^2-5x+\\enclose{roundedbox}{\\mathstrut k}', ['k']).input!
    const moves = previewAutoStep(q, { head: '', auto: { engine: 'pure', job: 'factor', input } }, SETTINGS)
    const last = moves.map((m) => m.tex ?? '').join(' ')
    expect(last.replace(/\s|\\left|\\right/g, '')).toMatch(/\(x-2\)\(x-3\)|\(x-3\)\(x-2\)/)
  })
})

describe('a product written side by side', () => {
  it('comes back from the maths field as the product it is (mathjs writes 3x as 3~x)', () => {
    for (const expr of ['3x^2 - 2x', '2 x + k', 'k x']) {
      const tex = formulaLatex(expr, ['k'])
      expect(tex).not.toContain('~')
      const back = readFormula(tex, ['k'], ['x'])
      expect(back.problem, expr).toBeUndefined()
      expect(evaluateInVariables(back.expr!, { x: 1.5, k: 4 })).toBeCloseTo(evaluateInVariables(expr, { x: 1.5, k: 4 }), 12)
    }
  })
})

describe('the letters a formula answer may use', () => {
  it('reads a list of letters and refuses a variable or a word the maths owns', () => {
    expect(parseLetters('x, y', ['v', 't'])).toEqual({ letters: ['x', 'y'] })
    expect(parseLetters('x x', [])).toEqual({ letters: ['x'] })
    expect(parseLetters('', []).problem).toMatch(/at least one letter/)
    expect(parseLetters('t', ['v', 't']).problem).toBe('t is a variable of this question, so it stands for a number, not a letter.')
    expect(parseLetters('pi', []).problem).toMatch(/already means something/)
  })
})

/**
 * The braking train as a teacher builds it in Question Author (the browser check builds the same):
 * u and a drawn from ranges, a picture of the speed falling to 0, two number parts in m and s to
 * 2 %, three steps at the "some lines hidden" level. Every formula goes in the way the panel puts
 * it in — read from what the maths field holds — so the test crosses the same boundary.
 */
function authoredTrain(): PQQuestion {
  const names = ['u', 'a']
  const formula = (latex: string, free: string[] = []): string => {
    const r = readFormula(latex, names, free)
    if (r.problem !== undefined) throw new Error(r.problem)
    return r.expr
  }
  return {
    ...newQuestion('Ms Khan'),
    title: 'A braking train',
    statement: blocksStatement([
      { kind: 'text', text: 'A train moving at {u} brakes evenly at {a} until it stops.' },
      { kind: 'formula', tex: 'v^2 = u^2 - 2as' }
    ]),
    variables: [
      { name: 'u', def: { kind: 'range', from: 10, to: 30, step: 2 }, unit: 'm/s', description: 'speed when the brakes go on' },
      { name: 'a', def: { kind: 'range', from: 0.5, to: 1.5, step: 0.25 }, unit: 'm/s²' }
    ],
    parts: [
      { type: 'number', prompt: 'How far does it travel while braking?', answer: formula('\\frac{u^2}{2a}'), unit: 'm', tolerance: { kind: 'relative', value: 0.02 }, marks: 2 },
      { type: 'number', prompt: 'How long does it take to stop?', answer: formula('\\frac{u}{a}'), unit: 's', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }
    ],
    picture: { kind: 'curve', expr: formula('u-ax', ['x']), xMin: '0', xMax: formula('\\frac{u}{a}') },
    steps: {
      level: 'half',
      items: [
        { head: 'It stops, so the final speed is 0.', tex: texFromEditor('v = 0', names) },
        { head: 'Put the numbers into v² = u² − 2as.', tex: texFromEditor('0 = \\enclose{roundedbox}{\\mathstrut u}^2 - 2\\times\\enclose{roundedbox}{\\mathstrut a}\\times s', names), rule: 'v^2 = u^2 - 2as', blank: true },
        { head: 'The time comes from v = u − at.', tex: texFromEditor('t = \\frac{\\enclose{roundedbox}{\\mathstrut u}}{\\enclose{roundedbox}{\\mathstrut a}}', names), rule: 'v = u - at', blank: true }
      ]
    }
  }
}

describe('a question written in Question Author, played in Problem Sets', () => {
  it('builds the formulas from the maths field the way the panel does', () => {
    const q = authoredTrain()
    expect(q.parts.map((p) => (p.type === 'number' ? p.answer : ''))).toEqual(['u ^ 2 / (2 * a)', 'u / a'])
    expect(q.steps!.items[1].tex).toBe('0 = {u}^2 - 2\\times {a}\\times s')
    expect(questionProblems(q, 0, SETTINGS)).toEqual([])
  })

  it('writes the set as .pqjson text a teacher can read: app and format first, licence with their name', () => {
    const q = authoredTrain()
    const text = serializePQFile(questionFile([q]))
    expect(text.startsWith('{\n  "app": "PhysLab",\n  "format": "pqjson",\n  "version": 1,\n  "questions": [\n    {\n      "id": ')).toBe(true)
    expect(text).toContain('"license": {\n        "id": "CC BY 4.0",\n        "holder": "Ms Khan"\n      }')
    expect(text).toContain('"answer": "u ^ 2 / (2 * a)"')
    expect(text).toContain('"level": "half"')
    // No braces the teacher typed: the only ones are the file's own chips.
    expect(text).toContain('"statement": "A train moving at {u} brakes evenly at {a} until it stops.\\n$$ v^2 = u^2 - 2as $$"')
    expect(exportName([q], 'pqjson')).toBe('A braking train.pqjson')
    expect(exportName([q, train()], 'exam')).toBe('A braking train and 1 more.exam')
    // The same text twice: a set saved again diffs cleanly.
    expect(serializePQFile(questionFile([q]))).toBe(text)
  })

  it('opens in Problem Sets from the file and marks a right answer right and a wrong one wrong', () => {
    const q = authoredTrain()
    const set = loadTeacherFile(serializePQFile(questionFile([q])), 'C:\\Class 11\\A braking train.pqjson')
    expect(set).toMatchObject({ title: 'A braking train', source: 'teacher', report: [] })
    expect(set.questions).toEqual([q])
    for (const seed of [1, 7, 12345]) {
      const played = playQuestion(set.questions[0], seed, SETTINGS)
      expect(played.problems).toEqual([])
      expect(played.level).toBe('half')
      const { u, a } = played.variant.values
      const [distance, time] = played.parts
      const s = (u * u) / (2 * a)
      expect(isCorrect(checkPlayedPart(distance, `${s} m`, played, SETTINGS))).toBe(true)
      // 1.5 % out is inside the 2 % the teacher set; 5 % out is not.
      expect(isCorrect(checkPlayedPart(distance, `${s * 1.015} m`, played, SETTINGS))).toBe(true)
      expect(checkPlayedPart(distance, `${s * 1.05} m`, played, SETTINGS).verdict).toBe('wrong')
      expect(isCorrect(checkPlayedPart(time, `${u / a} s`, played, SETTINGS))).toBe(true)
      expect(checkPlayedPart(time, `${u / a} m`, played, SETTINGS).verdict).toBe('wrong')
      // At the half level the lines the teacher marked are left for the student.
      const moves = stepsToWorking(set.questions[0], played.variant, SETTINGS).moves
      expect(moves.map((m) => m.tex === undefined)).toEqual([false, true, true])
      expect(moves[0].tex).toBe('v = 0')
    }
  })

  it('goes out as a Numbas exam and comes back through the licence gate, still marking the same', () => {
    const q = authoredTrain()
    const exam = toExam(questionFile([q]), q.title)
    expect(exam.split('\n')[0]).toBe('// Numbas version: finer_feedback_settings')
    const back = loadTeacherFile(exam, 'A braking train.exam')
    expect(back.questions).toHaveLength(1)
    const again = back.questions[0]
    expect(again.license.id).toBe('CC BY 4.0')
    const played = playQuestion(again, 3, SETTINGS)
    const { u, a } = played.variant.values
    expect(isCorrect(checkPlayedPart(played.parts[0], `${(u * u) / (2 * a)} m`, played, SETTINGS))).toBe(true)
    expect(isCorrect(checkPlayedPart(played.parts[1], `${u / a} s`, played, SETTINGS))).toBe(true)
    // Imported beside the original, it becomes a copy with its own id, not a twin that edits it.
    const joined = joinImported([q], back.questions, () => 'fresh')
    expect(joined[0].id).toBe(q.id === again.id ? 'fresh' : again.id)
  })

  it("keeps another teacher's licence and credit on a question brought in, and the teacher's own stays theirs", () => {
    const none = new Set<string>()
    const theirs: PQQuestion = { ...train(), license: { id: 'CC BY-SA 4.0', holder: 'A. Other' } }
    const theirExam = toExam(questionFile([theirs]), 'Their exam')
    const back = loadTeacherFile(theirExam, 'Their exam.exam')
    expect(back.questions[0].license.found).toBe('Creative Commons Attribution-ShareAlike 4.0 International')
    // Someone else's: the panel shows its licence read-only, naming where it came from.
    const [kept] = joinImported([], back.questions, () => 'x', { file: back.title, written: none })
    expect(broughtInFrom(kept)).toBe(back.title)
    expect(kept.license.id).toBe('CC BY-SA 4.0')
    // Another teacher's .pqjson says nothing of its source: the file's title is kept as one.
    const pq = loadTeacherFile(serializePQFile(questionFile([theirs])), 'Theirs.pqjson')
    expect(broughtInFrom(joinImported([], pq.questions, () => 'y', { file: pq.title, written: none })[0])).toBe(pq.title)
    // The teacher's own exam, exported from this computer, opened again is theirs to relicense,
    // and a new licence goes out as the new licence's own words, not the text Numbas kept.
    const written = new Set(writtenHereIds([theirs], 'exam', theirExam))
    expect(written.size).toBe(1)
    const [mine] = joinImported([], back.questions, () => 'z', { file: back.title, written })
    expect(broughtInFrom(mine)).toBeNull()
    const relicensed: PQQuestion = { ...back.questions[0], license: changeLicence(back.questions[0].license, 'CC BY 4.0') }
    const exam = toExam(questionFile([relicensed]), 'Mine')
    expect(exam).toContain('"licence":"Creative Commons Attribution 4.0 International"')
    expect(exam).not.toContain('ShareAlike')
    // PhysLab's own samples and a question written here are not "brought in".
    expect(broughtInFrom(train())).toBeNull()
    expect(broughtInFrom(newQuestion('Ms Khan'))).toBeNull()
  })

  it("decides whose a question is by what this computer exported, never by the teacher's typed name", () => {
    const theirs: PQQuestion = { ...train(), id: 'theirs', license: { id: 'CC BY-SA 4.0', holder: 'A. Other' } }
    const pqText = serializePQFile(questionFile([theirs]))
    const pq = loadTeacherFile(pqText, 'Theirs.pqjson')
    // A teacher who types the other author's name first gains nothing: nothing of theirs was
    // exported here, so the question stays read-only.
    const [spoofed] = joinImported([], pq.questions, () => 'a', { file: pq.title, written: new Set() })
    expect(broughtInFrom(spoofed)).toBe(pq.title)
    // A teacher with no name saved opens their own exported .pqjson: it is still theirs.
    const own: PQQuestion = { ...train(), id: 'own', license: { id: 'CC BY 4.0', holder: '' } }
    const ownText = serializePQFile(questionFile([own]))
    const written = new Set(writtenHereIds([own], 'pqjson', ownText))
    const [again] = joinImported([], loadTeacherFile(ownText, 'Mine.pqjson').questions, () => 'b', { file: 'Mine', written })
    expect(broughtInFrom(again)).toBeNull()
    // A question brought in and exported again is never recorded as the teacher's, as .pqjson or
    // as .exam, so a round trip through a file cannot unlock its licence.
    expect(writtenHereIds([spoofed], 'pqjson', serializePQFile(questionFile([spoofed])))).toEqual([])
    const examText = toExam(questionFile([spoofed]), 'Round trip')
    expect(writtenHereIds([spoofed], 'exam', examText)).toEqual([])
    const [round] = joinImported([], loadTeacherFile(examText, 'Round trip.exam').questions, () => 'c', { file: 'Round trip', written })
    expect(broughtInFrom(round)).toBe('Round trip')
    // The record is kept on this computer and survives a reload of the app.
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) })
    try {
      rememberWrittenHere(['own'])
      rememberWrittenHere(['other', 'own'])
      expect([...readWrittenHere()]).toEqual(['other', 'own'])
    } finally {
      vi.unstubAllGlobals()
    }
    expect(readWrittenHere().size).toBe(0)
  })

  it('refuses to open a set whose question has lost its licence', () => {
    const { license: _gone, ...bare } = authoredTrain()
    const text = JSON.stringify({ app: 'PhysLab', format: 'pqjson', version: 1, questions: [bare] })
    expect(() => loadTeacherFile(text, 'x.pqjson')).toThrow(/licen/)
  })
})

describe('a question only just started', () => {
  it('previews without red rows until its answer is written, and Export still asks for the answer', () => {
    const q: PQQuestion = { ...newQuestion('Ms Khan'), title: 'Braking', variables: [{ name: 'u', def: { kind: 'range', from: 10, to: 30, step: 2 }, unit: 'm/s' }] }
    const rows = previewRows(q, SETTINGS)
    expect(rows.every((r) => r.problems.length === 0)).toBe(true)
    expect(rows[0].answers).toEqual([null])
    expect(rows[0].values[0].text).toMatch(/ m\/s$/)
    expect(questionProblems({ ...q, parts: [{ ...q.parts[0], prompt: 'How fast?' }] }, 0, SETTINGS)).toEqual(["Question 'Braking' needs its answer."])
    // A second part with its answer written is played and shown beside the empty one.
    const two: PQQuestion = { ...q, parts: [q.parts[0], { type: 'number', prompt: 'Double it', answer: '2 * u', unit: 'm/s', tolerance: { kind: 'relative', value: 0.02 }, marks: 1 }] }
    const [first] = previewRows(two, SETTINGS)
    expect(first.answers[0]).toBeNull()
    expect(first.answers[1]!.text).toMatch(/ m\/s$/)
  })
})
