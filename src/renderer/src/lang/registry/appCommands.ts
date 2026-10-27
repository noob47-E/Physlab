// App Level Commands: mode, view, camera, theme, zoom, grid, axes, snap, unit, precision, angles, undo, redo, clear
import { scene } from '../../core/store'
import { enterMode } from '../../app/layout'
import { normalizeModeId } from '../../app/modes'
import { useTheme, type Theme } from '../../app/theme'
import { fitCamera, resetCamera } from '../../render/viewState'
import { normaliseGridStyle } from '../../render/gridMath'
import type { LengthUnit } from '../../core/types'
import type { CommandEntry, RegistryResult } from './types'

export const appCommands: CommandEntry[] = [
  {
    name: 'mode',
    modes: 'all',
    args: [
      { name: 'targetMode', type: 'string', required: true, description: 'calculator, graphing, shapes/geometry, vectors, sandbox, lab, problems' }
    ],
    summary: 'Switch the active PhysLab mode',
    examples: ['mode graphing', 'mode geometry', 'mode sandbox', 'mode calc', 'mode lab', 'mode vectors'],
    parse: (raw) => {
      const m = raw.match(/^mode\s+(\S+)$/i)
      return m ? { targetMode: m[1] } : null
    },
    run: (args): RegistryResult => {
      const target = String(args.targetMode ?? '').trim()
      const norm = normalizeModeId(target)
      enterMode(norm)
      return { ok: true, created: [], removed: [], changed: [], message: `Switched to ${norm} mode.` }
    }
  },
  {
    name: 'view',
    aliases: ['2d', '3d'],
    modes: 'all',
    args: [
      { name: 'mode', type: 'string', required: true, description: '2d or 3d' }
    ],
    summary: 'Switch viewport view between 2D and 3D',
    examples: ['view 2d', 'view 3d', '2d', '3d'],
    parse: (raw) => {
      const lower = raw.trim().toLowerCase()
      if (lower === '2d' || lower === '3d') return { mode: lower }
      const m = raw.match(/^view\s+(2d|3d)$/i)
      return m ? { mode: m[1].toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const v = args.mode === '3d' ? '3d' : '2d'
      s.setViewMode(v)
      return { ok: true, created: [], removed: [], changed: [], message: `View set to ${v}.` }
    }
  },
  {
    name: 'camera',
    aliases: ['fit', 'home'],
    modes: 'all',
    args: [
      { name: 'action', type: 'string', required: true, description: 'fit or reset' }
    ],
    summary: 'Fit all objects in view or reset the camera',
    examples: ['camera fit', 'camera reset', 'fit', 'home'],
    parse: (raw) => {
      const lower = raw.trim().toLowerCase()
      if (lower === 'fit') return { action: 'fit' }
      if (lower === 'home') return { action: 'reset' }
      const m = raw.match(/^camera\s+(fit|reset)$/i)
      return m ? { action: m[1].toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      if (args.action === 'fit') {
        fitCamera()
        return { ok: true, created: [], removed: [], changed: [], message: 'Fitted scene in camera view.' }
      }
      resetCamera()
      return { ok: true, created: [], removed: [], changed: [], message: 'Reset camera view.' }
    }
  },
  {
    name: 'theme',
    modes: 'all',
    args: [
      { name: 'themeId', type: 'string', required: true, description: 'dark, light, moonlight, gold' }
    ],
    summary: 'Switch color theme',
    examples: ['theme dark', 'theme light', 'theme moonlight', 'theme gold'],
    parse: (raw) => {
      const m = raw.match(/^theme\s+(\S+)$/i)
      return m ? { themeId: m[1].toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      const rawId = String(args.themeId ?? '').toLowerCase()
      let themeId: Theme = 'dark'
      if (rawId === 'light') themeId = 'light'
      else if (rawId === 'moonlight') themeId = 'moonlight'
      else if (rawId === 'gold' || rawId === 'moongold' || rawId === 'moonlight-gold') themeId = 'moongold'
      else themeId = 'dark'

      useTheme.getState().set(themeId)
      return { ok: true, created: [], removed: [], changed: [], message: `Theme set to ${themeId}.` }
    }
  },
  {
    name: 'grid',
    modes: 'all',
    args: [
      { name: 'style', type: 'string', required: true, description: 'cartesian, polar, isometric, dot, on, off' }
    ],
    summary: 'Set grid style or toggle grid visibility',
    examples: ['grid cartesian', 'grid polar', 'grid on', 'grid off'],
    parse: (raw) => {
      const m = raw.match(/^grid\s+(\S+)$/i)
      return m ? { style: m[1].toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const style = String(args.style ?? '').toLowerCase()
      if (style === 'off' || style === 'hide' || style === 'false') {
        s.setSettings({ showGrid: false })
        return { ok: true, created: [], removed: [], changed: [], message: 'Grid turned off.' }
      }
      if (style === 'on' || style === 'show' || style === 'true') {
        s.setSettings({ showGrid: true })
        return { ok: true, created: [], removed: [], changed: [], message: 'Grid turned on.' }
      }
      const gridId = normaliseGridStyle(style)
      s.setSettings({ showGrid: true, gridStyle: gridId })
      return { ok: true, created: [], removed: [], changed: [], message: `Grid set to ${gridId}.` }
    }
  },
  {
    name: 'axes',
    modes: 'all',
    args: [
      { name: 'show', type: 'boolean', required: true, description: 'on/off or show/hide' }
    ],
    summary: 'Show or hide coordinate axes',
    examples: ['axes on', 'axes off', 'axes show', 'axes hide'],
    parse: (raw) => {
      const m = raw.match(/^axes\s+(on|off|show|hide|true|false)$/i)
      if (m) {
        const val = m[1].toLowerCase()
        return { show: val === 'on' || val === 'show' || val === 'true' }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const show = !!args.show
      s.setSettings({ showAxes: show })
      return { ok: true, created: [], removed: [], changed: [], message: `Axes ${show ? 'shown' : 'hidden'}.` }
    }
  },
  {
    name: 'snap',
    modes: 'all',
    args: [
      { name: 'enabled', type: 'boolean', required: true, description: 'on or off' }
    ],
    summary: 'Enable or disable grid and point snapping',
    examples: ['snap on', 'snap off'],
    parse: (raw) => {
      const m = raw.match(/^snap\s+(on|off|true|false)$/i)
      if (m) {
        const val = m[1].toLowerCase()
        return { enabled: val === 'on' || val === 'true' }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const snap = !!args.enabled
      s.setSettings({ snap })
      return { ok: true, created: [], removed: [], changed: [], message: `Snapping ${snap ? 'enabled' : 'disabled'}.` }
    }
  },
  {
    name: 'units',
    aliases: ['unit'],
    modes: 'all',
    args: [
      { name: 'unit', type: 'string', required: true, description: 'unit, mm, cm, m, km, in, ft' }
    ],
    summary: 'Set measurement unit and scale',
    examples: ['unit cm', 'units m', 'unit mm'],
    parse: (raw) => {
      const m = raw.match(/^(?:units?)\s+(unit|mm|cm|m|km|in|ft)$/i)
      return m ? { unit: m[1].toLowerCase() as LengthUnit } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const u = (args.unit || 'unit') as LengthUnit
      s.setSettings({ unit: u })
      return { ok: true, created: [], removed: [], changed: [], message: `Measurement unit set to ${u}.` }
    }
  },
  {
    name: 'precision',
    modes: 'all',
    args: [
      { name: 'decimals', type: 'number', required: true, description: 'Number of decimal places or sig figs' },
      { name: 'mode', type: 'string', required: false, description: 'dp or sf' }
    ],
    summary: 'Set display numerical precision',
    examples: ['precision 3 sf', 'precision 2 dp', 'precision 4'],
    parse: (raw) => {
      const m = raw.match(/^precision\s+(\d+)(?:\s+(dp|sf))?$/i)
      return m ? { decimals: parseInt(m[1], 10), mode: m[2]?.toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const dec = Math.max(0, Math.min(12, Number(args.decimals ?? 2)))
      const pMode = args.mode === 'sf' ? 'sf' : 'dp'
      s.setSettings({ decimals: dec, precisionMode: pMode })
      return { ok: true, created: [], removed: [], changed: [], message: `Precision set to ${dec} ${pMode}.` }
    }
  },
  {
    name: 'angles',
    modes: 'all',
    args: [
      { name: 'unit', type: 'string', required: true, description: 'deg or rad' }
    ],
    summary: 'Set angle measurement unit (degrees or radians)',
    examples: ['angles deg', 'angles rad'],
    parse: (raw) => {
      const m = raw.match(/^angles?\s+(deg|rad|degrees?|radians?)$/i)
      if (m) {
        const u = m[1].toLowerCase().startsWith('rad') ? 'rad' : 'deg'
        return { unit: u }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const u = args.unit === 'rad' ? 'rad' : 'deg'
      s.setSettings({ angleUnit: u })
      return { ok: true, created: [], removed: [], changed: [], message: `Angle unit set to ${u === 'deg' ? 'degrees' : 'radians'}.` }
    }
  },
  {
    name: 'clear',
    aliases: ['new'],
    modes: 'all',
    args: [],
    summary: 'Clear all objects in the scene',
    examples: ['clear', 'new'],
    parse: (raw) => (raw.trim().toLowerCase() === 'clear' || raw.trim().toLowerCase() === 'new' ? {} : null),
    run: (): RegistryResult => {
      const s = scene()
      const removed = [...s.order]
      s.newScene()
      s.pushLog({ input: 'clear', kind: 'info', text: 'Scene cleared.' })
      return { ok: true, created: [], removed, changed: [], message: 'Scene cleared.' }
    }
  },
  {
    name: 'undo',
    modes: 'all',
    args: [],
    summary: 'Undo the last action',
    examples: ['undo'],
    parse: (raw) => (raw.trim().toLowerCase() === 'undo' ? {} : null),
    run: (): RegistryResult => {
      const s = scene()
      const idsBefore = new Set(s.order)
      s.undo()
      const sAfter = scene()
      const idsAfter = new Set(sAfter.order)
      const created = sAfter.order.filter((id) => !idsBefore.has(id))
      const removed = [...idsBefore].filter((id) => !idsAfter.has(id))
      return { ok: true, created, removed, changed: [], message: 'Undone.' }
    }
  },
  {
    name: 'redo',
    modes: 'all',
    args: [],
    summary: 'Redo the last undone action',
    examples: ['redo'],
    parse: (raw) => (raw.trim().toLowerCase() === 'redo' ? {} : null),
    run: (): RegistryResult => {
      const s = scene()
      const idsBefore = new Set(s.order)
      s.redo()
      const sAfter = scene()
      const idsAfter = new Set(sAfter.order)
      const created = sAfter.order.filter((id) => !idsBefore.has(id))
      const removed = [...idsBefore].filter((id) => !idsAfter.has(id))
      return { ok: true, created, removed, changed: [], message: 'Redone.' }
    }
  }
]
