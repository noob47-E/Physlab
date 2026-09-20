// The sandbox store behind the panel: adding, choosing, joining, saving, loading and resetting.
// The undo history folds bursts of edits by the wall clock, so the clock here is a fake one.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MASS, startingScene, useSandbox } from '../src/renderer/src/sim/store'
import { DEFAULT_WORLD, type BodyDef } from '../src/renderer/src/sim/types'

const fresh = () => useSandbox.getState().loadSandbox()
const state = () => useSandbox.getState()
const moving = (): BodyDef[] => state().bodies.filter((b) => b.motion === 'dynamic')

describe('the sandbox store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Well past any burst the previous test left behind.
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    vi.advanceTimersByTime(5_000)
    fresh()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds a body with the next free letter, resting on the floor, selected and undoable', () => {
    const before = state().bodies.length
    const c = state().addBody('sphere')
    expect(c.name).toBe('C')
    expect(c.mass).toBe(DEFAULT_MASS.sphere)
    expect(c.massMode).toBe('mass')
    expect(c.position[1]).toBeGreaterThan(0)
    expect(state().bodies).toHaveLength(before + 1)
    expect(state().selection).toBe(c.id)
    expect(state().canUndo()).toBe(true)
    state().undo()
    expect(state().bodies).toHaveLength(before)
    expect(state().canRedo()).toBe(true)
    state().redo()
    expect(state().bodies.find((b) => b.id === c.id)).toBeDefined()
  })

  it('a burst of edits to one field is one undo; a pause makes it two', () => {
    const ball = moving()[0]
    state().updateBody(ball.id, { mass: 2 })
    vi.advanceTimersByTime(100)
    state().updateBody(ball.id, { mass: 3 })
    vi.advanceTimersByTime(100)
    state().updateBody(ball.id, { mass: 4 })
    expect(state().past).toHaveLength(1)
    vi.advanceTimersByTime(1_000)
    state().updateBody(ball.id, { mass: 5 })
    expect(state().past).toHaveLength(2)
    state().undo()
    expect(state().bodies.find((b) => b.id === ball.id)!.mass).toBe(4)
    state().undo()
    expect(state().bodies.find((b) => b.id === ball.id)!.mass).toBe(ball.mass)
  })

  it('a burst on a different field does not fold into the last one', () => {
    const ball = moving()[0]
    state().updateBody(ball.id, { mass: 2 })
    vi.advanceTimersByTime(50)
    state().updateBody(ball.id, { friction: 0.9 })
    expect(state().past).toHaveLength(2)
  })

  it('changing the material brings its friction, bounciness and colour along', () => {
    const ball = moving()[0]
    state().updateBody(ball.id, { material: 'rubber' })
    const after = state().bodies.find((b) => b.id === ball.id)!
    expect(after.friction).toBe(1)
    expect(after.restitution).toBe(0.85)
    expect(after.color).not.toBe(ball.color)
  })

  it('choosing a partner: shift-click semantics live in the store', () => {
    const [a, b] = moving()
    state().select(a.id)
    state().setPartner(b.id)
    expect(state().partner).toBe(b.id)
    // The selected object cannot be its own partner.
    state().setPartner(a.id)
    expect(state().partner).toBeNull()
    state().setPartner(b.id)
    // Selecting the partner itself ends the pair; selecting nothing does too.
    state().select(b.id)
    expect(state().partner).toBeNull()
    state().select(a.id)
    state().setPartner(b.id)
    state().select(null)
    expect(state().partner).toBeNull()
    // Deleting the partner forgets it.
    state().select(a.id)
    state().setPartner(b.id)
    state().removeBody(b.id)
    expect(state().partner).toBeNull()
    expect(state().selection).toBe(a.id)
  })

  it('joins two bodies from where they are now, and a delete takes the link with it', () => {
    const [a, b] = moving()
    useSandbox.setState({ live: { [a.id]: { position: [0, 4, 0], rotation: [0, 0, 0, 1], velocity: [0, 0, 0], angularVelocity: [0, 0, 0], mass: 1, asleep: false } } })
    expect(state().addLink(a.id, b.id, 'rod')).toBe(true)
    const link = state().links[0]
    expect(link.kind).toBe('rod')
    // Sized from the live position of A, not its definition.
    expect(link.length).toBeCloseTo(Math.hypot(b.position[0] - 0, b.position[1] - 4, b.position[2] - 0), 6)
    state().updateLink(link.id, { length: 2 })
    expect(state().links[0].length).toBe(2)
    expect(state().addLink(a.id, 'nobody', 'string')).toBe(false)
    state().removeBody(a.id)
    expect(state().links).toHaveLength(0)
    state().undo()
    expect(state().links).toHaveLength(1)
    state().removeLink(state().links[0].id)
    expect(state().links).toHaveLength(0)
  })

  it('a pulley link needs a wheel', () => {
    const [a, b] = moving()
    expect(state().addLink(a.id, b.id, 'pulley')).toBe(false)
    const wheel = state().addBody('pulley')
    expect(state().addLink(a.id, b.id, 'pulley', wheel.id)).toBe(true)
    expect(state().links[0].over).toBe(wheel.id)
  })

  it('a snapshot comes back through loadSandbox exactly, with a clean history', () => {
    const [a, b] = moving()
    state().addLink(a.id, b.id, 'spring')
    state().setWorld({ gravity: 1.62 })
    state().setSideView(false)
    state().select(a.id)
    const file = state().snapshot()
    expect(file.bodies).toBe(state().bodies)
    expect(file.world.gravity).toBe(1.62)
    fresh()
    expect(state().world.gravity).toBe(DEFAULT_WORLD.gravity)
    expect(state().links).toHaveLength(0)
    const nonce = state().runNonce
    state().loadSandbox(file)
    expect(state().bodies).toEqual(file.bodies)
    expect(state().links).toEqual(file.links)
    expect(state().world).toEqual(file.world)
    expect(state().sideView).toBe(false)
    expect(state().past).toHaveLength(0)
    expect(state().future).toHaveLength(0)
    expect(state().selection).toBeNull()
    expect(state().runNonce).toBe(nonce + 1)
    // A missing world in an old file falls back to the defaults, field by field.
    state().loadSandbox({ ...file, world: { gravity: 3.72 } as never })
    expect(state().world).toEqual({ ...DEFAULT_WORLD, gravity: 3.72 })
  })

  it('loading nothing is the starting scene', () => {
    state().addBody('box')
    state().loadSandbox()
    const scene = startingScene()
    expect(state().bodies.map((b) => [b.shape, b.name])).toEqual(scene.map((b) => [b.shape, b.name]))
    expect(state().world).toEqual(DEFAULT_WORLD)
    expect(state().sideView).toBe(true)
  })

  it('Reset asks for a rebuild and forgets the run, but keeps the objects and the history', () => {
    const ball = moving()[0]
    state().updateBody(ball.id, { mass: 3 })
    const nonce = state().runNonce
    useSandbox.setState({ engineTime: 7, live: { x: {} as never }, recording: { x: [] }, contacts: [{ a: 'x', b: 'y', t: 1, approachSpeed: 1, normal: [0, 1, 0], point: [0, 0, 0] }] })
    state().resetRun()
    expect(state().runNonce).toBe(nonce + 1)
    expect(state().engineTime).toBe(0)
    expect(state().live).toEqual({})
    expect(state().recording).toEqual({})
    expect(state().contacts).toEqual([])
    expect(state().bodies.find((b) => b.id === ball.id)!.mass).toBe(3)
    expect(state().past).toHaveLength(1)
  })

  it('readings pile up per body and go with a clear', () => {
    const [a] = moving()
    const sample = { t: 0.1, x: 0, y: 1, v: 0, ke: 0, pe: 9.81, p: 0 }
    state().record({ [a.id]: sample })
    state().record({ [a.id]: { ...sample, t: 0.2 } })
    expect(state().recording[a.id]).toHaveLength(2)
    state().clearRecording()
    expect(state().recording).toEqual({})
  })

  it('collisions arrive newest first and never pile past sixty', () => {
    const hit = (t: number) => ({ a: 'x', b: 'y', t, approachSpeed: 1, normal: [0, 1, 0] as [number, number, number], point: [0, 0, 0] as [number, number, number] })
    state().pushContacts([hit(1), hit(2)])
    expect(state().contacts[0].t).toBe(2)
    state().pushContacts(Array.from({ length: 80 }, (_, i) => hit(10 + i)))
    expect(state().contacts).toHaveLength(60)
    state().clearContacts()
    expect(state().contacts).toEqual([])
  })
})
