// GF-SANDBOX: "guess first" in the Sandbox.
// Pressing Play on an experiment first asks for a prediction (a number with its unit,
// e.g. "Period = ? s", or a choice for yes/no cases), with a "Just play" way out;
// after the run the card shows "Your guess: ... | Measured: ..." beside the formula.
// Before Play, the formula cards and the experiment descriptions (sim/presets.ts about texts)
// must not give the result away.

import { describe, expect, it } from 'vitest'
import { presetById } from '../src/renderer/src/sim/presets'
import {
  targetForPreset,
  guessFirstCheck,
  formatGuessRow,
  cardMatchesTarget,
  useGuessStore
} from '../src/renderer/src/sim/guessStore'

describe('GF-SANDBOX: experiment descriptions do not give the result away', () => {
  it('preset about texts do not spoil numerical results', () => {
    const spoiledPresets = [
      'cliff',
      'drop',
      'moon',
      'terminal',
      'ramp',
      'friction',
      'pendulum',
      'spring',
      'bounce',
      'atwood',
      'lift',
      'cradle',
      'collision',
      'recoil'
    ]

    for (const id of spoiledPresets) {
      const p = presetById(id)
      expect(p, `Preset ${id} should exist`).toBeDefined()
      const about = p!.about

      // Must not contain spoiling equality answers like "= 0.90 s", "= 2.7 m", "= 1.11 s", etc.
      expect(about).not.toMatch(/=\s*0\.90\s*s/i)
      expect(about).not.toMatch(/=\s*2\.7\s*m/i)
      expect(about).not.toMatch(/=\s*1\.11\s*s/i)
      expect(about).not.toMatch(/=\s*2\.48\s*s/i)
      expect(about).not.toMatch(/≈\s*20\s*m\/s/i)
      expect(about).not.toMatch(/=\s*4\.6\s*m\/s/i)
      expect(about).not.toMatch(/=\s*1\.59\s*m/i)
      expect(about).not.toMatch(/=\s*2\.84\s*s/i)
      expect(about).not.toMatch(/=\s*0\.63\s*s/i)
      expect(about).not.toMatch(/=\s*1\.96\s*m/i)
      expect(about).not.toMatch(/=\s*1\.96\s*m\/s²/i)
      expect(about).not.toMatch(/=\s*23\.5\s*N/i)
      expect(about).not.toMatch(/=\s*2\.26\s*m\/s²/i)
      expect(about).not.toMatch(/=\s*60\.4\s*N/i)
      expect(about).not.toMatch(/=\s*−2\.0\s*m\/s/i)
    }
  })
})

describe('GF-SANDBOX: target extraction and guess checking', () => {
  it('extracts prediction targets for classic presets', () => {
    const pendulum = presetById('pendulum')!
    const builtPendulum = pendulum.build()
    const targetPendulum = targetForPreset('pendulum', builtPendulum)

    expect(targetPendulum).toBeDefined()
    expect(targetPendulum!.unit).toBe('s')
    expect(targetPendulum!.label.toLowerCase()).toContain('period')
    expect(targetPendulum!.expected).toBeCloseTo(2.84, 1)

    const cliff = presetById('cliff')!
    const builtCliff = cliff.build()
    const targetCliff = targetForPreset('cliff', builtCliff)
    expect(targetCliff).toBeDefined()
    expect(targetCliff!.unit).toBe('s')

    const ramp = presetById('ramp')!
    const builtRamp = ramp.build()
    const targetRamp = targetForPreset('ramp', builtRamp)
    expect(targetRamp).toBeDefined()
    expect(targetRamp!.unit).toBe('m/s')
    expect(targetRamp!.label.toLowerCase()).toContain('bottom')
  })

  it('provides choice options for categorical questions like free fall drop', () => {
    const drop = presetById('drop')!
    const builtDrop = drop.build()
    const targetDrop = targetForPreset('drop', builtDrop)
    expect(targetDrop).toBeDefined()
    expect(targetDrop!.choices).toBeDefined()
    expect(targetDrop!.choices!.length).toBeGreaterThanOrEqual(2)
    expect(targetDrop!.choices).toContain('Both land together')
  })

  it('checks numeric guesses using checkAnswer', () => {
    const target = {
      key: 'T',
      label: 'Period',
      unit: 's',
      expected: 2.84,
      formula: '2π√(L/g)'
    }

    // Accurate guess
    const resRight = guessFirstCheck('2.85 s', target)
    expect(resRight.verdict).toBe('right')
    expect(resRight.parsed).toBeCloseTo(2.85, 2)

    // Slightly rounded guess
    const resClose = guessFirstCheck('2.9 s', target)
    expect(['right', 'close']).toContain(resClose.verdict)

    // Way off guess
    const resWrong = guessFirstCheck('10 s', target)
    expect(resWrong.verdict).toBe('wrong')
  })

  it('formats guess row with Formula and only says Measured once measured', () => {
    const target = {
      key: 'T',
      label: 'Period',
      unit: 's',
      expected: 2.84,
      formula: '2π√(L/g)'
    }

    // 1. Before measurement is completed: shows Formula and marks vs formula, never says Measured
    const rowBefore = formatGuessRow({
      guessText: '2.8 s',
      formulaValue: 2.84,
      measuredValue: null,
      unit: 's',
      target,
      format: (v) => v.toFixed(2)
    })
    expect(rowBefore).toContain('Formula: 2.84 s')
    expect(rowBefore).toContain('vs formula')
    expect(rowBefore).not.toContain('Measured:')

    // 2. Once measured: shows both Formula and Measured, and marks vs measured
    const rowAfter = formatGuessRow({
      guessText: '2.8 s',
      formulaValue: 2.84,
      measuredValue: 2.85,
      unit: 's',
      target,
      format: (v) => v.toFixed(2)
    })
    expect(rowAfter).toContain('Formula: 2.84 s')
    expect(rowAfter).toContain('Measured: 2.85 s')
    expect(rowAfter).toContain('vs measured')
  })

  it('matches target cards appropriately', () => {
    const targetPendulum = targetForPreset('pendulum')!
    expect(cardMatchesTarget({ id: 'pendulum-T' }, targetPendulum)).toBe(true)
    expect(cardMatchesTarget({ id: 'ke' }, targetPendulum)).toBe(false)

    const targetCliff = targetForPreset('cliff')!
    expect(cardMatchesTarget({ id: 'flight-time' }, targetCliff)).toBe(true)
  })
})

describe('GF-SANDBOX: guess store lifecycle', () => {
  it('starts unprompted and prompts when experiment has not run', () => {
    useGuessStore.getState().initPreset('pendulum')
    expect(useGuessStore.getState().promptOpen).toBe(false)
    expect(useGuessStore.getState().hasAnswered).toBe(false)

    // Calling requestPlay before any run opens the prompt
    const shouldProceed = useGuessStore.getState().requestPlay({ hasRun: false })
    expect(shouldProceed).toBe(false)
    expect(useGuessStore.getState().promptOpen).toBe(true)

    // Skipping ("Just play") closes prompt and allows play
    useGuessStore.getState().skip()
    expect(useGuessStore.getState().promptOpen).toBe(false)
    expect(useGuessStore.getState().hasAnswered).toBe(true)
    expect(useGuessStore.getState().guess?.skipped).toBe(true)

    // Subsequent requestPlay allows play immediately
    const nextProceed = useGuessStore.getState().requestPlay({ hasRun: true })
    expect(nextProceed).toBe(true)
  })

  it('submitting a guess records it and allows play', () => {
    useGuessStore.getState().initPreset('cliff')
    useGuessStore.getState().requestPlay({ hasRun: false })
    expect(useGuessStore.getState().promptOpen).toBe(true)

    useGuessStore.getState().submit('0.9 s')
    expect(useGuessStore.getState().promptOpen).toBe(false)
    expect(useGuessStore.getState().hasAnswered).toBe(true)
    expect(useGuessStore.getState().guess?.text).toBe('0.9 s')
    expect(useGuessStore.getState().guess?.skipped).toBe(false)
  })

  it('a new scene (as the AI builds) drops the old experiment\'s question', async () => {
    const { useSandbox } = await import('../src/renderer/src/sim/store')
    useSandbox.getState().loadPreset('cradle')
    expect(useGuessStore.getState().target).not.toBeNull()

    useSandbox.getState().setScene(presetById('projectile')!.build().bodies, {}, [])
    expect(useGuessStore.getState().target).toBeNull()
    expect(useGuessStore.getState().requestPlay({ hasRun: false })).toBe(true)
    expect(useGuessStore.getState().promptOpen).toBe(false)
  })
})
