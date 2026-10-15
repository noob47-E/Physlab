// 3D-2: what a 'Try one' tile does in Graphing in 3D. It types the tile's lines (its slider, then its graph) as the student
// would, gives the slider the gallery's range and step, takes away what the last tile put there (the student's own lines
// stay), and frames the new graph. The tiles themselves are math/graph3dTiles.ts.

import { scene } from '../core/store'
import { runCommand } from '../lang/commands'
import { tileLines, type Tile3D } from '../math/graph3dTiles'
import { resetCamera } from '../render/viewState'

/** What the last tile added, taken away when another tile is chosen. */
let lastTile: { id: string; objects: string[] } | null = null

/** The tile shown now (its caption is written under the tiles), or null once nothing it drew is left (deleted, a new scene). */
export const shownTile = (): string | null => (lastTile && lastTile.objects.some((id) => scene().objects[id]) ? lastTile.id : null)

/** Puts a tile's graph on the drawing; returns what it added. */
export async function playTile(tile: Tile3D): Promise<string[]> {
  if (lastTile) {
    const still = lastTile.objects.filter((id) => scene().objects[id])
    if (still.length) scene().removeObjects(still)
  }
  const before = new Set(Object.keys(scene().objects))
  for (const line of tileLines(tile)) await runCommand(line)
  const id = scene().ev.names.get(tile.slider.name)
  if (id) {
    const { min, max, step = (max - min) / 100 } = tile.slider
    scene().updateObject(id, (d) => {
      if (d.type === 'number') d.slider = { min, max, step }
    })
  }
  const added = Object.keys(scene().objects).filter((o) => !before.has(o))
  // A surface z = f(x, y) is drawn over the gallery's own square (the hill of the tangent plane is ±4, not ±6).
  if (tile.domain) {
    const { min, max } = tile.domain
    for (const id of added) {
      scene().updateObject(id, (d) => {
        if (d.type === 'graph' && d.kind === 'surface') {
          d.tMin = min
          d.tMax = max
        }
      })
    }
  }
  lastTile = { id: tile.id, objects: added }
  // Typing a line selects what it drew; a tile's graph is shown plain (selected, a curve was drawn under a thick highlight).
  scene().select([])
  // Home frames what is drawn once the new views have drawn it (render/Graph3DViews.tsx records each one's box).
  setTimeout(resetCamera, 300)
  return added
}
