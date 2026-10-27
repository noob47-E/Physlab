// Scene Commands: delete, rename, hide, show, move, set, color, lock
import { scene } from '../../core/store'
import { isValidName } from '../../core/naming'
import { useSandbox } from '../../sim/store'
import type { ObjId } from '../../core/types'
import type { CommandEntry, RegistryResult } from './types'

export const sceneCommands: CommandEntry[] = [
  {
    name: 'delete',
    aliases: ['del', 'remove'],
    modes: 'all',
    args: [
      { name: 'targets', type: 'string', required: true, description: 'Names or IDs of objects to delete' }
    ],
    summary: 'Delete one or more objects by name',
    examples: ['delete A', 'delete A, B, C', 'del c1'],
    parse: (raw) => {
      const m = raw.match(/^(?:delete|del|remove)\s+(.+)$/i)
      return m ? { targets: m[1].trim() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const rawTargets = String(args.targets ?? args.rawArgs ?? '')
      const names = rawTargets.split(/[,\s]+/).filter(Boolean)
      if (!names.length) return { ok: false, created: [], removed: [], changed: [], message: 'Specify at least one object to delete.' }

      const removed: ObjId[] = []
      const sceneIds: ObjId[] = []

      // Check scene objects
      for (const n of names) {
        const id = s.ev.names.get(n) ?? (s.objects[n] ? n : undefined)
        if (id) sceneIds.push(id)
      }
      if (sceneIds.length) {
        s.removeObjects(sceneIds)
        removed.push(...sceneIds)
      }

      // Check sandbox bodies
      const sb = useSandbox.getState()
      for (const n of names) {
        const body = sb.bodies.find((b) => b.name === n || b.id === n)
        if (body) {
          sb.removeBody(body.id)
          removed.push(body.id)
        }
      }

      if (!removed.length) {
        return { ok: false, created: [], removed: [], changed: [], message: `Nothing found with name ${rawTargets}.` }
      }
      return { ok: true, created: [], removed, changed: [], message: `Deleted ${names.join(', ')}.` }
    }
  },
  {
    name: 'rename',
    aliases: ['rn'],
    modes: 'all',
    args: [
      { name: 'oldName', type: 'string', required: true, description: 'Current object name' },
      { name: 'newName', type: 'string', required: true, description: 'New object name' }
    ],
    summary: 'Rename an object',
    examples: ['rename A B', 'rename c1 circle1', 'rename oldName to newName'],
    parse: (raw) => {
      const m = raw.match(/^rename\s+(\S+)(?:\s+to)?\s+(\S+)$/i)
      return m ? { oldName: m[1], newName: m[2] } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const oldName = String(args.oldName ?? '').trim()
      const newName = String(args.newName ?? '').trim()
      if (!oldName || !newName) {
        return { ok: false, created: [], removed: [], changed: [], message: 'Usage: rename <oldName> <newName>' }
      }
      if (!isValidName(newName)) {
        return { ok: false, created: [], removed: [], changed: [], message: `"${newName}" is an invalid or reserved name.` }
      }

      // Scene object rename
      const id = s.ev.names.get(oldName) ?? (s.objects[oldName] ? oldName : undefined)
      if (id) {
        if (s.ev.names.has(newName) && s.ev.names.get(newName) !== id) {
          return { ok: false, created: [], removed: [], changed: [], message: `Name "${newName}" is already taken.` }
        }
        s.renameObject(id, newName)
        return { ok: true, created: [], removed: [], changed: [id], message: `Renamed ${oldName} to ${newName}.` }
      }

      // Sandbox body rename
      const sb = useSandbox.getState()
      const body = sb.bodies.find((b) => b.name === oldName || b.id === oldName)
      if (body) {
        sb.updateBody(body.id, { name: newName })
        return { ok: true, created: [], removed: [], changed: [body.id], message: `Renamed body ${oldName} to ${newName}.` }
      }

      return { ok: false, created: [], removed: [], changed: [], message: `Object "${oldName}" not found.` }
    }
  },
  {
    name: 'hide',
    modes: 'all',
    args: [
      { name: 'targets', type: 'string', required: true, description: 'Names of objects to hide' }
    ],
    summary: 'Hide object(s) from viewport',
    examples: ['hide A', 'hide A, B', 'hide curve1'],
    parse: (raw) => {
      const m = raw.match(/^hide\s+(.+)$/i)
      return m ? { targets: m[1].trim() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const names = String(args.targets ?? args.rawArgs ?? '').split(/[,\s]+/).filter(Boolean)
      const changed: ObjId[] = []
      for (const n of names) {
        const id = s.ev.names.get(n) ?? (s.objects[n] ? n : undefined)
        if (id) {
          s.updateObject(id, (d) => { d.visible = false })
          changed.push(id)
        }
      }
      if (!changed.length) {
        return { ok: false, created: [], removed: [], changed: [], message: `No objects found to hide.` }
      }
      return { ok: true, created: [], removed: [], changed, message: `Hidden ${names.join(', ')}.` }
    }
  },
  {
    name: 'show',
    modes: 'all',
    args: [
      { name: 'targets', type: 'string', required: true, description: 'Names of objects to show' }
    ],
    summary: 'Show hidden object(s) in viewport',
    examples: ['show A', 'show A, B', 'show curve1'],
    parse: (raw) => {
      const m = raw.match(/^show\s+(.+)$/i)
      return m ? { targets: m[1].trim() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const names = String(args.targets ?? args.rawArgs ?? '').split(/[,\s]+/).filter(Boolean)
      const changed: ObjId[] = []
      for (const n of names) {
        const id = s.ev.names.get(n) ?? (s.objects[n] ? n : undefined)
        if (id) {
          s.updateObject(id, (d) => { d.visible = true })
          changed.push(id)
        }
      }
      if (!changed.length) {
        return { ok: false, created: [], removed: [], changed: [], message: `No objects found to show.` }
      }
      return { ok: true, created: [], removed: [], changed, message: `Shown ${names.join(', ')}.` }
    }
  },
  {
    name: 'move',
    modes: 'all',
    args: [
      { name: 'target', type: 'string', required: true, description: 'Name of object to move' },
      { name: 'pos', type: 'point', required: true, description: 'Target coordinate (x, y, [z])' }
    ],
    summary: 'Move or reposition a point, vector tail, or sandbox body',
    examples: ['move A to (2, 3)', 'move A (2, 3)', 'move A to (1, 2, 3)', 'move ball pos (0, 5, 0)'],
    parse: (raw) => {
      const m = raw.match(/^move\s+(\S+)(?:\s+(?:to|pos))?\s*\(?([-\d.]+)[,\s]+([-\d.]+)(?:[,\s]+([-\d.]+))?\)?$/i)
      if (m) {
        const x = parseFloat(m[2])
        const y = parseFloat(m[3])
        const z = m[4] !== undefined ? parseFloat(m[4]) : 0
        return { target: m[1], pos: [x, y, z] }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const target = String(args.target ?? '').trim()
      const pos = Array.isArray(args.pos) ? args.pos : [0, 0, 0]
      const [x, y, z = 0] = pos

      // 1. Scene point
      const id = s.ev.names.get(target) ?? (s.objects[target] ? target : undefined)
      if (id) {
        const obj = s.objects[id]
        if (obj?.type === 'point' && obj.def.kind === 'free') {
          s.updateObject(id, (d) => {
            if (d.type === 'point' && d.def.kind === 'free') {
              d.def.p = [x, y, z]
            }
          })
          return { ok: true, created: [], removed: [], changed: [id], message: `Moved ${target} to (${x}, ${y}${z !== 0 ? `, ${z}` : ''}).` }
        }
        if (obj?.type === 'vector' && obj.def.kind === 'free') {
          s.updateObject(id, (d) => {
            if (d.type === 'vector' && d.def.kind === 'free') {
              d.def.tail = [x, y, z]
            }
          })
          return { ok: true, created: [], removed: [], changed: [id], message: `Moved vector ${target} tail to (${x}, ${y}, ${z}).` }
        }
        return { ok: false, created: [], removed: [], changed: [], message: `Object "${target}" is not a free point or movable vector.` }
      }

      // 2. Sandbox body
      const sb = useSandbox.getState()
      const body = sb.bodies.find((b) => b.name === target || b.id === target)
      if (body) {
        sb.updateBody(body.id, { position: [x, y, z] })
        return { ok: true, created: [], removed: [], changed: [body.id], message: `Moved body ${target} to (${x}, ${y}, ${z}).` }
      }

      return { ok: false, created: [], removed: [], changed: [], message: `Object "${target}" not found.` }
    }
  },
  {
    name: 'set',
    aliases: ['slider'],
    modes: 'all',
    args: [
      { name: 'target', type: 'string', required: true, description: 'Variable or body property to set' },
      { name: 'value', type: 'any', required: true, description: 'New value' }
    ],
    summary: 'Set a slider/number value, slider bounds, or body property',
    examples: ['set k = 5', 'set k 5', 'slider k = 3', 'set k min -5 max 15 step 0.5', 'set ball mass = 2'],
    parse: (raw) => {
      // Bounds: set k min -5 max 15 step 0.5
      const bounds = raw.match(/^(?:set|slider)\s+(\S+)\s+min\s+([-\d.]+)\s+max\s+([-\d.]+)(?:\s+step\s+([-\d.]+))?$/i)
      if (bounds) {
        return {
          target: bounds[1],
          bounds: {
            min: parseFloat(bounds[2]),
            max: parseFloat(bounds[3]),
            step: bounds[4] ? parseFloat(bounds[4]) : undefined
          }
        }
      }
      // Value: set k = 5 or set k 5
      const m = raw.match(/^(?:set|slider)\s+(\S+)\s*(?:=|\s)\s*(.+)$/i)
      if (m) {
        return { target: m[1], value: m[2].trim() }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const target = String(args.target ?? '').trim()

      // Sandbox body property? (e.g. "ball mass = 2" or target="ball.mass")
      const sb = useSandbox.getState()
      const bodyPropMatch = target.match(/^(\S+)\.(mass|friction|bounce|restitution)$/i)
      const bodyName = bodyPropMatch ? bodyPropMatch[1] : target
      const body = sb.bodies.find((b) => b.name === bodyName || b.id === bodyName)
      if (body && (bodyPropMatch || args.prop)) {
        const prop = (bodyPropMatch ? bodyPropMatch[2] : args.prop).toLowerCase()
        const val = parseFloat(String(args.value))
        if (!isNaN(val)) {
          if (prop === 'mass') sb.updateBody(body.id, { mass: val })
          else if (prop === 'friction') sb.updateBody(body.id, { friction: val })
          else if (prop === 'bounce' || prop === 'restitution') sb.updateBody(body.id, { restitution: val })
          return { ok: true, created: [], removed: [], changed: [body.id], message: `Set ${bodyName} ${prop} = ${val}.` }
        }
      }

      // Scene number / slider
      const id = s.ev.names.get(target) ?? (s.objects[target] ? target : undefined)
      if (id) {
        const obj = s.objects[id]
        if (obj?.type === 'number') {
          if (args.bounds) {
            s.updateObject(id, (d) => {
              if (d.type === 'number') {
                d.slider = {
                  min: args.bounds.min,
                  max: args.bounds.max,
                  step: args.bounds.step ?? d.slider?.step ?? 0.1
                }
              }
            })
            return { ok: true, created: [], removed: [], changed: [id], message: `Set slider ${target} bounds to [${args.bounds.min}, ${args.bounds.max}].` }
          }
          const valStr = String(args.value)
          s.updateObject(id, (d) => {
            if (d.type === 'number') {
              d.expr = valStr
            }
          })
          return { ok: true, created: [], removed: [], changed: [id], message: `Set ${target} = ${valStr}.` }
        }
      }

      return { ok: false, created: [], removed: [], changed: [], message: `Target "${target}" not found or cannot be modified with set.` }
    }
  },
  {
    name: 'color',
    aliases: ['colour'],
    modes: 'all',
    args: [
      { name: 'target', type: 'string', required: true, description: 'Object name' },
      { name: 'color', type: 'string', required: true, description: 'Hex or CSS color code' }
    ],
    summary: 'Change object color',
    examples: ['color A #ff5500', 'colour c1 #00ffaa'],
    parse: (raw) => {
      const m = raw.match(/^(?:color|colour)\s+(\S+)\s+(#?[A-Za-z0-9]+)$/i)
      return m ? { target: m[1], color: m[2] } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const target = String(args.target ?? '').trim()
      const color = String(args.color ?? '').trim()
      const id = s.ev.names.get(target) ?? (s.objects[target] ? target : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Object "${target}" not found.` }
      s.updateObject(id, (d) => { d.color = color.startsWith('#') ? color : `#${color}` })
      return { ok: true, created: [], removed: [], changed: [id], message: `Updated color of ${target}.` }
    }
  },
  {
    name: 'lock',
    aliases: ['unlock'],
    modes: 'all',
    args: [
      { name: 'target', type: 'string', required: true, description: 'Object name' }
    ],
    summary: 'Lock or unlock an object from dragging',
    examples: ['lock A', 'unlock A'],
    parse: (raw) => {
      const m = raw.match(/^(lock|unlock)\s+(\S+)$/i)
      return m ? { target: m[2], action: m[1].toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const target = String(args.target ?? '').trim()
      const shouldLock = args.action !== 'unlock'
      const id = s.ev.names.get(target) ?? (s.objects[target] ? target : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Object "${target}" not found.` }
      s.updateObject(id, (d) => { d.locked = shouldLock })
      return { ok: true, created: [], removed: [], changed: [id], message: `${shouldLock ? 'Locked' : 'Unlocked'} ${target}.` }
    }
  }
]
