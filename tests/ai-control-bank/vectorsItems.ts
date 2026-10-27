import { scene } from '../../src/renderer/src/core/store'
import { enterMode } from '../../src/renderer/src/app/layout'
import type { BankItem } from './types'

export const VECTORS_ITEMS: BankItem[] = [
  {
    id: 'vec-01',
    name: 'Create a 2D vector u = <3, 4>',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Create a 2D vector u = <3, 4>',
    setup: () => {
      enterMode('vectors')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'u = <3, 4>' }],
    check: ({ scene }) => {
      const uObj = Object.values(scene.objects).find((o) => o.name === 'u' || o.type === 'vector')
      return {
        pass: Boolean(uObj),
        reason: uObj ? undefined : 'Vector u not found'
      }
    }
  },
  {
    id: 'vec-02',
    name: 'Add vectors u and v to get resultant R',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Add vectors u and v to get resultant R',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('u = <2, 1>')
      await runCommand('v = <1, 3>')
    },
    mockCommands: [{ type: 'command', command: 'R = u + v' }],
    check: ({ scene }) => {
      const rObj = Object.values(scene.objects).find((o) => o.name === 'R')
      return {
        pass: Boolean(rObj),
        reason: rObj ? undefined : 'Resultant vector R not created'
      }
    }
  },
  {
    id: 'vec-03',
    name: 'Resolve a 50 N force at 30°',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Resolve a 50 N force at 30° into horizontal and vertical components',
    setup: () => {
      enterMode('vectors')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'F = <43.301, 25>' },
      { type: 'command', command: 'Fx = <43.301, 0>' },
      { type: 'command', command: 'Fy = <0, 25>' }
    ],
    check: ({ scene }) => {
      const vectors = Object.values(scene.objects).filter((o) => o.type === 'vector')
      return {
        pass: vectors.length >= 1,
        reason: vectors.length >= 1 ? undefined : 'Resolved force vectors not created'
      }
    }
  },
  {
    id: 'vec-04',
    name: 'Create 3D vector v = <1, 2, 3>',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Create 3D vector v = <1, 2, 3>',
    setup: () => {
      enterMode('vectors')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'v = <1, 2, 3>' }],
    check: ({ scene }) => {
      const vObj = Object.values(scene.objects).find((o) => o.name === 'v')
      return {
        pass: Boolean(vObj),
        reason: vObj ? undefined : '3D vector v not created'
      }
    }
  },
  {
    id: 'vec-05',
    name: 'Calculate dot product of u and v',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Calculate dot product of u = <2, 3> and v = <4, -1>',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('u = <2, 3>')
      await runCommand('v = <4, -1>')
    },
    mockCommands: [{ type: 'tool', tool: 'solve', args: { expression: 'dot([2, 3], [4, -1])' } }],
    check: ({ calc, toolResults }) => {
      const res = toolResults?.find((r) => r.answer !== undefined)
      const ans = String(res?.answer ?? calc.ans)
      const passed = ans.includes('5') || calc.history.length > 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Dot product not calculated'
      }
    }
  },
  {
    id: 'vec-06',
    name: 'Find cross product of a and b',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Find cross product of a = <1, 0, 0> and b = <0, 1, 0>',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('a = <1, 0, 0>')
      await runCommand('b = <0, 1, 0>')
    },
    mockCommands: [{ type: 'command', command: 'c = <0, 0, 1>' }],
    check: ({ scene }) => {
      const cObj = Object.values(scene.objects).find((o) => o.name === 'c')
      return {
        pass: Boolean(cObj),
        reason: cObj ? undefined : 'Cross product vector c not created'
      }
    }
  },
  {
    id: 'vec-07',
    name: 'Find unit vector of u = <3, 4>',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Find the unit vector in direction of u',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('u = <3, 4>')
    },
    mockCommands: [{ type: 'command', command: 'u_hat = <0.6, 0.8>' }],
    check: ({ scene }) => {
      const uHat = Object.values(scene.objects).find((o) => o.name === 'u_hat')
      return {
        pass: Boolean(uHat),
        reason: uHat ? undefined : 'Unit vector u_hat not created'
      }
    }
  },
  {
    id: 'vec-08',
    name: 'Subtract vector B from A',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Subtract vector B from A',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = <5, 5>')
      await runCommand('B = <2, 1>')
    },
    mockCommands: [{ type: 'command', command: 'D = A - B' }],
    check: ({ scene }) => {
      const dObj = Object.values(scene.objects).find((o) => o.name === 'D')
      return {
        pass: Boolean(dObj),
        reason: dObj ? undefined : 'Vector difference D not created'
      }
    }
  },
  {
    id: 'vec-09',
    name: 'Multiply vector v by scalar 3',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Multiply vector v by scalar 3',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('v = <2, -1>')
    },
    mockCommands: [{ type: 'command', command: 'w = <6, -3>' }],
    check: ({ scene }) => {
      const wObj = Object.values(scene.objects).find((o) => o.name === 'w')
      return {
        pass: Boolean(wObj),
        reason: wObj ? undefined : 'Scaled vector w not created'
      }
    }
  },
  {
    id: 'vec-10',
    name: 'Find angle between vectors',
    mode: 'vectors',
    category: 'vectors',
    prompt: 'Find the angle between u = <1, 0> and v = <0, 1>',
    setup: async () => {
      enterMode('vectors')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('u = <1, 0>')
      await runCommand('v = <0, 1>')
    },
    mockCommands: [{ type: 'tool', tool: 'solve', args: { expression: '90' } }],
    check: ({ calc, toolResults }) => {
      const res = toolResults?.find((r) => r.answer !== undefined)
      const passed = Boolean(res || calc.history.length > 0)
      return {
        pass: passed,
        reason: passed ? undefined : 'Angle calculation not completed'
      }
    }
  }
]
