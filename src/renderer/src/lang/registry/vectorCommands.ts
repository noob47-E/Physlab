// Vector Commands: add, components, resolve, dot, cross, mag, unit, proj
import { scene } from '../../core/store'
import { Builder } from '../../core/factory'
import { uniqueName } from '../../core/naming'
import * as VS from '../../math/vectorSolver'
import { heading, len, toDeg } from '../../math/vec'
import { addHeadToTailHelpers } from '../commands/route'
import type { CommandEntry, RegistryResult } from './types'

export const vectorCommands: CommandEntry[] = [
  {
    name: 'resolve',
    modes: ['vectors'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Vector name or magnitude' },
      { name: 'angle', type: 'number', required: false, description: 'Angle in degrees (if target is magnitude)' }
    ],
    summary: 'Resolve a vector into rectangular components and toggle display',
    examples: ['resolve A', 'resolve 10 30', 'resolve 10 N at 30°'],
    parse: (raw) => {
      const numM = raw.match(/^resolve\s+([-\d.]+)\s*(?:N|kN|m\/s|m\/s\^2|m)?\s*(?:at\s+)?([-\d.]+)\s*(?:°|deg|rad)?$/i)
      if (numM) return { target: parseFloat(numM[1]), angle: parseFloat(numM[2]), unit: raw.match(/\b(N|kN|m\/s|m\/s\^2|m)\b/i)?.[1] }
      const vecM = raw.match(/^resolve\s+(\S+)$/i)
      if (vecM) return { target: vecM[1] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      if (typeof args.target === 'number' && typeof args.angle === 'number') {
        const mag = args.target
        const angle = args.angle
        const unit = args.unit ? String(args.unit) : undefined
        const bld = new Builder()
        const rad = (angle * Math.PI) / 180
        const vx = mag * Math.cos(rad)
        const vy = mag * Math.sin(rad)
        const vName = uniqueName('v', s.objects)
        const vObj = bld.vector(
          { kind: 'free', tail: [0, 0, 0], comp: [vx, vy, 0] },
          { name: vName, unit, showComponents: true, color: '#0cdefd' }
        )
        bld.commit()

        const sol = VS.solveComponents(vName, mag, angle)
        s.showSolution(sol)
        return {
          ok: true,
          created: [vObj.id],
          removed: [],
          changed: [],
          message: `Created and resolved ${vName} = ${mag}${unit ? ` ${unit}` : ''} ∠ ${angle}°: ${vName}x = ${vx.toFixed(2)}, ${vName}y = ${vy.toFixed(2)}.`
        }
      }

      const name = String(args.target ?? '').trim()
      const id = s.ev.names.get(name) ?? (s.objects[name] ? name : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Vector "${name}" not found.` }

      const val = s.ev.values.get(id)
      if (val?.type !== 'vector') return { ok: false, created: [], removed: [], changed: [], message: `"${name}" is not a vector.` }

      s.updateObject(id, (d) => {
        if (d.type === 'vector') d.showComponents = true
      })
      const sol = VS.solveComponents(name, len(val.comp), toDeg(heading(val.comp)))
      s.showSolution(sol)
      return {
        ok: true,
        created: [],
        removed: [],
        changed: [id],
        message: `Resolved ${name}: ${name}x = ${val.comp[0].toFixed(2)}, ${name}y = ${val.comp[1].toFixed(2)}.`
      }
    }
  },
  {
    name: 'addvector',
    aliases: ['addvec', 'add'],
    modes: ['vectors'],
    args: [
      { name: 'a', type: 'string', required: true, description: 'First vector' },
      { name: 'b', type: 'string', required: true, description: 'Second vector' },
      { name: 'name', type: 'string', required: false, description: 'Result vector name' }
    ],
    summary: 'Add two vectors and create a live resultant vector with head-to-tail parallelogram',
    examples: ['addvector A B', 'addvec A B R', 'add u and v'],
    parse: (raw) => {
      const m = raw.match(/^(?:addvector|addvec|add)\s+(\S+?)(?:\s*,\s*|\s+and\s+|\s+to\s+|\s+)(\S+?)(?:\s+(?:as|to|=|into)\s+(\S+)|\s+(\S+))?$/i)
      if (m) {
        const rName = m[3] || m[4]
        return { a: m[1], b: m[2], name: rName }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const aName = String(args.a ?? '').trim()
      const bName = String(args.b ?? '').trim()
      const rName = args.name ? String(args.name).trim() : 'R'

      const aId = s.ev.names.get(aName)
      const bId = s.ev.names.get(bName)
      if (!aId || !bId) return { ok: false, created: [], removed: [], changed: [], message: 'Both vectors must exist.' }

      const bld = new Builder()
      const expr = `${aName} + ${bName}`
      const obj = bld.vector({ kind: 'expr', expr, tailOf: aId }, { name: rName, color: '#ffd43b' })
      addHeadToTailHelpers(bld, [aName, bName])
      bld.commit()
      return { ok: true, created: [obj.id, ...bld.created.filter(c => c.id !== obj.id).map(c => c.id)], removed: [], changed: [], message: `Created resultant vector ${rName} = ${aName} + ${bName}.` }
    }
  }
]
