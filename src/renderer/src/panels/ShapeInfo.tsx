import { useEffect, useMemo, useState } from 'react'
import { Combine, FlipHorizontal2, Puzzle, RotateCcw, RotateCw, Scissors, Shapes } from 'lucide-react'
import { useScene } from '../core/store'
import type { ObjId } from '../core/types'
import { freeCapitals } from '../core/naming'
import { decompose, type DecomposeGoal } from '../math/decompose'
import { legoStatus } from '../math/lego'
import type { V3 } from '../math/vec'
import { answerTex, circleReport, polygonReport, type FormulaRow, type Highlight, type ShapeReport } from '../math/shapeFormulas'
import { useHighlight } from '../render/Highlights'
import { Tex } from '../ui/Tex'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function Hover({ h, owner, children, className = '' }: { h: Highlight; owner: ObjId; children: React.ReactNode; className?: string }) {
  const set = useHighlight((s) => s.set)
  return (
    <div className={`cursor-help rounded px-1 hover:bg-sel/40 ${className}`} onMouseEnter={() => set({ ...h, owner })} onMouseLeave={() => set(null)}>
      {children}
    </div>
  )
}

function Row({ row, owner, piFactor }: { row: FormulaRow; owner: ObjId; piFactor?: boolean }) {
  const settings = useScene((s) => s.settings)
  return (
    <div className="border-t border-line px-2 py-2 first:border-t-0">
      <div className="mb-1 text-fine uppercase tracking-wide text-ink-faint">{row.title}</div>
      <Hover h={row.highlight} owner={owner} className="text-lead">
        <Tex tex={row.general} />
        <span className="ml-2 text-fine text-ink-faint">hover to shade</span>
      </Hover>
      {row.symbols.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-ink">
          {row.symbols.map((s) => (
            <Hover key={s.sym + s.label} h={s.highlight} owner={owner}>
              <Tex tex={`${s.sym} = ${/^[A-Z][\w]*$/.test(s.label) ? `\\mathit{${s.label}} = ` : ''}${answerTex(s.value, s.kind, settings)}`} />
            </Hover>
          ))}
        </div>
      )}
      <div className="mt-1 pl-1 text-ink">
        <Tex tex={row.substitution} />
      </div>
      <div className="mt-1 pl-1 text-title text-ink-strong">
        <Tex tex={`${row.general.split('=')[0]}= ${answerTex(row.value, row.kind, settings, piFactor)}`} />
      </div>
    </div>
  )
}

export function ShapeReportView({ report, owner, piFactor }: { report: ShapeReport; owner: ObjId; piFactor?: boolean }) {
  return (
    <>
      {report.rows.map((r) => (
        <Row key={r.title} row={r} owner={owner} piFactor={piFactor} />
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
  const selection = useScene((s) => s.selection)
  const breakApart = useScene((s) => s.breakApart)
  const fusePieces = useScene((s) => s.fusePieces)
  const turnPiece = useScene((s) => s.turnPiece)
  const flipPiece = useScene((s) => s.flipPiece)
  // What the last Fuse said when it could not: a gap, an overlap. Cleared by the next Fuse.
  const [fuseNote, setFuseNote] = useState<string | null>(null)

  const obj = objects[id]
  const c = ev.values.get(id)
  // When this card goes — the shape deleted, another one selected — its shading goes too. The
  // mouse-leave that used to clear it never fires on an element that has been unmounted.
  useEffect(() => () => setHighlight(null), [id, setHighlight])
  const setGoal = (g: DecomposeGoal) =>
    update(id, (d) => {
      if (d.type === 'polygon') {
        d.decomposeGoal = g
        d.decomposeIndex = 0
      }
    })

  const goal: DecomposeGoal = (obj?.type === 'polygon' && obj.decomposeGoal) || 'basic'
  const decIndex = (obj?.type === 'polygon' && obj.decomposeIndex) || 0
  const lego = obj?.type === 'polygon' ? obj.lego : undefined
  // The selected pieces of the same shape as this one, this one included: what Fuse joins.
  const fusable = useMemo(() => {
    if (!lego) return []
    return [...new Set([...selection, id])].filter((k) => {
      const p = objects[k]
      return p?.type === 'polygon' && p.lego?.sourceId === lego.sourceId
    })
  }, [lego, selection, objects, id])

  // Every piece of this shape on the table, and what they make together: a new outline is not
  // fused by itself, so the panel says so and Fuse joins them all.
  const together = useMemo(() => {
    if (!lego) return null
    const ids = Object.values(objects)
      .filter((o) => o.type === 'polygon' && o.lego?.sourceId === lego.sourceId)
      .map((o) => o.id)
    const pts = ids.map((k) => {
      const v = ev.values.get(k)
      return v?.type === 'polygon' ? v.pts : null
    })
    if (ids.length < 2 || pts.some((p) => !p)) return null
    return { ids, status: legoStatus(pts as V3[][], lego.sourceSignature) }
  }, [lego, objects, ev])
  const fuseIds = fusable.length >= 2 ? fusable : together && together.status.kind !== 'apart' ? together.ids : fusable

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
  // A decomposed shape breaks into its parts; a simple one (and a triangle, which has no
  // Decompose) is cut in two instead, so Break apart works on the shapes a student draws most.
  const canBreak = data.kind === 'polygon' && !lego && (data.dec !== null || data.pts.length === 3)
  const simple = canBreak && data.kind === 'polygon' && (!data.dec || data.dec.parts.length < 2)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <Shapes size={15} className="text-accent" />
        <div className="flex-1">
          <span className="font-semibold text-ink-strong">{data.report.name}</span>{' '}
          {data.kind === 'polygon' && !lego && <span className="font-math italic text-ink-dim">{data.names.join('')}</span>}
          {lego && <span className="text-ink-dim">a piece of a shape</span>}
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

      {data.kind === 'polygon' && (canBreak || lego) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5 text-small">
          {canBreak && (
            <button
              className="btn min-h-[44px]"
              title={simple ? `Cut it in two along ${data.pts.length === 3 ? 'a median' : 'a diagonal'}, then slide, turn and flip the halves` : 'Turn the pieces into shapes you can slide, turn and flip'}
              onClick={() => (setHighlight(null), breakApart(id))}
            >
              <Puzzle size={14} /> Break apart
            </button>
          )}
          {lego && (
            <>
              <button
                className="btn min-h-[44px]"
                disabled={fuseIds.length < 2}
                title={fuseIds.length < 2 ? 'Select two or more pieces of the same shape, then fuse them' : fuseIds === fusable ? 'Join the selected pieces into one shape' : 'Join all the pieces into the new shape'}
                onClick={() => setFuseNote(fusePieces(fuseIds))}
              >
                <Combine size={14} /> Fuse
              </button>
              <button className="btn min-h-[44px]" title="Turn this piece a quarter turn anticlockwise" onClick={() => turnPiece(id, 90)}>
                <RotateCw size={14} /> Turn 90°
              </button>
              <button className="btn min-h-[44px]" title="Turn this piece a little anticlockwise" onClick={() => turnPiece(id, 15)}>
                <RotateCw size={14} /> Turn 15°
              </button>
              <button className="btn min-h-[44px]" title="Its mirror image, left for right" onClick={() => flipPiece(id)}>
                <FlipHorizontal2 size={14} /> Flip
              </button>
            </>
          )}
        </div>
      )}

      {data.kind === 'polygon' && data.dec && data.dec.parts.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5 text-small">
          <span className="text-ink-faint">Split into</span>
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
            <div className="px-2 py-2 text-ink-dim">
              This is already a simple shape; no need to split it.
              {goal === 'basic' && <span className="text-ink-faint"> It is a rectangle, square or triangle already.</span>}
              <span className="text-ink-faint"> Break apart still cuts it in two, so you can see what its halves make.</span>
            </div>
          ) : (
            <>
              {data.dec.parts.map((part, i) => {
                // Corners of the whole shape keep their letters; corners made by the cut get new ones.
                const partNames = part.pts.map((p) => data.nameAt(p))
                const rep = polygonReport(part.pts, partNames, settings)
                const areaRow = rep.rows.find((r) => r.title.startsWith('Area'))
                return (
                  <div key={i} className="border-t border-line">
                    <Hover h={{ region: part.pts }} owner={id} className="mx-1 mt-1 flex items-center gap-2">
                      <span className="rounded bg-surface-4 px-1.5 text-fine font-bold text-ink-strong">{ROMAN[i]}</span>
                      <span className="text-ink-strong">
                        {part.cls.name}{' '}
                        <span className="font-math italic text-ink-dim">
                          {partNames.join('')}
                        </span>
                      </span>
                      <span className="flex-1" />
                      <Tex tex={`A_{${ROMAN[i]}} = ${answerTex(part.area, 'area', settings)}`} className="text-ink-strong" />
                    </Hover>
                    {areaRow && <Row row={{ ...areaRow, highlight: { ...areaRow.highlight, region: part.pts } }} owner={id} />}
                  </div>
                )
              })}
              <Hover h={{ region: data.pts }} owner={id} className="m-1 border-t border-line pt-2 text-lead text-ink-strong">
                <Tex
                  tex={`A = ${data.dec.parts.map((_, i) => `A_{${ROMAN[i]}}`).join(' + ')} = ${data.dec.parts.map((p) => answerTex(p.area, 'area', settings).split('\\approx').pop()!.replace(/\\,\\text\{[^}]*\}(\^\d)?/, '')).join(' + ')} = ${answerTex(data.dec.parts.reduce((s, p) => s + p.area, 0), 'area', settings)}`}
                />
              </Hover>
            </>
          )}
        </div>
      ) : (
        <ShapeReportView report={data.report} owner={id} piFactor={data.kind === 'circle'} />
      )}
      {data.report.note && !(obj.type === 'polygon' && obj.decomposed) && <div className="border-t border-line px-2 py-1.5 text-small text-warn">{data.report.note}</div>}
      {fuseNote && lego && <div className="border-t border-line px-2 py-1.5 text-small text-warn">{fuseNote}</div>}
      {lego && together?.status.kind === 'different' && (
        <div className="border-t border-line px-2 py-1.5 text-small text-accent">These pieces make a new shape: {together.status.name}. Press Fuse to join them.</div>
      )}
    </div>
  )
}
