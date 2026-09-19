import { useMemo } from 'react'
import { RotateCcw, Scissors, Shapes } from 'lucide-react'
import { useScene } from '../core/store'
import type { ObjId } from '../core/types'
import { freeCapitals } from '../core/naming'
import { decompose, type DecomposeGoal } from '../math/decompose'
import type { V3 } from '../math/vec'
import { answerTex, circleReport, polygonReport, type FormulaRow, type Highlight, type ShapeReport } from '../math/shapeFormulas'
import { useHighlight } from '../render/Highlights'
import { Tex } from '../ui/Tex'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function Hover({ h, children, className = '' }: { h: Highlight; children: React.ReactNode; className?: string }) {
  const set = useHighlight((s) => s.set)
  return (
    <div className={`cursor-help rounded px-1 hover:bg-[#2f4a7a55] ${className}`} onMouseEnter={() => set(h)} onMouseLeave={() => set(null)}>
      {children}
    </div>
  )
}

function Row({ row, piFactor }: { row: FormulaRow; piFactor?: boolean }) {
  const settings = useScene((s) => s.settings)
  return (
    <div className="border-t border-[#2a2b30] px-2 py-2 first:border-t-0">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{row.title}</div>
      <Hover h={row.highlight} className="text-[15px]">
        <Tex tex={row.general} />
        <span className="ml-2 text-[11px] text-zinc-500">hover to shade</span>
      </Hover>
      {row.symbols.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-zinc-300">
          {row.symbols.map((s) => (
            <Hover key={s.sym + s.label} h={s.highlight}>
              <Tex tex={`${s.sym} = ${/^[A-Z][\w]*$/.test(s.label) ? `\\mathit{${s.label}} = ` : ''}${answerTex(s.value, s.kind, settings)}`} />
            </Hover>
          ))}
        </div>
      )}
      <div className="mt-1 pl-1 text-zinc-300">
        <Tex tex={row.substitution} />
      </div>
      <div className="mt-1 pl-1 text-[16px] text-white">
        <Tex tex={`${row.general.split('=')[0]}= ${answerTex(row.value, row.kind, settings, piFactor)}`} />
      </div>
    </div>
  )
}

export function ShapeReportView({ report, piFactor }: { report: ShapeReport; piFactor?: boolean }) {
  return (
    <>
      {report.rows.map((r) => (
        <Row key={r.title} row={r} piFactor={piFactor} />
      ))}
    </>
  )
}

/** Shape name, algebraic area/perimeter formulas, hover shading and Decompose for the selection. */
export function ShapeInfo({ id }: { id: ObjId }) {
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  const settings = useScene((s) => s.settings)
  const update = useScene((s) => s.updateObject)
  const setHighlight = useHighlight((s) => s.set)

  const obj = objects[id]
  const c = ev.values.get(id)
  const setGoal = (g: DecomposeGoal) =>
    update(id, (d) => {
      if (d.type === 'polygon') {
        d.decomposeGoal = g
        d.decomposeIndex = 0
      }
    })

  const goal: DecomposeGoal = (obj?.type === 'polygon' && obj.decomposeGoal) || 'basic'
  const decIndex = (obj?.type === 'polygon' && obj.decomposeIndex) || 0

  const data = useMemo(() => {
    if (!obj || !c) return null
    if (obj.type === 'polygon' && c.type === 'polygon' && c.pts.length >= 3) {
      const names = obj.points.map((p) => objects[p]?.name ?? '?')
      const report = polygonReport(c.pts, names, settings)
      const dec = obj.decomposed ? decompose(c.pts, goal, decIndex) : null
      // Corners made by the cut get the next free capitals, the same letter in every part.
      const letters = dec ? freeCapitals(Object.values(objects).map((o) => o.name), dec.newPoints.length) : []
      const nameAt = (p: V3): string => {
        const k = c.pts.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7)
        if (k >= 0) return names[k]
        const n = dec ? dec.newPoints.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-7) : -1
        return n >= 0 ? letters[n] ?? '?' : '?'
      }
      return { kind: 'polygon' as const, report, names, dec, pts: c.pts, nameAt }
    }
    if (obj.type === 'circle' && c.type === 'circle') {
      const centerId = obj.def.kind === 'centerPoint' || obj.def.kind === 'centerRadius' ? obj.def.c : undefined
      return { kind: 'circle' as const, report: circleReport(c.circle.c, c.circle.r, centerId ? objects[centerId]?.name ?? 'O' : 'O', settings) }
    }
    return null
  }, [obj, c, objects, settings, goal, decIndex])

  if (!data || !obj) return null

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#2a2b30] px-2 py-1.5">
        <Shapes size={15} className="text-violet-300" />
        <div className="flex-1">
          <span className="font-semibold text-white">{data.report.name}</span>{' '}
          {data.kind === 'polygon' && <span className="italic text-zinc-400" style={{ fontFamily: 'Cambria, serif' }}>{data.names.join('')}</span>}
        </div>
        {data.kind === 'polygon' && data.pts.length >= 4 && (
          <button
            className={`btn h-6 ${obj.type === 'polygon' && obj.decomposed ? 'primary' : ''}`}
            title="Split into simple shapes"
            onClick={() => {
              setHighlight(null)
              update(id, (d) => {
                if (d.type === 'polygon') d.decomposed = !d.decomposed
              })
            }}
          >
            <Scissors size={12} /> {obj.type === 'polygon' && obj.decomposed ? 'Undo decompose' : 'Decompose'}
          </button>
        )}
      </div>

      {data.kind === 'polygon' && data.dec && data.dec.parts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#2a2b30] px-2 py-1.5 text-[12px]">
          <span className="text-zinc-500">Split into</span>
          <div className="seg">
            <button className={goal === 'basic' ? 'on' : ''} onClick={() => setGoal('basic')} title="Only rectangles, squares and triangles">
              Rectangles &amp; triangles
            </button>
            <button className={goal === 'formula' ? 'on' : ''} onClick={() => setGoal('formula')} title="Also trapeziums and parallelograms: fewer pieces, harder formulas">
              Any shape with a formula
            </button>
          </div>
          <span className="flex-1" />
          {data.dec.alternatives > 1 && (
            <button
              className="btn h-6"
              title={`Show another way of splitting it (${(decIndex % data.dec.alternatives) + 1} of ${data.dec.alternatives})`}
              onClick={() => {
                setHighlight(null)
                update(id, (d) => {
                  if (d.type === 'polygon') d.decomposeIndex = (d.decomposeIndex ?? 0) + 1
                })
              }}
            >
              <RotateCcw size={12} /> Other way {(decIndex % data.dec.alternatives) + 1}/{data.dec.alternatives}
            </button>
          )}
        </div>
      )}

      {data.kind === 'polygon' && data.dec ? (
        <div>
          {data.dec.parts.length === 1 ? (
            <div className="px-2 py-2 text-zinc-400">
              This is already a simple shape; no need to split it.
              {goal === 'basic' && <span className="text-zinc-500"> It is a rectangle, square or triangle already.</span>}
            </div>
          ) : (
            <>
              {data.dec.parts.map((part, i) => {
                // Corners of the whole shape keep their letters; corners made by the cut get new ones.
                const partNames = part.pts.map((p) => data.nameAt(p))
                const rep = polygonReport(part.pts, partNames, settings)
                const areaRow = rep.rows.find((r) => r.title.startsWith('Area'))
                return (
                  <div key={i} className="border-t border-[#2a2b30]">
                    <Hover h={{ region: part.pts }} className="mx-1 mt-1 flex items-center gap-2">
                      <span className="rounded bg-[#3a3f4a] px-1.5 text-[11px] font-bold text-white">{ROMAN[i]}</span>
                      <span className="text-zinc-200">
                        {part.cls.name}{' '}
                        <span className="italic text-zinc-400" style={{ fontFamily: 'Cambria, serif' }}>
                          {partNames.join('')}
                        </span>
                      </span>
                      <span className="flex-1" />
                      <Tex tex={`A_{${ROMAN[i]}} = ${answerTex(part.area, 'area', settings)}`} className="text-white" />
                    </Hover>
                    {areaRow && <Row row={{ ...areaRow, highlight: { ...areaRow.highlight, region: part.pts } }} />}
                  </div>
                )
              })}
              <Hover h={{ region: data.pts }} className="m-1 border-t border-[#2a2b30] pt-2 text-[15px] text-white">
                <Tex
                  tex={`A = ${data.dec.parts.map((_, i) => `A_{${ROMAN[i]}}`).join(' + ')} = ${data.dec.parts.map((p) => answerTex(p.area, 'area', settings).split('\\approx').pop()!.replace(/\\,\\text\{[^}]*\}(\^\d)?/, '')).join(' + ')} = ${answerTex(data.dec.parts.reduce((s, p) => s + p.area, 0), 'area', settings)}`}
                />
              </Hover>
            </>
          )}
        </div>
      ) : (
        <ShapeReportView report={data.report} piFactor={data.kind === 'circle'} />
      )}
      {data.report.note && !(obj.type === 'polygon' && obj.decomposed) && <div className="border-t border-[#2a2b30] px-2 py-1.5 text-[12px] text-amber-200">{data.report.note}</div>}
    </div>
  )
}
