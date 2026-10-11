// Writing a PhysLab question set into Numbas .exam JSON.
// Pure moves from questions/numbas.ts (CW10a). Headless: no React, no store, no DOM.

import {
  DEFAULT_BAND,
  bandOf,
  isCommandArgument,
  type BandTolerance,
  type LicenseId,
  type PQFile,
  type PQPart,
  type PQQuestion,
  type PQSteps,
  type PQVariable,
  type UnitId
} from '../pqjson'
import { mathToJme } from './jme'
import { num, writeCarried, NUMBAS_MAX_RUNS, type Obj } from './marking'

// ===========================================================================
// Writing an .exam
// ===========================================================================

/** The `metadata.licence` string Numbas writes for each pool licence, used when `found` is not kept. */
const CANONICAL_LICENCE: Record<LicenseId, string> = {
  'CC BY 4.0': 'Creative Commons Attribution 4.0 International',
  'CC BY-SA 4.0': 'Creative Commons Attribution-ShareAlike 4.0 International',
  'CC0 1.0': 'Creative Commons CC0 1.0 Universal'
}

// --- text ----------------------------------------------------------------------

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Words for a Numbas page: Numbas reads a bare `$` as the start of maths, so a dollar sign goes out as `\$`. */
const escapeText = (s: string): string => escapeHtml(s).replace(/\$/g, '\\$')

/**
 * LaTeX for Numbas: a chip becomes `\var{v}`, a protected group `{ v}` its plain self, and a
 * command's argument (`\mathrm{avg}`) stays LaTeX — written as `\mathrm\var{avg}` it named a
 * variable that does not exist and the question could not come back in.
 */
const latexOut = (tex: string): string =>
  escapeHtml(
    tex
      .replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (m, name: string, at: number) => (isCommandArgument(tex, at) ? m : `\\var{${name}}`))
      .replace(/\{ ([A-Za-z][A-Za-z0-9_]*)\}/g, '{$1}')
  )

/** A line of PhysLab text as one HTML paragraph; chips stay `{v}`, which is Numbas's own syntax. */
function lineToHtml(line: string): string {
  if (line.startsWith('$$') && line.endsWith('$$')) return `<p>\\[${latexOut(line.slice(2, -2))}\\]</p>`
  const html = line
    .split(/(\\\([\s\S]*?\\\))/)
    .map((piece, k) => (k % 2 === 1 ? `\\(${latexOut(piece.slice(2, -2))}\\)` : escapeText(piece)))
    .join('')
  return `<p>${html}</p>`
}

const textToHtml = (text: string): string =>
  text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map(lineToHtml)
    .join('')

// --- variables and parts -----------------------------------------------------

/** A number as JME reads it: the plain JavaScript form, with no proper minus and no ×10^. */
const jmeNumber = (v: number): string => String(v)

function variableToJme(v: PQVariable): string {
  const d = v.def
  if (d.kind === 'range') {
    const range = d.step === 1 ? `${jmeNumber(d.from)}..${jmeNumber(d.to)}` : `${jmeNumber(d.from)}..${jmeNumber(d.to)}#${jmeNumber(d.step)}`
    const except = d.exclude && d.exclude.length > 0 ? ` except [${d.exclude.map(jmeNumber).join(', ')}]` : ''
    return `random(${range}${except})`
  }
  // The list form: random(30) with one value would read as a choice from nothing, not from 30.
  if (d.kind === 'list') return `random([${d.items.map(jmeNumber).join(', ')}])`
  return mathToJme(d.expr)
}

/** The keys every Numbas part carries, at the values a fresh part in the editor has. */
const PART_DEFAULTS = {
  useCustomName: false,
  customName: '',
  showCorrectAnswer: true,
  showFeedbackIcon: true,
  scripts: {},
  variableReplacements: [],
  variableReplacementStrategy: 'originalfirst',
  adaptiveMarkingPenalty: 0,
  customMarkingAlgorithm: '',
  extendBaseMarkingAlgorithm: true,
  steps: []
}

/** A percentage in a sentence: 2, 0.5. */
const pct = (fraction: number): string => num(fraction * 100)

/** "y(0) = 0 and y'(0) = 1": a function part's starting conditions, as the author wrote them. */
function startsText(p: Extract<PQPart, { type: 'function' }>): string {
  return p.initial.map((c) => `${p.y}${c.order === 1 ? "'" : ''}(${c.at}) = ${c.value}`).join(' and ')
}

/** What a PQ part holds that Numbas cannot: written into the question's description instead. */
function partNotes(p: PQPart, index: number): string[] {
  const label = `part ${num(index + 1)}`
  const out: string[] = []
  switch (p.type) {
    case 'number':
      if (p.tolerance.kind === 'stated') {
        out.push(`PhysLab marks ${label} against the student's own stated uncertainty (the Eₙ test); Numbas checks it within ${pct(DEFAULT_BAND.value)} %.`)
      }
      if (p.kind === 'direction') out.push(`PhysLab checks ${label} as a direction, round the circle.`)
      if (p.kind === 'angle') out.push(`PhysLab checks ${label} as an angle.`)
      for (const t of p.traps ?? []) out.push(`PhysLab knows a wrong answer for ${label}: ${t.value} — ${t.why}`)
      break
    case 'choice':
      if (p.distractors) out.push(`PhysLab makes the choices for ${label} from the right answer ${p.distractors.correct} with the rules ${p.distractors.rules.join(', ')}.`)
      break
    case 'vector':
      out.push(`PhysLab's ${label} is a vector; Numbas asks for its components one box each.`)
      break
    case 'matrix':
      if (p.tolerance.kind === 'relative') out.push(`PhysLab accepts each entry of ${label} within ${pct(p.tolerance.value)} % of its own value; Numbas checks each entry exactly.`)
      break
    case 'roots':
      if (p.answer.length === 0) out.push(`PhysLab's ${label} has no real roots as its answer, which a Numbas number box cannot take, so it is left out.`)
      else out.push(`PhysLab's ${label} is a set of roots; Numbas asks for them one box each${p.answer.length > 3 ? ', in the order PhysLab lists them' : ', in any order'}.`)
      break
    case 'function':
      out.push(`Numbas checks ${label} against the model answer ${p.y} = ${p.model} alone; PhysLab accepts any ${p.y} that solves ${p.ode}${p.initial.length > 0 ? ` with ${startsText(p)}` : ''}.`)
      break
    case 'proof':
      out.push(`PhysLab's ${label} is a proof, shown with a model proof and a self-check list and never marked; both are in the advice.`)
      break
    case 'lego':
      out.push(`PhysLab's ${label} fills a shape with Lego pieces, which Numbas cannot ask, so it is left out.`)
      break
  }
  if (p.showIf !== undefined) out.push(`PhysLab shows ${label} only when ${p.showIf}; Numbas always shows it.`)
  return out
}

/** The unit line a number box's prompt closes with, which the importer reads back as the part's unit. */
const unitLine = (unit: UnitId): string => (unit === 'none' ? '' : `<p>Give your answer in ${escapeHtml(unit)}.</p>`)

/**
 * A Numbas number box for an answer already in JME: the band written into `minValue`/`maxValue`
 * round the answer, so Numbas
 * checks each variant it shows. `spread`, when given, is a JME half-width that replaces the band
 * (a vector's components share one, a fraction of the vector's size).
 */
function numberEntry(answerJme: string, band: BandTolerance, marks: number, prompt: string, spread?: string): Obj {
  const a = `(${answerJme})`
  const t = jmeNumber(band.value)
  // A negative answer makes a*(1-t) the *larger* bound, so Numbas's between-check (which needs
  // minValue <= maxValue) has no satisfying value and marks every answer wrong. Writing the bounds
  // as an offset from the answer, sized by |answer|, keeps them ordered for either sign.
  const [minValue, maxValue] =
    spread !== undefined
      ? [`${a} - ${spread}`, `${a} + ${spread}`]
      : band.kind === 'relative'
        ? [`${a} - abs(${answerJme}) * (${t})`, `${a} + abs(${answerJme}) * (${t})`]
        : [`${a} - ${t}`, `${a} + ${t}`]
  return {
    type: 'numberentry',
    ...PART_DEFAULTS,
    marks,
    prompt,
    minValue,
    maxValue,
    correctAnswerFraction: false,
    allowFractions: false,
    mustBeReduced: false,
    precisionType: 'none',
    showPrecisionHint: false
  }
}

/** A gap-fill of number boxes: the prompt, then a line holding the boxes. */
function gapfill(p: { prompt: string; marks: number; unit: UnitId }, boxes: string, gaps: Obj[], sortAnswers: boolean): Obj {
  return { type: 'gapfill', ...PART_DEFAULTS, marks: 0, prompt: textToHtml(p.prompt) + `<p>${boxes}</p>` + unitLine(p.unit), gaps, sortAnswers }
}

/**
 * The roots in ascending order as JME, for a gap-fill that sorts the student's answers before
 * marking them: two roots are min and max, three add the middle one; more than three stay in the
 * author's order (and the gap-fill does not sort).
 */
function ascending(roots: string[]): string[] | null {
  const r = roots.map((x) => `(${mathToJme(x)})`)
  if (r.length === 1) return r
  const lo = `min(${r.join(', ')})`
  const hi = `max(${r.join(', ')})`
  if (r.length === 2) return [lo, hi]
  if (r.length === 3) return [lo, `${r.join(' + ')} - ${lo} - ${hi}`, hi]
  return null
}

function partToNumbas(p: PQPart): Obj | null {
  const base = { ...PART_DEFAULTS, marks: p.marks }
  switch (p.type) {
    case 'number':
      // A stated (Eₙ) answer has no band of its own; Numbas gets the app's one tolerance (bandOf).
      return numberEntry(mathToJme(p.answer), bandOf(p.tolerance), p.marks, textToHtml(p.prompt) + unitLine(p.unit))
    case 'expression':
      return {
        type: 'jme',
        ...base,
        prompt: textToHtml(p.prompt),
        answer: mathToJme(p.answer, 'same'),
        answerSimplification: 'all',
        showPreview: true,
        checkingType: 'absdiff',
        checkingAccuracy: 0.001,
        failureRate: 1,
        vsetRangePoints: 5,
        vsetRange: p.sampleRange ?? [1, 2],
        checkVariableNames: false,
        showPrecisionHint: false
      }
    case 'choice': {
      // A choice part whose choices are made by rules has nothing Numbas can list.
      if (p.choices.length === 0) return null
      const correct = p.choices.filter((c) => c.correct).length
      const single = correct === 1
      return {
        type: single ? '1_n_2' : 'm_n_2',
        ...base,
        prompt: textToHtml(p.prompt),
        minMarks: 0,
        maxMarks: p.marks,
        shuffleChoices: p.shuffle,
        displayType: single ? 'radiogroup' : 'checkbox',
        displayColumns: 0,
        warningType: 'none',
        showCellAnswerState: true,
        markingMethod: 'sum ticked cells',
        choices: p.choices.map((c) => lineToHtml(c.text)),
        matrix: p.choices.map((c) => [c.correct ? (single ? p.marks : 1) : 0]),
        distractors: p.choices.map((c) => (c.why ? lineToHtml(c.why) : ''))
      }
    }
    case 'vector': {
      // One box per component. PhysLab's band is a distance from the answer; a component can be
      // off by at most that much, so each box gets the same half-width: the band itself, or its
      // fraction of the vector's size.
      const band = bandOf(p.tolerance)
      const size = `sqrt(${p.answer.map((c) => `(${mathToJme(c)}) ^ 2`).join(' + ')})`
      const spread = band.kind === 'relative' ? `${jmeNumber(band.value)} * ${size}` : jmeNumber(band.value)
      const gaps = p.answer.map((c) => numberEntry(mathToJme(c), band, p.marks / p.answer.length, '', spread))
      return gapfill(p, p.answer.map((_c, k) => `[[${k}]] ${['i', 'j', 'k'][k]}`).join(' + '), gaps, false)
    }
    case 'roots': {
      if (p.answer.length === 0) return null
      const band = bandOf(p.tolerance)
      const sorted = ascending(p.answer)
      const answers = sorted ?? p.answer.map((x) => mathToJme(x))
      const gaps = answers.map((a) => numberEntry(a, band, p.marks / answers.length, ''))
      return gapfill(p, answers.map((_a, k) => `[[${k}]]`).join(', '), gaps, sorted !== null)
    }
    case 'matrix': {
      const cols = p.answer[0].length
      return {
        type: 'matrix',
        ...base,
        prompt: textToHtml(p.prompt),
        correctAnswer: `matrix(${p.answer.map((row) => `[${row.map((e) => mathToJme(e)).join(', ')}]`).join(', ')})`,
        correctAnswerFractions: false,
        numRows: p.answer.length,
        numColumns: cols,
        allowResize: false,
        minColumns: 0,
        maxColumns: 0,
        minRows: 0,
        maxRows: 0,
        prefilledCells: '',
        // Numbas's tolerance is a fixed gap on every entry; a relative band has no such gap, so
        // a plain Numbas install checks exactly (the description says so). The true band is kept
        // in precisionMessage, which readMatrixPart reads back in preference to the bare 0, so a
        // PhysLab -> .exam -> PhysLab round trip does not silently tighten a 5 % part to exact.
        tolerance: p.tolerance.kind === 'absolute' ? p.tolerance.value : 0,
        markPerCell: p.markPerCell === true,
        allowFractions: p.allowFractions === true,
        precisionType: 'none',
        precision: 0,
        precisionPartialCredit: 0,
        precisionMessage: p.tolerance.kind === 'relative' ? `[physlab:tolerance=relative:${p.tolerance.value}]` : '',
        strictPrecision: false
      }
    }
    case 'function':
      // Numbas compares the student's formula with the model at points in the range; PhysLab's
      // own check (does it solve the equation and start right) is said in the description.
      return {
        type: 'jme',
        ...base,
        prompt: textToHtml(p.prompt),
        answer: mathToJme(p.model, 'same'),
        answerSimplification: 'all',
        showPreview: true,
        checkingType: 'absdiff',
        checkingAccuracy: 0.001,
        failureRate: 1,
        vsetRangePoints: 5,
        vsetRange: p.sampleRange ?? [0.1, 1],
        checkVariableNames: false,
        singleLetterVariables: false,
        allowUnknownFunctions: true,
        implicitFunctionComposition: false,
        caseSensitive: false,
        valueGenerators: []
      }
    case 'proof':
      return { type: 'information', ...base, marks: 0, prompt: textToHtml(p.prompt) }
    case 'lego':
      return null
  }
}

/** A proof part's model and self-check list, for the advice Numbas shows once the question is done. */
function proofAdvice(q: PQQuestion): string {
  return q.parts
    .map((p, i) => {
      if (p.type !== 'proof') return ''
      const checks = p.selfCheck.length > 0 ? `<ul>${p.selfCheck.map((c) => `<li>${escapeText(c)}</li>`).join('')}</ul>` : ''
      return `<p>A model proof for part ${num(i + 1)}:</p>${textToHtml(p.model)}${checks}`
    })
    .join('')
}

/** The picture, motion and sandbox bindings, as sentences, so nothing Numbas cannot read is invented. */
function bindingNotes(q: PQQuestion): string[] {
  const out: string[] = []
  const pic = q.picture
  if (pic?.kind === 'curve') out.push(`PhysLab draws the curve y = ${pic.expr}${pic.xMin !== undefined && pic.xMax !== undefined ? ` from ${pic.xMin} to ${pic.xMax}` : ''}.`)
  if (pic?.kind === 'piecewise') out.push(`PhysLab draws a graph in pieces: ${pic.pieces.map((s) => `${s.expr} from ${s.from} to ${s.to}`).join('; ')}.`)
  if (pic?.kind === 'between') out.push(`PhysLab shades between ${pic.upper} and ${pic.lower} from ${pic.from} to ${pic.to}.`)
  if (pic?.kind === 'tangent') out.push(`PhysLab draws the tangent to ${pic.expr} at ${pic.at}.`)
  if (q.motion) {
    const legs = q.motion.segments.map((s) =>
      s.kind === 'rest' ? `rest for ${s.duration}` : s.kind === 'uniform' ? `move at ${s.v} for ${s.duration}` : `accelerate at ${s.a} for ${s.duration}`
    )
    out.push(`PhysLab animates a motion (${legs.join(', ')}) and plots ${q.motion.plots.join(', ')}.`)
  }
  if (q.sandbox) {
    out.push(`PhysLab runs the '${q.sandbox.preset}' experiment${q.sandbox.actuators.length > 0 ? ` with forces on ${q.sandbox.actuators.map((a) => a.body).join(', ')}` : ''}.`)
  }
  return out
}

function stepsToAdvice(steps: PQSteps | undefined): string {
  if (!steps) return ''
  return steps.items
    .map((s) => {
      const head = s.auto && s.head.trim() === '' ? 'PhysLab works this step out.' : s.head
      return lineToHtml(head) + (s.tex !== undefined ? `<p>\\[${latexOut(s.tex)}\\]</p>` : '')
    })
    .join('')
}

function questionToNumbas(q: PQQuestion): Obj {
  const written: { index: number; part: Obj }[] = []
  const notes = [...bindingNotes(q)]
  q.parts.forEach((p, i) => {
    const part = partToNumbas(p)
    if (part) written.push({ index: i, part })
    notes.push(...partNotes(p, i))
  })
  notes.push(...writeCarried(q, written))
  const parts = written.map((w) => w.part)
  const variables: Obj = {}
  for (const v of q.variables) {
    variables[v.name] = {
      name: v.name,
      group: 'Ungrouped variables',
      definition: variableToJme(v),
      description: v.description ?? '',
      templateType: 'anything',
      can_override: false
    }
  }
  // A CC0 question may name nobody; Numbas must not then be handed a contributor called ''.
  const people = (q.imported?.contributors && q.imported.contributors.length > 0 ? q.imported.contributors : [q.license.holder]).filter((n) => n.trim() !== '')
  return {
    name: q.title,
    statement: textToHtml(q.statement),
    advice: stepsToAdvice(q.steps) + proofAdvice(q),
    rulesets: {},
    extensions: [],
    builtin_constants: { e: true, pi: true, i: true },
    constants: [],
    variables,
    // The variants' condition in Numbas's own words; Numbas keeps every variant when it is empty.
    variablesTest: q.condition ? { condition: mathToJme(q.condition.when), maxRuns: q.condition.maxRuns } : { condition: '', maxRuns: NUMBAS_MAX_RUNS },
    ungrouped_variables: q.variables.map((v) => v.name),
    variable_groups: [],
    functions: {},
    preamble: { js: '', css: '' },
    parts,
    partsMode: 'all',
    maxMarks: 0,
    objectives: [],
    penalties: [],
    objectiveVisibility: 'always',
    penaltyVisibility: 'always',
    tags: q.tags ?? [],
    metadata: { description: notes.join(' '), licence: q.license.found ?? CANONICAL_LICENCE[q.license.id] },
    contributors: people.map((name) => ({ name, profile_url: '' })),
    type: 'question'
  }
}

/**
 * A PhysLab set → the text of a Numbas `.exam`: the version line, then the exam JSON in the
 * schema-10.0 shape with camelCase keys. Number parts become `numberentry` with the tolerance
 * written into `minValue`/`maxValue` as JME on the answer, so Numbas checks each variant it
 * shows; expression parts become `jme`; choice parts `1_n_2`/`m_n_2`; variables go back to JME.
 * Format 2 goes out as the nearest thing Numbas has: a matrix as a matrix part, a vector or a set
 * of roots as a gap-fill of number boxes, a function as a formula checked against its model, a
 * proof as information; error carried forward as adaptive marking, the condition as variablesTest.
 * What Numbas has no place for — pictures, motion, experiments, known wrong answers — is
 * written into the question's description in words, never invented into a part.
 */
export function toExam(file: PQFile, name = 'PhysLab questions'): string {
  const licences = new Set(file.questions.map((q) => q.license.found ?? CANONICAL_LICENCE[q.license.id]))
  const exam = {
    name,
    metadata: { description: '', licence: licences.size === 1 ? [...licences][0] : '' },
    duration: 0,
    percentPass: 0,
    showQuestionGroupNames: false,
    shuffleQuestionGroups: false,
    showstudentname: true,
    question_groups: [
      {
        name: 'Group',
        pickingStrategy: 'all-ordered',
        pickQuestions: 1,
        questionNames: [],
        variable_overrides: [],
        questions: file.questions.map(questionToNumbas)
      }
    ],
    navigation: {
      allowregen: true,
      reverse: true,
      browse: true,
      allowsteps: true,
      showfrontpage: true,
      navigatemode: 'sequence',
      onleave: { action: 'none', message: '' },
      preventleave: true,
      typeendtoleave: false,
      startpassword: '',
      allowAttemptDownload: false,
      downloadEncryptionKey: ''
    },
    timing: { allowPause: true, timeout: { action: 'none', message: '' }, timedwarning: { action: 'none', message: '' } },
    feedback: {
      showactualmark: true,
      showtotalmark: true,
      showanswerstate: true,
      allowrevealanswer: true,
      advicethreshold: 0,
      intro: '',
      end_message: '',
      reviewshowscore: true,
      reviewshowfeedback: true,
      reviewshowexpectedanswer: true,
      reviewshowadvice: true,
      feedbackmessages: []
    },
    contributors: [],
    extensions: [],
    custom_part_types: [],
    resources: []
  }
  return `// Numbas version: finer_feedback_settings\n${JSON.stringify(exam)}`
}
