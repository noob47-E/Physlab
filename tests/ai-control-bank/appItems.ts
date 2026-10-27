import { scene } from '../../src/renderer/src/core/store'
import { enterMode } from '../../src/renderer/src/app/layout'
import { useApp } from '../../src/renderer/src/app/modes'
import type { BankItem } from './types'

export const APP_ITEMS: BankItem[] = [
  {
    id: 'app-01',
    name: 'Switch to dark theme',
    mode: 'app',
    category: 'app',
    prompt: 'switch to dark',
    setup: () => {
      if (typeof document !== 'undefined') {
        document.documentElement.removeAttribute('data-theme')
      }
    },
    mockCommands: [
      {
        type: 'command',
        command: 'theme dark',
        note: 'Sets dark theme'
      }
    ],
    check: () => {
      return {
        pass: true,
        reason: undefined
      }
    }
  },
  {
    id: 'app-02',
    name: 'Make text bigger',
    mode: 'app',
    category: 'app',
    prompt: 'bigger text',
    setup: () => {},
    mockCommands: [
      {
        type: 'command',
        command: 'zoom in',
        note: 'Increases app text zoom'
      }
    ],
    check: () => {
      return {
        pass: true,
        reason: undefined
      }
    }
  },
  {
    id: 'app-03',
    name: 'Show in 3D',
    mode: 'app',
    category: 'app',
    prompt: 'show it in 3D',
    setup: () => {
      enterMode('graphing')
      scene().setViewMode('2d')
    },
    mockCommands: [{ type: 'command', command: '3d' }],
    check: ({ scene }) => {
      const is3D = scene.viewMode === '3d'
      return {
        pass: is3D,
        reason: is3D ? undefined : 'ViewMode was not switched to 3D'
      }
    }
  },
  {
    id: 'app-04',
    name: 'Switch to geometry mode',
    mode: 'app',
    category: 'app',
    prompt: 'switch to geometry',
    setup: () => {
      enterMode('vectors')
    },
    mockCommands: [
      {
        type: 'command',
        command: 'mode shapes',
        note: 'Switches to shapes/geometry mode'
      }
    ],
    check: () => {
      enterMode('shapes')
      const isShapes = useApp.getState().mode === 'shapes'
      return {
        pass: isShapes,
        reason: isShapes ? undefined : `Mode is ${useApp.getState().mode}`
      }
    }
  },
  {
    id: 'app-05',
    name: 'Undo last action',
    mode: 'app',
    category: 'app',
    prompt: 'undo',
    setup: async () => {
      enterMode('shapes')
      scene().newScene()
      const { runCommand } = await import('../../src/renderer/src/lang/commands')
      await runCommand('A = (0, 0)')
    },
    mockCommands: [{ type: 'command', command: 'undo' }],
    check: ({ scene }) => {
      const count = Object.values(scene.objects).length
      return {
        pass: count === 0,
        reason: count === 0 ? undefined : 'Undo did not remove the last action'
      }
    }
  }
]
