// Construction Commands: midpoint, perpendicular, parallel, bisectors, intersect, angle, distance, decompose, breakapart, fuse, turn, flip
import { Builder } from '../../core/factory'
import { scene } from '../../core/store'
import { dist } from '../../math/vec'
import { formatMeasure } from '../../math/format'
import type { ObjId } from '../../core/types'
import type { CommandEntry, RegistryResult } from './types'

export const constructionCommands: CommandEntry[] = [
  {
    name: 'distance',
    aliases: ['dist'],
    modes: ['shapes', 'vectors', 'graphing', 'calculator'],
    args: [
      { name: 'a', type: 'string', required: true, description: 'First point or segment name' },
      { name: 'b', type: 'string', required: false, description: 'Second point name' }
    ],
    summary: 'Measure distance between two points or length of a segment',
    examples: ['distance A B', 'dist A B', 'distance seg1'],
    parse: (raw) => {
      // If parenthesis present, leave to existing math/geo parser
      if (raw.includes('(')) return null
      const spaceMatch = raw.match(/^(?:distance|dist)\s+(\S+)(?:\s+(\S+))?$/i)
      if (spaceMatch) return { a: spaceMatch[1], b: spaceMatch[2] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const aName = String(args.a ?? '').trim()
      const bName = args.b ? String(args.b).trim() : ''

      const aId = s.ev.names.get(aName) ?? (s.objects[aName] ? aName : undefined)
      if (!aId) return { ok: false, created: [], removed: [], changed: [], message: `Object "${aName}" not found.` }

      // Single argument: segment
      if (!bName) {
        const obj = s.objects[aId]
        if (obj?.type === 'segment') {
          const ptA = s.ev.values.get(obj.a)
          const ptB = s.ev.values.get(obj.b)
          if (ptA?.type === 'point' && ptB?.type === 'point') {
            const d = dist(ptA.p, ptB.p)
            const text = formatMeasure(d, 'length', s.settings)
            return { ok: true, created: [], removed: [], changed: [], message: `Length of ${aName}: ${text}` }
          }
        }
        return { ok: false, created: [], removed: [], changed: [], message: `"${aName}" is not a segment. Provide two points to measure distance.` }
      }

      // Two points
      const bId = s.ev.names.get(bName) ?? (s.objects[bName] ? bName : undefined)
      if (!bId) return { ok: false, created: [], removed: [], changed: [], message: `Point "${bName}" not found.` }

      const valA = s.ev.values.get(aId)
      const valB = s.ev.values.get(bId)
      if (valA?.type !== 'point' || valB?.type !== 'point') {
        return { ok: false, created: [], removed: [], changed: [], message: `Both "${aName}" and "${bName}" must be points.` }
      }

      const d = dist(valA.p, valB.p)
      const text = formatMeasure(d, 'length', s.settings)

      // Also create a connecting segment if none exists between them
      const existingSeg = Object.values(s.objects).find(
        (o) => o.type === 'segment' && ((o.a === aId && o.b === bId) || (o.a === bId && o.b === aId))
      )
      if (!existingSeg) {
        const bld = new Builder()
        const seg = bld.segment(aId, bId)
        bld.commit()
        return { ok: true, created: [seg.id], removed: [], changed: [], message: `Distance ${aName}${bName} = ${text}` }
      }

      return { ok: true, created: [], removed: [], changed: [], message: `Distance ${aName}${bName} = ${text}` }
    }
  },
  {
    name: 'midpoint',
    modes: ['shapes'],
    args: [
      { name: 'a', type: 'string', required: true, description: 'First point or segment' },
      { name: 'b', type: 'string', required: false, description: 'Second point' }
    ],
    summary: 'Construct the midpoint between two points or of a segment',
    examples: ['midpoint A B', 'midpoint seg1'],
    parse: (raw) => {
      if (raw.includes('(')) return null
      const spaceMatch = raw.match(/^midpoint\s+(\S+)(?:\s+(\S+))?$/i)
      if (spaceMatch) return { a: spaceMatch[1], b: spaceMatch[2] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const aName = String(args.a ?? '').trim()
      const bName = args.b ? String(args.b).trim() : ''
      const aId = s.ev.names.get(aName) ?? (s.objects[aName] ? aName : undefined)
      if (!aId) return { ok: false, created: [], removed: [], changed: [], message: `Object "${aName}" not found.` }

      const bld = new Builder()
      if (!bName) {
        const obj = s.objects[aId]
        if (obj?.type === 'segment') {
          const pt = bld.point({ kind: 'midpoint', a: obj.a, b: obj.b })
          bld.commit()
          return { ok: true, created: [pt.id], removed: [], changed: [], message: `Created midpoint ${pt.name} of ${aName}.` }
        }
        return { ok: false, created: [], removed: [], changed: [], message: `Provide two points or a segment.` }
      }

      const bId = s.ev.names.get(bName) ?? (s.objects[bName] ? bName : undefined)
      if (!bId) return { ok: false, created: [], removed: [], changed: [], message: `Point "${bName}" not found.` }

      const pt = bld.point({ kind: 'midpoint', a: aId, b: bId })
      bld.commit()
      return { ok: true, created: [pt.id], removed: [], changed: [], message: `Created midpoint ${pt.name} between ${aName} and ${bName}.` }
    }
  },
  {
    name: 'perpendicular',
    aliases: ['perp'],
    modes: ['shapes'],
    args: [
      { name: 'point', type: 'string', required: true, description: 'Point to pass through' },
      { name: 'line', type: 'string', required: true, description: 'Line or segment to be perpendicular to' }
    ],
    summary: 'Construct a perpendicular line through a point to another line',
    examples: ['perpendicular P line1', 'perp P l1'],
    parse: (raw) => {
      if (raw.includes('(')) return null
      const spaceMatch = raw.match(/^(?:perpendicular|perp)\s+(\S+)\s+(\S+)$/i)
      if (spaceMatch) return { point: spaceMatch[1], line: spaceMatch[2] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const pName = String(args.point ?? '').trim()
      const lName = String(args.line ?? '').trim()
      const pId = s.ev.names.get(pName) ?? (s.objects[pName] ? pName : undefined)
      const lId = s.ev.names.get(lName) ?? (s.objects[lName] ? lName : undefined)
      if (!pId) return { ok: false, created: [], removed: [], changed: [], message: `Point "${pName}" not found.` }
      if (!lId) return { ok: false, created: [], removed: [], changed: [], message: `Line "${lName}" not found.` }

      const bld = new Builder()
      const ln = bld.line({ kind: 'perpendicular', through: pId, line: lId })
      bld.commit()
      return { ok: true, created: [ln.id], removed: [], changed: [], message: `Created perpendicular line ${ln.name} through ${pName} to ${lName}.` }
    }
  },
  {
    name: 'parallel',
    modes: ['shapes'],
    args: [
      { name: 'point', type: 'string', required: true, description: 'Point to pass through' },
      { name: 'line', type: 'string', required: true, description: 'Line or segment to be parallel to' }
    ],
    summary: 'Construct a parallel line through a point to another line',
    examples: ['parallel P line1'],
    parse: (raw) => {
      if (raw.includes('(')) return null
      const spaceMatch = raw.match(/^parallel\s+(\S+)\s+(\S+)$/i)
      if (spaceMatch) return { point: spaceMatch[1], line: spaceMatch[2] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const pName = String(args.point ?? '').trim()
      const lName = String(args.line ?? '').trim()
      const pId = s.ev.names.get(pName) ?? (s.objects[pName] ? pName : undefined)
      const lId = s.ev.names.get(lName) ?? (s.objects[lName] ? lName : undefined)
      if (!pId) return { ok: false, created: [], removed: [], changed: [], message: `Point "${pName}" not found.` }
      if (!lId) return { ok: false, created: [], removed: [], changed: [], message: `Line "${lName}" not found.` }

      const bld = new Builder()
      const ln = bld.line({ kind: 'parallel', through: pId, line: lId })
      bld.commit()
      return { ok: true, created: [ln.id], removed: [], changed: [], message: `Created parallel line ${ln.name} through ${pName} to ${lName}.` }
    }
  },
  {
    name: 'perpbisector',
    aliases: ['perpendicularbisector'],
    modes: ['shapes'],
    args: [
      { name: 'a', type: 'string', required: true, description: 'First point or segment' },
      { name: 'b', type: 'string', required: false, description: 'Second point' }
    ],
    summary: 'Construct the perpendicular bisector of a segment or two points',
    examples: ['perpbisector A B', 'perpbisector seg1'],
    parse: (raw) => {
      if (raw.includes('(')) return null
      const spaceMatch = raw.match(/^(?:perpbisector|perpendicularbisector)\s+(\S+)(?:\s+(\S+))?$/i)
      if (spaceMatch) return { a: spaceMatch[1], b: spaceMatch[2] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const aName = String(args.a ?? '').trim()
      const bName = args.b ? String(args.b).trim() : ''
      const aId = s.ev.names.get(aName) ?? (s.objects[aName] ? aName : undefined)
      if (!aId) return { ok: false, created: [], removed: [], changed: [], message: `Object "${aName}" not found.` }

      const bld = new Builder()
      if (!bName) {
        const obj = s.objects[aId]
        if (obj?.type === 'segment') {
          const ln = bld.line({ kind: 'perpBisector', a: obj.a, b: obj.b })
          bld.commit()
          return { ok: true, created: [ln.id], removed: [], changed: [], message: `Created perpendicular bisector ${ln.name} of ${aName}.` }
        }
        return { ok: false, created: [], removed: [], changed: [], message: `Provide two points or a segment.` }
      }

      const bId = s.ev.names.get(bName) ?? (s.objects[bName] ? bName : undefined)
      if (!bId) return { ok: false, created: [], removed: [], changed: [], message: `Point "${bName}" not found.` }

      const ln = bld.line({ kind: 'perpBisector', a: aId, b: bId })
      bld.commit()
      return { ok: true, created: [ln.id], removed: [], changed: [], message: `Created perpendicular bisector ${ln.name} of ${aName}${bName}.` }
    }
  },
  {
    name: 'anglebisector',
    modes: ['shapes'],
    args: [
      { name: 'a', type: 'string', required: true, description: 'First arm point' },
      { name: 'vertex', type: 'string', required: true, description: 'Vertex point' },
      { name: 'b', type: 'string', required: true, description: 'Second arm point' }
    ],
    summary: 'Construct an angle bisector line',
    examples: ['anglebisector A B C'],
    parse: (raw) => {
      if (raw.includes('(')) return null
      const spaceMatch = raw.match(/^anglebisector\s+(\S+)\s+(\S+)\s+(\S+)$/i)
      if (spaceMatch) return { a: spaceMatch[1], vertex: spaceMatch[2], b: spaceMatch[3] }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const aId = s.ev.names.get(args.a) ?? (s.objects[args.a] ? args.a : undefined)
      const vId = s.ev.names.get(args.vertex) ?? (s.objects[args.vertex] ? args.vertex : undefined)
      const bId = s.ev.names.get(args.b) ?? (s.objects[args.b] ? args.b : undefined)
      if (!aId || !vId || !bId) return { ok: false, created: [], removed: [], changed: [], message: 'All three points must exist.' }

      const bld = new Builder()
      const ln = bld.line({ kind: 'angleBisector', a: aId, vertex: vId, b: bId })
      bld.commit()
      return { ok: true, created: [ln.id], removed: [], changed: [], message: `Created angle bisector ${ln.name} at ${args.vertex}.` }
    }
  },
  {
    name: 'decompose',
    modes: ['shapes'],
    args: [
      { name: 'shape', type: 'string', required: true, description: 'Polygon name to decompose' }
    ],
    summary: 'Decompose a polygon into simple geometric shapes',
    examples: ['decompose poly1', 'decompose T'],
    parse: (raw) => {
      const m = raw.match(/^decompose\s+(\S+)$/i)
      return m ? { shape: m[1] } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const name = String(args.shape ?? '').trim()
      const id = s.ev.names.get(name) ?? (s.objects[name] ? name : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Shape "${name}" not found.` }

      const obj = s.objects[id]
      if (obj?.type !== 'polygon') return { ok: false, created: [], removed: [], changed: [], message: `"${name}" is not a polygon.` }

      s.updateObject(id, (d) => {
        if (d.type === 'polygon') d.decomposed = true
      })
      return { ok: true, created: [], removed: [], changed: [id], message: `Decomposed shape ${name}.` }
    }
  },
  {
    name: 'breakapart',
    modes: ['shapes'],
    args: [
      { name: 'shape', type: 'string', required: true, description: 'Polygon name to break apart into Lego pieces' }
    ],
    summary: 'Break apart a shape into movable Lego pieces',
    examples: ['breakapart poly1', 'breakapart T'],
    parse: (raw) => {
      const m = raw.match(/^(?:breakapart|break_apart)\s+(\S+)$/i)
      return m ? { shape: m[1] } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const name = String(args.shape ?? '').trim()
      const id = s.ev.names.get(name) ?? (s.objects[name] ? name : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Shape "${name}" not found.` }

      const idsBefore = new Set(s.order)
      s.breakApart(id)
      const sAfter = scene()
      const created = sAfter.order.filter((i) => !idsBefore.has(i))
      return { ok: true, created, removed: [id], changed: [], message: `Broken apart ${name} into ${created.length} Lego piece(s).` }
    }
  },
  {
    name: 'fuse',
    modes: ['shapes'],
    args: [
      { name: 'pieces', type: 'string', required: true, description: 'Lego pieces to fuse together' }
    ],
    summary: 'Fuse touching Lego pieces back into one shape',
    examples: ['fuse piece1 piece2', 'fuse P1, P2'],
    parse: (raw) => {
      const m = raw.match(/^fuse\s+(.+)$/i)
      return m ? { pieces: m[1].trim() } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const names = String(args.pieces ?? '').split(/[,\s]+/).filter(Boolean)
      const ids: ObjId[] = []
      for (const n of names) {
        const id = s.ev.names.get(n) ?? (s.objects[n] ? n : undefined)
        if (id) ids.push(id)
      }
      if (ids.length < 2) return { ok: false, created: [], removed: [], changed: [], message: 'Select at least two touching pieces to fuse.' }

      const idsBefore = new Set(s.order)
      const err = s.fusePieces(ids)
      if (err) return { ok: false, created: [], removed: [], changed: [], message: err }

      const sAfter = scene()
      const created = sAfter.order.filter((i) => !idsBefore.has(i))
      const removed = ids.filter((i) => !sAfter.objects[i])
      return { ok: true, created, removed, changed: [], message: `Fused ${names.join(', ')} into one shape.` }
    }
  },
  {
    name: 'turn',
    aliases: ['rotate'],
    modes: ['shapes'],
    args: [
      { name: 'shape', type: 'string', required: true, description: 'Lego piece name' },
      { name: 'deg', type: 'number', required: true, description: 'Degrees to rotate anticlockwise' }
    ],
    summary: 'Turn or rotate a Lego piece by degrees',
    examples: ['turn piece1 90', 'turn P1 15', 'rotate piece1 45'],
    parse: (raw) => {
      const m = raw.match(/^(?:turn|rotate)\s+(\S+)\s+([-\d.]+)$/i)
      return m ? { shape: m[1], deg: parseFloat(m[2]) } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const name = String(args.shape ?? '').trim()
      const deg = Number(args.deg ?? 90)
      const id = s.ev.names.get(name) ?? (s.objects[name] ? name : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Piece "${name}" not found.` }

      s.turnPiece(id, deg)
      return { ok: true, created: [], removed: [], changed: [id], message: `Turned ${name} by ${deg}°.` }
    }
  },
  {
    name: 'flip',
    aliases: ['reflect'],
    modes: ['shapes'],
    args: [
      { name: 'shape', type: 'string', required: true, description: 'Lego piece name' }
    ],
    summary: 'Flip a Lego piece (left for right mirror image)',
    examples: ['flip piece1', 'reflect P1'],
    parse: (raw) => {
      const m = raw.match(/^(?:flip|reflect)\s+(\S+)$/i)
      return m ? { shape: m[1] } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const name = String(args.shape ?? '').trim()
      const id = s.ev.names.get(name) ?? (s.objects[name] ? name : undefined)
      if (!id) return { ok: false, created: [], removed: [], changed: [], message: `Piece "${name}" not found.` }

      s.flipPiece(id)
      return { ok: true, created: [], removed: [], changed: [id], message: `Flipped piece ${name}.` }
    }
  }
]
