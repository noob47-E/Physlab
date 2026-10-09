// The `pointer` sweep's scenes (CLEANUP-PLAN.md §2), built through the command bar so every object
// has the shape the app really makes. Lines are only ever appended.

export const SCENES: { name: string; space: 'vectors' | 'shapes' | 'graphing'; lines: string[] }[] = [
  { name: 'a free point and a free vector', space: 'vectors', lines: ['P = (1, 2)', 'A = <3, 3>'] },
  { name: 'a resultant of two vectors', space: 'vectors', lines: ['A = <3, 4>', 'B = <1, -2>', 'R = A + B'] },
  { name: 'a segment and its midpoint', space: 'shapes', lines: ['A = (0, 0)', 'B = (4, 0)', 'Segment(A, B)', 'M = Midpoint(A, B)'] },
  { name: 'a triangle', space: 'shapes', lines: ['Triangle((0,0), (4,0), (0,3))'] },
  { name: 'a polygon of five corners', space: 'shapes', lines: ['Polygon((0,0), (6,0), (6,4), (3,7), (0,4))'] },
  { name: 'a circle on a centre', space: 'shapes', lines: ['C = (1, 1)', 'Circle(C, 2)'] },
  { name: 'a line and a point', space: 'shapes', lines: ['A = (0, 0)', 'B = (2, 1)', 'Line(A, B)', 'Q = (3, 4)'] },
  { name: 'a graph and a slider', space: 'graphing', lines: ['a = 2', 'y = a x^2'] },
  { name: 'a point on a graph', space: 'graphing', lines: ['y = x^2', 'T = (1, 1)'] },
  { name: 'a square', space: 'shapes', lines: ['Square((0,0), (2,0))'] }
]

/** Selections before a click, the object clicked, Shift held, the pointer moved. */
export const CLICKS: [string[], string, boolean, boolean][] = [
  [[], 'p1', false, false],
  [['p1'], 'p1', false, false],
  [['p1'], 'p2', false, false],
  [['p1'], 'p2', true, false],
  [['p1', 'p2'], 'p1', true, false],
  [['p1'], 'p1', false, true],
  [['p1', 'p2'], 'p3', false, true]
]

/** Numbers the pointer tips write: lengths, angles in radians, plain numbers. */
export const TIP_VALUES: number[] = [0, 1, 1.2345, 2.5e-7, 123456789, -3.75, Math.PI / 4, Math.PI, 1e-16]
