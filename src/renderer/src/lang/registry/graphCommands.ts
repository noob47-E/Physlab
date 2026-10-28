// Graphing Commands: plot, domain, trace, roots, extrema, tangent, area
import { scene } from '../../core/store'
import { Builder } from '../../core/factory'
import { math, preprocess } from '../../math/expr'
import { tryGraph } from '../commands/graph'
import { visualizeTangentAt, visualizeBetween } from '../../core/visualize'
import type { GraphObj } from '../../core/types'
import type { CommandEntry, RegistryResult } from './types'

function findGraph(name?: string): GraphObj | undefined {
  const s = scene()
  const graphs = Object.values(s.objects).filter((o): o is GraphObj => o.type === 'graph')
  if (!name) return graphs[graphs.length - 1]
  const id = s.ev.names.get(name) ?? name
  return graphs.find((g) => g.id === id || g.name === name)
}

export const graphCommands: CommandEntry[] = [
  {
    name: 'plot',
    modes: ['graphing', 'calculator'],
    args: [
      { name: 'expr', type: 'string', required: true, description: 'Expression or equation to plot' }
    ],
    summary: 'Plot a function, curve, or 3D surface in Graphing mode',
    examples: ['plot y = x^2 - 4', 'plot f(x) = sin(x)', 'plot z = sin(x)cos(y)', 'plot r = 2cos(3θ)'],
    parse: (raw) => {
      const m = raw.match(/^plot\s+(.+)$/i)
      return m ? { expr: m[1].trim() } : null
    },
    run: async (args): Promise<RegistryResult> => {
      const s = scene()
      const idsBefore = new Set(s.order)
      const expr = String(args.expr ?? '').trim()
      if (!expr) return { ok: false, created: [], removed: [], changed: [], message: 'Specify a function or equation to plot.' }

      const handled = tryGraph(expr)
      if (!handled) {
        return { ok: false, created: [], removed: [], changed: [], message: `Could not parse graph equation: "${expr}"` }
      }

      const sAfter = scene()
      const created = sAfter.order.filter((id) => !idsBefore.has(id))
      return { ok: true, created, removed: [], changed: [], message: `Plotted ${expr}.` }
    }
  },
  {
    name: 'domain',
    modes: ['graphing'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Graph name' },
      { name: 'min', type: 'number', required: true, description: 'Minimum domain value' },
      { name: 'max', type: 'number', required: true, description: 'Maximum domain value' }
    ],
    summary: 'Set the domain/parameter range of a graph or curve',
    examples: ['domain f -5 5', 'domain curve1 0 2pi', 'domain f [-2, 2]'],
    parse: (raw) => {
      const m = raw.match(/^domain\s+(\S+)\s+\[?([-\d.piPI]+)[,\s]+([-\d.piPI]+)\]?$/i)
      if (m) {
        const parseVal = (v: string) => (v.toLowerCase() === 'pi' || v === 'π' ? Math.PI : parseFloat(v))
        return { target: m[1], min: parseVal(m[2]), max: parseVal(m[3]) }
      }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const target = String(args.target ?? '').trim()
      const g = findGraph(target)
      if (!g) return { ok: false, created: [], removed: [], changed: [], message: `Graph "${target}" not found.` }

      const min = Number(args.min)
      const max = Number(args.max)
      if (isNaN(min) || isNaN(max) || min >= max) {
        return { ok: false, created: [], removed: [], changed: [], message: 'Domain minimum must be strictly less than maximum.' }
      }

      s.updateObject(g.id, (d) => {
        if (d.type === 'graph') {
          d.tMin = min
          d.tMax = max
        }
      })
      return { ok: true, created: [], removed: [], changed: [g.id], message: `Set domain of ${g.name} to [${min}, ${max}].` }
    }
  },
  {
    name: 'roots',
    modes: ['graphing'],
    args: [
      { name: 'target', type: 'string', required: false, description: 'Graph name' },
      { name: 'show', type: 'boolean', required: false, description: 'Whether to show or hide roots' }
    ],
    summary: 'Show or hide roots (x-intercepts) on a function graph',
    examples: ['roots', 'roots f', 'show roots f', 'hide roots f'],
    parse: (raw) => {
      const hideM = raw.match(/^hide\s+roots(?:\s+(\S+))?$/i)
      if (hideM) return { target: hideM[1], show: false }
      const showM = raw.match(/^(?:show\s+)?roots(?:\s+(\S+))?$/i)
      if (showM) return { target: showM[1], show: true }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const g = findGraph(args.target)
      if (!g) return { ok: false, created: [], removed: [], changed: [], message: 'No graph found to show roots for.' }

      const show = args.show !== false
      s.updateObject(g.id, (d) => {
        if (d.type === 'graph') d.showRoots = show
      })
      return { ok: true, created: [], removed: [], changed: [g.id], message: `${show ? 'Showing' : 'Hidden'} roots for ${g.name}.` }
    }
  },
  {
    name: 'extrema',
    aliases: ['turningpoints'],
    modes: ['graphing'],
    args: [
      { name: 'target', type: 'string', required: false, description: 'Graph name' },
      { name: 'show', type: 'boolean', required: false, description: 'Whether to show or hide turning points' }
    ],
    summary: 'Show or hide local extrema / turning points on a graph',
    examples: ['extrema', 'extrema f', 'show extrema f', 'hide extrema f'],
    parse: (raw) => {
      const hideM = raw.match(/^hide\s+(?:extrema|turningpoints)(?:\s+(\S+))?$/i)
      if (hideM) return { target: hideM[1], show: false }
      const showM = raw.match(/^(?:show\s+)?(?:extrema|turningpoints)(?:\s+(\S+))?$/i)
      if (showM) return { target: showM[1], show: true }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const g = findGraph(args.target)
      if (!g) return { ok: false, created: [], removed: [], changed: [], message: 'No graph found to show extrema for.' }

      const show = args.show !== false
      s.updateObject(g.id, (d) => {
        if (d.type === 'graph') d.showExtrema = show
      })
      return { ok: true, created: [], removed: [], changed: [g.id], message: `${show ? 'Showing' : 'Hidden'} extrema for ${g.name}.` }
    }
  },
  {
    name: 'tangent',
    modes: ['graphing', 'shapes'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Function expression or graph name' },
      { name: 'x', type: 'number', required: true, description: 'X coordinate' }
    ],
    summary: 'Draw tangent line to curve at x = a',
    examples: ['tangent f at 2', 'tangent f 1', 'tangent x^2 at 3'],
    parse: (raw) => {
      const m = raw.match(/^tangent\s+(\S+)(?:\s+at)?\s+([-\d.]+)$/i)
      return m ? { target: m[1], x: parseFloat(m[2]) } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const idsBefore = new Set(s.order)
      const target = String(args.target ?? '').trim()
      const x = Number(args.x)
      if (isNaN(x)) return { ok: false, created: [], removed: [], changed: [], message: 'Specify a valid numerical x coordinate.' }

      const g = findGraph(target)
      const expr = g ? g.exprs[0] : target
      try {
        const res = visualizeTangentAt(expr, x)
        const sAfter = scene()
        const created = sAfter.order.filter((id) => !idsBefore.has(id))
        return { ok: true, created, removed: [], changed: [], message: `Tangent at x = ${x}: slope = ${res.slope.toFixed(3)}, y = ${res.fa.toFixed(3)}.` }
      } catch (err) {
        return { ok: false, created: [], removed: [], changed: [], message: err instanceof Error ? err.message : String(err) }
      }
    }
  },
  {
    name: 'area',
    modes: ['graphing'],
    args: [
      { name: 'upper', type: 'string', required: true, description: 'Upper curve expression or graph name' },
      { name: 'a', type: 'number', required: true, description: 'Lower x bound' },
      { name: 'b', type: 'number', required: true, description: 'Upper x bound' },
      { name: 'lower', type: 'string', required: false, description: 'Optional lower curve expression (default 0)' }
    ],
    summary: 'Shade area under a curve between x = a and x = b',
    examples: ['area f 0 3', 'area f from 1 to 4', 'area x^2 0 2'],
    parse: (raw) => {
      const fromToM = raw.match(/^area\s+(\S+)\s+from\s+([-\d.]+)\s+to\s+([-\d.]+)$/i)
      if (fromToM) return { upper: fromToM[1], a: parseFloat(fromToM[2]), b: parseFloat(fromToM[3]) }
      const spaceM = raw.match(/^area\s+(\S+)\s+([-\d.]+)\s+([-\d.]+)$/i)
      if (spaceM) return { upper: spaceM[1], a: parseFloat(spaceM[2]), b: parseFloat(spaceM[3]) }
      return null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const idsBefore = new Set(s.order)
      const upperName = String(args.upper ?? '').trim()
      const a = Number(args.a)
      const b = Number(args.b)
      if (isNaN(a) || isNaN(b) || a === b) {
        return { ok: false, created: [], removed: [], changed: [], message: 'Bounds a and b must be distinct numbers.' }
      }

      const g = findGraph(upperName)
      const upperExpr = g ? g.exprs[0] : upperName
      const lowerExpr = String(args.lower ?? '0')

      try {
        const val = visualizeBetween(upperExpr, lowerExpr, a, b)
        const sAfter = scene()
        const created = sAfter.order.filter((id) => !idsBefore.has(id))
        return { ok: true, created, removed: [], changed: [], message: `Area between x = ${a} and x = ${b} is ${val.toFixed(3)}.` }
      } catch (err) {
        return { ok: false, created: [], removed: [], changed: [], message: err instanceof Error ? err.message : String(err) }
      }
    }
  },
  {
    name: 'trace',
    modes: ['graphing'],
    args: [
      { name: 'target', type: 'string', required: true, description: 'Graph name' },
      { name: 'x', type: 'number', required: true, description: 'X coordinate to trace' }
    ],
    summary: 'Place a point tracing coordinates on a curve at x',
    examples: ['trace f 2', 'trace f -1.5'],
    parse: (raw) => {
      const m = raw.match(/^trace\s+(\S+)\s+([-\d.]+)$/i)
      return m ? { target: m[1], x: parseFloat(m[2]) } : null
    },
    run: (args): RegistryResult => {
      const s = scene()
      const target = String(args.target ?? '').trim()
      const x = Number(args.x)
      const g = findGraph(target)
      if (!g) return { ok: false, created: [], removed: [], changed: [], message: `Graph "${target}" not found.` }

      try {
        const y = Number(math.evaluate(preprocess(g.exprs[0]), { x, ...s.ev.scope }))
        if (!Number.isFinite(y)) return { ok: false, created: [], removed: [], changed: [], message: `Function has no real value at x = ${x}.` }

        const bld = new Builder()
        const pt = bld.point([x, y, 0], { name: `T_${Math.round(x)}` })
        bld.commit()
        return { ok: true, created: [pt.id], removed: [], changed: [], message: `Trace point on ${g.name}: (${x}, ${y.toFixed(3)}).` }
      } catch (err) {
        return { ok: false, created: [], removed: [], changed: [], message: `Error evaluating curve at x = ${x}.` }
      }
    }
  }
]
