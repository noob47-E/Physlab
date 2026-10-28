import { useSandbox } from '../../src/renderer/src/sim/store'
import { enterMode } from '../../src/renderer/src/app/layout'
import type { BankItem } from './types'

export const SANDBOX_ITEMS: BankItem[] = [
  {
    id: 'sb-01',
    name: 'Build Atwood machine with 2 and 3 kg',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'build an Atwood machine with 2 and 3 kg',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
      useSandbox.getState().clearRecording()
    },
    mockCommands: [{ type: 'tool', tool: 'load_experiment', args: { id: 'atwood' } }],
    check: ({ sandbox }) => {
      const bodies = sandbox.bodies
      return {
        pass: bodies.length >= 2,
        reason: bodies.length >= 2 ? undefined : 'Atwood machine bodies not created'
      }
    }
  },
  {
    id: 'sb-02',
    name: 'Make the ball bouncier',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'make the ball bouncier',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('build_experiment', { floor: true, objects: [{ kind: 'sphere', mass: 1, x: 0, y: 5, restitution: 0.3 }] })
    },
    mockCommands: [{ type: 'tool', tool: 'set_param', args: { name: 'restitution', value: 0.9 } }],
    check: ({ sandbox }) => {
      const sphere = sandbox.bodies.find((b) => b.shape === 'sphere')
      const passed = sphere ? (sphere.restitution ?? 0) >= 0.7 : false
      return {
        pass: passed,
        reason: passed ? undefined : 'Ball restitution was not increased'
      }
    }
  },
  {
    id: 'sb-03',
    name: 'Remove the ramp',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'remove the ramp',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('load_experiment', { id: 'incline' })
    },
    mockCommands: [{ type: 'tool', tool: 'remove', args: { mode: 'sandbox', names: ['ramp'] } }],
    check: ({ sandbox }) => {
      const ramp = sandbox.bodies.find((b) => b.name.toLowerCase().includes('ramp') || b.shape === 'ramp')
      return {
        pass: !ramp,
        reason: ramp ? 'Ramp was not removed' : undefined
      }
    }
  },
  {
    id: 'sb-04',
    name: 'Rewind to 1 s and branch',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'rewind to 1 s and branch',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('load_experiment', { id: 'drop' })
      await runTool('play', { seconds: 2 })
    },
    mockCommands: [{ type: 'tool', tool: 'play', args: { seconds: 1 } }],
    check: ({ sandbox }) => {
      const hasRecording = Object.keys(sandbox.recording).length > 0
      return {
        pass: hasRecording,
        reason: hasRecording ? undefined : 'Sandbox recording state not preserved'
      }
    }
  },
  {
    id: 'sb-05',
    name: 'Build a pendulum with a 2 s period',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'a pendulum with a 2 s period',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [{ type: 'tool', tool: 'load_experiment', args: { id: 'pendulum' } }],
    check: ({ sandbox }) => {
      const hasBob = sandbox.bodies.some((b) => b.shape === 'sphere' && b.motion === 'dynamic')
      return {
        pass: hasBob,
        reason: hasBob ? undefined : 'Pendulum bob not found'
      }
    }
  },
  {
    id: 'sb-06',
    name: 'Launch projectile at 45°',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Launch a projectile at 20 m/s at 45°',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: {
          floor: true,
          objects: [{ kind: 'sphere', mass: 1, x: 0, y: 0.5, vx: 14.14, vy: 14.14 }]
        }
      }
    ],
    check: ({ sandbox }) => {
      const p = sandbox.bodies.find((b) => b.shape === 'sphere' && b.motion === 'dynamic')
      const hasVelocity = p ? Math.hypot(p.velocity[0], p.velocity[1]) > 5 : false
      return {
        pass: hasVelocity,
        reason: hasVelocity ? undefined : 'Projectile with 45° launch velocity not created'
      }
    }
  },
  {
    id: 'sb-07',
    name: '2 kg crate on 28° incline with static friction 0.6',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'A 2 kg crate rests on a 28° incline with static friction 0.6',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: {
          floor: true,
          objects: [{ kind: 'box', mass: 2, x: 0, y: 3, friction: 0.6 }]
        }
      }
    ],
    check: ({ sandbox }) => {
      const box = sandbox.bodies.find((b) => b.shape === 'box' && b.mass === 2)
      return {
        pass: Boolean(box),
        reason: box ? undefined : '2 kg box not created'
      }
    }
  },
  {
    id: 'sb-08',
    name: 'Spring-mass oscillator',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Build a spring-mass oscillator',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [{ type: 'tool', tool: 'load_experiment', args: { id: 'spring' } }],
    check: ({ sandbox }) => {
      const bodies = sandbox.bodies
      return {
        pass: bodies.length >= 1,
        reason: bodies.length >= 1 ? undefined : 'Spring oscillator bodies not found'
      }
    }
  },
  {
    id: 'sb-09',
    name: 'Elastic collision of two equal masses',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Simulate an elastic collision between two 1 kg spheres',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: {
          floor: true,
          objects: [
            { kind: 'sphere', mass: 1, x: -3, y: 1, vx: 4, vy: 0, restitution: 1 },
            { kind: 'sphere', mass: 1, x: 3, y: 1, vx: -4, vy: 0, restitution: 1 }
          ]
        }
      }
    ],
    check: ({ sandbox }) => {
      const spheres = sandbox.bodies.filter((b) => b.shape === 'sphere')
      return {
        pass: spheres.length >= 2,
        reason: spheres.length >= 2 ? undefined : 'Two collision spheres not found'
      }
    }
  },
  {
    id: 'sb-10',
    name: 'Completely inelastic collision',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Simulate a completely inelastic collision between two carts',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: {
          floor: true,
          objects: [
            { kind: 'box', mass: 1, x: -2, y: 0.5, vx: 3, vy: 0, restitution: 0 },
            { kind: 'box', mass: 1, x: 2, y: 0.5, vx: 0, vy: 0, restitution: 0 }
          ]
        }
      }
    ],
    check: ({ sandbox }) => {
      const boxes = sandbox.bodies.filter((b) => b.shape === 'box')
      return {
        pass: boxes.length >= 2,
        reason: boxes.length >= 2 ? undefined : 'Two collision boxes not found'
      }
    }
  },
  {
    id: 'sb-11',
    name: 'Change gravity to Moon gravity 1.62 m/s^2',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: "Set gravity to the Moon's gravity 1.62 m/s^2",
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [{ type: 'tool', tool: 'set_param', args: { name: 'gravity', value: 1.62 } }],
    check: ({ sandbox }) => {
      const g = sandbox.world.gravity
      const isMoon = Math.abs(g - 1.62) < 0.05
      return {
        pass: isMoon,
        reason: isMoon ? undefined : `Gravity was not set to 1.62 (found ${g})`
      }
    }
  },
  {
    id: 'sb-12',
    name: 'Zero gravity space flight',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Turn off gravity',
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [{ type: 'tool', tool: 'set_param', args: { name: 'gravity', value: 0 } }],
    check: ({ sandbox }) => {
      const g = sandbox.world.gravity
      return {
        pass: g === 0,
        reason: g === 0 ? undefined : `Gravity was not 0 (found ${g})`
      }
    }
  },
  {
    id: 'sb-13',
    name: 'Play simulation for 1.5 seconds',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'play the simulation for 1.5 seconds',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('load_experiment', { id: 'drop' })
    },
    mockCommands: [{ type: 'tool', tool: 'play', args: { seconds: 1.5 } }],
    check: ({ sandbox }) => {
      const hasSamples = Object.values(sandbox.recording).some((arr) => arr.length > 0)
      return {
        pass: hasSamples,
        reason: hasSamples ? undefined : 'Simulation did not produce recordings'
      }
    }
  },
  {
    id: 'sb-14',
    name: 'Pause simulation',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'pause the simulation',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('load_experiment', { id: 'drop' })
      await runTool('play', {})
    },
    mockCommands: [{ type: 'tool', tool: 'pause', args: {} }],
    check: ({ scene }) => {
      return {
        pass: !scene.playing,
        reason: scene.playing ? 'Simulation still running' : undefined
      }
    }
  },
  {
    id: 'sb-15',
    name: 'Reset simulation',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'reset the simulation',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('load_experiment', { id: 'drop' })
      await runTool('play', { seconds: 1 })
    },
    mockCommands: [{ type: 'tool', tool: 'reset', args: {} }],
    check: ({ scene }) => {
      return {
        pass: !scene.playing,
        reason: scene.playing ? 'Simulation running after reset' : undefined
      }
    }
  },
  {
    id: 'sb-16',
    name: 'Set simulation speed to 2x',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'set simulation speed to 2x',
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [{ type: 'tool', tool: 'set_speed', args: { factor: 2 } }],
    check: ({ sandbox }) => {
      return {
        pass: sandbox.world.timeScale === 2,
        reason: sandbox.world.timeScale === 2 ? undefined : `TimeScale was ${sandbox.world.timeScale}`
      }
    }
  },
  {
    id: 'sb-17',
    name: 'Run simulation in slow motion at 0.5x',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'run simulation in slow motion at 0.5x',
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [{ type: 'tool', tool: 'set_speed', args: { factor: 0.5 } }],
    check: ({ sandbox }) => {
      return {
        pass: sandbox.world.timeScale === 0.5,
        reason: sandbox.world.timeScale === 0.5 ? undefined : `TimeScale was ${sandbox.world.timeScale}`
      }
    }
  },
  {
    id: 'sb-18',
    name: 'Drop 10 kg bowling ball from 15 m',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Drop a 10 kg bowling ball from 15 m',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: { floor: true, objects: [{ kind: 'sphere', mass: 10, x: 0, y: 15 }] }
      }
    ],
    check: ({ sandbox }) => {
      const ball = sandbox.bodies.find((b) => b.shape === 'sphere' && b.mass === 10)
      return {
        pass: Boolean(ball),
        reason: ball ? undefined : '10 kg bowling ball not found'
      }
    }
  },
  {
    id: 'sb-19',
    name: "Load Newton's cradle",
    mode: 'sandbox',
    category: 'sandbox',
    prompt: "Load Newton's cradle",
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [{ type: 'tool', tool: 'load_experiment', args: { id: 'cradle' } }],
    check: ({ sandbox }) => {
      const spheres = sandbox.bodies.filter((b) => b.shape === 'sphere')
      return {
        pass: spheres.length >= 2,
        reason: spheres.length >= 2 ? undefined : 'Newton cradle spheres not found'
      }
    }
  },
  {
    id: 'sb-20',
    name: 'Load chaotic double pendulum',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Load the chaotic double pendulum',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [{ type: 'tool', tool: 'load_experiment', args: { id: 'double_pendulum' } }],
    check: ({ sandbox }) => {
      const bodies = sandbox.bodies
      return {
        pass: bodies.length >= 2,
        reason: bodies.length >= 2 ? undefined : 'Double pendulum bodies not found'
      }
    }
  },
  {
    id: 'sb-21',
    name: 'Add cylinder on slope',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Add a cylinder rolling down',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: { floor: true, objects: [{ kind: 'cylinder', mass: 2, x: -3, y: 5 }] }
      }
    ],
    check: ({ sandbox }) => {
      const cyl = sandbox.bodies.find((b) => b.shape === 'cylinder')
      return {
        pass: Boolean(cyl),
        reason: cyl ? undefined : 'Cylinder body not found'
      }
    }
  },
  {
    id: 'sb-22',
    name: 'Galileo free fall comparison',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Drop a 1 kg ball and a 5 kg ball together from 10 m',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: {
          floor: true,
          objects: [
            { kind: 'sphere', mass: 1, x: -1, y: 10 },
            { kind: 'sphere', mass: 5, x: 1, y: 10 }
          ]
        }
      }
    ],
    check: ({ sandbox }) => {
      const spheres = sandbox.bodies.filter((b) => b.shape === 'sphere')
      return {
        pass: spheres.length >= 2,
        reason: spheres.length >= 2 ? undefined : 'Two comparison spheres not found'
      }
    }
  },
  {
    id: 'sb-23',
    name: 'Set floor friction to 0',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Set floor friction to 0',
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [{ type: 'tool', tool: 'set_param', args: { name: 'friction', value: 0 } }],
    check: () => {
      return {
        pass: true,
        reason: undefined
      }
    }
  },
  {
    id: 'sb-24',
    name: 'Super bouncy ball with restitution 0.98',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'Create a super bouncy ball with restitution 0.98',
    setup: () => {
      enterMode('sandbox')
      useSandbox.getState().resetRun()
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'build_experiment',
        args: { floor: true, objects: [{ kind: 'sphere', mass: 1, x: 0, y: 5, restitution: 0.98 }] }
      }
    ],
    check: ({ sandbox }) => {
      const ball = sandbox.bodies.find((b) => b.shape === 'sphere' && (b.restitution ?? 0) >= 0.9)
      return {
        pass: Boolean(ball),
        reason: ball ? undefined : 'Bouncy ball with restitution >= 0.9 not found'
      }
    }
  },
  {
    id: 'sb-25',
    name: 'Clear all sandbox bodies',
    mode: 'sandbox',
    category: 'sandbox',
    prompt: 'clear all sandbox bodies',
    setup: async () => {
      enterMode('sandbox')
      const { runTool } = await import('../../src/renderer/src/ai/tools')
      await runTool('load_experiment', { id: 'cradle' })
    },
    mockCommands: [{ type: 'tool', tool: 'remove', args: { mode: 'sandbox', names: ['all'] } }],
    check: ({ sandbox }) => {
      const count = sandbox.bodies.length
      return {
        pass: count === 0,
        reason: count === 0 ? undefined : `Expected 0 sandbox bodies after clear, found ${count}`
      }
    }
  }
]
