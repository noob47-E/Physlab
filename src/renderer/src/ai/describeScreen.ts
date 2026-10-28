import { useApp, normalizeModeId, type ModeId } from '../app/modes'
import { useScene } from '../core/store'
import { spaceOf, visibleOrder, type Space } from '../core/visibility'
import { useSandbox } from '../sim/store'
import { useTape } from '../sim/tapeStore'
import { useCalc } from '../calc/calcStore'
import { usePure } from '../math/pure/store'
import { useLab } from '../lab/labStore'
import { fmtPrecise } from '../math/format'
import type { ObjId, PointObj, GraphObj, VectorObj, SegmentObj, PolygonObj, AngleObj, NumberObj, TextObj, RayObj } from '../core/types'

/**
 * Format a number using 3 significant figures and PhysLab precision rules.
 */
export function fmtSig(val: number | undefined | null, sig = 3): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '0'
  return fmtPrecise(val, { precisionMode: 'sf', decimals: sig })
}

/**
 * Format 2D or 3D coordinate point.
 */
function fmtPointCoords(p: [number, number, number] | [number, number] | number[] | undefined, sig = 3): string {
  if (!p || !Array.isArray(p)) return '(0, 0)'
  if (p.length === 2 || (p.length >= 3 && Math.abs(p[2] ?? 0) < 1e-9)) {
    return `(${fmtSig(p[0], sig)}, ${fmtSig(p[1], sig)})`
  }
  return `(${fmtSig(p[0], sig)}, ${fmtSig(p[1], sig)}, ${fmtSig(p[2], sig)})`
}

/**
 * Format vector components <x, y> or <x, y, z>.
 */
function fmtVectorComp(v: [number, number, number] | [number, number] | number[] | undefined, sig = 3): string {
  if (!v || !Array.isArray(v)) return '<0, 0>'
  if (v.length === 2 || (v.length >= 3 && Math.abs(v[2] ?? 0) < 1e-9)) {
    return `<${fmtSig(v[0], sig)}, ${fmtSig(v[1], sig)}>`
  }
  return `<${fmtSig(v[0], sig)}, ${fmtSig(v[1], sig)}, ${fmtSig(v[2], sig)}>`
}

/**
 * Describe the screen in detail for the AI eyes.
 * Supports Calculator, Graphing, Geometry (Shapes), Vectors, Sandbox, and Lab Data.
 * Formats numbers compactly (3 significant figures) and handles large lists (>40 items)
 * with summaries and optional search filters.
 */
export function describeScreen(modeArg?: string, filterArg?: string): string {
  const currentMode: ModeId = modeArg ? normalizeModeId(modeArg) : useApp.getState().mode
  const s = useScene.getState()
  const viewMode = s.viewMode ?? '2d'
  const filter = filterArg ? filterArg.trim().toLowerCase() : ''

  const lines: string[] = []
  lines.push(`Mode: ${currentMode} (${viewMode})`)

  switch (currentMode) {
    case 'calculator': {
      const calc = useCalc.getState()
      const pure = usePure.getState()

      lines.push(`Input: ${calc.input || '(empty)'}`)
      
      let answer = ''
      if (pure.working?.answers && pure.working.answers.length > 0) {
        answer = pure.working.answers.map((a: any) => a.tex || a.text || '').filter(Boolean).join(', ')
      }
      if (!answer && calc.ans !== undefined && calc.ans !== null && calc.ans !== 0) {
        answer = typeof calc.ans === 'number' ? fmtSig(calc.ans) : String(calc.ans)
      }
      if (answer) {
        lines.push(`Answer: ${answer}`)
      }
      const angleUnit = s.settings?.angleUnit ?? 'deg'
      lines.push(`Angle: ${angleUnit}`)

      if (calc.history && calc.history.length > 0) {
        lines.push('Recent History:')
        const recent = calc.history.slice(0, 3)
        recent.forEach((h, i) => {
          lines.push(`  ${i + 1}. ${h.input} = ${h.result}`)
        })
      }
      break
    }

    case 'sandbox': {
      const sb = useSandbox.getState()
      const isPlaying = s.playing
      const time = (useTape.getState().playhead || 0) / (sb.world?.stepRate || 60)
      const timeScale = sb.world?.timeScale ?? 1
      const gravity = sb.world?.gravity ?? 9.81
      const floor = (sb.bodies ?? []).some((b) => b.shape === 'ground' || b.name.toLowerCase() === 'floor')

      lines.push(`Simulation: ${isPlaying ? 'playing' : 'paused'}, t = ${fmtSig(time)} s, speed = ${fmtSig(timeScale)}x`)
      lines.push(`World: gravity = ${fmtSig(gravity)} m/s², floor = ${floor ? 'enabled' : 'disabled'}`)

      const bodies = sb.bodies ?? []
      const bodyItems: string[] = []

      for (const b of bodies) {
        const name = b.name || b.id
        const shape = b.shape
        const massStr = `${fmtSig(b.mass)} kg`
        const posStr = fmtPointCoords(b.position)
        const velStr = fmtVectorComp(b.velocity)
        const motion = b.motion || (b.mass === 0 ? 'static' : 'dynamic')
        const itemStr = `- Body "${name}" (${shape}): mass = ${massStr}, pos = ${posStr}, vel = ${velStr}, motion = ${motion}`
        bodyItems.push(itemStr)
      }

      const totalBodies = bodyItems.length
      const filteredBodies = filter
        ? bodyItems.filter((line) => line.toLowerCase().includes(filter))
        : bodyItems

      if (filter) {
        lines.push(`Bodies (matched ${filteredBodies.length} of ${totalBodies} with filter "${filter}"):`)
        if (filteredBodies.length === 0) {
          lines.push(`  (no bodies match filter "${filter}")`)
        } else {
          filteredBodies.slice(0, 40).forEach((b) => lines.push(`  ${b}`))
          if (filteredBodies.length > 40) {
            lines.push(`  [...${filteredBodies.length - 40} more matching bodies omitted]`)
          }
        }
      } else if (totalBodies > 40) {
        // Group by shape count
        const counts: Record<string, number> = {}
        for (const b of bodies) counts[b.shape] = (counts[b.shape] || 0) + 1
        const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')
        lines.push(`Bodies (${totalBodies} total: ${summary}):`)
        lines.push(`  [Showing first 15 bodies; use filter='<name_or_shape>' to narrow]`)
        bodyItems.slice(0, 15).forEach((b) => lines.push(`  ${b}`))
        lines.push(`  [...${totalBodies - 15} more bodies omitted]`)
      } else {
        lines.push(`Bodies (${totalBodies}):`)
        if (totalBodies === 0) {
          lines.push('  (none)')
        } else {
          bodyItems.forEach((b) => lines.push(`  ${b}`))
        }
      }

      // Links
      const links = sb.links ?? []
      if (links.length > 0) {
        lines.push(`Links (${links.length}):`)
        links.forEach((l) => {
          const bodyA = bodies.find((b) => b.id === l.a)?.name || l.a
          const bodyB = bodies.find((b) => b.id === l.b)?.name || l.b
          lines.push(`  - Link "${l.id}" (${l.kind}): between "${bodyA}" and "${bodyB}"`)
        })
      }
      break
    }

    case 'lab': {
      const lab = useLab.getState()
      const tables = lab.tables ?? []
      lines.push(`Tables (${tables.length}):`)
      if (tables.length === 0) {
        lines.push('  (none)')
      } else {
        const curId = lab.currentId
        for (const t of tables) {
          const isActive = t.id === curId ? ' [active]' : ''
          const title = t.title || (t as any).name || t.id
          const colList = t.columns.map((c) => `${c.name}${c.unit ? ` (${c.unit})` : ''}`).join(', ')
          lines.push(`  - Table "${title}" (${t.id})${isActive}: ${t.rows.length} rows, columns: [${colList}]`)
          if (t.plot) {
            lines.push(`    Plot: ${t.plot.x} vs ${t.plot.y} (fit: ${t.plot.fit})`)
          }
        }
      }
      break
    }

    case 'graphing':
    case 'shapes':
    case 'vectors':
    default: {
      const currentSpace: Space | null = spaceOf(currentMode)
      const visibleIds = visibleOrder(s.order, s.objects, currentSpace)

      const objectLines: Array<{ id: ObjId; type: string; name: string; desc: string }> = []

      for (const id of visibleIds) {
        const o = s.objects[id]
        if (!o) continue
        const name = o.name || id
        const status = o.visible === false ? ' (hidden)' : ''
        let desc = ''

        switch (o.type) {
          case 'point': {
            const pObj = o as PointObj
            const val = s.ev.values.get(id)
            const coords = (val?.type === 'point' ? (val as any).p : val?.type === 'vector' ? val.comp : undefined) ?? (pObj.def?.kind === 'free' ? (pObj.def as any).p : undefined)
            desc = `Point ${name}${status}: ${fmtPointCoords(coords)}`
            break
          }
          case 'vector': {
            const vObj = o as VectorObj
            const val = s.ev.values.get(id)
            const comp = (val?.type === 'vector' ? val.comp : undefined) ?? (vObj.def?.kind === 'free' ? (vObj.def as any).comp : undefined)
            const mag = comp ? Math.hypot(comp[0] || 0, comp[1] || 0, comp[2] || 0) : 0
            const unitStr = vObj.unit ? ` ${vObj.unit}` : ''
            desc = `Vector ${name}${status}: ${fmtVectorComp(comp)}${unitStr}, magnitude = ${fmtSig(mag)}${unitStr}`
            break
          }
          case 'graph': {
            const gObj = o as GraphObj
            const eq = gObj.source || gObj.exprs?.join(', ') || 'y = f(x)'
            desc = `Curve ${name}${status}: ${eq} (kind: ${gObj.kind})`
            break
          }
          case 'number': {
            const numObj = o as NumberObj
            const val = s.ev.values.get(id)
            const valNum = val?.type === 'number' ? val.value : undefined
            const sliderStr = numObj.slider ? ` [slider: ${numObj.slider.min} to ${numObj.slider.max}, step ${numObj.slider.step}]` : ''
            desc = `Number/Slider ${name}${status}: ${valNum !== undefined ? fmtSig(valNum) : numObj.expr}${sliderStr}`
            break
          }
          case 'segment': {
            const seg = o as SegmentObj
            const aName = s.objects[seg.a]?.name || seg.a
            const bName = s.objects[seg.b]?.name || seg.b
            const val = s.ev.values.get(id)
            const len = val?.type === 'number' ? `length = ${fmtSig(val.value)}` : `between ${aName} and ${bName}`
            desc = `Segment ${name}${status}: endpoints (${aName}, ${bName}), ${len}`
            break
          }
          case 'ray': {
            const ray = o as RayObj
            const aName = s.objects[ray.a]?.name || ray.a
            const bName = s.objects[ray.b]?.name || ray.b
            desc = `Ray ${name}${status}: from ${aName} through ${bName}`
            break
          }
          case 'line': {
            desc = `Line ${name}${status}`
            break
          }
          case 'circle': {
            const val = s.ev.values.get(id)
            const r = val?.type === 'number' ? fmtSig(val.value) : 'r'
            desc = `Circle ${name}${status}: radius = ${r}`
            break
          }
          case 'polygon': {
            const poly = o as PolygonObj
            const ptNames = poly.points.map((pid) => s.objects[pid]?.name || pid).join(', ')
            const val = s.ev.values.get(id)
            const area = val?.type === 'number' ? `, area = ${fmtSig(val.value)}` : ''
            desc = `Polygon ${name}${status}: vertices [${ptNames}]${area}`
            break
          }
          case 'angle': {
            const ang = o as AngleObj
            const vName = s.objects[ang.vertex]?.name || ang.vertex
            const aName = s.objects[ang.a]?.name || ang.a
            const bName = s.objects[ang.b]?.name || ang.b
            const val = s.ev.values.get(id)
            const deg = val?.type === 'number' ? `${fmtSig(val.value)}°` : ''
            desc = `Angle ${name}${status}: ∠${aName}${vName}${bName} = ${deg}`
            break
          }
          case 'text': {
            const txt = o as TextObj
            desc = `Label ${name}${status}: "${txt.text}" at ${fmtPointCoords(txt.p)}`
            break
          }
          default: {
            desc = `${o.type} ${name}${status}`
            break
          }
        }

        objectLines.push({ id, type: o.type, name, desc })
      }

      const totalCount = objectLines.length
      const filtered = filter
        ? objectLines.filter((item) => item.desc.toLowerCase().includes(filter) || item.name.toLowerCase().includes(filter) || item.type.toLowerCase().includes(filter))
        : objectLines

      if (filter) {
        lines.push(`Objects (matched ${filtered.length} of ${totalCount} with filter "${filter}"):`)
        if (filtered.length === 0) {
          lines.push(`  (no objects match filter "${filter}")`)
        } else {
          filtered.slice(0, 40).forEach((item) => lines.push(`  - ${item.desc}`))
          if (filtered.length > 40) {
            lines.push(`  [...${filtered.length - 40} more matching objects omitted]`)
          }
        }
      } else if (totalCount > 40) {
        // Group by type
        const typeCounts: Record<string, number> = {}
        for (const item of objectLines) typeCounts[item.type] = (typeCounts[item.type] || 0) + 1
        const summary = Object.entries(typeCounts).map(([k, v]) => `${v} ${k}s`).join(', ')
        lines.push(`Objects (${totalCount} total: ${summary}):`)
        lines.push(`  [Showing first 15 objects; use filter='<term>' to narrow]`)
        objectLines.slice(0, 15).forEach((item) => lines.push(`  - ${item.desc}`))
        lines.push(`  [...${totalCount - 15} more objects omitted]`)
      } else {
        lines.push(`Objects (${totalCount}):`)
        if (totalCount === 0) {
          lines.push('  (none)')
        } else {
          objectLines.forEach((item) => lines.push(`  - ${item.desc}`))
        }
      }
      break
    }
  }

  return lines.join('\n')
}
