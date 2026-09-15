import { Eye, EyeOff, MousePointer2, Pin } from 'lucide-react'
import { useScene } from '../core/store'
import type { ObjId, SceneSettings } from '../core/types'

type Show = SceneSettings['labelShow']

export const LABEL_SHOW_HELP: Record<Show, string> = {
  always: 'Every label stays on the drawing.',
  hover: 'A label appears when you point at or select an object, and hides when the cursor moves away.',
  never: 'No labels on the drawing; read values in the Measure panel.'
}

const OPTIONS: [Show, string, typeof Eye, string][] = [
  ['always', 'Always', Eye, 'Labels always on the drawing'],
  ['hover', 'On hover', MousePointer2, 'Labels appear when you point at an object and hide when the cursor moves away'],
  ['never', 'Hidden', EyeOff, 'No labels on the drawing (values stay in the Measure panel)']
]

/** Always / On hover / Hidden switch for labels on the drawing. */
export function LabelShowSwitch({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const show = useScene((s) => s.settings.labelShow)
  const set = useScene((s) => s.setSettings)
  return (
    <div className={`seg ${className}`}>
      {OPTIONS.map(([k, label, Icon, title]) => (
        <button key={k} className={`inline-flex items-center gap-1 whitespace-nowrap ${show === k ? 'on' : ''}`} onClick={() => set({ labelShow: k })} title={title}>
          <Icon size={12} /> {compact ? label.replace('On hover', 'Hover') : label}
        </button>
      ))}
    </div>
  )
}

/** Pins one object's label so it always shows, whatever the global setting is. */
export function PinLabelButton({ id, size = 13, className = '' }: { id: ObjId; size?: number; className?: string }) {
  const pin = useScene((s) => s.objects[id]?.labelPin)
  const update = useScene((s) => s.updateObject)
  const pinned = pin === 'always'
  return (
    <button
      className={`${pinned ? 'text-amber-300' : 'text-zinc-500 hover:text-white'} ${className}`}
      title={pinned ? 'Label pinned: always shown on the drawing. Click to unpin.' : 'Pin label: always show it on the drawing'}
      onClick={(e) => {
        e.stopPropagation()
        update(id, (d) => {
          d.labelPin = pinned ? undefined : 'always'
        })
      }}
    >
      <Pin size={size} fill={pinned ? 'currentColor' : 'none'} />
    </button>
  )
}
