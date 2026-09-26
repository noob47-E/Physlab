// Fix 22, second half: the Sandbox panel must keep its shape when Play is pressed.
//
// The panel is rendered for real (react-dom/server — the suite has no DOM, and no new
// dependency is added for one), before Play and again mid-run with live states, readings and
// collisions fed into the store. Everything above the World heading — where Gravity and Slow
// motion live — must be the same elements with the same classes. Heights come from those classes
// (fixed rows, a fixed-height chart box), so the same structure is the same offsetTop for World.
// Before the fix the Energy section was missing before Play, the Recording hint turned into a
// chart and the Collisions list appeared above World: three ways for Gravity to move.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Sandbox } from '../src/renderer/src/panels/Sandbox'
import { useSandbox, massOf } from '../src/renderer/src/sim/store'
import { useScene } from '../src/renderer/src/core/store'
import { energyOf, readoutStates, startStateOf } from '../src/renderer/src/sim/energy'
import type { BodyState } from '../src/renderer/src/sim/types'
import type { Sample } from '../src/renderer/src/sim/recording'

// The engine's load state is a useSyncExternalStore with no server snapshot; the panel's shape is
// what is under test, not the engine, so it reads as loaded.
vi.mock('../src/renderer/src/sim/jolt', async (importOriginal) => ({ ...(await importOriginal<object>()), useJoltState: () => 'ready' }))

// A server render reads every zustand store's *initial* state (its getServerSnapshot), so the
// stores are built here with hooks that read the current state: the test drives the stores and
// renders again, which is all it needs.
vi.mock('zustand', async (importOriginal) => {
  const z = await importOriginal<typeof import('zustand')>()
  const bind = (init: never) => {
    const api = z.createStore(init)
    const hook = (select: (s: unknown) => unknown = (s) => s) => select(api.getState())
    return Object.assign(hook, api)
  }
  return { ...z, create: (init?: never) => (init ? bind(init) : bind) }
})

const render = () => renderToStaticMarkup(createElement(Sandbox))

/** The part of the panel above the World heading, as its tags and classes with the text left out. */
function shapeAboveWorld(html: string): string {
  const at = html.indexOf('>World<')
  expect(at).toBeGreaterThan(0)
  return html
    .slice(0, at)
    .replace(/>[^<]*</g, '><')
    .replace(/ (title|style|value|aria-[a-z]+)="[^"]*"/g, '')
    // Play and Pause are icons of one size, and the two words sit stacked in one grid cell
    // (sim/transport.ts), the hidden one kept for its width: which one shows is not a shape change.
    .replace(/<svg[^>]*>.*?<\/svg>/g, '<svg/>')
    .replace(/ ?invisible/g, '')
    .replace(/ "/g, '"')
    // A button greying out keeps its size.
    .replace(/ disabled=""/g, '')
    // What is inside the Recording box (hint or chart) may change; the box itself has a fixed height.
    .replace(/(<div class="mt-1 h-\[160px\][^"]*">).*?(<\/div><div class="mt-1 flex flex-wrap gap-2 px-3">)/, '$1$2')
}

beforeEach(() => {
  useScene.getState().setPlaying(false)
  useSandbox.getState().resetRun()
})

describe('Sandbox panel on Play (Fix 22)', () => {
  it('the default scene has moving bodies to read', () => {
    expect(useSandbox.getState().bodies.some((b) => b.motion === 'dynamic')).toBe(true)
  })

  it('shows the Energy readout before Play, from the typed start', () => {
    const html = render()
    expect(html).toContain('>Energy<')
    expect(html).toContain('Heights are measured from the top of the floor.')
    expect(html).toContain('Press Play and the readings start arriving.')
  })

  it('keeps everything above World the same shape when Play starts with live states, readings and collisions', () => {
    const before = shapeAboveWorld(render())
    const { bodies } = useSandbox.getState()
    const moving = bodies.filter((b) => b.motion === 'dynamic')
    const live: Record<string, BodyState> = {}
    const recording: Record<string, Sample[]> = {}
    for (const b of moving) {
      live[b.id] = { ...startStateOf(b, massOf(b)), position: [b.position[0], b.position[1] - 0.8, b.position[2]], velocity: [0.3, -3.9, 0] }
      recording[b.id] = Array.from({ length: 27 }, (_, i) => ({ t: i / 10, x: 0, y: 2 - i * 0.05, v: i * 0.98, ke: i, pe: 20 - i, p: i * 0.5 }))
    }
    const [a, b] = bodies
    // Play first: starting a run from t = 0 clears the readings, as the engine would.
    useScene.getState().setPlaying(true)
    useSandbox.setState({ live, recording, contacts: [{ a: a.id, b: b.id, t: 0.6, approachSpeed: 4.2 } as never] })
    const after = render()
    expect(after).toContain('27 readings')
    expect(shapeAboveWorld(after)).toBe(before)
  })

  // Review round 1: the one-line rows cut every body's momentum to "p…" at 1366 px, and a cut
  // 3.48×10^-12 reads as 3.48×10^-1. No reading in the Energy section may sit in a box that cuts
  // it short or lets it shrink; only a body's name may be truncated.
  it('never cuts a number short in the Energy section, before Play or mid-run', () => {
    const energySection = (html: string) => html.slice(html.indexOf('>Energy<'), html.indexOf('Heights are measured'))
    const cutNumbers = (html: string) =>
      [...energySection(html).matchAll(/<span class="([^"]*)"[^>]*>([^<]*)<\/span>/g)]
        .filter(([, cls, text]) => /\d/.test(text) && (/\btruncate\b/.test(cls) || !/\bshrink-0\b/.test(cls)))
        .map(([, , text]) => text)
    expect(cutNumbers(render())).toEqual([])
    const { bodies } = useSandbox.getState()
    const live: Record<string, BodyState> = {}
    for (const b of bodies.filter((d) => d.motion === 'dynamic')) {
      live[b.id] = { ...startStateOf(b, massOf(b)), velocity: [3.48e-12, 0, 0] }
    }
    useScene.getState().setPlaying(true)
    useSandbox.setState({ live })
    const html = render()
    expect(energySection(html)).toContain('kg m/s')
    expect(cutNumbers(html)).toEqual([])
  })
})

describe('the start state the readout uses before Play', () => {
  it('is the typed position and velocity, so a body at rest has KE 0 and PE mgh', () => {
    const body = useSandbox.getState().bodies.find((b) => b.motion === 'dynamic')!
    const def = { ...body, position: [0, 2.5, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number], angularVelocity: [0, 0, 0] as [number, number, number] }
    const s = startStateOf(def, 2)
    const e = energyOf(def, s, 9.8, 0.5)
    expect(e.kinetic).toBe(0)
    expect(e.potential).toBeCloseTo(2 * 9.8 * 2, 12)
  })

  it('prefers the engine state once there is one', () => {
    const bodies = useSandbox.getState().bodies
    const d = bodies.find((b) => b.motion === 'dynamic')!
    const engineState: BodyState = { ...startStateOf(d, 1), velocity: [3, 4, 0] }
    const rows = readoutStates(bodies, { [d.id]: engineState }, () => 1)
    expect(rows.find((r) => r.def.id === d.id)!.state).toBe(engineState)
    expect(rows.every((r) => r.def.motion === 'dynamic')).toBe(true)
  })
})
