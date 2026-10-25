// 3D-2 (owner, Wed 14 Oct 21:51: "beautiful 3D graphs"): the 'Try one' tiles of Graphing in 3D. Each of the twelve graphs of
// math/graph3dGallery.ts (lane I) written as the lines a student would type, so a tile puts real lines in the Expressions
// list (the student can read and change them) and its one slider works as any slider does. The gallery's own functions
// are the reference: tests/graph3dTiles.test.ts checks every line against them at several points.

import { graph3dGallery, type Graph3D } from './graph3dGallery'

export interface Tile3D {
  id: string
  title: string
  caption: string
  slider?: Graph3D['slider']
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

/** Molecular, atomic and biological 3D structures. */
export const CHEMISTRY_TILES_3D: Tile3D[] = [
  {
    id: 'dna-double-helix',
    title: 'DNA Double Helix',
    caption: 'Dual antiparallel helical backbones winding around a shared axis in 3D.',
    lines: [
      'curve(3 cos(t), 3 sin(t), 0.5 t - 6, 0, 8 pi)',
      'curve(3 cos(t + pi), 3 sin(t + pi), 0.5 t - 6, 0, 8 pi)'
    ]
  },
  {
    id: 'water-molecule',
    title: 'Water (H₂O)',
    caption: 'Central Oxygen atom bonded to two Hydrogen atoms at a 104.5° angle.',
    lines: [
      'O = (0, 0, 0)',
      'H1 = (1.5, 1.1, 0)',
      'H2 = (-1.5, 1.1, 0)',
      'Segment(O, H1)',
      'Segment(O, H2)'
    ]
  },
  {
    id: 'methane-molecule',
    title: 'Methane (CH₄)',
    caption: 'Central Carbon atom bonded to four Hydrogen atoms forming a regular tetrahedron.',
    lines: [
      'C = (0, 0, 0)',
      'H1 = (1.4, 1.4, 1.4)',
      'H2 = (-1.4, -1.4, 1.4)',
      'H3 = (-1.4, 1.4, -1.4)',
      'H4 = (1.4, -1.4, -1.4)',
      'Segment(C, H1)',
      'Segment(C, H2)',
      'Segment(C, H3)',
      'Segment(C, H4)'
    ]
  },
  {
    id: 'benzene-ring',
    title: 'Benzene (C₆H₆)',
    caption: 'Planar aromatic hexagonal ring of six Carbon atoms and six Hydrogen atoms.',
    lines: [
      'C1 = (2.5, 0, 0)',
      'C2 = (1.25, 2.17, 0)',
      'C3 = (-1.25, 2.17, 0)',
      'C4 = (-2.5, 0, 0)',
      'C5 = (-1.25, -2.17, 0)',
      'C6 = (1.25, -2.17, 0)',
      'H1 = (4, 0, 0)',
      'H2 = (2, 3.46, 0)',
      'H3 = (-2, 3.46, 0)',
      'H4 = (-4, 0, 0)',
      'H5 = (-2, -3.46, 0)',
      'H6 = (2, -3.46, 0)',
      'Segment(C1, C2)',
      'Segment(C2, C3)',
      'Segment(C3, C4)',
      'Segment(C4, C5)',
      'Segment(C5, C6)',
      'Segment(C6, C1)',
      'Segment(C1, H1)',
      'Segment(C2, H2)',
      'Segment(C3, H3)',
      'Segment(C4, H4)',
      'Segment(C5, H5)',
      'Segment(C6, H6)'
    ]
  },
  {
    id: 'bohr-atom',
    title: 'Bohr Atom Model',
    caption: 'Central nucleus surrounded by electron orbital shells in three-dimensional space.',
    lines: [
      'Nucleus = (0, 0, 0)',
      'curve(3 cos(t), 3 sin(t), 0, 0, 2 pi)',
      'curve(3 cos(t), 0, 3 sin(t), 0, 2 pi)',
      'curve(0, 3 cos(t), 3 sin(t), 0, 2 pi)'
    ]
  }
]

/** Every line a tile types, its slider's first if present. */
export const tileLines = (t: Tile3D): string[] => (t.slider ? [`${t.slider.name} = ${t.slider.default}`, ...t.lines] : t.lines)
