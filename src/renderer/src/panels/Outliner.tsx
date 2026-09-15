import { Eye, EyeOff, Lock, Trash2, Unlock } from 'lucide-react'
import { useScene } from '../core/store'
import type { ObjType, SceneObject } from '../core/types'
import { describeComputed } from '../lang/commands'
import { Tex } from '../ui/Tex'
import { PinLabelButton } from '../ui/LabelControls'

const GROUPS: { type: ObjType[]; label: string }[] = [
  { type: ['vector'], label: 'Vectors' },
  { type: ['point'], label: 'Points' },
  { type: ['segment', 'ray', 'line'], label: 'Lines' },
  { type: ['circle', 'polygon', 'angle'], label: 'Shapes' },
  { type: ['graph'], label: 'Graphs' },
  { type: ['number'], label: 'Numbers & sliders' },
  { type: ['text'], label: 'Text' }
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

  const list = order.map((id) => objects[id]).filter((o): o is SceneObject => !!o)
  if (list.length === 0) {
    return (
      <div className="panel p-4 text-zinc-500">
        <p className="mb-2 text-zinc-300">The scene is empty.</p>
        <p>Pick a tool above and click in the viewport, or type in the command bar, for example:</p>
        <pre className="mt-2 rounded bg-black/30 p-2 text-[12px] leading-6 text-amber-200">{`A = <3, 4>\nB = <2, -1>\nR = A + B\nTriangle((0,0),(4,0),(0,3))\ny = sin(x)`}</pre>
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
              {g.label} <span className="text-zinc-600">{items.length}</span>
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
                  className={`group flex h-7 cursor-pointer items-center gap-2 px-2 ${sel ? 'bg-[#2f4a7a]' : hovered === o.id ? 'bg-[#26282d]' : ''}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: o.color, opacity: o.visible ? 1 : 0.3 }} />
                  <span className={`w-12 shrink-0 truncate font-semibold italic ${o.auxiliary ? 'text-zinc-500' : 'text-zinc-100'}`} style={{ fontFamily: 'Cambria, serif' }}>
                    {o.name}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-400">
                    {err ? <span className="text-red-400">{err}</span> : o.type === 'graph' ? o.source : <Tex tex={describeComputed(ev.values.get(o.id), 2)} />}
                  </span>
                  <span className="hidden items-center gap-1 group-hover:flex">
                    <button
                      className="text-zinc-400 hover:text-white"
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
                      className="text-zinc-400 hover:text-red-400"
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
                    className="text-zinc-400 hover:text-white"
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
    </div>
  )
}
