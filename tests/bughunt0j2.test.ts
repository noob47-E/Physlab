// 0j2 (owner, 14 Oct: "there should not be any kind of bug at all"): the real bugs a review of the replay code found, each
// pinned here; the ones it reported that are not reachable are listed with the reason in 09-BUGREC's REPORT.md.

import { describe, expect, it } from 'vitest'
import { angleDegrees, largestAngleSoFar, turnAt } from '../src/renderer/src/sim/angles'
import { heatShares } from '../src/renderer/src/sim/ledger'
import { readSource } from './helpers/repo'

/** A tape of `n` records of one body turning about y, `deg(i)` degrees at step i, spinning at `spin(i)` rad/s about y. */
function turning(n: number, deg: (i: number) => number, spin: (i: number) => number = () => 0) {
  const frames: Float32Array[] = []
  for (let i = 0; i < n; i++) {
    const r = (deg(i) * Math.PI) / 180
    const rec = new Float32Array(13)
    rec[4] = Math.sin(r / 2)
    rec[6] = Math.cos(r / 2)
    rec[11] = spin(i)
    frames.push(rec)
  }
  return {
    frames,
    tape: {
      first: 0,
      last: n - 1,
      layout: { bodies: ['b1'] },
      record: (step: number) => frames[Math.floor(step)] ?? null
    }
  }
}

/** The plain scan: the largest |angle about y| from the first record to `upTo`. */
const plainMax = (frames: Float32Array[], upTo: number): number => {
  let m = 0
  for (let i = 0; i <= upTo; i++) m = Math.max(m, Math.abs(angleDegrees([frames[i][6], frames[i][3], frames[i][4], frames[i][5]])[1]))
  return m
}

describe('Largest so far (the Angle fold in a replay)', () => {
  it('a new run of the same body does not read the last run’s largest angles', () => {
    const big = turning(200, (i) => i * 0.5)
    const small = turning(200, (i) => i * 0.05)
    expect(largestAngleSoFar(big.tape, 150, 'b1', [0, 0, 0])[1]).toBeCloseTo(75, 3)
    // Reset and run again: another tape, the same body id, the same step.
    expect(largestAngleSoFar(small.tape, 150, 'b1', [0, 0, 0])[1]).toBeCloseTo(7.5, 3)
  })

  it('a slow replay (a fractional playhead every frame) keeps scanning: no step is skipped and it never freezes', () => {
    const { frames, tape } = turning(400, (i) => i * 0.3)
    let got = 0
    for (let p = 10.15; p < 60; p += 0.15) got = largestAngleSoFar(tape, p, 'b1', [0, 0, 0])[1]
    expect(got).toBeCloseTo(plainMax(frames, 59), 3)
  })

  it('a branch (the same tape, its records after the branch step replaced) reads the new records', () => {
    const run = turning(300, (i) => i * 0.4)
    const branchA = {}
    expect(largestAngleSoFar(run.tape, 250, 'b1', [0, 0, 0], branchA)[1]).toBeCloseTo(100, 3)
    // Branch from step 50: the body is held still from there.
    for (let i = 51; i < 300; i++) run.frames[i] = run.frames[50]
    expect(largestAngleSoFar(run.tape, 250, 'b1', [0, 0, 0], {})[1]).toBeCloseTo(20, 3)
  })
})

describe('the angle about each axis', () => {
  it('a body turned 200° about y reads 200° about y and 0° about x and z, not ±360°', () => {
    const half = (200 / 2) * (Math.PI / 180)
    const a = angleDegrees([Math.cos(half), 0, Math.sin(half), 0])
    expect(a[1]).toBeCloseTo(200, 6)
    expect(a[0]).toBeCloseTo(0, 6)
    expect(a[2]).toBeCloseTo(0, 6)
    // The engine's float32 leaves a hair on the other axes, either sign.
    const b = angleDegrees([Math.cos(half), -1e-7, Math.sin(half), 1e-7])
    expect(Math.abs(b[0])).toBeLessThan(0.01)
    expect(Math.abs(b[2])).toBeLessThan(0.01)
    expect(b[1]).toBeCloseTo(200, 4)
  })

  it('a turn past 180° about a slanting axis reads past 180° on both axes it slants along (review)', () => {
    const half = (200 / 2) * (Math.PI / 180)
    const s = Math.sin(half) / Math.SQRT2
    const a = angleDegrees([Math.cos(half), s, s * 1.001, 0])
    expect(a[0]).toBeGreaterThan(180)
    expect(a[1]).toBeGreaterThan(180)
    expect(a[2]).toBeCloseTo(0, 6)
  })

  it('a replayed step gives the turning speed it recorded (it read 0 °/s in every replay)', () => {
    const { tape } = turning(10, (i) => i, (i) => 0.5 + i)
    const t = turnAt(tape, 4, 'b1')!
    expect(t.angularVelocity).toEqual([0, 4.5, 0])
    expect(t.rotation[3]).toBeCloseTo(Math.cos((4 * Math.PI) / 360), 6)
    // Played backwards, what is seen turns the other way (as the Selected panel shows it).
    expect(turnAt(tape, 4, 'b1', true)!.angularVelocity).toEqual([-0, -4.5, -0])
    expect(turnAt(tape, 4, 'nobody')).toBeNull()
  })
})

describe('the heat each body was given (the ledger’s temperature rise)', () => {
  it('shares never add up to more than the whole: a body whose running total went below zero takes none', () => {
    const s = heatShares(
      new Map([
        ['a', [-2]],
        ['b', [3]]
      ]),
      0
    )
    expect(s.get('a')).toBe(0)
    expect(s.get('b')).toBe(1)
  })
  it('nothing given yet: equal shares', () => {
    const s = heatShares(
      new Map([
        ['a', [0]],
        ['b', [0]]
      ]),
      0
    )
    expect([s.get('a'), s.get('b')]).toEqual([0.5, 0.5])
  })
})

describe('no re-render a step (source pins: the suite has no DOM)', () => {
  const strip = readSource('src/renderer/src/render/sandbox/TapeStrip.tsx')
  const fold = readSource('src/renderer/src/panels/sandbox/PendulumFold.tsx')

  it('the hidden bar is a pill that listens only to whether there is a run, not to the playhead 240 times a second', () => {
    const outer = strip.slice(strip.indexOf('export function TapeStrip('))
    const body = outer.slice(0, outer.indexOf('\n}\n'))
    expect(body).toContain('<ReplayPill />')
    expect(body).not.toContain('useTransportFlags()')
    expect(body).not.toMatch(/useTape\(\(s\) => s\.playhead\)/)
  })

  it('the Angle fold follows the panels’ moment (ten a second), not the playhead every frame', () => {
    expect(fold).not.toMatch(/useTape\(\(s\) => \(s\.mode === 'live' \? 0 : s\.playhead\)\)/)
    expect(fold).toContain('stepAtOrBefore(tape, engineTime)')
  })
})
