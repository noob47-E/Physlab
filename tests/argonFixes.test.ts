// Argon's repo review (18 Oct, reviews\ARGON-REPO-2026-10-18-verdicts.md), the findings that were real once checked:
// Esc that another window already used must not ALSO open the mode wheel (the tour, the Keyboard and mouse dialog, the
// replay bar's More menu); the Sandbox keeps room for the slim replay bar only; and saving an unchanged graph line is
// not a second undo step.

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/renderer/src/math/engine/sympy/worker', () => ({
  cas: vi.fn(async () => ({ latex: '', text: '', numeric: null })),
  useCasStatus: { getState: () => ({ status: 'idle', busy: 0 }), setState: () => {}, subscribe: () => () => {} },
  CAS_OPS: []
}))

import { shortcutKeyDown } from '../src/renderer/src/app/shortcuts'
import { useModeWheel } from '../src/renderer/src/app/modeWheelStore'
import { useApp } from '../src/renderer/src/app/modes'
import { useTour } from '../src/renderer/src/app/tour/Tour'
import { useTapeBar } from '../src/renderer/src/sim/tapeBar'
import { useSandbox } from '../src/renderer/src/sim/store'
import { scene } from '../src/renderer/src/core/store'
import { resetTool } from '../src/renderer/src/render/tools'
import { runCommand } from '../src/renderer/src/lang/commands'
import { replaceGraphEquation } from '../src/renderer/src/lang/graphEdit'
import { resetGlobals } from './helpers/globals'
import { readSource } from './helpers/repo'

const pressEsc = (defaultPrevented = false) =>
  shortcutKeyDown({
    key: 'Escape',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    repeat: false,
    target: { tagName: 'DIV' },
    defaultPrevented,
    preventDefault() {}
  } as unknown as KeyboardEvent)

describe('Esc that already did a job does not also open the mode wheel', () => {
  beforeEach(() => {
    useModeWheel.getState().close(false)
    useApp.getState().setMode('shapes')
    scene().setTool('select')
    scene().select([])
    resetTool()
    useTour.getState().setShortcuts(false)
    useTapeBar.getState().setMore(false)
    useSandbox.getState().select(null)
  })

  it('an Esc another window handler already used (default prevented) is left alone', () => {
    pressEsc(true)
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('Esc closes the Keyboard and mouse dialog instead of opening the wheel behind it', () => {
    useTour.getState().setShortcuts(true)
    pressEsc()
    expect(useTour.getState().showShortcuts).toBe(false)
    expect(useModeWheel.getState().open).toBe(false)
  })

  it("Esc closes the replay bar's More menu in the Sandbox instead of also opening the wheel", () => {
    useApp.getState().setMode('sandbox')
    useTapeBar.getState().setMore(true)
    pressEsc()
    expect(useTapeBar.getState().more).toBe(false)
    expect(useModeWheel.getState().open).toBe(false)
  })

  it('with nothing open, Esc still opens the wheel', () => {
    pressEsc()
    expect(useModeWheel.getState().open).toBe(true)
  })

  it("the tour's own Esc stops the key, so the wheel does not open the moment the tour closes", () => {
    const tour = readSource('src/renderer/src/app/tour/Tour.tsx')
    expect(tour).toMatch(/if \(e\.key === 'Escape'\) \{\s*e\.preventDefault\(\)\s*e\.stopPropagation\(\)\s*stop\(\)\s*return/)
  })
})

describe('the Sandbox keeps room for the slim replay bar only', () => {
  it('All tools no longer reserves the old two-row bar height under the cards and graph', () => {
    expect(readSource('src/renderer/src/render/sandbox/SandboxHud.tsx')).not.toContain('bottom-[260px]')
  })
})

describe('saving a graph line that did not change', () => {
  beforeEach(() => {
    resetGlobals()
    scene().newScene()
    scene().clearLog()
    scene().setActiveSpace('graphing')
  })

  it('is not a second undo step (Enter then clicking away used to save twice)', async () => {
    await runCommand('y = x^2')
    const id = scene().order.find((o) => scene().objects[o]?.type === 'graph')!
    const source = (scene().objects[id] as { source: string }).source
    const steps = scene().past.length
    expect((await replaceGraphEquation(id, source)).ok).toBe(true)
    expect(scene().past.length).toBe(steps)
  })
})
