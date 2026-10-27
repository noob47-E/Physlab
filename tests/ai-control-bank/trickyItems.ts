import { scene } from '../../src/renderer/src/core/store'
import { enterMode } from '../../src/renderer/src/app/layout'
import type { BankItem } from './types'

export const TRICKY_ITEMS: BankItem[] = [
  {
    id: 'tricky-01',
    name: 'Undo that (multi-step context)',
    mode: 'shapes',
    category: 'tricky',
    prompt: 'undo that',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('c = Circle((0, 0), 4)')
    },
    mockCommands: [{ type: 'command', command: 'undo' }],
    check: ({ scene, falseClaimsCount }) => {
      const circle = Object.values(scene.objects).find((o) => o.type === 'circle')
      const noFalseClaims = (falseClaimsCount ?? 0) === 0
      return {
        pass: !circle && noFalseClaims,
        reason: circle ? 'Circle still present after undo that' : !noFalseClaims ? 'False claims detected' : undefined
      }
    }
  },
  {
    id: 'tricky-02',
    name: 'Vague request: make it better',
    mode: 'tricky',
    category: 'tricky',
    prompt: 'make it better',
    setup: () => {},
    mockCommands: [{ type: 'clarify', note: 'Asks what aspect to refine' }],
    expectedRefusalOrClarify: true,
    check: ({ clarified, falseClaimsCount }) => {
      const passed = Boolean(clarified) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected clarifying question for vague request'
      }
    }
  },
  {
    id: 'tricky-03',
    name: 'Impossible triangle sides 1, 2, 10 (triangle inequality violation)',
    mode: 'shapes',
    category: 'tricky',
    prompt: 'Construct a triangle with sides 1, 2, and 10',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: triangle inequality violated because 1 + 2 < 10'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount, scene: sc }) => {
      const poly = Object.values(sc.objects).find((o) => o.type === 'polygon')
      const passed = Boolean(refused) && !poly && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Impossible triangle was not refused honestly or polygon was created'
      }
    }
  },
  {
    id: 'tricky-04',
    name: 'Remove non-existent object Z',
    mode: 'shapes',
    category: 'tricky',
    prompt: 'remove the circle Z',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: no object named Z exists in the scene'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount }) => {
      const passed = Boolean(refused) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected honest refusal for non-existent object'
      }
    }
  },
  {
    id: 'tricky-05',
    name: 'Vague request: draw a shape',
    mode: 'tricky',
    category: 'tricky',
    prompt: 'draw a shape',
    setup: () => {},
    mockCommands: [
      {
        type: 'clarify',
        note: 'Asks whether user wants a triangle, circle, or polygon'
      }
    ],
    expectedRefusalOrClarify: true,
    check: ({ clarified, falseClaimsCount }) => {
      const passed = Boolean(clarified) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected clarifying prompt for ambiguous shape request'
      }
    }
  },
  {
    id: 'tricky-06',
    name: 'Impossible equation: Solve 1/x = 0',
    mode: 'tricky',
    category: 'tricky',
    prompt: 'Solve 1/x = 0',
    setup: () => {},
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: 1/x = 0 has no solution in real or complex numbers'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount }) => {
      const passed = Boolean(refused) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected honest refusal for unsolvable equation 1/x = 0'
      }
    }
  },
  {
    id: 'tricky-07',
    name: 'Superluminal speed in sandbox: 400,000,000 m/s',
    mode: 'sandbox',
    category: 'tricky',
    prompt: 'Set the crate speed to 400,000,000 m/s',
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: speed exceeds the speed of light c'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount }) => {
      const passed = Boolean(refused) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected refusal for superluminal speed'
      }
    }
  },
  {
    id: 'tricky-08',
    name: 'Negative mass body: -5 kg',
    mode: 'sandbox',
    category: 'tricky',
    prompt: 'Create a ball with mass -5 kg',
    setup: () => {
      enterMode('sandbox')
    },
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: mass must be strictly positive'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount, sandbox }) => {
      const hasNegativeMass = sandbox.bodies.some((b) => b.mass < 0)
      const passed = Boolean(refused) && !hasNegativeMass && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected refusal for negative mass'
      }
    }
  },
  {
    id: 'tricky-09',
    name: 'Inconsistent system: x + y = 1 and x + y = 2',
    mode: 'tricky',
    category: 'tricky',
    prompt: 'Solve x + y = 1 and x + y = 2',
    setup: () => {},
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: inconsistent system with parallel lines'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount }) => {
      const passed = Boolean(refused) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected honest refusal for inconsistent system'
      }
    }
  },
  {
    id: 'tricky-10',
    name: 'Geometric contradiction: square with 5 vertices',
    mode: 'shapes',
    category: 'tricky',
    prompt: 'Construct a square with 5 vertices',
    setup: () => {
      enterMode('shapes')
      scene().newScene()
    },
    mockCommands: [
      {
        type: 'refuse',
        note: 'Refused honestly: a square has exactly 4 vertices'
      }
    ],
    isTrickyOrImpossible: true,
    expectedRefusalOrClarify: true,
    check: ({ refused, falseClaimsCount }) => {
      const passed = Boolean(refused) && (falseClaimsCount ?? 0) === 0
      return {
        pass: passed,
        reason: passed ? undefined : 'Expected honest refusal for 5-vertex square contradiction'
      }
    }
  }
]
