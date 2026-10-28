import { describe, it, expect, beforeEach } from 'vitest'
import { evaluateInput } from '../src/renderer/src/calc/evaluateInput'
import { reconcile } from '../src/renderer/src/calc/working'
import { usePure } from '../src/renderer/src/math/pure/store'
import { resetGlobals } from './helpers/globals'
import { scene } from '../src/renderer/src/core/store'
import { FSC_PROBLEMS, type FScProblem } from './fscProblemsCorpus'

beforeEach(() => {
  resetGlobals()
  scene().setSettings({ angleUnit: 'deg' })
})

const OPTS_DEG = { vars: {}, ans: 0, angle: 'deg' as const }
const OPTS_RAD = { vars: {}, ans: 0, angle: 'rad' as const }

export function runProblem(prob: FScProblem) {
  const angle = prob.angle ?? 'deg'
  scene().setSettings({ angleUnit: angle })
  const opts = angle === 'rad' ? OPTS_RAD : OPTS_DEG
  let card: ReturnType<typeof evaluateInput> = null
  let cardError: string | null = null
  try {
    card = evaluateInput('COMP', prob.input, opts)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    cardError = msg
  }

  let pureWorking: ReturnType<typeof usePure.getState>['working'] = null
  try {
    usePure.getState().runLatex(prob.input, 'auto', { quiet: true })
    pureWorking = usePure.getState().working ?? null
  } catch {
    // ignore runLatex exceptions
  }

  const joined = card ? reconcile(card, pureWorking) : { verdict: 'unchecked' as const }
  return { card, cardError, pureWorking, joined }
}

describe('Q03: Calculator 300+ FSc/A-level Coverage Sweep', () => {
  it('has at least 300 problems across key topics', () => {
    expect(FSC_PROBLEMS.length).toBeGreaterThanOrEqual(300)
  })

  it('runs the full sweep, categorises successes, refusals, and unchecked items', () => {
    const results: {
      prob: FScProblem
      cardMain?: string
      cardError?: string
      checked?: string
      verdict?: string
      status: 'pass' | 'refusal' | 'unchecked_pass' | 'mismatch'
    }[] = []

    for (const p of FSC_PROBLEMS) {
      const res = runProblem(p)
      const main = res.card?.main ?? ''
      const err = res.cardError ?? res.card?.error
      const checked = res.pureWorking?.checked
      const verdict = res.joined.verdict

      let status: 'pass' | 'refusal' | 'unchecked_pass' | 'mismatch' = 'pass'
      if (err || !main) {
        status = 'refusal'
      } else if (p.expected) {
        // Normalize typographic characters, LaTeX delimiters and whitespace for matching
        const cleanText = (t: string) => t.replace(/\u2212/g, '-').replace(/\\left|\\right/g, '').replace(/\^\{(\d+)\}/g, '^$1').replace(/²/g, '^2').replace(/³/g, '^3').replace(/ˣ/g, '^x').replace(/\s+/g, ' ')
        const normMain = cleanText(main)
        const normExpected = p.expected instanceof RegExp ? p.expected : cleanText(String(p.expected))

        const allAnswers = cleanText([main, ...(res.pureWorking?.answers.map((a) => a.tex) ?? [])].join(' '))
        const matches = typeof normExpected === 'string'
          ? allAnswers.includes(normExpected)
          : normExpected.test(normMain) || normExpected.test(allAnswers) || (normExpected.test(allAnswers.replace(/\\pi/g, 'pi')))
          || Math.abs(Number(res.card?.value) - Number(p.expected)) < 1e-4

        if (!matches) {
          status = 'mismatch'
        } else if (checked === 'ok' || verdict === 'agree') {
          status = 'pass'
        } else {
          status = 'unchecked_pass'
        }
      }

      results.push({
        prob: p,
        cardMain: main,
        cardError: err ? (typeof err === 'object' && 'sentence' in err ? String((err as { sentence: string }).sentence) : String(err)) : undefined,
        checked,
        verdict,
        status
      })
    }

    const passes = results.filter((r) => r.status === 'pass')
    const uncheckedPasses = results.filter((r) => r.status === 'unchecked_pass')
    const refusals = results.filter((r) => r.status === 'refusal')
    const mismatches = results.filter((r) => r.status === 'mismatch')

    console.log(`\n======================================================`)
    console.log(`FSc 300+ Sweep Summary (${FSC_PROBLEMS.length} problems):`)
    console.log(`Checked & Verified Passes: ${passes.length}`)
    console.log(`Unchecked Correct Passes:  ${uncheckedPasses.length}`)
    console.log(`Refusals / Unsupported:    ${refusals.length}`)
    console.log(`Mismatches:               ${mismatches.length}`)
    console.log(`Total Correct Answers:     ${passes.length + uncheckedPasses.length} / ${FSC_PROBLEMS.length}`)
    console.log(`======================================================\n`)

    if (refusals.length > 0) {
      console.log(`\nRefusal IDs (${refusals.length}):`, refusals.map((r) => r.prob.id).join(', '))
    }

    if (mismatches.length > 0) {
      console.log(`\nAll Mismatches (${mismatches.length}):`)
      mismatches.forEach((r) => {
        console.log(`  [${r.prob.id}] ${r.prob.topic}: "${r.prob.input}" -> Got: "${r.cardMain}", Checked: ${r.checked}, Verdict: ${r.verdict}, Expected: ${r.prob.expected}`)
      })
    }

    // Safety invariant: A wrong answer marked "checked" is the worst bug there is.
    const wrongChecked = mismatches.filter((m) => m.checked === 'ok' || m.verdict === 'agree')
    if (wrongChecked.length > 0) {
      console.error('WRONG CHECKED ANSWERS:', wrongChecked)
      expect(wrongChecked.length).toBe(0)
    }
  }, 60_000)
})
