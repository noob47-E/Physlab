// GF-SANDBOX: "guess first" store and prediction target evaluator.
// When an experiment is opened, it derives the target quantity the student can predict.
// On Play, if the run hasn't started, it opens the Guess prompt, offering a "Just play" escape.
// After the run, the student's guess is shown alongside the measured result on formula cards.

import { create } from 'zustand'
import { theoryFor, type Built } from './theory'
import { presetById } from './presets'
import { checkAnswer, type Check } from '../math/checkAnswer'

export interface PredictionTarget {
  key: string
  label: string
  unit: string
  expected: number
  formula: string
  choices?: string[]
}

export interface StudentGuess {
  text: string
  value: number | string | null
  skipped: boolean
  verdict?: Check['verdict']
  message?: string
}

/**
 * Derives the target prediction for a preset from its theory and built scene.
 */
export function targetForPreset(presetId: string, built?: Built): PredictionTarget | null {
  if (presetId === 'drop') {
    return {
      key: 'drop',
      label: 'Fall order',
      unit: '',
      expected: 1.11,
      formula: '√(2h/g)',
      choices: ['Both land together', 'Heavy ball lands first', 'Light ball lands first']
    }
  }

  const theory = theoryFor(presetId)
  if (!theory) return null

  const preset = presetById(presetId)
  if (!preset && !built) return null

  const b: Built = built ?? preset!.build()
  const preds = theory.predict(b)
  if (!preds || preds.length === 0) return null

  // Select the most intuitive primary prediction target
  let chosen = preds[0]
  if (presetId === 'pendulum') {
    chosen = preds.find((p) => p.key === 'T' || p.key === 'Tsmall') ?? preds[0]
  } else if (presetId === 'cliff') {
    chosen = preds.find((p) => p.key === 'time') ?? preds[0]
  } else if (presetId === 'bounce') {
    chosen = preds.find((p) => p.key === 'top1') ?? preds[0]
  }

  const rawLabel = chosen.label
  const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)

  return {
    key: chosen.key,
    label,
    unit: chosen.unit ?? '',
    expected: chosen.value,
    formula: chosen.formula
  }
}

/**
 * Checks a student's guess using checkAnswer.
 */
export function guessFirstCheck(text: string, target: PredictionTarget): Check {
  if (target.choices && target.choices.length > 0) {
    const isCorrect = text.trim().toLowerCase() === target.choices[0].toLowerCase()
    return {
      verdict: isCorrect ? 'right' : 'wrong',
      parsed: target.expected,
      message: isCorrect ? 'Spot on! In a vacuum, gravity accelerates all masses equally.' : 'Not quite. Without air drag, all objects accelerate at g.'
    }
  }

  // 5 % band for student predictions in the Sandbox
  const tol = Math.max(0.01, Math.abs(target.expected) * 0.05)
  return checkAnswer(text, {
    key: target.key,
    label: target.label,
    value: target.expected,
    tol,
    unit: target.unit
  })
}

/**
 * Evaluates a guess against either the measured value (when available) or the formula value.
 */
export function evaluateGuess(
  text: string,
  target: PredictionTarget,
  measuredValue?: number | null
): {
  verdict: 'right' | 'close' | 'wrong'
  against: 'measured' | 'formula'
  referenceValue: number
} {
  const isMeasured = measuredValue !== undefined && measuredValue !== null && Number.isFinite(measuredValue)
  const refVal = isMeasured ? measuredValue! : target.expected
  const tol = Math.max(0.01, Math.abs(refVal) * 0.05)
  const check = checkAnswer(text, {
    key: target.key,
    label: target.label,
    value: refVal,
    tol,
    unit: target.unit
  })
  return {
    verdict: check.verdict === 'right' ? 'right' : check.verdict === 'close' ? 'close' : 'wrong',
    against: isMeasured ? 'measured' : 'formula',
    referenceValue: refVal
  }
}

/**
 * Formats "Your guess: ... | Formula: ... [| Measured: ...]" row honestly with units.
 * Never says Measured before the run has measured it.
 */
export function formatGuessRow(options: {
  guessText: string
  formulaValue: number
  measuredValue?: number | null
  unit: string
  target?: PredictionTarget
  format: (v: number) => string
}): string {
  const { guessText, formulaValue, measuredValue, unit, target, format } = options
  const unitSuffix = unit ? ` ${unit}` : ''
  const hasMeasured = measuredValue !== undefined && measuredValue !== null && Number.isFinite(measuredValue)

  let mark = ''
  if (target) {
    const evalRes = evaluateGuess(guessText, target, measuredValue)
    const sym = evalRes.verdict === 'right' ? '✓' : evalRes.verdict === 'close' ? '~' : '✗'
    mark = ` (${sym} vs ${evalRes.against})`
  }

  const formulaStr = `Formula: ${format(formulaValue)}${unitSuffix}`
  if (!hasMeasured) {
    return `Your guess: ${guessText}${mark} | ${formulaStr}`
  }
  const measuredStr = `Measured: ${format(measuredValue!)}${unitSuffix}`
  return `Your guess: ${guessText}${mark} | ${formulaStr} | ${measuredStr}`
}

/**
 * Finds the measured value corresponding to a prediction target from theory.measure() output.
 */
export function findMeasuredForTarget(
  measuredList: { key: string; value: number }[] | undefined,
  target: PredictionTarget | null
): number | null {
  if (!measuredList || !target) return null
  const m = measuredList.find((x) => {
    if (x.key === target.key) return true
    if (target.key.startsWith('T') && x.key === 'T') return true
    if (target.key === 'time' && (x.key === 'time' || x.key === 'flight-time')) return true
    if (target.key === 'range' && (x.key === 'range' || x.key === 'projectile-range')) return true
    if (target.key === 'top1' && (x.key === 'top1' || x.key === 'top' || x.key === 'h1')) return true
    return false
  })
  if (m && Number.isFinite(m.value)) return m.value
  return null
}

/**
 * Checks whether a formula card corresponds to the prediction target for the scene.
 */
export function cardMatchesTarget(
  card: { id: string; unit?: string; value?: number },
  target: PredictionTarget | null
): boolean {
  if (!target) return false
  if (card.id === target.key || card.id.endsWith(`-${target.key}`)) return true
  if (target.key.startsWith('T') && (card.id === 'pendulum-T' || card.id === 'spring-T')) return true
  if (target.key === 'time' && (card.id === 'flight-time' || card.id.includes('time'))) return true
  if (target.key === 'range' && card.id === 'projectile-range') return true
  if (target.key === 'top1' && (card.id === 'bounce-next-top' || card.id === 'suvat-s')) return true
  if (target.key === 'drop' && (card.id === 'suvat-s' || card.id === 'suvat-v')) return true
  if (
    card.unit !== undefined &&
    card.unit === target.unit &&
    card.value !== undefined &&
    Number.isFinite(card.value)
  ) {
    const diff = Math.abs(card.value - target.expected)
    if (diff <= Math.max(0.1, 0.05 * Math.abs(target.expected))) return true
  }
  return false
}

interface GuessState {
  presetId: string | null
  target: PredictionTarget | null
  promptOpen: boolean
  hasAnswered: boolean
  guess: StudentGuess | null

  initPreset: (id: string, built?: Built) => void
  requestPlay: (options: { hasRun: boolean }) => boolean
  submit: (text: string) => void
  skip: () => void
  closePrompt: () => void
  reset: () => void
}

export const useGuessStore = create<GuessState>((set, get) => ({
  presetId: null,
  target: null,
  promptOpen: false,
  hasAnswered: false,
  guess: null,

  initPreset: (id: string, built?: Built) => {
    const target = targetForPreset(id, built)
    set({
      presetId: id,
      target,
      promptOpen: false,
      hasAnswered: false,
      guess: null
    })
  },

  requestPlay: ({ hasRun }) => {
    const { target, hasAnswered } = get()
    // Only prompt before the run begins on presets that have a prediction target
    if (!hasRun && target && !hasAnswered) {
      set({ promptOpen: true })
      return false
    }
    return true
  },

  submit: (text: string) => {
    const { target } = get()
    if (!target) {
      set({ promptOpen: false, hasAnswered: true })
      return
    }
    const check = guessFirstCheck(text, target)
    set({
      promptOpen: false,
      hasAnswered: true,
      guess: {
        text: text.trim(),
        value: check.parsed ?? text.trim(),
        skipped: false,
        verdict: check.verdict,
        message: check.message
      }
    })
  },

  skip: () => {
    set({
      promptOpen: false,
      hasAnswered: true,
      guess: {
        text: '',
        value: null,
        skipped: true
      }
    })
  },

  closePrompt: () => {
    set({ promptOpen: false })
  },

  reset: () => {
    set({
      promptOpen: false,
      hasAnswered: false,
      guess: null
    })
  }
}))
