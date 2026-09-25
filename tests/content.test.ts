// QN2: the curated Numbas school-maths bundle. Every question here was gathered by QN1
// (numbas-all.pqjson, outside the repo) and then curated by hand: deduplicated, checked against
// PhysLab's rules (no programming syntax shown, no broken chip text, an actual visual), and given
// a PhysLab-authored picture of its own mathematics (a curve, a shaded region, arrows, an array of
// dots, a sequence plot) where Numbas gave none (S-Q §3 decision 10 — every such change is named
// in NOTICE and on the question's own `imported.changes`). A question with no honest picture was
// left out rather than given the fallback number line under another name (decision 11).
//
// This file is the guard against the bundle rotting under a later change elsewhere (a Numbas
// import fix, an autoVisual rule, a licence check): every question must still parse, ship, play
// five seeds clean, mark its own right answer right and every choice distractor wrong, and offer
// a real (non-fallback) visual — the same bar `tests/practice.test.ts`'s "every bundled question"
// test holds the whole bank to.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/app/theme', () => ({
  themeColor: (_name: string, fallback = '#888888') => fallback,
  seriesColor: () => '#888888',
  SERIES_COUNT: 6,
  useTheme: { getState: () => ({ theme: 'dark' }) }
}))

import { resetGlobals } from './helpers/globals'
import { readSource, repoPath } from './helpers/repo'
import { isShippable } from '../src/renderer/src/questions/license'
import { loadBundled } from '../src/renderer/src/questions/bank'
import { parsePQFile, type PQFile, type PQQuestion } from '../src/renderer/src/questions/pqjson'
import { substituteTex, type Segment } from '../src/renderer/src/questions/steps'
import { drawVariables } from '../src/renderer/src/questions/variables'
import { evaluateInVariables } from '../src/renderer/src/questions/parts'
import { hasVisual, numberLineOf, visualOf } from '../src/renderer/src/questions/autoVisual'
import { bindValues, checkPlayedPart, picturePlan, playQuestion, spokenOf, type Played, type PartAnswer, type PlayedPart } from '../src/renderer/src/questions/player'
import type { MeasureSettings } from '../src/renderer/src/math/format'

const BANK_PATH = 'src/renderer/src/questions/bank/numbas-school-maths.pqjson'
const SETTINGS: MeasureSettings = { decimals: 4, precisionMode: 'dp', unit: 'm', unitPerSquare: 1, angleUnit: 'deg' }
const SEEDS = [1, 2, 3, 4, 5]
const BUDGET_BYTES = 4 * 1024 * 1024

let file: PQFile
beforeEach(() => {
  resetGlobals()
  file = parsePQFile(readSource(BANK_PATH))
})

/** The answer a student who got it right would type. An unhandled part kind throws rather than
 *  being silently skipped (`questionPlayer.test.ts:431`'s own helper does the same) — a bundled
 *  question of a kind this file has not been taught to check must fail loudly, not go untested. */
function rightAnswerFor(p: PlayedPart, values: Record<string, number>): PartAnswer | null {
  const part = p.part
  if (part.type === 'number') return p.field ? String(p.field.value) : null
  // Bound first: an answer formula may still name one of the question's own drawn variables
  // (only the free symbols are meant to stay letters), and checkExpressionPart marks the
  // student's own text the same way `player.ts`'s `bindValues` prepares it (questionPlayer.test.ts:427).
  if (part.type === 'expression') return bindValues(part.answer, values, part.symbols)
  if (part.type === 'choice') return (p.choices ?? []).map((c, i) => (c.correct ? i : -1)).filter((i) => i >= 0)
  if (part.type === 'matrix') return part.answer.map((row) => row.map((e) => String(evaluateInVariables(e, values))))
  if (part.type === 'proof') return null // shown, never marked (pqjson.ts checkQuestion's own rule)
  throw new Error(`the curated bundle has a part of a kind this test does not check: ${part.type}`)
}

/** Every student-visible string a leftover Numbas artifact or a stray piece of programming syntax
 *  could hide in, as the player hands it to the panel (numbers filled in, a negative chip in maths
 *  bracketed): the statement, every part's prompt, choices and revealed answer, and the worked
 *  steps' heads, maths, rules and notes, faded and full (a step is shown before the answer is). */
function studentVisibleText(played: Played): string {
  const out: string[] = []
  const segs = (lines: Segment[][]): void => {
    for (const line of lines) for (const s of line) out.push('text' in s ? s.text : s.tex)
  }
  segs(played.statement)
  for (const p of played.parts) {
    out.push(p.prompt, p.answerText ?? '')
    segs(p.promptLines)
    for (const c of p.choices ?? []) out.push(c.text)
  }
  for (const m of [...played.working.moves, ...played.full.moves]) out.push(m.head, m.tex ?? '', m.rule ?? '', m.note ?? '')
  return out.join('\n')
}

/** Text a student must never read, and why. */
const FORBIDDEN: [RegExp, string][] = [
  [/\\simplify/, 'a Numbas \\simplify macro'],
  [/shown\d/, 'a broken shownN chip'],
  [/\bif\s*\([^)]*\)\s*\{/, 'an if(…){ block'],
  [/=\s*(TRUE|FALSE)\b/, 'a TRUE/FALSE flag'],
  // $…$ is LaTeX's inline maths, which PhysLab never reads (it wants \(…\)); a display $$ line has
  // already been taken apart by the player, and an escaped \$ is a dollar sign.
  [/(?<!\\)\$/, 'a $ left from $…$ maths'],
  [/&[a-z]+;/, 'an HTML entity such as &euro;'],
  [/\d{2}= \d/, 'a power flattened into digits ("27= 128" for 2⁷ = 128)'],
  // AGENTS rule 2: nothing that looks like programming. A negative number bracketed in a list or
  // coordinates ("P(3,(-10),1)"), as a coefficient ("+(-5)*z") or squeezed against a plus in the
  // plain sentence ("6 +(-9)") is a chip filled in blindly; "4 × (−7) + (−3) × 2" in a worked
  // step is how maths is written and is left alone.
  [/\*/, 'an asterisk for times'],
  [/\^\(/, 'a power written ^( … )'],
  [/,\s*(\\left)?\(\s*-\s*\d+(\.\d+)?\s*(\\right)?\)/, 'a bracketed negative in a list or coordinates'],
  [/(\\left)?\(\s*-\s*\d+(\.\d+)?\s*(\\right)?\)\s*\*?\s*[a-z]\b/, 'a bracketed negative coefficient'],
  [/\+\(-\d/, 'a bracketed negative squeezed against a plus'],
  // Text written for the Numbas editor or for another institution's course, wrong in PhysLab.
  [/Newcastle|editor version|lecture slides|Study Skills|navigation at the top|previous part|missing marks|number line here|Enter an integer|Caclulate/i, "authoring or another course's text"]
]

/** The strings the panel shows with no KaTeX at all: each part's prompt as one plain sentence
 *  (above its revealed answer in Practice, and every box's accessible name) and each choice. */
function plainVisibleText(played: Played): string[] {
  return played.parts.flatMap((p) => [p.prompt, ...(p.choices ?? []).map((c) => c.text)])
}

/** Plain text a student must never read. The LaTeX patterns above are fine inside KaTeX; here
 *  they are what `texToPlain` left behind ("2^n", "y_0", "\$40"). */
const FORBIDDEN_PLAIN: [RegExp, string][] = [
  [/\\/, 'a backslash: a LaTeX command or an escaped \\$ left in words'],
  [/\^[A-Za-z0-9({]/, 'a power left as ^'],
  [/_[A-Za-z0-9{]/, 'a subscript left as _'],
  [/\d×|×\d/, 'a times sign pressed against a number']
]

/** The LaTeX commands `texToPlain` (math/pure/work.ts) speaks, or that carry no symbol
 *  (\displaystyle). Any other command in a prompt's maths — \int, \geq, \infty — is dropped from
 *  the plain sentence without a trace: '∫₀² x(2x+3) dx' became '_0² x(2x+3) dx'. */
const SPOKEN_COMMANDS = new Set(['frac', 'dfrac', 'sqrt', 'text', 'left', 'right', 'times', 'cdot', 'quad', 'displaystyle'])

/** Everything wrong with a question's plain prompt lines, over five seeds. */
function plainPromptFaults(questions: PQQuestion[]): string[] {
  const out: string[] = []
  const alnum = /[A-Za-z0-9]/
  for (const q of questions) {
    for (const seed of SEEDS) {
      const played = playQuestion(q, seed, SETTINGS)
      for (const text of plainVisibleText(played)) {
        for (const [re, what] of FORBIDDEN_PLAIN) if (re.test(text)) out.push(`${q.title} #${seed}: ${what} in "${text}"`)
      }
      for (const p of played.parts) {
        const where = `${q.title} #${seed} part ${p.index}`
        // Lines are joined into one sentence; each must end where the next begins.
        if (p.prompt !== p.promptLines.map((l) => spokenOf(l)).join(' ')) out.push(`${where}: lines run together in "${p.prompt}"`)
        for (const line of p.promptLines) {
          for (const [k, s] of line.entries()) {
            if ('tex' in s) {
              for (const [, name] of s.tex.matchAll(/\\([A-Za-z]+)/g)) if (!SPOKEN_COMMANDS.has(name)) out.push(`${where}: \\${name} is lost from "${p.prompt}"`)
            }
            // Words against maths with no space: 'the recursive formula' + 'y(n)' read 'formulay(n)'.
            const next = line[k + 1]
            if (next && ('tex' in s) !== ('tex' in next)) {
              const a = spokenOf([s])
              const b = spokenOf([next])
              const raw = 'text' in s ? s.text : (next as { text: string }).text
              const edge = 'text' in s ? raw.slice(-1) : raw.slice(0, 1)
              if (alnum.test(a.slice(-1)) && alnum.test(b.slice(0, 1)) && alnum.test(edge)) out.push(`${where}: "${a}" and "${b}" run together`)
            }
          }
        }
      }
    }
  }
  return [...new Set(out)]
}

/** Each forbidden pattern found in a bundled question's student-visible text, over five seeds. */
function forbiddenFound(questions: PQQuestion[]): string[] {
  const out: string[] = []
  for (const q of questions) {
    for (const seed of SEEDS) {
      const blob = studentVisibleText(playQuestion(q, seed, SETTINGS))
      for (const [re, what] of FORBIDDEN) {
        const m = blob.match(re)
        if (m) out.push(`${q.title} #${seed}: ${what} in "…${blob.slice(Math.max(0, m.index! - 30), m.index! + 30)}…"`)
      }
    }
  }
  return [...new Set(out)]
}

/** Every choice a student could have picked instead, one distractor at a time. */
function distractorsFor(p: PlayedPart): PartAnswer[] {
  if (p.part.type !== 'choice') return []
  return (p.choices ?? []).map((c, i) => i).filter((i) => !p.choices![i].correct).map((i) => [i])
}

/** Every "question #seed part: typed" whose answer is a whole number and yet one more or one
 *  fewer was marked right. A matrix entry is tried one at a time, the other entries left right. */
function offByOneAccepted(questions: PQQuestion[]): string[] {
  const out: string[] = []
  for (const q of questions) {
    for (const seed of SEEDS) {
      const played = playQuestion(q, seed, SETTINGS)
      for (const p of played.parts) {
        if (p.part.type === 'number' && p.field && Number.isInteger(p.field.value)) {
          for (const typed of [p.field.value - 1, p.field.value + 1]) {
            if (checkPlayedPart(p, String(typed), played, SETTINGS).verdict === 'right') out.push(`${q.title} #${seed} part ${p.index}: ${typed}`)
          }
        }
        if (p.part.type === 'matrix') {
          const grid = rightAnswerFor(p, played.variant.values) as string[][]
          grid.forEach((row, r) =>
            row.forEach((cell, c) => {
              const v = Number(cell)
              if (!Number.isInteger(v)) return
              for (const typed of [v - 1, v + 1]) {
                const near = grid.map((rw, i) => rw.map((e, j) => (i === r && j === c ? String(typed) : e)))
                if (checkPlayedPart(p, near, played, SETTINGS).verdict === 'right') out.push(`${q.title} #${seed} entry ${r + 1},${c + 1}: ${typed}`)
              }
            })
          )
        }
      }
    }
  }
  return out
}

describe('the curated Numbas school-maths bundle (QN2)', () => {
  it('parses as a PhysLab question file and holds a reasonable, deduplicated set', () => {
    expect(file.questions.length).toBeGreaterThan(0)
    const ids = new Set(file.questions.map((q) => q.id))
    expect(ids.size).toBe(file.questions.length)
    const titles = new Set(file.questions.map((q) => q.title))
    expect(titles.size).toBe(file.questions.length)
  })

  it('is CC BY 4.0, CC BY-SA 4.0 or CC0 1.0 for every question (the licence gate; S-Q §3)', () => {
    for (const q of file.questions) expect(isShippable(q.license), q.title).toBe(true)
  })

  it('names every question\'s own change from the Numbas original, as CC BY/BY-SA requires', () => {
    for (const q of file.questions) {
      expect(q.imported?.format, q.title).toBe('numbas')
      expect(q.imported?.itemUrl, q.title).toBeTruthy()
    }
  })

  it('shows no programming syntax (AGENTS rule 2) and no leftover Numbas macro text, anywhere a student reads', () => {
    expect(forbiddenFound(file.questions)).toEqual([])
  })

  it('reads every part\'s plain prompt line as its maths: no symbol lost, no ^ or _ or \\$, no words run together', () => {
    // Round 2: the line above each revealed answer read '_0² x(2x+3) dx = ___' (∫ lost),
    // 'n3' (≥ lost), '2^n, y_0=1', 'cost \$40.How much' and 'the recursive formulay(n)'.
    expect(plainPromptFaults(file.questions)).toEqual([])
  })

  it('plays five seeds with no problems, marks its own answer right and every distractor wrong, and shows a real visual', () => {
    for (const q of file.questions) {
      for (const seed of SEEDS) {
        const played = playQuestion(q, seed, SETTINGS)
        expect(played.problems, `${q.title} #${seed}`).toEqual([])

        for (const p of played.parts) {
          const right = rightAnswerFor(p, played.variant.values)
          if (right === null) continue
          const rightCheck = checkPlayedPart(p, right, played, SETTINGS)
          expect(rightCheck.verdict, `${q.title} #${seed} part ${p.index}: ${rightCheck.message ?? ''}`).toBe('right')
          for (const wrong of distractorsFor(p)) {
            expect(checkPlayedPart(p, wrong, played, SETTINGS).verdict, `${q.title} #${seed} part ${p.index} distractor`).not.toBe('right')
          }
        }

        const variant = drawVariables(q, seed)
        const plan = visualOf(q, variant)
        expect(plan.source, `${q.title} #${seed}`).not.toBe('fallback')
        expect(hasVisual(plan), `${q.title} #${seed}`).toBe(true)
      }
    }
  })

  it('draws a picture of its own mathematics, never the Fix-21 fallback number line frozen into the file (decision 11)', () => {
    for (const q of file.questions) {
      expect(q.picture ?? q.motion ?? q.sandbox, q.title).toBeTruthy()
      for (const seed of SEEDS) {
        const played = playQuestion(q, seed, SETTINGS)
        // Frozen into the file, the fallback reads as 'authored' and passes the visual test above
        // while losing its "PhysLab drew this from the question's numbers" caption.
        const fallback = numberLineOf(q, played.variant).visual.picture
        if (q.picture?.kind === 'numberline' && fallback?.kind === 'numberline') expect(q.picture.items, `${q.title} #${seed}`).not.toEqual(fallback.items)
        if (q.picture) expect(() => picturePlan(q.picture!, played, SETTINGS), `${q.title} #${seed}`).not.toThrow()
      }
    }
  })

  it('never draws a part\'s answer: no dot count is a number answer, no arrow ends on an answer matrix\'s column or row', () => {
    // Round 2: 'Multiplication test' drew all 21 of a week's apples (part 1's answer, counted off
    // the dots), and the matrix pictures ran their arrows head to tail so the last tip sat on the
    // first column of A + B or AB. The picture shows the question's mathematics, never its result.
    const pad = (xs: number[]): number[] => [...xs, 0, 0, 0].slice(0, 3)
    const same = (a: number[], b: number[]): boolean => a.every((x, i) => Math.abs(x - b[i]) < 1e-9)
    const leaks: string[] = []
    for (const q of file.questions) {
      if (q.picture?.kind !== 'vectors' && q.picture?.kind !== 'dots') continue
      for (const seed of SEEDS) {
        const played = playQuestion(q, seed, SETTINGS)
        const numbers = played.parts.flatMap((p) => (p.field ? [p.field.value] : []))
        const lines = played.parts.flatMap((p) => {
          if (p.part.type !== 'matrix') return []
          const m = p.part.answer.map((row) => row.map((e) => evaluateInVariables(e, played.variant.values)))
          const cols = m[0].map((_, j) => m.map((row) => row[j]))
          return [...m, ...cols].map(pad)
        })
        const plan = picturePlan(q.picture, played, SETTINGS)
        if (plan.kind === 'dots' && numbers.includes(plan.count)) leaks.push(`${q.title} #${seed}: ${plan.count} dots`)
        if (plan.kind === 'vectors') {
          for (const it of plan.items) {
            const tip = it.v.map((x, i) => x + (it.tail?.[i] ?? 0))
            if (lines.some((l) => same(tip, l))) leaks.push(`${q.title} #${seed}: ${it.name} ends at (${tip.join(', ')})`)
          }
        }
      }
    }
    expect(leaks).toEqual([])
  })

  it('plots each recurrence\'s first five terms as the recurrence itself makes them', () => {
    const plotted = (title: string): number[] => {
      const pic = file.questions.find((q) => q.title === title)!.picture
      if (pic?.kind !== 'curves') throw new Error(`${title} has no sequence plot`)
      return pic.items.map((it) => Number(it.expr))
    }
    const run = (first: number[], next: (y: number[], n: number) => number, from: number): number[] => {
      const y = [...first]
      for (let n = from + first.length; y.length < 5; n++) y.push(next(y, n))
      return y
    }
    // y(n) = 6y(n−1) − 9y(n−2) + 2ⁿ, y(0) = 1, y(1) = 2
    expect(plotted('A recurrence relation (5)')).toEqual(run([1, 2], (y, n) => 6 * y[y.length - 1] - 9 * y[y.length - 2] + 2 ** n, 0))
    // y(n) = 3y(n−1) − 2y(n−2), y(1) = 0, y(2) = 2
    expect(plotted('A recurrence relation (4)')).toEqual(run([0, 2], (y) => 3 * y[y.length - 1] - 2 * y[y.length - 2], 1))
    // y(n) = 3y(n−1) − 4n, y(0) = 2
    expect(plotted('A recurrence relation (3)')).toEqual(run([2], (y, n) => 3 * y[y.length - 1] - 4 * n, 0))
    // y(n) = 3y(n−1), y(0) = 2
    expect(plotted('A recurrence relation (2)')).toEqual(run([2], (y) => 3 * y[y.length - 1], 0))
  })

  it('refuses a whole-number answer that is one out, in every number box and every matrix entry, over five seeds', () => {
    // The stored key only proves it marks itself; Numbas marks these exactly, and a 2 % band
    // inherited from the importer let 62 and 64 pass for 63 (and 73 for 74 in a matrix product).
    expect(offByOneAccepted(file.questions)).toEqual([])
  })

  it('lists every question\'s licence source in NOTICE', () => {
    const notice = readSource('NOTICE')
    for (const q of file.questions) {
      const source = q.license.source ?? q.imported?.itemUrl
      expect(source, q.title).toBeTruthy()
      expect(notice, `${q.title}: ${source}`).toContain(source!)
    }
  })

  it('keeps its licence change notes to how each question differs from the original, not review history', () => {
    // A CC BY change note says what differs from the Numbas original; the story of an internal
    // review round ("Round 3: …") is not one, and once contradicted the note's own "marked exactly".
    const HISTORY = /\bround \d\b|\bwas drawn\b/i
    const notes = file.questions.flatMap((q) => (q.imported?.changes ?? []).map((c) => `${q.title}: ${c}`))
    expect(notes.filter((n) => HISTORY.test(n))).toEqual([])
    const notice = readSource('NOTICE')
    expect(notice).not.toMatch(/\bRound \d\b/)
    // The two parts marked to within 0.0001 are described as that, never as "marked exactly".
    for (const title of ['Adding two measured lengths', 'VAT on a price']) {
      const q = file.questions.find((x) => x.title === title)!
      expect(q.parts.some((p) => p.type === 'number' && p.tolerance?.kind === 'absolute' && p.tolerance.value === 0.0001), title).toBe(true)
      const note = (q.imported?.changes ?? []).join(' ')
      expect(note, title).toContain('to within 0.0001')
      expect(note, title).not.toMatch(/marked exactly|^Marked exactly/i)
    }
  })

  it('keeps the bundle inside its size budget (4 MB; S-Q QN2)', () => {
    const bytes = Buffer.byteLength(readFileSync(repoPath(BANK_PATH), 'utf8'), 'utf8')
    expect(bytes).toBeLessThan(BUDGET_BYTES)
  })
})

// Round 3: a bracketed negative such as "2 & \left(-9\right)" in a matrix cell, or "= (−7)" after
// a step's own "=", was FIX-2's own notFixed finding against the round-2 bundle — true, but its
// cause is substituteTex (steps.ts), not any question's wording. Widened here from a plain
// content-test ban into its own describe: the pure function's every case, then the same ban run
// against the shipped bundle as a regression guard.
describe('substituteTex leaves a stand-alone negative unbracketed (round 3)', () => {
  it('reads a negative chip plainly at a matrix/array cell boundary', () => {
    expect(substituteTex('2 & {a}', { a: -9 }, {}, SETTINGS)).toBe('2 & -9')
    expect(substituteTex('1 & 2 \\\\ {a} & 4', { a: -9 }, {}, SETTINGS)).toBe('1 & 2 \\\\ -9 & 4')
  })

  it('reads a matrix\'s or an array\'s first cell plainly too — it follows \\begin{…}, not "&"', () => {
    expect(substituteTex('\\begin{pmatrix} {a} & {b} \\end{pmatrix}', { a: -1, b: -2 }, {}, SETTINGS)).toBe(
      '\\begin{pmatrix} -1 & -2 \\end{pmatrix}'
    )
    expect(substituteTex('\\begin{bmatrix}{a}\\end{bmatrix}', { a: -4 }, {}, SETTINGS)).toBe('\\begin{bmatrix}-4\\end{bmatrix}')
    // The bundle's own matrix form: A = \left(\begin{array}{rrr} {a11} & … \end{array}\right).
    expect(substituteTex('\\left(\\begin{array}{rrr} {a} & {b} & 3 \\end{array}\\right)', { a: -7, b: 5 }, {}, SETTINGS)).toBe(
      '\\left(\\begin{array}{rrr} -7 & 5 & 3 \\end{array}\\right)'
    )
    // A first cell under a power keeps its brackets, and an opening that is not a matrix's or an
    // array's (cases, a plain group) is not a cell start.
    expect(substituteTex('\\begin{pmatrix} {a}^2 \\end{pmatrix}', { a: -1 }, {}, SETTINGS)).toBe(
      '\\begin{pmatrix} \\left(-1\\right)^2 \\end{pmatrix}'
    )
    expect(substituteTex('\\begin{cases} {a} \\end{cases}', { a: -1 }, {}, SETTINGS)).toBe('\\begin{cases} \\left(-1\\right) \\end{cases}')
  })

  it('reads a negative chip plainly standing alone right after "="', () => {
    expect(substituteTex('y = {a}', { a: -7 }, {}, SETTINGS)).toBe('y = -7')
    expect(substituteTex('{r} = {a}', { r: 3, a: -7 }, {}, SETTINGS)).toBe('3 = -7')
  })

  it('still brackets a negative anywhere else a sign could be misread', () => {
    expect(substituteTex('{a} \\times 2', { a: -3 }, {}, SETTINGS)).toBe('\\left(-3\\right) \\times 2')
    expect(substituteTex('5 + {a}', { a: -3 }, {}, SETTINGS)).toBe('5 + \\left(-3\\right)')
    expect(substituteTex('5 - {a}', { a: -3 }, {}, SETTINGS)).toBe('5 - \\left(-3\\right)')
    expect(substituteTex('P = ({a}, 2)', { a: -3 }, {}, SETTINGS)).toBe('P = (\\left(-3\\right), 2)')
  })

  it('still brackets a stand-alone negative raised to a power or a subscript', () => {
    expect(substituteTex('2 & {a}^2', { a: -9 }, {}, SETTINGS)).toBe('2 & \\left(-9\\right)^2')
    expect(substituteTex('y = {a}^2', { a: -9 }, {}, SETTINGS)).toBe('y = \\left(-9\\right)^2')
    expect(substituteTex('2 & {a}_0', { a: -9 }, {}, SETTINGS)).toBe('2 & \\left(-9\\right)_0')
  })

  it('still brackets a unit under a power wherever the chip sits, sign or no sign', () => {
    expect(substituteTex('2 & {t}^2', { t: 5 }, { t: 's' }, SETTINGS)).toBe('2 & \\left(5\\,\\mathrm{s}\\right)^2')
    expect(substituteTex('{t}^2', { t: 5 }, { t: 's' }, SETTINGS)).toBe('\\left(5\\,\\mathrm{s}\\right)^2')
  })

  it('leaves the curated bundle free of a bracketed negative after "&", a row\'s "\\\\", "=" or a matrix\'s \\begin', () => {
    const found: string[] = []
    const BAN = /(?:&|\\\\|=|\\begin\{[a-zA-Z]*matrix\*?\}|\\begin\{array\}\{[^{}]*\})\s*(\\left)?\(\s*-\s*\d+(\.\d+)?\s*(\\right)?\)/
    // Ten seeds, not five: a matrix's first cell is negative for only some draws (a11, b11 in −9…9).
    const matrixTitles: string[] = []
    for (const q of file.questions) {
      if (/\\begin\{(?:array|[pbvBV]?matrix)/.test(JSON.stringify(q))) matrixTitles.push(q.title)
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const blob = studentVisibleText(playQuestion(q, seed, SETTINGS))
        const m = blob.match(BAN)
        if (m) found.push(`${q.title} #${seed}: "…${blob.slice(Math.max(0, m.index! - 20), m.index! + 30)}…"`)
      }
    }
    expect(found).toEqual([])
    // The scan must actually reach the matrix questions it was widened for.
    expect(matrixTitles).toEqual(expect.arrayContaining(['Matrix addition', 'Matrix subtraction', 'Matrix multiplication AB', 'Matrix multiplication BA']))
  })
})

describe('loading the bundled bank once (bank.ts, S-Q §5 risk 5)', () => {
  it('gives every caller the same questions, each its own copy', () => {
    const first = loadBundled().questions
    const q = first.find((x) => x.title === 'Like terms')!
    expect(q).toBeTruthy()
    // One caller changing its copy in place must not reach the next caller through the cache.
    q.title = 'changed by one caller'
    q.parts[0].prompt = ''
    const second = loadBundled().questions
    expect(second.map((x) => x.id)).toEqual(first.map((x) => x.id))
    const again = second.find((x) => x.id === q.id)!
    expect(again.title).toBe('Like terms')
    expect(again.parts[0].prompt).not.toBe('')
  })
})

/** The verdict for `typed` in one part of a bundled question, played at `seed`. */
function verdictOf(title: string, partIndex: number, typed: PartAnswer, seed = 1): string {
  const q = parsePQFile(readSource(BANK_PATH)).questions.find((x) => x.title === title)
  if (!q) throw new Error(`no bundled question called ${title}`)
  const played = playQuestion(q, seed, SETTINGS)
  const p = played.parts.find((x) => x.index === partIndex)
  if (!p) throw new Error(`${title} has no part ${partIndex}`)
  return checkPlayedPart(p, typed, played, SETTINGS).verdict
}

// Known answers worked from each question's own words, never read back from its key: a wrong key
// marks itself right, so the "marks its own answer" test above cannot catch one.
describe('the curated bundle against answers worked from the questions themselves (QN2)', () => {
  it('a recurrence relation (3): y(n) − 3y(n−1) = −4n, y(0) = 2 is −3ⁿ + 2n + 3', () => {
    const y = [2]
    for (let n = 1; n <= 3; n++) y.push(3 * y[n - 1] - 4 * n)
    expect(y).toEqual([2, 2, -2, -18])
    const direct = (n: number): number => -(3 ** n) + 2 * n + 3
    expect([0, 1, 2, 3].map(direct)).toEqual(y)
    expect(verdictOf('A recurrence relation (3)', 0, '-3^n + 2n + 3')).toBe('right')
    expect(verdictOf('A recurrence relation (3)', 0, '5*3^n - 2n - 3')).not.toBe('right')
  })

  it('a definite integral: ∫₀² x(2x + 3) dx = 16/3 + 6 = 34/3', () => {
    expect((2 * 2 ** 3) / 3 + (3 * 2 ** 2) / 2).toBeCloseTo(34 / 3, 12)
    expect(verdictOf('A definite integral', 0, '34/3')).toBe('right')
    expect(verdictOf('A definite integral', 0, '11.33')).toBe('right')
    expect(verdictOf('A definite integral', 0, '11.3')).not.toBe('right')
    expect(verdictOf('A definite integral', 0, '12')).not.toBe('right')
  })

  it('compound interest: €1 000 for 5 years at 3.5 % grows to 1 000 × 1.035⁵ = €1 187.69, and the rate is 3.50 %', () => {
    const q = file.questions.find((x) => x.title === 'Compound interest on savings')!
    // Seed 1 is the textbook case; the check below still works it from the drawn numbers.
    const { P, n, A } = drawVariables(q, 1).values
    expect([P, n]).toEqual([1000, 5])
    expect(A).toBe(1187.69)
    expect(Math.round(1000 * 1.035 ** 5 * 100) / 100).toBe(1187.69)
    const rate = ((A / P) ** (1 / n) - 1) * 100
    expect(verdictOf('Compound interest on savings', 3, rate.toFixed(2))).toBe('right')
    expect(verdictOf('Compound interest on savings', 3, '3.5')).toBe('right')
    expect(verdictOf('Compound interest on savings', 3, '3.52')).not.toBe('right')
    expect(verdictOf('Compound interest on savings', 1, '1187.69')).toBe('right')
  })

  it('simple interest: the sum plus P × t × r, to the cent', () => {
    const q = file.questions.find((x) => x.title === 'Simple interest')!
    for (const seed of SEEDS) {
      const { initial, n, p } = drawVariables(q, seed).values
      const total = initial + (initial * n * p) / 100
      expect(verdictOf('Simple interest', 0, total.toFixed(2), seed), `#${seed}`).toBe('right')
      expect(verdictOf('Simple interest', 0, (total + 0.01).toFixed(2), seed), `#${seed}`).not.toBe('right')
    }
  })

  it('VAT: £70 + 20 % is £84 and £96 less its VAT is £80, and one pound out is wrong', () => {
    const q = file.questions.find((x) => x.title === 'VAT on a price')!
    for (const seed of SEEDS) {
      const { novatprice1, vatprice2 } = drawVariables(q, seed).values
      expect(verdictOf('VAT on a price', 0, String(novatprice1 * 1.2), seed), `#${seed}`).toBe('right')
      expect(verdictOf('VAT on a price', 0, String(novatprice1 * 1.2 - 1), seed), `#${seed}`).not.toBe('right')
      expect(verdictOf('VAT on a price', 1, String(vatprice2 / 1.2), seed), `#${seed}`).toBe('right')
    }
    expect(70 * 1.2).toBeCloseTo(84, 9)
    expect(96 / 1.2).toBeCloseTo(80, 9)
  })

  it('multiplication test: 3 apples a day is 21 a week and 63 in three weeks', () => {
    expect(verdictOf('Multiplication test', 0, '21')).toBe('right')
    expect(verdictOf('Multiplication test', 1, '63')).toBe('right')
    for (const wrong of ['62', '64']) expect(verdictOf('Multiplication test', 1, wrong)).not.toBe('right')
  })

  it('guitar: fret 14 of a 647.7 mm scale is 647.7(1 − 2^(−14/12)) = 359.2 mm, and fret 8 at 245.1 mm means a 662.4 mm scale', () => {
    expect(647.7 * (1 - 2 ** (-14 / 12))).toBeCloseTo(359.18, 2)
    expect(245.1 / (1 - 2 ** (-8 / 12))).toBeCloseTo(662.36, 2)
    expect(verdictOf('Guitar fret spacing', 0, '359.2')).toBe('right')
    expect(verdictOf('Guitar fret spacing', 0, '359.3')).not.toBe('right')
    expect(verdictOf('Guitar scale length', 0, '662.4')).toBe('right')
    expect(verdictOf('Guitar scale length', 0, '662.5')).not.toBe('right')
  })

  it('two measured lengths: the total to 2 significant figures, and the unrounded sum is not it', () => {
    const q = file.questions.find((x) => x.title === 'Adding two measured lengths')!
    for (const seed of SEEDS) {
      const { a, b } = drawVariables(q, seed).values
      const sum = a + b
      const twoSf = Number(sum.toPrecision(2))
      expect(verdictOf('Adding two measured lengths', 0, String(twoSf), seed), `#${seed} ${sum}`).toBe('right')
      if (Math.abs(twoSf - sum) > 1e-9) expect(verdictOf('Adding two measured lengths', 0, sum.toFixed(2), seed), `#${seed}`).not.toBe('right')
    }
  })

  it('the recurrences: (2) is 2·3ⁿ, (4) is 2ⁿ − 2 and (5) is −3ⁿ⁺¹ + n·3ⁿ + 2ⁿ⁺², each checked against its own recurrence', () => {
    for (let n = 0; n <= 6; n++) {
      const y5 = (k: number): number => -(3 ** (k + 1)) + k * 3 ** k + 2 ** (k + 2)
      if (n >= 2) expect(y5(n) - 6 * y5(n - 1) + 9 * y5(n - 2)).toBe(2 ** n)
      const y4 = (k: number): number => 2 ** k - 2
      if (n >= 3) expect(y4(n) - 3 * y4(n - 1) + 2 * y4(n - 2)).toBe(0)
      const y2 = (k: number): number => 2 * 3 ** k
      if (n >= 1) expect(y2(n) - 3 * y2(n - 1)).toBe(0)
    }
    expect(verdictOf('A recurrence relation (5)', 0, '-3^(n+1) + n*3^n + 2^(n+2)')).toBe('right')
    expect(verdictOf('A recurrence relation (4)', 0, '2^n - 2')).toBe('right')
    expect(verdictOf('A recurrence relation (4)', 0, '2^n')).not.toBe('right')
    expect(verdictOf('A recurrence relation (2)', 0, '2*3^n')).toBe('right')
  })

  it('the point-to-plane question always draws a real plane, and its distance is |ax + by + cz + d| ÷ √(a² + b² + c²)', () => {
    const q = file.questions.find((x) => x.title === 'Calculate distance from a point to a plane')!
    for (let seed = 1; seed <= 300; seed++) {
      const { a, b, c, d, px, py, pz } = drawVariables(q, seed).values
      // a = b = c = 0 is no plane at all, and the distance would divide by zero.
      expect(a * a + b * b + c * c, `#${seed}`).toBeGreaterThan(0)
      expect(Number.isFinite(evaluateInVariables(q.parts[0].type === 'number' ? q.parts[0].answer : '', { a, b, c, d, px, py, pz })), `#${seed}`).toBe(true)
    }
    // P = (1, 2, 3) and 2x + 3y + 6z + 1 = 0: |2 + 6 + 18 + 1| ÷ √49 = 27/7 ≈ 3.857.
    const played = playQuestion(q, 1, SETTINGS)
    const p = played.parts[0]
    const v = { ...played.variant.values, a: 2, b: 3, c: 6, d: 1, px: 1, py: 2, pz: 3 }
    expect(evaluateInVariables(p.part.type === 'number' ? p.part.answer : '', v)).toBeCloseTo(27 / 7, 12)
    const { a, b, c, d, px, py, pz } = played.variant.values
    const dist = Math.abs(a * px + b * py + c * pz + d) / Math.hypot(a, b, c)
    expect(checkPlayedPart(p, dist.toFixed(2), played, SETTINGS).verdict).toBe('right')
    expect(checkPlayedPart(p, (dist + 0.01).toFixed(2), played, SETTINGS).verdict).not.toBe('right')
  })

  it('like terms: the cheetah (31 m/s) catches a sprinter (10 m/s, 50 m ahead) at 50/21 ≈ 2.4 s', () => {
    const t = 50 / (31 - 10)
    expect(t).toBeCloseTo(2.381, 3)
    expect(verdictOf('Like terms', 5, '2.4')).toBe('right')
    expect(verdictOf('Like terms', 5, '2.38')).toBe('right')
    expect(verdictOf('Like terms', 5, '2.3')).not.toBe('right')
    expect(verdictOf('Like terms', 5, '2.2')).not.toBe('right')
  })
})

describe('the full Numbas question pack (built outside the repo, QN2)', () => {
  const PACK_PATH = 'C:/my_projects/PhysLab-content/PhysLab Question Pack.pqjson'
  const has = (() => {
    try {
      readFileSync(PACK_PATH, 'utf8')
      return true
    } catch {
      return false
    }
  })()

  it.skipIf(!has)('parses, ships under an allowed licence, and plays five seeds marking its own answer right and every distractor wrong', () => {
    const pack = parsePQFile(readFileSync(PACK_PATH, 'utf8'))
    expect(pack.questions.length).toBeGreaterThan(0)
    const failures: string[] = []
    for (const q of pack.questions as PQQuestion[]) {
      expect(isShippable(q.license), q.title).toBe(true)
      for (const seed of SEEDS) {
        const played = playQuestion(q, seed, SETTINGS)
        if (played.problems.length > 0) failures.push(`${q.title} #${seed}: ${played.problems[0]}`)
        for (const p of played.parts) {
          const right = rightAnswerFor(p, played.variant.values)
          if (right === null) continue
          const check = checkPlayedPart(p, right, played, SETTINGS)
          if (check.verdict !== 'right') failures.push(`${q.title} #${seed} part ${p.index}: own answer marked ${check.verdict}`)
          for (const wrong of distractorsFor(p)) {
            if (checkPlayedPart(p, wrong, played, SETTINGS).verdict === 'right') failures.push(`${q.title} #${seed} part ${p.index}: a distractor marked right`)
          }
        }
      }
    }
    expect(failures).toEqual([])
  })

  it.skipIf(!has)('refuses a whole-number answer that is one out, as the app\'s own set does', () => {
    expect(offByOneAccepted(parsePQFile(readFileSync(PACK_PATH, 'utf8')).questions)).toEqual([])
  })

  it.skipIf(!has)('holds every question the app ships, exactly as the app ships it', () => {
    const pack = parsePQFile(readFileSync(PACK_PATH, 'utf8'))
    const byId = new Map(pack.questions.map((q) => [q.id, q]))
    for (const q of file.questions) expect(byId.get(q.id), q.title).toEqual(q)
    // The app's NOTICE once called these '50 further questions … outside this curated set'.
    expect(readSource('NOTICE')).toContain(`holds ${pack.questions.length} questions: the ${file.questions.length} above`)
  })

  it.skipIf(!has)('has its own NOTICE beside it, naming every question\'s licence source', () => {
    const notice = readFileSync(join('C:/my_projects/PhysLab-content', 'PhysLab Question Pack NOTICE.txt'), 'utf8')
    const pack = parsePQFile(readFileSync(PACK_PATH, 'utf8'))
    for (const q of pack.questions as PQQuestion[]) {
      const source = q.license.source ?? q.imported?.itemUrl
      expect(notice, `${q.title}: ${source}`).toContain(source!)
    }
  })
})
