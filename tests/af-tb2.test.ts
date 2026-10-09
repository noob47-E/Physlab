import { beforeEach, describe, expect, it } from 'vitest'
import { useTour } from '../src/renderer/src/app/tour/Tour'
import { MISSIONS } from '../src/renderer/src/app/tour/steps'
import { readSource } from './helpers/repo'

const tourSource = () => readSource('src/renderer/src/app/tour/Tour.tsx')
const topBarSource = () => readSource('src/renderer/src/app/TopBar.tsx')

describe('the Start here chip', () => {
  beforeEach(() => {
    useTour.getState().startOver()
  })

  it('keeps count of done missions and exposes its hidden state', () => {
    const state = useTour.getState()
    expect(state.done.length).toBe(0)
    expect(state.chipHidden).toBe(false)

    state.markDone(MISSIONS[0].id)
    expect(useTour.getState().done.length).toBe(1)
    expect(useTour.getState().done).toContain(MISSIONS[0].id)
    expect(useTour.getState().chipHidden).toBe(false)
  })

  it('can be hidden and brought back', () => {
    useTour.getState().setChipHidden(true)
    expect(useTour.getState().chipHidden).toBe(true)

    useTour.getState().setChipHidden(false)
    expect(useTour.getState().chipHidden).toBe(false)

    useTour.getState().hideChip()
    expect(useTour.getState().chipHidden).toBe(true)

    useTour.getState().startOver()
    expect(useTour.getState().chipHidden).toBe(false)
  })

  it('disappears only when all missions are done or the student hides it', () => {
    // The chip's own rule, in its source: hidden, or every mission counted.
    expect(tourSource()).toContain('if (chipHidden || count >= MISSIONS.length) return null')
    for (const m of MISSIONS) useTour.getState().markDone(m.id)
    expect(MISSIONS.every((m) => useTour.getState().done.includes(m.id))).toBe(true)
  })
})

describe('the Start here card', () => {
  it('shows the exact all-done sentence word for word', () => {
    expect(tourSource()).toContain(
      'All done. You have used every part of PhysLab you need to start. Help ▸ Start here brings this list back.'
    )
  })

  it('has Hide, Start over and Show me controls', () => {
    const src = tourSource()
    // The words as button text, not as a word in a comment.
    expect(src).toMatch(/>\s*Hide\s*<\/button>/)
    expect(src).toMatch(/>\s*Start over\s*<\/button>/)
    expect(src).toMatch(/>\s*Show me\s*<\/button>/)
  })
})

describe('exact words on the screens', () => {
  it('Welcome screen has the third button "Start here (6 missions)"', () => {
    expect(tourSource()).toContain('Start here (6 missions)')
  })

  it('Help menu has the "Start here" line', () => {
    expect(topBarSource()).toMatch(/label:\s*'Start here'/)
  })

  it('top-bar chip says "Start here N of 6"', () => {
    expect(tourSource()).toContain('Start here {count} of {MISSIONS.length}')
  })
})
