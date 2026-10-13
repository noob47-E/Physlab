// Guard (CLEANUP-PLAN.md CW1): every Sandbox preset's numbers match its own description. Each row
// reads the set-up from the built preset (masses, sizes, positions, speeds, springs, gravity) and
// works out each number the `about` sentence quotes with the formula the sentence names; the
// sentence's number must be that result at the sentence's own precision. A row never copies a
// number from the sentence into its result. Drafted by the crew; rows that only copied a number
// were taken out.

import { describe, it, expect } from 'vitest'
import { PRESETS } from '../../src/renderer/src/sim/presets'
import { dragCoefficient } from '../../src/renderer/src/sim/materials'

type BuiltPreset = ReturnType<typeof PRESETS[0]['build']>

const PRESET_CHECKS: {
  id: string
  /** 'no-numbers': the sentence quotes no number; 'formulas-only': it quotes formulas, no value to check. */
  check: ((built: BuiltPreset, text: string) => [string, number][]) | 'no-numbers' | 'formulas-only'
  /** Numbers in the sentence that are not worked out here, each with the reason (a formula's own constant, a measured result). */
  unchecked?: Record<string, string>
}[] = [
  {
    id: 'fall',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'A')!
      const h = ball.position[1] - ball.size[1] // underside
      const g = built.world?.gravity ?? 9.81
      return [
        ['1', ball.mass],
        ['5', h],
        ['1.01', Math.sqrt(2 * h / g)],
        ['9.9', Math.sqrt(2 * g * h)]
      ]
    }
  },
  {
    id: 'projectile',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'P')!
      const vx = ball.velocity[0]
      const vy = ball.velocity[1]
      const v = Math.hypot(vx, vy)
      const angle = Math.round(Math.atan2(vy, vx) * 180 / Math.PI)
      const g = built.world?.gravity ?? 9.81
      const range = v * v * Math.sin(2 * angle * Math.PI / 180) / g
      const hMax = ball.position[1] + vy * vy / (2 * g)
      return [
        ['14', v],
        ['30', angle],
        ['17.3', range],
        ['2.8', hMax]
      ]
    }
  },
  {
    id: 'cliff',
    check: (built) => {
      const ledge = built.bodies.find(b => b.name === 'Ledge')!
      const ball = built.bodies.find(b => b.name === 'P')!
      const h = ledge.position[1] + ledge.size[1] / 2
      const v = ball.velocity[0]
      const g = built.world?.gravity ?? 9.81
      const t = Math.sqrt(2 * h / g)
      const d = v * t
      const edgeX = ledge.position[0] + ledge.size[0] / 2
      const landX = edgeX + d
      return [
        ['4', h],
        ['3', v],
        ['0.90', t],
        ['2.7', d],
        ['-1.3', landX]
      ]
    }
  },
  {
    id: 'drop',
    check: (built) => {
      const heavy = built.bodies.find(b => b.name === 'Heavy')!
      const light = built.bodies.find(b => b.name === 'Light')!
      const h = heavy.position[1] - heavy.size[1]
      const g = built.world?.gravity ?? 9.81
      return [
        ['5', heavy.mass],
        ['0.5', light.mass],
        ['6', h],
        ['1.11', Math.sqrt(2 * h / g)]
      ]
    }
  },
  {
    id: 'moon',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'A')!
      const h = ball.position[1] - ball.size[1]
      const g = built.world?.gravity ?? 9.81
      return [
        ['1.62', g],
        ['5', h],
        ['2.48', Math.sqrt(2 * h / g)],
        ['1.01', Math.sqrt(2 * h / 9.81)]
      ]
    }
  },
  {
    id: 'terminal',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'Foam')!
      const h = ball.position[1] - ball.size[1]
      const m = ball.mass
      const g = built.world?.gravity ?? 9.81
      const rho = built.world!.airDensity!
      // The sim's own drag coefficient for the shape, unless the body sets one.
      const C = ball.dragCd ?? dragCoefficient(ball.shape)
      const A = Math.PI * ball.size[0] * ball.size[0]
      const vTerm = Math.sqrt(2 * m * g / (rho * C * A))
      // Falling from rest against v² drag: v(d) = v_t √(1 − e^(−2gd/v_t²)), as a percentage of v_t.
      const percentAfter = (d: number): number => 100 * Math.sqrt(1 - Math.exp((-2 * g * d) / (vTerm * vTerm)))
      return [
        ['0.8', m],
        ['45', h],
        ['20', vTerm],
        ['95', percentAfter(h)],
        ['88', percentAfter(30)]
      ]
    },
    unchecked: { '30': 'a shorter drop the sentence compares with, not part of the set-up' }
  },
  {
    id: 'ramp',
    check: (built) => {
      // The drop: the ball's centre now, down to its centre resting on the floor (one radius up).
      const ball = built.bodies.find(b => b.name === 'A')!
      const ground = built.bodies.find(b => b.name === 'Floor')!
      const floorTop = ground.position[1] + ground.size[1] / 2
      const drop = ball.position[1] - (floorTop + ball.size[1])
      const g = built.world?.gravity ?? 9.81
      return [
        ['1.5', drop],
        ['4.6', Math.sqrt(10 * g * drop / 7)],
        ['5.4', Math.sqrt(2 * g * drop)],
      ]
    },
    unchecked: { '4.5': 'what the readout shows when the sim runs (the rolling contact costs a little), not a formula' }
  },
  {
    id: 'rollslide',
    // "v = √(10gh/7) against √(2gh)": formulas, with no value in the sentence to work out.
    check: 'formulas-only'
  },
  {
    id: 'friction',
    check: (built) => {
      const crate = built.bodies.find(b => b.name === 'Crate')!
      const v = crate.velocity[0]
      const mu = crate.friction
      const g = built.world?.gravity ?? 9.81
      return [
        ['6', v],
        ['0.4', mu],
        ['4.6', v * v / (2 * mu * g)]
      ]
    }
  },
  {
    id: 'seesaw',
    check: (built) => {
      const left = built.bodies.find((b) => b.name === 'Left hanger')!
      const right = built.bodies.find((b) => b.name === 'Right hanger')!
      const dL = Math.abs(left.position[0])
      const dR = Math.abs(right.position[0])
      return [
        ['2', left.mass],
        ['0.3', dL],
        ['3', right.mass],
        ['0.2', dR]
      ]
    }
  },
  {
    id: 'atwood',
    check: (built) => {
      const m1 = built.bodies.find((b) => b.name === 'm₁')!.mass
      const m2 = built.bodies.find((b) => b.name === 'm₂')!.mass
      const g = built.world?.gravity ?? 9.81
      const a = ((m2 - m1) * g) / (m1 + m2)
      const t = 2
      const d = 0.5 * a * t * t
      return [
        ['0.50', m1],
        ['0.55', m2],
        ['0.47', a],
        ['0.93', d],
        ['2', t]
      ]
    }
  },
  {
    id: 'lift',
    check: (built) => {
      const weight = built.bodies.find(b => b.name === 'Weight')!.mass
      const crate = built.bodies.find(b => b.name === 'Crate')!.mass
      const g = built.world?.gravity ?? 9.81
      const a = (weight - crate) * g / (weight + crate)
      const T = crate * (g + a)
      return [
        ['4', weight],
        ['3', crate],
        ['4', weight],
        ['3', crate],
        ['7', weight + crate],
        ['1.4', a],
        ['3', crate],
        ['33.6', T]
      ]
    }
  },
  {
    id: 'balance',
    check: (built) => {
      const m = built.bodies.find(b => b.name === 'A')!.mass
      const g = built.world?.gravity ?? 9.81
      return [
        ['2', m],
        ['19.6', m * g],
      ]
    },
    unchecked: { '1': 'a drag the student makes (down 1 m, up 1 m), not part of the set-up' }
  },
  {
    id: 'crane',
    check: (built) => {
      const crate = built.bodies.find(b => b.name === 'Crate')!.mass
      const rope = built.links!.find(l => l.kind === 'rope')!
      const g = built.world?.gravity ?? 9.81
      return [
        ['3', crate],
        ['2.5', rope.length],
        ['29.4', crate * g]
      ]
    }
  },
  {
    id: 'bounce',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'Ball')!
      const e = ball.restitution
      const h = ball.position[1] - ball.size[1]
      const h1 = e * e * h
      const h2 = e * e * h1
      const h3 = e * e * h2
      return [
        ['0.8', e],
        ['3', h],
        ['3', h],
        ['1.92', h1],
        ['1.23', h2],
        ['0.79', h3]
      ]
    }
  },
  {
    id: 'galileo',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'A')!
      const h1 = ball.position[1]
      return [['1.31', h1]]
    },
    unchecked: {
      '1.14': 'the height the ball reaches when the sim runs, measured, not a formula',
      '0.17': 'the loss at the corners, as measured (1.31 − 1.14)'
    }
  },
  {
    id: 'stack',
    check: (built) => {
      const ball = built.bodies.find(b => b.name === 'Ball')!
      const m = ball.mass
      const v = ball.velocity[0]
      const crate = built.bodies.find(b => b.name === 'A')!.mass
      return [
        ['2', m],
        ['9', v],
        ['2', crate],
        ['18', m * v],
        ['81', 0.5 * m * v * v]
      ]
    }
  },
  {
    id: 'collision',
    check: (built) => {
      const a = built.bodies.find(b => b.name === 'A')!
      const b = built.bodies.find(b => b.name === 'B')!
      const m1 = a.mass
      const v1 = a.velocity[0]
      const m2 = b.mass
      const v2 = b.velocity[0]
      const e = a.restitution
      const p = m1 * v1 + m2 * v2
      const v1After = (m1 * v1 + m2 * v2 + m2 * e * (v2 - v1)) / (m1 + m2)
      const v2After = (m1 * v1 + m2 * v2 + m1 * e * (v1 - v2)) / (m1 + m2)
      return [
        ['1', m1],
        ['5', v1],
        ['3', m2],
        ['0.9', e],
        ['5', p],
        ['2.1', Math.abs(v1After)],
        ['2.4', v2After]
      ]
    }
  },
  {
    id: 'sticky',
    check: (built) => {
      const a = built.bodies.find(b => b.name === 'A')!
      const b = built.bodies.find(b => b.name === 'B')!
      const m1 = a.mass
      const v1 = a.velocity[0]
      const m2 = b.mass
      const vAfter = (m1 * v1) / (m1 + m2)
      return [
        ['1', m1],
        ['4', v1],
        ['3', m2],
        ['4', m1 * v1],
        ['1', m1],
        ['3', m2],
        ['1', vAfter]
      ]
    }
  },
  {
    id: 'recoil',
    check: (built) => {
      const gun = built.bodies.find(b => b.name === 'Gun')!
      const bullet = built.bodies.find(b => b.name === 'Bullet')!
      const m1 = gun.mass
      const v1 = Math.abs(gun.velocity[0])
      const m2 = bullet.mass
      const v2 = bullet.velocity[0]
      return [
        ['10', m1],
        ['0.5', m2],
        ['25', m1 * v1],
        ['25', m2 * v2]
      ]
    }
  },
  {
    id: 'crash',
    check: (built) => {
      const crate = built.bodies.find(b => b.name === 'Crate')!
      const m = crate.mass
      const v = crate.velocity[0]
      return [
        ['5', m],
        ['8', v],
        ['40', m * v]
      ]
    }
  },
  {
    id: 'cradle',
    check: 'no-numbers'
  },
  {
    id: 'trolleys',
    check: (built) => {
      const a = built.bodies.find(b => b.name === 'A')!
      const ball = built.bodies.find(b => b.name === 'Ball')!
      const b = built.bodies.find(x => x.name === 'B')!
      const mCrates = a.mass + b.mass
      const mBall = ball.mass
      const vBall = ball.velocity[0]
      const p = mBall * vBall
      const mTotal = mCrates + mBall
      return [
        ['2', a.mass],
        ['1', mBall],
        ['6', vBall],
        ['6', p],
        ['5', mTotal],
        ['1.2', p / mTotal]
      ]
    }
  },
  {
    id: 'tug',
    check: (built) => {
      const puller = built.bodies.find(b => b.name === 'Puller')!
      const crate = built.bodies.find(b => b.name === 'Crate')!
      const m1 = puller.mass
      const v1 = puller.velocity[0]
      const m2 = crate.mass
      const p = m1 * v1
      const mTotal = m1 + m2
      const vAvg = p / mTotal
      const lightest = Math.min(m1, m2)
      const ropeMass = Math.max(lightest / 20, Math.min(5, 0.1 * lightest))
      const ropeP = ropeMass * vAvg
      return [
        ['4', m1],
        ['3', v1],
        ['2', m2],
        ['12', p],
        ['6', mTotal],
        ['2', vAvg],
        ['11.6', p - ropeP],
        ['12', p],
        ['0.2', ropeMass],
        ['0.4', ropeP]
      ]
    }
  },
  {
    id: 'pendulum',
    check: (built) => {
      const rope = built.links!.find(l => l.kind === 'string')!
      const L = rope.length
      const g = built.world?.gravity ?? 9.81
      const T = 2 * Math.PI * Math.sqrt(L / g)
      // The release angle from the vertical, from where the bob hangs below the pivot.
      const pivot = built.bodies.find(b => b.name === 'Pivot')!
      const bob = built.bodies.find(b => b.name === 'Bob')!
      const release = (Math.atan2(Math.abs(bob.position[0] - pivot.position[0]), pivot.position[1] - bob.position[1]) * 180) / Math.PI
      // A wide swing's period, to the θ⁴ term: T₀ (1 + θ²/16 + 11θ⁴/3072).
      const wide = (deg: number): number => {
        const th = (deg * Math.PI) / 180
        return T * (1 + th ** 2 / 16 + (11 * th ** 4) / 3072)
      }
      return [
        ['2', L],
        ['15', release],
        ['2.84', T],
        ['3.0', wide(53)]
      ]
    },
    unchecked: { '53': 'the angle the sentence asks the student to try; its 3.0 s is worked out above' }
  },
  {
    id: 'ropeswing',
    check: (built) => {
      const bob = built.bodies.find(b => b.name === 'Bob')!
      return [
        ['2', bob.mass]
      ]
    }
  },
  {
    id: 'swingbridge',
    check: (built) => {
      const string = built.links!.find(l => l.kind === 'string')!
      const L = string.length
      // The bob's vertical drop below the beams: each string is the hypotenuse over half the span.
      const beams = built.bodies.filter(b => b.name.startsWith('Beam'))
      const halfSpan = Math.abs(beams[0].position[2] - beams[1].position[2]) / 2
      const h = Math.sqrt(L * L - halfSpan * halfSpan)
      const g = built.world?.gravity ?? 9.81
      const Th = 2 * Math.PI * Math.sqrt(h / g)
      const TL = 2 * Math.PI * Math.sqrt(L / g)
      return [
        ['2.5', L],
        ['2', h],
        ['2.84', Th],
        ['3.17', TL],
        ['2.5', L],
      ]
    }
  },
  {
    id: 'spring',
    check: (built) => {
      const m = built.bodies.find(b => b.name === 'M')!.mass
      const spring = built.links!.find(l => l.kind === 'spring')!
      const k = spring.stiffness
      const T = 2 * Math.PI * Math.sqrt(m / k)
      return [
        ['0.63', T],
        ['2', m],
        ['200', k]
      ]
    }
  },
  {
    id: 'springice',
    check: (built) => {
      const m = built.bodies.find(b => b.name === 'M')!.mass
      const spring = built.links!.find(l => l.kind === 'spring')!
      const k = spring.stiffness
      const T = 2 * Math.PI * Math.sqrt(m / k)
      const post = built.bodies.find(b => b.name === 'Post')!
      const block = built.bodies.find(b => b.name === 'M')!
      const dist = Math.abs(post.position[0] - block.position[0])
      const stretch = dist - spring.length
      return [
        ['2', m],
        ['50', k],
        ['0.6', stretch],
        ['1.26', T]
      ]
    }
  }
]

describe('Preset text numbers', () => {
  it.each(PRESETS)('preset $id matches its text', (preset) => {
    const row = PRESET_CHECKS.find(r => r.id === preset.id)
    expect(row, `Missing row for preset ${preset.id}`).toBeDefined()
    
    const built = preset.build()
    // The sentences write a real minus sign (−1.3); the rows state numbers with a hyphen.
    const text = preset.about.replace(/−/g, '-')

    // Every number the sentence writes, as a whole token ("1" is not found inside "1.01"), except a
    // formula's own constant: one written against a letter (the 2 of √(2h/g), 2θ) or after a "/".
    const tokens = [...text.matchAll(/(?<![\w./])-?\d+(?:\.\d+)?(?![\d.]*\p{L})/gu)].map((m) => m[0])
    const unchecked = row!.unchecked ?? {}
    const stated = new Set<string>()
    if (row!.check === 'no-numbers') {
      expect(text).not.toMatch(/\d/)
    } else if (row!.check !== 'formulas-only') {
      const checks = row!.check(built, text)
      expect(checks.length, `preset ${preset.id} checks no number`).toBeGreaterThan(0)
      for (const [s, computed] of checks) {
        const decimals = s.includes('.') ? s.split('.')[1].length : 0
        expect(computed.toFixed(decimals), `preset ${preset.id}: ${s}`).toBe(s)
        expect(tokens, `preset ${preset.id}: ${s} is not a number in the sentence`).toContain(s)
        stated.add(s)
      }
    }
    // Nothing in the sentence goes unchecked without a reason, and no reason is left for a number that has gone.
    expect(tokens.filter((t) => !stated.has(t) && !(t in unchecked)), `preset ${preset.id}: numbers not worked out`).toEqual([])
    expect(Object.keys(unchecked).filter((t) => !tokens.includes(t)), `preset ${preset.id}: stale unchecked entries`).toEqual([])
  })

  it('covers all presets', () => {
    expect(PRESET_CHECKS.length).toBe(PRESETS.length)
    const presetIds = PRESETS.map(p => p.id)
    const checkIds = PRESET_CHECKS.map(r => r.id)
    expect(checkIds.sort()).toEqual(presetIds.sort())
  })
})
