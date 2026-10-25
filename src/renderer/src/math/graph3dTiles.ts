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
    caption: 'Dual 3D tubular helical backbones with horizontal base-pair rungs in 3D space.',
    lines: [
      'surface((2.6 + 0.28 cos(v)) cos(u), (2.6 + 0.28 cos(v)) sin(u), 0.45 u + 0.28 sin(v) - 5, 0, 6 pi, 0, 2 pi)',
      'surface((2.6 + 0.28 cos(v)) cos(u + pi), (2.6 + 0.28 cos(v)) sin(u + pi), 0.45 u + 0.28 sin(v) - 5, 0, 6 pi, 0, 2 pi)',
      'curve(t cos(0), t sin(0), -5, -2.5, 2.5)',
      'curve(t cos(pi / 3), t sin(pi / 3), -4.53, -2.5, 2.5)',
      'curve(t cos(2 pi / 3), t sin(2 pi / 3), -4.06, -2.5, 2.5)',
      'curve(t cos(pi), t sin(pi), -3.59, -2.5, 2.5)',
      'curve(t cos(4 pi / 3), t sin(4 pi / 3), -3.11, -2.5, 2.5)',
      'curve(t cos(5 pi / 3), t sin(5 pi / 3), -2.64, -2.5, 2.5)',
      'curve(t cos(2 pi), t sin(2 pi), -2.17, -2.5, 2.5)',
      'curve(t cos(7 pi / 3), t sin(7 pi / 3), -1.70, -2.5, 2.5)',
      'curve(t cos(8 pi / 3), t sin(8 pi / 3), -1.23, -2.5, 2.5)',
      'curve(t cos(3 pi), t sin(3 pi), -0.76, -2.5, 2.5)',
      'curve(t cos(10 pi / 3), t sin(10 pi / 3), -0.29, -2.5, 2.5)',
      'curve(t cos(11 pi / 3), t sin(11 pi / 3), 0.18, -2.5, 2.5)',
      'curve(t cos(4 pi), t sin(4 pi), 0.65, -2.5, 2.5)',
      'curve(t cos(13 pi / 3), t sin(13 pi / 3), 1.13, -2.5, 2.5)',
      'curve(t cos(14 pi / 3), t sin(14 pi / 3), 1.60, -2.5, 2.5)',
      'curve(t cos(5 pi), t sin(5 pi), 2.07, -2.5, 2.5)',
      'curve(t cos(16 pi / 3), t sin(16 pi / 3), 2.54, -2.5, 2.5)',
      'curve(t cos(17 pi / 3), t sin(17 pi / 3), 3.01, -2.5, 2.5)',
      'curve(t cos(6 pi), t sin(6 pi), 3.48, -2.5, 2.5)'
    ]
  },
  {
    id: 'water-molecule',
    title: 'Water (H₂O)',
    caption: '3D ball-and-stick model: central Oxygen sphere bonded to two Hydrogen spheres at 104.5°.',
    lines: [
      'surface(1.3 sin(v) cos(u), 1.3 sin(v) sin(u), 1.3 cos(v))',
      'surface(1.9 + 0.75 sin(v) cos(u), 1.47 + 0.75 sin(v) sin(u), 0.75 cos(v))',
      'surface(-1.9 + 0.75 sin(v) cos(u), 1.47 + 0.75 sin(v) sin(u), 0.75 cos(v))',
      'curve(1.9 t, 1.47 t, 0, 0, 1)',
      'curve(-1.9 t, 1.47 t, 0, 0, 1)',
      'O = (0, 0, 0)',
      'H1 = (1.9, 1.47, 0)',
      'H2 = (-1.9, 1.47, 0)'
    ]
  },
  {
    id: 'methane-molecule',
    title: 'Methane (CH₄)',
    caption: '3D tetrahedral ball-and-stick model: central Carbon sphere with four Hydrogen spheres and bonds.',
    lines: [
      'surface(1.2 sin(v) cos(u), 1.2 sin(v) sin(u), 1.2 cos(v))',
      'surface(1.6 + 0.7 sin(v) cos(u), 1.6 + 0.7 sin(v) sin(u), 1.6 + 0.7 cos(v))',
      'surface(-1.6 + 0.7 sin(v) cos(u), -1.6 + 0.7 sin(v) sin(u), 1.6 + 0.7 cos(v))',
      'surface(-1.6 + 0.7 sin(v) cos(u), 1.6 + 0.7 sin(v) sin(u), -1.6 + 0.7 cos(v))',
      'surface(1.6 + 0.7 sin(v) cos(u), -1.6 + 0.7 sin(v) sin(u), -1.6 + 0.7 cos(v))',
      'curve(1.6 t, 1.6 t, 1.6 t, 0, 1)',
      'curve(-1.6 t, -1.6 t, 1.6 t, 0, 1)',
      'curve(-1.6 t, 1.6 t, -1.6 t, 0, 1)',
      'curve(1.6 t, -1.6 t, -1.6 t, 0, 1)',
      'C = (0, 0, 0)',
      'H1 = (1.6, 1.6, 1.6)',
      'H2 = (-1.6, -1.6, 1.6)',
      'H3 = (-1.6, 1.6, -1.6)',
      'H4 = (1.6, -1.6, -1.6)'
    ]
  },
  {
    id: 'benzene-ring',
    title: 'Benzene (C₆H₆)',
    caption: 'Planar aromatic hexagonal ring with upper and lower π-electron cloud tori and C-H bonds.',
    lines: [
      'surface((2.4 + 0.45 cos(v)) cos(u), (2.4 + 0.45 cos(v)) sin(u), 0.6 + 0.3 sin(v), 0, 2 pi, 0, 2 pi)',
      'surface((2.4 + 0.45 cos(v)) cos(u), (2.4 + 0.45 cos(v)) sin(u), -0.6 + 0.3 sin(v), 0, 2 pi, 0, 2 pi)',
      'curve(2.4 cos(t), 2.4 sin(t), 0, 0, 2 pi)',
      'C1 = (2.4, 0, 0)',
      'C2 = (1.2, 2.08, 0)',
      'C3 = (-1.2, 2.08, 0)',
      'C4 = (-2.4, 0, 0)',
      'C5 = (-1.2, -2.08, 0)',
      'C6 = (1.2, -2.08, 0)',
      'H1 = (3.8, 0, 0)',
      'H2 = (1.9, 3.29, 0)',
      'H3 = (-1.9, 3.29, 0)',
      'H4 = (-3.8, 0, 0)',
      'H5 = (-1.9, -3.29, 0)',
      'H6 = (1.9, -3.29, 0)',
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
    caption: 'Central 3D nucleus sphere surrounded by tilted electron orbital shells and electrons.',
    lines: [
      'surface(1.0 sin(v) cos(u), 1.0 sin(v) sin(u), 1.0 cos(v))',
      'curve(3 cos(t), 3 sin(t), 0, 0, 2 pi)',
      'curve(3 cos(t), 1.5 sin(t), 2.6 sin(t), 0, 2 pi)',
      'curve(3 cos(t), 1.5 sin(t), -2.6 sin(t), 0, 2 pi)',
      'Nucleus = (0, 0, 0)',
      'e1 = (3, 0, 0)',
      'e2 = (-1.5, 2.6, 0)',
      'e3 = (0, 1.5, 2.6)'
    ]
  }
]

/** Every line a tile types, its slider's first if present. */
export const tileLines = (t: Tile3D): string[] => (t.slider ? [`${t.slider.name} = ${t.slider.default}`, ...t.lines] : t.lines)
