// SB61 Step 1: measure hanging spin in experiments untouched (a), after Set (b), after drag (c)
// For every joined body: record largest |angular velocity| and total rotation in degrees

import { beforeAll, describe, it, expect } from 'vitest'
import { SimWorld } from '../src/renderer/src/sim/world'
import { DEFAULT_WORLD, type BodyDef, type Link, type StepRate, type WorldSettings } from '../src/renderer/src/sim/types'
import type { V3 } from '../src/renderer/src/math/vec'
import { presetById } from '../src/renderer/src/sim/presets'
import { planPullBack, type PullBackInput } from '../src/renderer/src/sim/pendulum'
import { add } from '../src/renderer/src/math/vec'

const DEG = 180 / Math.PI

interface SpinRecord {
  experimentId: string
  bodyId: string
  step: 'a' | 'b' | 'c'
  maxAngularSpeed: number
  totalRotationDeg: number
  startingAngularVelocity: V3
  contacts: string[]
}

let n = 0

function body(over: Partial<BodyDef> = {}): BodyDef {
  return {
    id: `h${++n}`,
    name: `H${n}`,
    shape: 'sphere',
    size: [0.1, 0.1, 0.1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    velocity: [0, 0, 0],
    angularVelocity: [0, 0, 0],
    motion: 'dynamic',
    material: 'steel',
    massMode: 'mass',
    mass: 1,
    restitution: 0,
    friction: 0,
    linearDamping: 0,
    angularDamping: 0,
    color: '#fff',
    ...over
  }
}

function link(kind: Link['kind'], a: BodyDef, b: BodyDef, over: Partial<Link> = {}): Link {
  return { id: `l${++n}`, kind, a: a.id, b: b.id, length: 1, stiffness: 0, damping: 0, ...over }
}

async function world(rate: StepRate, over: Partial<WorldSettings> = {}): Promise<SimWorld> {
  return SimWorld.create({ ...DEFAULT_WORLD, airDensity: 0, allowSleeping: false, twoD: true, stepRate: rate, ...over })
}

const sq = (v: V3) => v[0] * v[0] + v[1] * v[1] + v[2] * v[2]
const len = (v: V3) => Math.sqrt(sq(v))

beforeAll(async () => {
  const w = await world(240)
  w.destroy()
}, 30_000)

describe('SB61 Step 1: hanging spin - untouched (a), after Set (b), after drag (c)', () => {
  it('measure angular velocity and rotation in three scenarios', async () => {
    const results: SpinRecord[] = []

    // Test pendulum
    const pendulumPreset = presetById('pendulum')
    if (pendulumPreset) {
      const scene = pendulumPreset.build()
      const w = await world(240)
      if (scene.bodies && scene.links) {
        w.rebuild(scene.bodies, scene.links)
        // (a) untouched
        results.push(...await measureExperiment(w, 'pendulum', scene.bodies, scene.links, 'a'))
      }
      w.destroy()

      // (b) after Set
      const scene2 = pendulumPreset.build()
      const w2 = await world(240)
      if (scene2.bodies && scene2.links) {
        w2.rebuild(scene2.bodies, scene2.links)
        // Find the bob (non-static joined body with smallest y, presumably)
        const bob = scene2.bodies.find(b => {
          const link = scene2.links!.find(l => (l.a === b.id || l.b === b.id))
          return link && b.motion === 'dynamic'
        })
        if (bob) {
          // Apply Set: use planPullBack to move bob to 30 degrees
          const pivot = scene2.bodies.find(b => b.motion === 'static' && scene2.links!.some(l => l.a === bob.id || l.b === bob.id))
          if (pivot) {
            const input: PullBackInput = {
              bobId: bob.id,
              bodies: scene2.bodies,
              links: scene2.links,
              where: (id) => w2.state(id)?.position,
              twoD: true,
              engineTime: 0,
              refusal: null,
              num: (n) => String(n)
            }
            const plan = planPullBack(input, 30, 'side')
            if (plan.ok) {
              w2.placeBody(bob.id, plan.position)
              w2.setVelocity(bob.id, [0, 0, 0])
              w2.setAngularVelocity(bob.id, [0, 0, 0])
            }
          }
        }
        results.push(...await measureExperiment(w2, 'pendulum', scene2.bodies, scene2.links, 'b'))
      }
      w2.destroy()

      // (c) after drag
      const scene3 = pendulumPreset.build()
      const w3 = await world(240)
      if (scene3.bodies && scene3.links) {
        w3.rebuild(scene3.bodies, scene3.links)
        const bob = scene3.bodies.find(b => {
          const link = scene3.links!.find(l => (l.a === b.id || l.b === b.id))
          return link && b.motion === 'dynamic'
        })
        if (bob) {
          // Drag the bob: grab at surface, move 20cm over 0.2s (48 steps at 240Hz)
          const startPos = w3.state(bob.id)?.position
          if (startPos) {
            const dragSteps = 48  // 0.2s * 240 Hz
            const dragDist = 0.2  // 20 cm
            w3.grab(bob.id, startPos)
            for (let i = 0; i < dragSteps; i++) {
              const t = (i + 1) / dragSteps
              const target = add(startPos, [dragDist * t, 0, 0])
              w3.moveGrab(target)
              w3.stepOnce()
            }
            w3.release_()
          }
        }
        results.push(...await measureExperiment(w3, 'pendulum', scene3.bodies, scene3.links, 'c'))
      }
      w3.destroy()
    }

    // Test spring (mass on a spring)
    const springPreset = presetById('spring')
    if (springPreset) {
      const scene = springPreset.build()
      const w = await world(240)
      if (scene.bodies && scene.links) {
        w.rebuild(scene.bodies, scene.links)
        results.push(...await measureExperiment(w, 'spring', scene.bodies, scene.links, 'a'))
      }
      w.destroy()

      // (b) after Set
      const scene2 = springPreset.build()
      const w2 = await world(240)
      if (scene2.bodies && scene2.links) {
        w2.rebuild(scene2.bodies, scene2.links)
        const bob = scene2.bodies.find(b => {
          const link = scene2.links!.find(l => (l.a === b.id || l.b === b.id))
          return link && b.motion === 'dynamic'
        })
        if (bob) {
          const input: PullBackInput = {
            bobId: bob.id,
            bodies: scene2.bodies,
            links: scene2.links,
            where: (id) => w2.state(id)?.position,
            twoD: true,
            engineTime: 0,
            refusal: null,
            num: (n) => String(n)
          }
          const plan = planPullBack(input, 0.3, 'side')
          if (plan.ok) {
            w2.placeBody(bob.id, plan.position)
            w2.setVelocity(bob.id, [0, 0, 0])
            w2.setAngularVelocity(bob.id, [0, 0, 0])
          }
        }
        results.push(...await measureExperiment(w2, 'spring', scene2.bodies, scene2.links, 'b'))
      }
      w2.destroy()

      // (c) after drag
      const scene3 = springPreset.build()
      const w3 = await world(240)
      if (scene3.bodies && scene3.links) {
        w3.rebuild(scene3.bodies, scene3.links)
        const bob = scene3.bodies.find(b => {
          const link = scene3.links!.find(l => (l.a === b.id || l.b === b.id))
          return link && b.motion === 'dynamic'
        })
        if (bob) {
          const startPos = w3.state(bob.id)?.position
          if (startPos) {
            const dragSteps = 48
            const dragDist = 0.2
            w3.grab(bob.id, startPos)
            for (let i = 0; i < dragSteps; i++) {
              const t = (i + 1) / dragSteps
              const target = add(startPos, [dragDist * t, 0, 0])
              w3.moveGrab(target)
              w3.stepOnce()
            }
            w3.release_()
          }
        }
        results.push(...await measureExperiment(w3, 'spring', scene3.bodies, scene3.links, 'c'))
      }
      w3.destroy()
    }

    // Test ropeswing
    const ropeswingPreset = presetById('ropeswing')
    if (ropeswingPreset) {
      const scene = ropeswingPreset.build()
      const w = await world(240)
      if (scene.bodies && scene.links) {
        w.rebuild(scene.bodies, scene.links)
        results.push(...await measureExperiment(w, 'ropeswing', scene.bodies, scene.links, 'a'))
      }
      w.destroy()

      // (b) after Set
      const scene2 = ropeswingPreset.build()
      const w2 = await world(240)
      if (scene2.bodies && scene2.links) {
        w2.rebuild(scene2.bodies, scene2.links)
        const bob = scene2.bodies.find(b => {
          const link = scene2.links!.find(l => (l.a === b.id || l.b === b.id))
          return link && b.motion === 'dynamic'
        })
        if (bob) {
          const input: PullBackInput = {
            bobId: bob.id,
            bodies: scene2.bodies,
            links: scene2.links,
            where: (id) => w2.state(id)?.position,
            twoD: true,
            engineTime: 0,
            refusal: null,
            num: (n) => String(n)
          }
          const plan = planPullBack(input, 45, 'side')
          if (plan.ok) {
            w2.placeBody(bob.id, plan.position)
            w2.setVelocity(bob.id, [0, 0, 0])
            w2.setAngularVelocity(bob.id, [0, 0, 0])
          }
        }
        results.push(...await measureExperiment(w2, 'ropeswing', scene2.bodies, scene2.links, 'b'))
      }
      w2.destroy()

      // (c) after drag
      const scene3 = ropeswingPreset.build()
      const w3 = await world(240)
      if (scene3.bodies && scene3.links) {
        w3.rebuild(scene3.bodies, scene3.links)
        const bob = scene3.bodies.find(b => {
          const link = scene3.links!.find(l => (l.a === b.id || l.b === b.id))
          return link && b.motion === 'dynamic'
        })
        if (bob) {
          const startPos = w3.state(bob.id)?.position
          if (startPos) {
            const dragSteps = 48
            const dragDist = 0.2
            w3.grab(bob.id, startPos)
            for (let i = 0; i < dragSteps; i++) {
              const t = (i + 1) / dragSteps
              const target = add(startPos, [dragDist * t, 0, 0])
              w3.moveGrab(target)
              w3.stepOnce()
            }
            w3.release_()
          }
        }
        results.push(...await measureExperiment(w3, 'ropeswing', scene3.bodies, scene3.links, 'c'))
      }
      w3.destroy()
    }

    // Test ball on rod (custom scene)
    {
      const w = await world(240)
      const box = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 2, 0], motion: 'static' })
      const ball = body({ position: [1, 2, 0], mass: 1 })
      const rod = link('rod', box, ball, { length: 1 })
      w.rebuild([box, ball], [rod])
      results.push(...await measureExperiment(w, 'ball-on-rod', [box, ball], [rod], 'a'))
      w.destroy()

      // (b) after Set
      const w2 = await world(240)
      const box2 = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 2, 0], motion: 'static' })
      const ball2 = body({ position: [1, 2, 0], mass: 1 })
      const rod2 = link('rod', box2, ball2, { length: 1 })
      w2.rebuild([box2, ball2], [rod2])
      const input: PullBackInput = {
        bobId: ball2.id,
        bodies: [box2, ball2],
        links: [rod2],
        where: (id) => w2.state(id)?.position,
        twoD: true,
        engineTime: 0,
        refusal: null,
        num: (n) => String(n)
      }
      const plan = planPullBack(input, 30, 'side')
      if (plan.ok) {
        w2.placeBody(ball2.id, plan.position)
        w2.setVelocity(ball2.id, [0, 0, 0])
        w2.setAngularVelocity(ball2.id, [0, 0, 0])
      }
      results.push(...await measureExperiment(w2, 'ball-on-rod', [box2, ball2], [rod2], 'b'))
      w2.destroy()

      // (c) after drag
      const w3 = await world(240)
      const box3 = body({ shape: 'box', size: [0.5, 0.5, 0.5], position: [0, 2, 0], motion: 'static' })
      const ball3 = body({ position: [1, 2, 0], mass: 1 })
      const rod3 = link('rod', box3, ball3, { length: 1 })
      w3.rebuild([box3, ball3], [rod3])
      const startPos = w3.state(ball3.id)?.position
      if (startPos) {
        const dragSteps = 48
        const dragDist = 0.2
        w3.grab(ball3.id, startPos)
        for (let i = 0; i < dragSteps; i++) {
          const t = (i + 1) / dragSteps
          const target = add(startPos, [dragDist * t, 0, 0])
          w3.moveGrab(target)
          w3.stepOnce()
        }
        w3.release_()
      }
      results.push(...await measureExperiment(w3, 'ball-on-rod', [box3, ball3], [rod3], 'c'))
      w3.destroy()
    }

    // Print results as table
    console.log('\n=== SB61 Spin Measurement Results (Steps a, b, c) ===')
    console.log('Experiment | Step | Body ID | Max |ω| (rad/s) | Total Rotation (deg) | Starting ω | Contacts')
    console.log('-'.repeat(120))
    for (const r of results) {
      const omegaStr = r.startingAngularVelocity.map(v => v.toFixed(4)).join(',')
      const contactsStr = r.contacts.join('; ') || 'none'
      console.log(`${r.experimentId.padEnd(15)} | ${r.step} | ${r.bodyId.padEnd(8)} | ${r.maxAngularSpeed.toFixed(6).padEnd(16)} | ${r.totalRotationDeg.toFixed(2).padEnd(19)} | [${omegaStr}] | ${contactsStr}`)
    }

    // At least one experiment should have results
    expect(results.length).toBeGreaterThan(0)
    // SB61-fix: a joined body now turns WITH its link, so the spins this measurement prints are its link's swing (the ball
    // on a level rod reaches √(2gL)/L, the Rope swing whips round at the top of its big swing). A spin of its own, against
    // its link, is what matters, and tests/turnWithLink.test.ts holds every one of them under 0.05 rad/s.
  })
})

async function measureExperiment(w: SimWorld, experimentId: string, _bodies: BodyDef[], links: Link[], step: 'a' | 'b' | 'c'): Promise<SpinRecord[]> {
  const results: SpinRecord[] = []

  // Map body ids to whether they are joined
  const joinedBodies = new Set<string>()
  for (const link of links) {
    joinedBodies.add(link.a)
    joinedBodies.add(link.b)
  }

  // Record starting angular velocities
  const startOmega = new Map<string, V3>()
  const startRotation = new Map<string, number[]>()
  for (const bodyId of joinedBodies) {
    const state = w.state(bodyId)
    if (state) {
      startOmega.set(bodyId, [...state.angularVelocity])
      startRotation.set(bodyId, [...state.rotation])
    }
  }

  // Track max angular speed and rotation for each body
  const maxOmega = new Map<string, number>()
  const totalRotation = new Map<string, number>()

  for (const bodyId of joinedBodies) {
    maxOmega.set(bodyId, 0)
    totalRotation.set(bodyId, 0)
  }

  // Run for 10 seconds at 240 steps/s = 2400 steps
  const steps = 240 * 10
  for (let i = 0; i < steps; i++) {
    w.stepOnce()

    // Track angular velocities and rotations
    for (const bodyId of joinedBodies) {
      const state = w.state(bodyId)
      if (state) {
        const omegaMag = len(state.angularVelocity)
        const current = maxOmega.get(bodyId) || 0
        maxOmega.set(bodyId, Math.max(current, omegaMag))

        // Calculate rotation change (simple approximation from angular velocity)
        // For more accurate measurement we'd integrate quaternions, but this gives us the trend
      }
    }
  }

  // Measure total rotation at the end
  for (const bodyId of joinedBodies) {
    const state = w.state(bodyId)
    if (state && startRotation.has(bodyId)) {
      const start = startRotation.get(bodyId)!
      const end = state.rotation
      // Measure angular distance in radians (approximate using dot product)
      const rotation = getRotationAngle(start, end)
      totalRotation.set(bodyId, rotation * DEG)
    }
  }

  // Get contact information (all bodies joined to this one)
  for (const bodyId of joinedBodies) {
    const contactBodies: string[] = []
    for (const link of links) {
      if (link.a === bodyId) contactBodies.push(link.b)
      else if (link.b === bodyId) contactBodies.push(link.a)
    }

    const omega = startOmega.get(bodyId) || [0, 0, 0]
    results.push({
      experimentId,
      bodyId,
      step,
      maxAngularSpeed: maxOmega.get(bodyId) || 0,
      totalRotationDeg: totalRotation.get(bodyId) || 0,
      startingAngularVelocity: omega,
      contacts: contactBodies
    })
  }

  return results
}

// Measure rotation angle between two quaternion-like rotation vectors
function getRotationAngle(r1: readonly number[], r2: readonly number[]): number {
  // Approximate rotation angle from rotation vectors
  const dx = r2[0] - r1[0]
  const dy = r2[1] - r1[1]
  const dz = r2[2] - r1[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}
