// 3D-2 (owner, Wed 14 Oct 21:51: "beautiful 3D graphs"): the 'Try one' tiles of Graphing in 3D. Each of the twelve graphs of
// math/graph3dGallery.ts (lane I) written as the lines a student would type, so a tile puts real lines in the Expressions
// list (the student can read and change them) and its one slider works as any slider does. The gallery's own functions
// are the reference: tests/graph3dTiles.test.ts checks every line against them at several points.

import { graph3dGallery, type Graph3D } from './graph3dGallery'

export interface Tile3D {
  id: string
  title: string
  caption: string
  slider: Graph3D['slider']
  /** The square a surface z = f(x, y) is drawn over, from the gallery. */
  domain?: Graph3D['domain']
  /** The graph lines, typed after the slider's own line `name = default`. */
  lines: string[]
}

/** The typed lines of each gallery graph, by its id. */
const LINES: Record<string, string[]> = {
  'saddle-surface': ['z = a (x^2 - y^2) / 4'],
  'water-ripple': ['z = 2.5 sin(k sqrt(x^2 + y^2 + 0.001)) / sqrt(x^2 + y^2 + 1)'],
  'gaussian-bell': ['z = 4 e^(-(x^2 + y^2) / (2 s^2))'],
  'paraboloid-bowl': ['z = a (x^2 + y^2) / 5 - 3'],
  'monkey-saddle': ['z = a (x^3 - 3 x y^2) / 10'],
  '3d-helix-spring': ['curve(3 cos(t), 3 sin(t), c t - 4, 0, 6 pi)'],
  'torus-doughnut': ['surface((R + 1.2 cos(v)) cos(u), (R + 1.2 cos(v)) sin(u), 1.2 sin(v), 0, 2 pi, 0, 2 pi)'],
  'parametric-sphere': ['surface(R sin(v) cos(u), R sin(v) sin(u), R cos(v), 0, 2 pi, 0, pi)'],
  'mobius-strip': ['surface((3 + v cos(n u / 2)) cos(u), (3 + v cos(n u / 2)) sin(u), v sin(n u / 2), 0, 2 pi, -1, 1)'],
  'quantum-wave-packet': ['z = 3 e^(-(x^2 + y^2) / 6) cos(k x)'],
  'double-cone': ['surface(v tan(a) cos(u), v tan(a) sin(u), v, 0, 2 pi, -4, 4)'],
  // The hill, the point P on it above x = a, and the plane that touches it there: z = h(a) + h_x(a) (x − a), h_y = 0 at y = 0.
  // Written a (x − a) / 2, never a / 2 (x − a): a bracket after a number binds first, which made that a / (2 (x − a)).
  'tangent-plane-on-hill': ['z = 3 - (x^2 + y^2) / 4', 'P = (a, 0, 3 - a^2 / 4)', 'z = 3 - a^2 / 4 - a (x - a) / 2']
}

/** The twelve tiles, in the gallery's order. */
export const TILES_3D: Tile3D[] = graph3dGallery.map((g) => ({ id: g.id, title: g.title, caption: g.caption, slider: g.slider, domain: g.domain, lines: LINES[g.id] ?? [] }))

/** Every line a tile types, its slider's first: `a = 1`, then the graph lines. */
export const tileLines = (t: Tile3D): string[] => [`${t.slider.name} = ${t.slider.default}`, ...t.lines]
