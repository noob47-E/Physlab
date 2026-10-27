import { scene } from '../../src/renderer/src/core/store'
import { enterMode } from '../../src/renderer/src/app/layout'
import type { BankItem } from './types'

export const GRAPHING_ITEMS: BankItem[] = [
  {
    id: 'graph-01',
    name: 'Plot y = x^2 - 4 and find its roots',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = x^2 - 4 and find its roots',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = x^2 - 4' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Graph y = x^2 - 4 not found'
      }
    }
  },
  {
    id: 'graph-02',
    name: 'Draw tangent line at x = 2',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Draw the tangent line to y = x^2 at x = 2',
    setup: async () => {
      enterMode('graphing')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('y = x^2')
    },
    mockCommands: [{ type: 'command', command: 'y = 4x - 4' }],
    check: ({ scene }) => {
      const graphs = Object.values(scene.objects).filter((o) => o.type === 'graph')
      return {
        pass: graphs.length >= 2,
        reason: graphs.length >= 2 ? undefined : 'Tangent line curve was not added'
      }
    }
  },
  {
    id: 'graph-03',
    name: 'Find area between curves y = x^2 and y = 4',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Find the area between y = x^2 and y = 4',
    setup: async () => {
      enterMode('graphing')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('y = x^2')
      await runCommand('y = 4')
    },
    mockCommands: [{ type: 'tool', tool: 'solve', args: { expression: 'integrate(4 - x^2, x, -2, 2)' } }],
    check: ({ calc, toolResults }) => {
      const toolRes = toolResults?.find((r) => r.answer || r.result)
      const hasAnswer = Boolean(toolRes?.answer || calc.history.length > 0)
      return {
        pass: hasAnswer,
        reason: hasAnswer ? undefined : 'Area between curves not calculated'
      }
    }
  },
  {
    id: 'graph-04',
    name: 'Clear the graph',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'clear the graph',
    setup: async () => {
      enterMode('graphing')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('y = sin(x)')
      await runCommand('y = cos(x)')
    },
    mockCommands: [{ type: 'command', command: 'clear' }],
    check: ({ scene }) => {
      const graphs = Object.values(scene.objects).filter((o) => o.type === 'graph')
      return {
        pass: graphs.length === 0,
        reason: graphs.length === 0 ? undefined : 'Graph curves still exist after clear'
      }
    }
  },
  {
    id: 'graph-05',
    name: 'Add a slider a',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'add a slider a',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'a = 5' }],
    check: ({ scene }) => {
      const aObj = Object.values(scene.objects).find((o) => o.name === 'a')
      return {
        pass: Boolean(aObj),
        reason: aObj ? undefined : 'Slider a was not created'
      }
    }
  },
  {
    id: 'graph-06',
    name: 'Plot parabola with vertex at (2, 3)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot a parabola with vertex at (2, 3)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = (x - 2)^2 + 3' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Parabola not plotted'
      }
    }
  },
  {
    id: 'graph-07',
    name: 'Plot y = sin(x) and y = cos(x)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = sin(x) and y = cos(x)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [
      { type: 'command', command: 'y = sin(x)' },
      { type: 'command', command: 'y = cos(x)' }
    ],
    check: ({ scene }) => {
      const graphs = Object.values(scene.objects).filter((o) => o.type === 'graph')
      return {
        pass: graphs.length >= 2,
        reason: graphs.length >= 2 ? undefined : 'Both sine and cosine curves not found'
      }
    }
  },
  {
    id: 'graph-08',
    name: 'Plot y = sqrt(4 - x^2)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = sqrt(4 - x^2)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = sqrt(4 - x^2)' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Semicircle curve not plotted'
      }
    }
  },
  {
    id: 'graph-09',
    name: 'Plot cubic function y = x^3 - 3x',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = x^3 - 3x',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = x^3 - 3x' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Cubic curve not plotted'
      }
    }
  },
  {
    id: 'graph-10',
    name: 'Plot the derivative of y = x^3',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot the derivative of y = x^3',
    setup: async () => {
      enterMode('graphing')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('y = x^3')
    },
    mockCommands: [{ type: 'command', command: 'y = 3x^2' }],
    check: ({ scene }) => {
      const graphs = Object.values(scene.objects).filter((o) => o.type === 'graph')
      return {
        pass: graphs.length >= 2,
        reason: graphs.length >= 2 ? undefined : 'Derivative curve not plotted'
      }
    }
  },
  {
    id: 'graph-11',
    name: 'Plot exponential growth y = e^x',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = e^x',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = e^x' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Exponential curve not plotted'
      }
    }
  },
  {
    id: 'graph-12',
    name: 'Plot natural logarithm y = ln(x)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = ln(x)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = ln(x)' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Logarithmic curve not plotted'
      }
    }
  },
  {
    id: 'graph-13',
    name: 'Plot rational function y = 1/(x - 1)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = 1/(x - 1)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = 1/(x - 1)' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Rational function curve not plotted'
      }
    }
  },
  {
    id: 'graph-14',
    name: 'Plot 3D saddle surface z = x^2 - y^2',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot 3D saddle surface z = x^2 - y^2',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'tool', tool: 'plot', args: { expression: 'z = x^2 - y^2', dim: '3d' } }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: scene.viewMode === '3d' && Boolean(graph),
        reason: scene.viewMode === '3d' ? undefined : '3D mode not activated for saddle surface'
      }
    }
  },
  {
    id: 'graph-15',
    name: 'Plot 3D ripple surface z = sin(sqrt(x^2 + y^2))',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot 3D ripple z = sin(sqrt(x^2 + y^2))',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'tool', tool: 'plot', args: { expression: 'z = sin(sqrt(x^2 + y^2))', dim: '3d' } }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: scene.viewMode === '3d' && Boolean(graph),
        reason: scene.viewMode === '3d' ? undefined : '3D ripple surface not plotted'
      }
    }
  },
  {
    id: 'graph-16',
    name: 'Plot circle equation x^2 + y^2 = 25',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot x^2 + y^2 = 25',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'x^2 + y^2 = 25' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Implicit circle curve not plotted'
      }
    }
  },
  {
    id: 'graph-17',
    name: 'Plot absolute value function y = abs(x - 3)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = abs(x - 3)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = abs(x - 3)' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Absolute value function curve not plotted'
      }
    }
  },
  {
    id: 'graph-18',
    name: 'Plot y = sin(3x)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = sin(3x)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = sin(3x)' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Sine harmonic curve not plotted'
      }
    }
  },
  {
    id: 'graph-19',
    name: 'Plot bell curve y = e^(-x^2)',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot bell curve y = e^(-x^2)',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = e^(-x^2)' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Gaussian bell curve not plotted'
      }
    }
  },
  {
    id: 'graph-20',
    name: 'Plot quadratic y = -2x^2 + 8x - 3',
    mode: 'graphing',
    category: 'graphing',
    prompt: 'Plot y = -2x^2 + 8x - 3 and find vertex',
    setup: () => {
      enterMode('graphing')
      scene().newScene()
    },
    mockCommands: [{ type: 'command', command: 'y = -2x^2 + 8x - 3' }],
    check: ({ scene }) => {
      const graph = Object.values(scene.objects).find((o) => o.type === 'graph')
      return {
        pass: Boolean(graph),
        reason: graph ? undefined : 'Quadratic curve not plotted'
      }
    }
  }
]
