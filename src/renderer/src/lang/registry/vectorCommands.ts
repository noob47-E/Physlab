// Vector Commands: add, components, resolve, dot, cross, mag, unit, proj
import { scene } from '../../core/store'
import { Builder } from '../../core/factory'
import * as VS from '../../math/vectorSolver'
import { heading, len, toDeg } from '../../math/vec'
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
    examples: ['resolve A', 'resolve 10 30'],
    parse: (raw) => {
      const numM = raw.match(/^resolve\s+([-\d.]+)\s+([-\d.]+)$/i)
      if (numM) return { target: parseFloat(numM[1]), angle: parseFloat(numM[2]) }
      const vecM = raw.match(/^resolve\s+(\S+)$/i)
      if (vecM) return { target: vecM[1] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      if (typeof args.target === 'number' && typeof args.angle === 'number') {
        const sol = VS.solveComponents('A', args.target, args.angle)
        s.showSolution(sol)
        return {
          ok: true,
          created: [],
          removed: [],
          changed: [],
          message: `Resolved ${args.target} at ${args.angle}°: Ax = ${(args.target * Math.cos((args.angle * Math.PI) / 180)).toFixed(2)}, Ay = ${(args.target * Math.sin((args.angle * Math.PI) / 180)).toFixed(2)}.`
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
    aliases: ['addvec'],
    modes: ['vectors'],
    args: [
      { name: 'a', type: 'string', required: true, description: 'First vector' },
      { name: 'b', type: 'string', required: true, description: 'Second vector' },
      { name: 'name', type: 'string', required: false, description: 'Result vector name' }
    ],
    summary: 'Add two vectors and create a live resultant vector',
    examples: ['addvector A B', 'addvec A B R'],
    parse: (raw) => {
      const m = raw.match(/^(?:addvector|addvec)\s+(\S+)\s+(\S+)(?:\s+(\S+))?$/i)
      return m ? { a: m[1], b: m[2], name: m[3] } : null
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
      bld.commit()
      return { ok: true, created: [obj.id], removed: [], changed: [], message: `Created resultant vector ${rName} = ${aName} + ${bName}.` }
    }
  }
]
