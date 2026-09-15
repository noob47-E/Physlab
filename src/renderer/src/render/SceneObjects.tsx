import { useScene } from '../core/store'
import { useView } from './viewState'
import { AngleView, CircleView, LineLikeView, PointView, PolygonView, TextView, VectorView } from './ObjectViews'
import { GraphView } from './GraphView'
import type { Computed } from '../core/types'

type C<T extends Computed['type']> = Extract<Computed, { type: T }>

export function SceneObjects() {
  const objects = useScene((s) => s.objects)
  const order = useScene((s) => s.order)
  const ev = useScene((s) => s.ev)
  const selection = useScene((s) => s.selection)
  const hovered = useScene((s) => s.hovered)
  const is3D = useScene((s) => s.viewMode === '3d')
  // Re-render on zoom so pixel-sized decorations (arcs, dashes) stay the same size on screen.
  const zoom = useView((s) => s.wpp)

  return (
    <>
      {order.map((id) => {
        const o = objects[id]
        if (!o || !o.visible) return null
        const sel = selection.includes(id)
        const hov = hovered === id
        if (o.type === 'graph') return <GraphView key={id} obj={o} selected={sel} hovered={hov} is3D={is3D} />
        const c = ev.values.get(id)
        if (!c) return null
        const common = { selected: sel, hovered: hov, is3D, zoom }
        switch (o.type) {
          case 'point':
            return <PointView key={id} obj={o} c={c as C<'point'>} {...common} />
          case 'vector':
            return <VectorView key={id} obj={o} c={c as C<'vector'>} {...common} />
          case 'segment':
          case 'ray':
          case 'line':
            return <LineLikeView key={id} obj={o} c={c as C<'segment'>} {...common} />
          case 'circle':
            return <CircleView key={id} obj={o} c={c as C<'circle'>} {...common} />
          case 'polygon':
            return <PolygonView key={id} obj={o} c={c as C<'polygon'>} {...common} />
          case 'angle':
            return <AngleView key={id} obj={o} c={c as C<'angle'>} {...common} />
          case 'text':
            return <TextView key={id} obj={o} c={c as C<'text'>} {...common} />
          default:
            return null
        }
      })}
    </>
  )
}
