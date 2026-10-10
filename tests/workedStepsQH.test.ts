import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resetGlobals } from './helpers/globals'
import { readSource, RENDERER_SRC } from './helpers/repo'
import { runPure } from '../src/renderer/src/math/pure/run'
import type { MeasureSettings } from '../src/renderer/src/math/format'
import { solveMagnitudeDirection, solveScalarMultiply, type Solution } from '../src/renderer/src/math/vectorSolver'
import { generateChoices } from '../src/renderer/src/questions/distractors'
import type { PQPart, PQQuestion } from '../src/renderer/src/questions/pqjson'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { stepsToWorking, workCasSteps } from '../src/renderer/src/questions/steps'

const S: MeasureSettings = { decimals: 2, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }

beforeEach(() => resetGlobals())

describe('Q25: a generated-distractor choice part reveals its correct answer, not ?', () => {
  it('uses the generated choices for the full solution answer', () => {
    const q: PQQuestion = {
      id: 'af-qh-q25',
      title: 'Q25 generated choices',
      statement: 'What is the acceleration?',
      variables: [],
      parts: [
        {
          type: 'choice',
          prompt: 'a?',
          choices: [],
          distractors: { correct: '2 + 3', unit: 'm/s²', rules: ['sign'] },
          shuffle: false,
          marks: 1
        }
      ],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }

    const answer = stepsToWorking(q, drawVariables(q, 1), S, 'worked').answers[0].tex
    expect(answer).toBe('\\text{5 m/s²}')
  })

  // Options whose right answer names a variable the question does not have cannot be worked out.
  // The answer card reveals "?", as for any answer that cannot be worked out; the player says why
  // in words. Unguarded, the throw took the whole question down before the player could say so.
  it('reveals ? for generated options that cannot be worked out, instead of throwing', () => {
    const q: PQQuestion = {
      id: 'af-qh-q25-unworkable',
      title: 'Q25 options that cannot be worked out',
      statement: 'What is the deceleration?',
      variables: [],
      parts: [
        {
          type: 'choice',
          prompt: 'a?',
          choices: [],
          distractors: { correct: 'v / 2', unit: 'm/s²', rules: ['sign'] },
          shuffle: false,
          marks: 1
        }
      ],
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }

    expect(stepsToWorking(q, drawVariables(q, 1), S, 'worked').answers[0].tex).toBe('\\text{?}')
  })
})

/** The tex an engine step shows for a vector solver's solution, as autoMoves lays it out. */
const solverTex = (solution: Solution): (string | undefined)[] =>
  solution.steps.filter((st) => (st.text ?? '') !== '' || st.tex !== undefined).map((st) => st.tex)

/** A question whose only step is one vector solver, with k drawn as −3. */
function solverQuestion(solver: string, args: string[]): PQQuestion {
  return {
    id: 'af-qh-q26-arg',
    title: 'Q26 negative chip argument',
    statement: 'Work it out.',
    variables: [{ name: 'k', def: { kind: 'list', items: [-3] }, unit: 'none' }],
    parts: [],
    steps: { level: 'worked', items: [{ head: '', auto: { engine: 'vectors', solver, args } }] },
    license: { id: 'CC BY 4.0', holder: 'PhysLab' }
  }
}

describe('Q26: a negative chip still reads where it needs no brackets', () => {
  // `(-3)` alone is read as a vector with one component and refused, so the bracket that keeps
  // {k}^2 at (−3)² made "multiply A by {k}" say it could not work the step out.
  it('reads a negative chip that is the whole argument as the number', () => {
    const q = solverQuestion('solveScalarMultiply', ['{k}', 'A: <1, 2>'])
    const tex = stepsToWorking(q, drawVariables(q, 1), S, 'worked').moves.map((m) => m.tex)
    expect(tex).toEqual(solverTex(solveScalarMultiply(-3, { name: 'A', v: [1, 2, 0] }, undefined, S)))
  })

  it('reads a negative chip inside a vector, in angle brackets or round ones', () => {
    const expected = solverTex(solveMagnitudeDirection({ name: 'A', v: [-3, 4, 0] }, S))
    for (const arg of ['A: <{k}, 4>', 'A = ({k}, 4)']) {
      const q = solverQuestion('solveMagnitudeDirection', [arg])
      expect(stepsToWorking(q, drawVariables(q, 1), S, 'worked').moves.map((m) => m.tex)).toEqual(expected)
    }
  })
})

describe('Q26: negative variables in vector-solver chips are bracketed', () => {
  it('works {k}^2 as (−3)^2 = 9, not −3² = −9', () => {
    const q: PQQuestion = {
      id: 'af-qh-q26',
      title: 'Q26 negative chip',
      statement: 'Work it out.',
      variables: [{ name: 'k', def: { kind: 'list', items: [-3] }, unit: 'none' }],
      parts: [
        {
          type: 'number',
          prompt: 'k² = ?',
          answer: 'k^2',
          unit: 'none',
          tolerance: { kind: 'relative', value: 0.02 },
          marks: 1
        }
      ],
      steps: {
        level: 'worked',
        items: [{ head: '', auto: { engine: 'vectors', solver: 'solveScalarMultiply', args: ['{k}^2', 'A: <1, 2>'] } }]
      },
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }

    const working = stepsToWorking(q, drawVariables(q, 1), S, 'worked')
    const joined = working.moves.map((m) => `${m.head} ${m.tex ?? ''}`).join(' ')
    expect(joined).toContain('9')
    expect(joined).not.toMatch(/-9|−9/)
  })
})

describe('Q27: the g-10 distractor is not swallowed by the 2% keep-apart band', () => {
  it('offers the g = 10 slip beside the g = 9.81 answer', () => {
    const part: Extract<PQPart, { type: 'choice' }> = {
      type: 'choice',
      prompt: 'Weight',
      choices: [],
      distractors: { correct: 'm*g', unit: 'N', rules: ['g-10'] },
      shuffle: false,
      marks: 1
    }

    const choices = generateChoices(part, { m: 5, g: 9.81 }, S)
    expect(choices.map((c) => c.text)).toEqual(['49.05 N', '50 N'])
  })

  // An answer that goes as 1/√g moves by only about 1 % with g = 10, and is still offered; but
  // two options that read the same at the student's precision are never both shown.
  it('offers the g = 10 slip of a fall time, but never as a second option that reads the same', () => {
    const part: Extract<PQPart, { type: 'choice' }> = {
      type: 'choice',
      prompt: 'Fall time',
      choices: [],
      distractors: { correct: 'sqrt(2*h/g)', unit: 's', rules: ['g-10'] },
      shuffle: false,
      marks: 1
    }
    const values = { h: 20, g: 9.81 }
    expect(generateChoices(part, values, S).map((c) => c.text)).toEqual(['2.02 s', '2 s'])
    expect(generateChoices(part, values, { decimals: 0, precisionMode: 'dp' }).map((c) => c.text)).toEqual(['2 s'])
  })
})

describe('Q28: pure and SymPy engine steps work with the exact drawn value, not the student rounding', () => {
  it('fills a pure engine step chip with the exact value', () => {
    const q: PQQuestion = {
      id: 'af-qh-q28-pure',
      title: 'Q28 pure exact',
      statement: 'Expand.',
      variables: [{ name: 'a', def: { kind: 'list', items: [0.125] }, unit: 'none' }],
      parts: [],
      steps: {
        level: 'worked',
        items: [{ head: '', auto: { engine: 'pure', job: 'expand', input: '(x + {a})^2' } }]
      },
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }

    const actual = stepsToWorking(q, drawVariables(q, 1), S).moves.map((m) => m.tex ?? '')
    const expected = runPure('expand', '(x + 0.125)^2').moves.map((m) => m.tex ?? '')
    expect(actual).toEqual(expected)
  })

  it('fills a SymPy engine step chip with the exact value', async () => {
    const q: PQQuestion = {
      id: 'af-qh-q28-cas',
      title: 'Q28 cas exact',
      statement: 'Integrate.',
      variables: [{ name: 'a', def: { kind: 'list', items: [0.125] }, unit: 'none' }],
      parts: [],
      steps: {
        level: 'worked',
        items: [{ head: '', auto: { engine: 'pure', job: 'integrate', input: 'x^({a})' } }]
      },
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }

    let sent = ''
    await workCasSteps(q, { a: 0.125 }, async (_job, input) => {
      sent = input
      return { title: _job, input, moves: [], answers: [], error: 'test' }
    })
    expect(sent).toBe('x^(0.125)')
  })

  /** An expand step on (x + {c})², c being whatever the variables make it. */
  function expandWith(variables: PQQuestion['variables']): PQQuestion {
    return {
      id: 'af-qh-q28-digits',
      title: 'Q28 exact digits',
      statement: 'Expand.',
      variables,
      parts: [],
      steps: { level: 'worked', items: [{ head: '', auto: { engine: 'pure', job: 'expand', input: '(x + {c})^2' } }] },
      license: { id: 'CC BY 4.0', holder: 'PhysLab' }
    }
  }
  const texOf = (q: PQQuestion): (string | undefined)[] => stepsToWorking(q, drawVariables(q, 1), S).moves.map((m) => m.tex)

  // A formula variable keeps the arithmetic's binary noise (a range draw is tidied, a formula is
  // not): a + b at 0.1 and 0.2 is 0.30000000000000004, which the exact-fraction engine worked as
  // 7500000000000001/25000000000000000.
  it('works a formula variable’s value without its binary noise', () => {
    const q = expandWith([
      { name: 'a', def: { kind: 'list', items: [0.1] } },
      { name: 'b', def: { kind: 'list', items: [0.2] } },
      { name: 'c', def: { kind: 'expr', expr: 'a + b' } }
    ])
    expect(drawVariables(q, 1).values.c).not.toBe(0.3)
    expect(texOf(q)).toEqual(runPure('expand', '(x + 0.3)^2').moves.map((m) => m.tex))
  })

  // A tiny value is written in plain digits, never 1.6e-19, and is worked at its full size.
  it('works a tiny value at its full size', () => {
    const q = expandWith([{ name: 'c', def: { kind: 'list', items: [1.6e-19] } }])
    expect(texOf(q)).toEqual(runPure('expand', '(x + 0.00000000000000000016)^2').moves.map((m) => m.tex))
    expect(texOf(q).join(' ')).toContain('\\frac{1}{6250000000000000000}')
  })
})

/** Every .ts and .tsx file under the renderer's source folder. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(e.name) ? [path] : []
  })
}

describe('Q29: the zscoreDistractors comment says what is true', () => {
  // The comment once said the module was "used for the standard-normal Working panel", and then
  // "for the standard-normal readers": nothing in the app imports it. If something does one day,
  // this fails, and the comment in distractors.ts must say what uses it.
  it('says nothing imports the fuller set, and nothing does', () => {
    const comment = readSource('src/renderer/src/questions/distractors.ts').replace(/\s*\n\s*\/\/\s*/g, ' ')
    expect(comment).toContain('(math/pure/zscoreDistractors.ts has a fuller set of the same slips, kept for a later use; nothing imports it today)')
    const importsIt = /(?:from\s+|import\s*\(\s*)['"][^'"]*zscoreDistractors['"]/
    const importers = sourceFiles(RENDERER_SRC).filter((f) => importsIt.test(readFileSync(f, 'utf8')))
    expect(importers).toEqual([])
  })
})
