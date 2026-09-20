import { Eye, EyeOff, Lock, Trash2, Unlock } from 'lucide-react'
import { useScene } from '../core/store'
import type { ObjType, SceneObject } from '../core/types'
import { describeComputed } from '../lang/commands'
import { Tex } from '../ui/Tex'
import { PinLabelButton } from '../ui/LabelControls'
import { menuForObject } from '../app/contextActions'
import { showContextMenu } from '../ui/ContextMenu'
import { modeOfSpace, SPACE_LABELS, visibleIn, type Space } from '../core/visibility'
import { enterMode } from '../app/TopBar'

const GROUPS: { type: ObjType[]; label: string }[] = [
  { type: ['vector'], label: 'Vectors' },
  { type: ['point'], label: 'Points' },
  { type: ['segment', 'ray', 'line'], label: 'Lines' },
  { type: ['circle', 'polygon', 'angle'], label: 'Shapes' },
  { type: ['graph'], label: 'Graphs' },
  { type: ['number'], label: 'Numbers & sliders' },
  { type: ['text'], label: 'Text' }
]

/** Plain words beside each starter: a bare block of syntax read like a programming manual. */
const STARTERS: { type: string; makes: string }[] = [
  { type: 'A = <3, 4>', makes: 'a vector' },
  { type: 'R = A + B', makes: 'adds two vectors' },
  { type: 'Triangle((0,0), (4,0), (0,3))', makes: 'a triangle' },
  { type: 'y = sin(x)', makes: 'a graph' }
]

export function Outliner() {
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const selection = useScene((s) => s.selection)
  const hovered = useScene((s) => s.hovered)
  const select = useScene((s) => s.select)
  const update = useScene((s) => s.updateObject)
  const remove = useScene((s) => s.removeObjects)
  const setHovered = useScene((s) => s.setHovered)
  const space = useScene((s) => s.activeSpace)

  const all = order.map((id) => objects[id]).filter((o): o is SceneObject => !!o)
  const list = all.filter((o) => visibleIn(o, space))
  // What lives in the other drawings, so nothing feels lost.
  const elsewhere = new Map<Space, number>()
  for (const o of all) if (!visibleIn(o, space) && o.space && !o.auxiliary) elsewhere.set(o.space, (elsewhere.get(o.space) ?? 0) + 1)
  const others = [...elsewhere.entries()].length > 0 && (
    <div className="px-3 pt-3 text-ink-faint">
      {[...elsewhere.entries()].map(([sp, n]) => (
        <button key={sp} className="btn ghost mr-1 mb-1" onClick={() => enterMode(modeOfSpace[sp])} title={`Switch to ${SPACE_LABELS[sp]}`}>
          {n} in {SPACE_LABELS[sp]}
        </button>
      ))}
    </div>
  )
  if (list.length === 0) {
    return (
      <div className="panel p-4 text-ink-faint">
        <p className="mb-2 text-ink">Nothing drawn yet.</p>
        <p>Pick a tool above and click on the drawing, or type something in the bar at the top, such as:</p>
        <ul className="mt-2 space-y-1">
          {STARTERS.map((s) => (
            <li key={s.type} className="flex items-baseline gap-2">
              <button className="font-mono text-warn hover:underline" title="Put this in the command bar" onClick={() => window.dispatchEvent(new CustomEvent('physlab:command', { detail: s.type }))}>
                {s.type}
              </button>
              <span>{s.makes}</span>
            </li>
          ))}
        </ul>
        {others}
      </div>
    )
  }

  return (
    <div className="panel pb-4">
      {GROUPS.map((g) => {
        const items = list.filter((o) => g.type.includes(o.type) && !(o.auxiliary && !o.visible))
        if (!items.length) return null
        return (
          <div key={g.label}>
            <div className="section-title">
              {g.label} <span className="text-ink-faint">{items.length}</span>
            </div>
            {items.map((o) => {
              const sel = selection.includes(o.id)
              const err = ev.errors.get(o.id)
              return (
                <div
                  key={o.id}
                  onMouseEnter={() => setHovered(o.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={(e) => select([o.id], e.shiftKey || e.ctrlKey)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    select([o.id])
                    showContextMenu(e, menuForObject(o.id))
                  }}
                  className={`group flex h-7 cursor-pointer items-center gap-2 px-2 ${sel ? 'bg-sel' : hovered === o.id ? 'bg-surface-3' : ''}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color, opacity: o.visible ? 1 : 0.3 }} />
                  <span className={`w-12 shrink-0 truncate font-math font-semibold italic ${o.auxiliary ? 'text-ink-faint' : 'text-ink-strong'}`}>
                    {o.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-fine text-ink-dim">
                    {err ? <span className="text-bad">{err}</span> : o.type === 'graph' ? o.source : <Tex tex={describeComputed(ev.values.get(o.id), 2)} />}
                  </span>
                  <span className="hidden items-center gap-1 group-hover:flex">
                    <button
                      className="text-ink-dim hover:text-ink-strong"
                      title={o.locked ? 'Unlock' : 'Lock'}
                      onClick={(e) => {
                        e.stopPropagation()
                        update(o.id, (d) => {
                          d.locked = !d.locked
                        })
                      }}
                    >
                      {o.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    <button
                      className="text-ink-dim hover:text-bad"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove([o.id])
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                  {o.type !== 'number' && o.type !== 'text' && (
                    <PinLabelButton id={o.id} className={o.labelPin === 'always' ? '' : 'hidden group-hover:block'} />
                  )}
                  <button
                    className="text-ink-dim hover:text-ink-strong"
                    title={o.visible ? 'Hide' : 'Show'}
                    onClick={(e) => {
                      e.stopPropagation()
                      update(o.id, (d) => {
                        d.visible = !d.visible
                      })
                    }}
                  >
                    {o.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
      {others}
    </div>
  )
}
