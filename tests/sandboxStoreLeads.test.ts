// A19 store leads (P-SIM H1, H2, H3, H5, H6), each verified by a test that failed before its fix.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSandbox } from '../src/renderer/src/sim/store'

const state = () => useSandbox.getState()

describe('the Sandbox store, A19 leads', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    vi.advanceTimersByTime(5_000)
    state().loadSandbox()
  })
  afterEach(() => vi.useRealTimers())

  it('H1: deleting a pulley wheel takes the rope over it away too', () => {
    const wheel = state().addBody('pulley')
    vi.advanceTimersByTime(1_000)
    const a = state().addBody('box')
    vi.advanceTimersByTime(1_000)
    const b = state().addBody('box')
    vi.advanceTimersByTime(1_000)
    expect(state().addLink(a.id, b.id, 'pulley', wheel.id).ok).toBe(true)
    vi.advanceTimersByTime(1_000)
    state().removeBody(wheel.id)
    expect(state().links.some((l) => l.over === wheel.id)).toBe(false)
  })

  it('H2: an edit straight after Undo clears Redo, even inside the burst window', () => {
    const [first] = state().bodies.filter((b) => b.motion === 'dynamic')
    state().updateBody(first.id, { mass: 2 })
    vi.advanceTimersByTime(1_000)
    state().updateBody(first.id, { mass: 3 })
    state().undo()
    expect(state().future.length).toBe(1)
    // Within 700 ms of the last remembered edit, with the same tag: it used to fold into it and keep
    // the stale redo, so Redo then threw this edit away.
    state().updateBody(first.id, { mass: 5 })
    expect(state().future).toEqual([])
    expect(state().bodies.find((b) => b.id === first.id)!.mass).toBe(5)
    state().undo()
    expect(state().bodies.find((b) => b.id === first.id)!.mass).toBe(2)
  })

  it('H3: Undo brings the world settings back with the objects', () => {
    const g = state().world.gravity
    state().setWorld({ gravity: 1.62 })
    vi.advanceTimersByTime(1_000)
    state().undo()
    expect(state().world.gravity).toBe(g)
    state().redo()
    expect(state().world.gravity).toBe(1.62)
  })

  it('H5: a second pulley does not appear on top of the first', () => {
    const one = state().addBody('pulley')
    vi.advanceTimersByTime(1_000)
    const two = state().addBody('pulley')
    expect(Math.hypot(one.position[0] - two.position[0], one.position[1] - two.position[1], one.position[2] - two.position[2])).toBeGreaterThan(0.6)
  })

  it('H6: adding an object ends a Shift-click pair', () => {
    const [a, b] = state().bodies.filter((x) => x.motion === 'dynamic')
    useSandbox.setState({ selection: a.id, partner: b.id })
    const c = state().addBody('sphere')
    expect(state().selection).toBe(c.id)
    expect(state().partner).toBeNull()
  })
})
