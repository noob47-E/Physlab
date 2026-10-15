// 3D-3B: what a shape tile does - the 3D shapes row under the tool shelf and the Shapes gallery in the Measure panel. The
// solid stands on the floor (at the centre, or beside the solids already there), selected, with its volume said, and the
// tool goes back to Move so the student can turn it, size it and measure it.

import { Builder } from '../core/factory'
import { scene } from '../core/store'
import { formatMeasure } from '../math/format'
import { SOLID_NAMES, type SolidKind, type SolidShape } from '../math/solidShape'
import { nextSolidSpot } from '../render/handles3d'

export function addSolid(kind: SolidKind): string {
  const s = scene()
  const shapes: SolidShape[] = []
  for (const id of s.order) {
    const c = s.ev.values.get(id)
    if (c?.type === 'solid' && s.objects[id]?.space === s.activeSpace) shapes.push(c.shape)
  }
  const b = new Builder()
  const solid = b.solid(kind, {}, nextSolidSpot(shapes))
  b.commit()
  s.select([solid.id])
  s.setTool('select')
  const c = scene().ev.values.get(solid.id)
  if (c?.type === 'solid') s.pushLog({ input: SOLID_NAMES[kind], kind: 'result', text: `${SOLID_NAMES[kind]}: V = ${formatMeasure(c.shape.volume, 'volume', s.settings)}. Its sizes and the worked volume are in the Measure panel.` })
  s.requestFocus('measure')
  return solid.id
}
