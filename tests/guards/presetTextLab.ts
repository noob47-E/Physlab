// SB51: the guard's rows for the Collision Lab's three sentences (tests/guards/presetText.test.ts spreads them in). Each number
// is worked out from the built scene with sim/collisionMath.ts; none is copied from the sentence.

import type { PRESETS } from '../../src/renderer/src/sim/presets'
import { collide1D, collide2D, contactNormal, simulateChain1D } from '../../src/renderer/src/sim/collisionMath'

type BuiltPreset = ReturnType<(typeof PRESETS)[0]['build']>

const body = (b: BuiltPreset, name: string) => b.bodies.find((d) => d.name === name)!

export const LAB_TEXT_ROWS: { id: string; check: (built: BuiltPreset, text: string) => [string, number][]; unchecked?: Record<string, string> }[] = [
  {
    id: 'lab1d',
    check: (built) => {
      const [A, B] = [body(built, 'A'), body(built, 'B')]
      const elastic = collide1D(A.mass, A.velocity[0], B.mass, B.velocity[0], 1)
      const sticky = collide1D(A.mass, A.velocity[0], B.mass, B.velocity[0], 0)
      // The slider's two ends, e = 1 and e = 0, as the sentence says them; the scene starts at the first.
      const e = Math.max(A.restitution, B.restitution)
      return [
        ['1', A.mass],
        ['3', A.velocity[0]],
        ['2', B.mass],
        ['3', elastic.p0],
        ['0', elastic.keLost],
        ['3', sticky.keLost],
        ['1', e]
      ]
    }
  },
  {
    id: 'lab2d',
    check: (built) => {
      const [A, B] = [body(built, 'A'), body(built, 'B')]
      const r = A.size[0] + B.size[0]
      const dy = B.position[1] - A.position[1]
      const along = Math.sqrt(r * r - dy * dy)
      const normal = contactNormal([B.position[0] - along, A.position[1]], [B.position[0], B.position[1]])!
      const c = collide2D({ m: A.mass, v: [A.velocity[0], A.velocity[1]] }, { m: B.mass, v: [0, 0] }, Math.max(A.restitution, B.restitution), normal)
      const phi = (Math.acos(normal[0]) * 180) / Math.PI
      return [
        ['1', A.mass],
        ['3', A.velocity[0]],
        ['1', B.mass],
        ['30', phi],
        ['1', Math.max(A.restitution, B.restitution)],
        ['1.5', Math.hypot(...c.va)],
        ['2.6', Math.hypot(...c.vb)]
      ]
    }
  },
  {
    id: 'labcradle',
    check: (built) => {
      const balls = [1, 2, 3, 4, 5].map((i) => body(built, `B${i}`))
      const one = simulateChain1D(balls.map((d) => ({ x: d.position[0], r: d.size[0], m: d.mass, v: d.velocity[0] })), 1)
      return [
        ['1', balls[0].mass],
        ['2', balls[0].velocity[0]],
        ['2', one.v[4]]
      ]
    }
  }
]
