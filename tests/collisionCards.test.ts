import { describe, it, expect } from 'vitest'
import { COLLISION_CARDS } from '../src/renderer/src/sim/cards/collisionCards'
import { makeBody } from '../src/renderer/src/sim/store'
import { readingOf, evaluateCard } from '../src/renderer/src/sim/cards/index'
import { DEFAULT_WORLD } from '../src/renderer/src/sim/types'
import type { BodyState } from '../src/renderer/src/sim/types'
import { unitsCheck } from '../src/renderer/src/sim/cards/units'
import type { DigitSettings } from '../src/renderer/src/math/format'
import katex from 'katex'

const SF3: DigitSettings = { decimals: 3, precisionMode: 'sf' as const }

function state(position: [number, number, number], velocity: [number, number, number], mass: number): BodyState {
  return { position, velocity, rotation: [0, 0, 0, 1], angularVelocity: [0, 0, 0], mass, asleep: false }
}

describe('Collision Lab cards', () => {
  it('has all exports explicitly imported', () => {
    expect(COLLISION_CARDS).toBeDefined()
  })

  it('every card has valid units, sumChecks true, and correct Katex rendering', () => {
    // Basic test using simple dummy data to verify sumChecks and Katex
    const A = makeBody('sphere', 'A', [0, 1, 0])
    A.mass = 1
    const B = makeBody('sphere', 'B', [2, 1, 0])
    B.mass = 2
    
    // We set B1 to B5 for cradle
    const B1 = makeBody('sphere', 'B1', [0, 1, 0]); B1.mass = 1;
    const B2 = makeBody('sphere', 'B2', [1, 1, 0]); B2.mass = 1;
    const B3 = makeBody('sphere', 'B3', [2, 1, 0]); B3.mass = 1;
    const B4 = makeBody('sphere', 'B4', [3, 1, 0]); B4.mass = 1;
    const B5 = makeBody('sphere', 'B5', [4, 1, 0]); B5.mass = 1;

    const bodies = [A, B, B1, B2, B3, B4, B5]

    const states: Record<string, BodyState> = {
      [A.id]: state([1, 1, 0], [1, 0, 0], 1),
      [B.id]: state([3, 1, 0], [0, 0, 0], 2),
      [B1.id]: state([0, 1, 0], [1, 0, 0], 1),
      [B2.id]: state([1, 1, 0], [0, 0, 0], 1),
      [B3.id]: state([2, 1, 0], [0, 0, 0], 1),
      [B4.id]: state([3, 1, 0], [0, 0, 0], 1),
      [B5.id]: state([4, 1, 0], [0, 0, 0], 1),
    }

    const starts: Record<string, BodyState> = {
      [A.id]: state([0, 1, 0], [2, 0, 0], 1),
      [B.id]: state([2, 1, 0], [0, 0, 0], 2),
      [B1.id]: state([0, 1, 0], [2, 0, 0], 1),
      [B2.id]: state([1, 1, 0], [0, 0, 0], 1),
      [B3.id]: state([2, 1, 0], [0, 0, 0], 1),
      [B4.id]: state([3, 1, 0], [0, 0, 0], 1),
      [B5.id]: state([4, 1, 0], [0, 0, 0], 1),
    }

    const r = readingOf({
      bodies,
      states,
      starts,
      links: [],
      world: DEFAULT_WORLD,
      t: 1,
      roles: { A: 'A', B: 'B', B1: 'B1', B2: 'B2', B3: 'B3', B4: 'B4', B5: 'B5' }
    })

    const trust = (ctx: { command: string }) => ctx.command === '\\htmlData'

    for (const c of COLLISION_CARDS) {
      expect(unitsCheck(c), `${c.id} units`).toBe(true)

      const v = evaluateCard(c.id, r, SF3)
      expect(v).not.toBeNull()
      expect(v!.sumChecks, `${c.id} sumChecks`).toBe(true)
      
      for (const line of v!.lines) {
        expect(() => katex.renderToString(line.tex, { displayMode: true, throwOnError: true, strict: 'ignore', trust }), c.id).not.toThrow()
      }
    }
  })

  it('Scene 1: 1D collision, elastic, inelastic, stuck', () => {
    const A = makeBody('sphere', 'A', [-1, 1, 0])
    A.mass = 1
    A.restitution = 0.5
    const B = makeBody('sphere', 'B', [1, 1, 0])
    B.mass = 2
    B.restitution = 0.5

    const starts: Record<string, BodyState> = {
      [A.id]: state([-1, 1, 0], [3, 0, 0], 1),
      [B.id]: state([1, 1, 0], [0, 0, 0], 2)
    }

    // At t = 0
    let r = readingOf({
      bodies: [A, B],
      states: starts,
      starts,
      links: [],
      world: DEFAULT_WORLD,
      t: 0,
      roles: { A: 'A', B: 'B' }
    })

    const last = (id: string, rd = r) => evaluateCard(id, rd, SF3)!.lines[2].plain

    expect(last('lab-p0')).toBe('= 3.00 kg m/s')
    expect(last('lab-p')).toBe('= 3.00 kg m/s')
    expect(last('lab-ke0')).toBe('= 4.50 J')
    expect(last('lab-ke')).toBe('= 4.50 J')
    expect(last('lab-ke-lost')).toBe('= 0 J')

    // After the hit, e = 0.5 on both (A [0,0,0], B [1.5,0,0])
    let states: Record<string, BodyState> = {
      [A.id]: state([0, 1, 0], [0, 0, 0], 1),
      [B.id]: state([2, 1, 0], [1.5, 0, 0], 2)
    }

    r = readingOf({
      bodies: [A, B],
      states,
      starts,
      links: [],
      world: DEFAULT_WORLD,
      t: 1,
      roles: { A: 'A', B: 'B' }
    })

    expect(last('lab-p')).toBe('= 3.00 kg m/s')
    expect(last('lab-ke')).toBe('= 2.25 J')
    expect(last('lab-ke-lost')).toBe('= 2.25 J')
    expect(last('lab-ke-lost-theory')).toBe('= 2.25 J')
    expect(last('lab-e-measured')).toBe('= 0.500')

    // Elastic (e = 1 on both; after A [-1,0,0], B [2,0,0])
    A.restitution = 1
    B.restitution = 1
    states = {
      [A.id]: state([-1, 1, 0], [-1, 0, 0], 1),
      [B.id]: state([2, 1, 0], [2, 0, 0], 2)
    }

    r = readingOf({ bodies: [A, B], states, starts, links: [], world: DEFAULT_WORLD, t: 1, roles: { A: 'A', B: 'B' } })

    expect(last('lab-p')).toBe('= 3.00 kg m/s')
    expect(last('lab-ke')).toBe('= 4.50 J')
    expect(last('lab-ke-lost')).toBe('= 0 J')
    expect(last('lab-ke-lost-theory')).toBe('= 0 J')
    expect(last('lab-e-measured')).toBe('= 1.00')

    // Stuck (e = 0; after both [1,0,0])
    A.restitution = 0
    B.restitution = 0
    states = {
      [A.id]: state([1, 1, 0], [1, 0, 0], 1),
      [B.id]: state([2, 1, 0], [1, 0, 0], 2)
    }

    r = readingOf({ bodies: [A, B], states, starts, links: [], world: DEFAULT_WORLD, t: 1, roles: { A: 'A', B: 'B' } })

    expect(last('lab-ke')).toBe('= 1.50 J')
    expect(last('lab-ke-lost')).toBe('= 3.00 J')
    expect(last('lab-ke-lost-theory')).toBe('= 3.00 J')
    expect(last('lab-e-measured')).toBe('= 0')

    // Different bounciness (A 0.2, B 0.9; after as the engine would give with 0.9)
    A.restitution = 0.2
    B.restitution = 0.9
    // engine uses max(e1, e2) = 0.9. Theory should use e = 0.9
    // Theory with e=0.9: 0.5 * (2/3) * (1 - 0.81) * 9 = 3 * 0.19 = 0.57
    r = readingOf({ bodies: [A, B], states, starts, links: [], world: DEFAULT_WORLD, t: 1, roles: { A: 'A', B: 'B' } })
    expect(last('lab-ke-lost-theory')).toBe('= 0.570 J')
  })

  it('Scene 2: 2-D collision', () => {
    // Scene 2 (2-D, 1 kg each, A start [3,0,0], B at rest, e = 0.5): 
    // after A [1.3125,-0.974278579,0], B [1.6875,0.974278579,0]
    const A = makeBody('sphere', 'A', [-1, 1, 0])
    A.mass = 1
    A.restitution = 0.5
    const B = makeBody('sphere', 'B', [1, 1, 0])
    B.mass = 1
    B.restitution = 0.5

    const starts: Record<string, BodyState> = {
      [A.id]: state([-1, 1, 0], [3, 0, 0], 1),
      [B.id]: state([1, 1, 0], [0, 0, 0], 1)
    }
    const states: Record<string, BodyState> = {
      [A.id]: state([0, 1, 0], [1.3125, -0.974278579, 0], 1),
      [B.id]: state([2, 1, 0], [1.6875, 0.974278579, 0], 1)
    }

    const r = readingOf({ bodies: [A, B], states, starts, links: [], world: DEFAULT_WORLD, t: 1, roles: { A: 'A', B: 'B' } })
    const last = (id: string, rd = r) => evaluateCard(id, rd, SF3)!.lines[2].plain
    const lastV = (id: string, rd = r) => evaluateCard(id, rd, SF3)!.value

    expect(last('lab2d-px0')).toBe('= 3.00 kg m/s')
    expect(last('lab2d-px')).toBe('= 3.00 kg m/s')
    expect(lastV('lab2d-py0')).toBeCloseTo(0, 9)
    expect(last('lab2d-py0')).toBe('= 0 kg m/s')
    expect(lastV('lab2d-py')).toBeCloseTo(0, 9)
    expect(last('lab2d-py')).toBe('= 0 kg m/s')
    expect(last('lab-ke')).toBe('= 3.23 J')
    expect(last('lab-ke-lost')).toBe('= 1.27 J')
    
    // Check values underneath (3 significant figures; 3.234375 and 1.265625 underneath)
    expect(lastV('lab-ke')).toBeCloseTo(3.234375, 5)
    expect(lastV('lab-ke-lost')).toBeCloseTo(1.265625, 5)
  })

  it('Scene 3: cradle', () => {
    const B1 = makeBody('sphere', 'B1', [0, 1, 0]); B1.mass = 1; B1.restitution = 1;
    const B2 = makeBody('sphere', 'B2', [1, 1, 0]); B2.mass = 1; B2.restitution = 1;
    const B3 = makeBody('sphere', 'B3', [2, 1, 0]); B3.mass = 1; B3.restitution = 1;
    const B4 = makeBody('sphere', 'B4', [3, 1, 0]); B4.mass = 1; B4.restitution = 1;
    const B5 = makeBody('sphere', 'B5', [4, 1, 0]); B5.mass = 1; B5.restitution = 1;

    const bodies = [B1, B2, B3, B4, B5]

    const starts: Record<string, BodyState> = {
      [B1.id]: state([0, 1, 0], [2, 0, 0], 1),
      [B2.id]: state([1, 1, 0], [0, 0, 0], 1),
      [B3.id]: state([2, 1, 0], [0, 0, 0], 1),
      [B4.id]: state([3, 1, 0], [0, 0, 0], 1),
      [B5.id]: state([4, 1, 0], [0, 0, 0], 1),
    }

    // at t = 0
    let r = readingOf({
      bodies,
      states: starts,
      starts,
      links: [],
      world: DEFAULT_WORLD,
      t: 0,
      roles: { B1: 'B1', B2: 'B2', B3: 'B3', B4: 'B4', B5: 'B5' }
    })

    const last = (id: string, rd = r) => evaluateCard(id, rd, SF3)!.lines[2].plain
    const lastV = (id: string, rd = r) => evaluateCard(id, rd, SF3)!.value

    expect(last('lab-cradle-p0')).toBe('= 2.00 kg m/s')
    expect(last('lab-cradle-ke0')).toBe('= 2.00 J')

    // after (B5 [2,0,0], the rest at rest)
    let states: Record<string, BodyState> = {
      [B1.id]: state([0, 1, 0], [0, 0, 0], 1),
      [B2.id]: state([1, 1, 0], [0, 0, 0], 1),
      [B3.id]: state([2, 1, 0], [0, 0, 0], 1),
      [B4.id]: state([3, 1, 0], [0, 0, 0], 1),
      [B5.id]: state([4, 1, 0], [2, 0, 0], 1),
    }

    r = readingOf({ bodies, states, starts, links: [], world: DEFAULT_WORLD, t: 1, roles: { B1: 'B1', B2: 'B2', B3: 'B3', B4: 'B4', B5: 'B5' } })

    expect(last('lab-cradle-p')).toBe('= 2.00 kg m/s')
    expect(last('lab-cradle-ke')).toBe('= 2.00 J')

    // after with e = 0.98 (B5 [1.92119202,0,0], B1 to B4 [0.019417664, 0.019605999, 0.019796158, 0.019988159])
    states = {
      [B1.id]: state([0, 1, 0], [0.019417664, 0, 0], 1),
      [B2.id]: state([1, 1, 0], [0.019605999, 0, 0], 1),
      [B3.id]: state([2, 1, 0], [0.019796158, 0, 0], 1),
      [B4.id]: state([3, 1, 0], [0.019988159, 0, 0], 1),
      [B5.id]: state([4, 1, 0], [1.92119202, 0, 0], 1),
    }

    r = readingOf({ bodies, states, starts, links: [], world: DEFAULT_WORLD, t: 1, roles: { B1: 'B1', B2: 'B2', B3: 'B3', B4: 'B4', B5: 'B5' } })

    expect(last('lab-cradle-p')).toBe('= 2.00 kg m/s')
    expect(last('lab-cradle-ke')).toBe('= 1.85 J')
    expect(lastV('lab-cradle-ke')).toBeCloseTo(1.846265816, 5)
  })

  it('roles missing from a reading give null', () => {
    const A = makeBody('sphere', 'A', [-1, 1, 0])
    A.mass = 1
    
    // Only A is present
    const starts: Record<string, BodyState> = {
      [A.id]: state([-1, 1, 0], [3, 0, 0], 1),
    }

    const r = readingOf({
      bodies: [A],
      states: starts,
      starts,
      links: [],
      world: DEFAULT_WORLD,
      t: 0,
      roles: { A: 'A' } // Missing B role
    })

    for (const c of COLLISION_CARDS) {
      if (c.id.includes('cradle')) continue // cradle uses B1..B5
      const v = evaluateCard(c.id, r, SF3)
      expect(v).toBeNull()
    }
  })
})
