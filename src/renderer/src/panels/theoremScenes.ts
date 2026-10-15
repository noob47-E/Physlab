// 3D-3B: the scene each of the ten 3-D theorems (math/theorems3d.ts, lane J) sets up in Geometry's 3-D view. A tile types its
// lines (its slider first, named so a line can read it, with the data's range and default), places a second solid beside the
// first, and the next tile takes away what the last one made. Where the slider changes what a line cannot say (Euler's solid,
// Pythagoras' box) `syncTheorem` updates the scene from the data.

import { Builder } from '../core/factory'
import { scene } from '../core/store'
import { runCommand } from '../lang/commands'
import type { Theorem3D } from '../math/theorems3d'
import type { SolidKind } from '../math/solidShape'
import type { V3 } from '../math/vec'
import { resetCamera } from '../render/viewState'

interface TheoremScene {
  /** The slider's name: short, as a line reads it. */
  slider: string
  /** The lines typed after `slider = default`. */
  lines: string[]
  /** Where a named solid stands, when not at the centre (a second solid beside the first). */
  at?: Record<string, V3>
  /** Faces made of corners that follow the slider (a net unfolding), each corner a formula. */
  faces?: string[][][]
}

/**
 * The six faces of a cube of side 4 on the floor, opening by 0.9u degrees on their hinges: four sides about the bottom edges,
 * the top about the back side's top edge (turning twice as far, so it lies flat beyond the back at u = 100).
 */
function cubeNet(): string[][][] {
  const C = 'cos((0.9 u) deg)'
  const S = 'sin((0.9 u) deg)'
  const C2 = 'cos((1.8 u) deg)'
  const S2 = 'sin((1.8 u) deg)'
  const pt = (x: string, y: string, z: string) => [x, y, z]
  return [
    [pt('-2', '-2', '0'), pt('2', '-2', '0'), pt('2', '2', '0'), pt('-2', '2', '0')],
    [pt('-2', '-2', '0'), pt('2', '-2', '0'), pt('2', `-2 - 4 ${S}`, `4 ${C}`), pt('-2', `-2 - 4 ${S}`, `4 ${C}`)],
    [pt('-2', '2', '0'), pt('2', '2', '0'), pt('2', `2 + 4 ${S}`, `4 ${C}`), pt('-2', `2 + 4 ${S}`, `4 ${C}`)],
    [pt('-2', '-2', '0'), pt('-2', '2', '0'), pt(`-2 - 4 ${S}`, '2', `4 ${C}`), pt(`-2 - 4 ${S}`, '-2', `4 ${C}`)],
    [pt('2', '-2', '0'), pt('2', '2', '0'), pt(`2 + 4 ${S}`, '2', `4 ${C}`), pt(`2 + 4 ${S}`, '-2', `4 ${C}`)],
    [
      pt('-2', `2 + 4 ${S}`, `4 ${C}`),
      pt('2', `2 + 4 ${S}`, `4 ${C}`),
      pt('2', `2 + 4 ${S} - 4 ${C2}`, `4 ${C} + 4 ${S2}`),
      pt('-2', `2 + 4 ${S} - 4 ${C2}`, `4 ${C} + 4 ${S2}`)
    ]
  ]
}

const EULER_KINDS: SolidKind[] = ['tetrahedron', 'pyramid', 'cube', 'prism', 'octahedron', 'dodecahedron', 'icosahedron']
const BOX = { a: [3, 4, 2], b: [4, 5, 3], c: [5, 6, 6] }

export const THEOREM_SCENES: Record<string, TheoremScene> = {
  'euler-polyhedron': { slider: 'n', lines: ['T = Cube(4)'] },
  'pythagoras-3d': { slider: 'm', lines: ['T = Cuboid(3, 4, 5)', 'D = (-1.5, -2, 0)', 'E = (1.5, 2, 5)', 'Segment(D, E)'] },
  'archimedes-sphere-cylinder': { slider: 'r', lines: ['S = Sphere(r)', 'T = Cylinder(r, 2 r)'] },
  // The cylinder fills cone by cone: f cones poured are W, f/3 of it.
  'cone-vs-cylinder': { slider: 'f', lines: ['T = Cylinder(2, 4)', 'W = Cylinder(2, max(4 f / 3, 0.01))', 'K = Cone(2, 4)'], at: { K: [6, 0, 0] } },
  // Beside the cylinder, the same four slices of it, each slid along x by s: the stack leans, its volume stays.
  'cavalieri-principle': { slider: 's', lines: ['T = Cylinder(2, 4)', 'U1 = Cylinder(2, 1)', 'U2 = Cylinder(2, 1)', 'U3 = Cylinder(2, 1)', 'U4 = Cylinder(2, 1)'] },
  // The cube stands on the floor with its centre at (0, 0, 2): the slice is x + y + (z − 2) = p.
  'cube-cross-section': { slider: 'p', lines: ['T = Cube(4)', 'P = (p, 0, 2)', 'Q = (p - 1, 1, 2)', 'R = (p - 1, 0, 3)', 'Plane(P, Q, R)'] },
  // The cube's six faces on their hinges: u = 0 is the cube, u = 100 its net flat on the floor.
  'nets-unfold': { slider: 'u', lines: [], faces: cubeNet() },
  // B turns round the z-axis at height 5 and 5 out: the line AB is always at 45° to the floor.
  'line-plane-angle': { slider: 'w', lines: ['A = (0, 0, 0)', 'G = (1, 0, 0)', 'H = (0, 1, 0)', 'Plane(A, G, H)', 'B = (5 cos(w deg), 5 sin(w deg), 5)', 'f = Line(A, B)'] },
  // The plane x + 2y + 2z = 6 through its three crossings with the axes; P = (4, 5, 6), its foot F, and a point Q of the
  // plane going round F (2 from it) as the slider turns, so |PQ| is never shorter than |PF|.
  'point-plane-distance': {
    slider: 'w',
    lines: [
      'G = (6, 0, 0)',
      'H = (0, 3, 0)',
      'J = (0, 0, 3)',
      'Plane(G, H, J)',
      'P = (4, 5, 6)',
      'F = (16/9, 5/9, 14/9)',
      'Segment(P, F)',
      'Q = (16/9 + 4 cos(w deg) / sqrt(5) + 4 sin(w deg) / (3 sqrt(5)), 5/9 - 2 cos(w deg) / sqrt(5) + 8 sin(w deg) / (3 sqrt(5)), 14/9 - 10 sin(w deg) / (3 sqrt(5)))',
      'Segment(P, Q)'
    ]
  },
  'similar-solids-scaling': { slider: 'k', lines: ['T = Cube(2)', 'U = Cube(2 k)'], at: { U: [5, 0, 0] } }
}

/** What the last tile added, taken away when another tile is chosen. */
let last: { id: string; objects: string[] } | null = null

/** The theorem shown now, or null once nothing it drew is left (deleted, a new scene). */
export const shownTheorem = (): string | null => (last && last.objects.some((id) => scene().objects[id]) ? last.id : null)

/** The data's live numbers at the slider's value now. */
export function liveNumbers(t: Theorem3D): { name: string; value: number | string; unit?: string }[] {
  const sc = THEOREM_SCENES[t.id]
  const v = sc ? scene().ev.scope[sc.slider] : undefined
  const at = typeof v === 'number' ? v : t.parameter.default
  return t.quantities.map((q) => ({ name: q.name, value: q.format(at), unit: q.unit }))
}

/** The scene's parts the slider moves that no line can say: Euler's solid, the box of Pythagoras in 3-D. */
export function syncTheorem(t: Theorem3D, value: number): void {
  const s = scene()
  const id = (n: string) => s.ev.names.get(n)
  if (t.id === 'euler-polyhedron') {
    const kind = EULER_KINDS[Math.max(0, Math.min(EULER_KINDS.length - 1, Math.round(value)))]
    const T = id('T')
    if (T && s.objects[T]?.type === 'solid' && (s.objects[T] as { kind: SolidKind }).kind !== kind) s.updateObject(T, (d) => void (d.type === 'solid' && ((d.kind = kind), (d.size = {}))), false)
  }
  if (t.id === 'cavalieri-principle') {
    for (let k = 0; k < 4; k++) {
      const U = id(`U${k + 1}`)
      const at: V3 = [6 + (value * k) / 4, 0, k]
      if (U) s.updateObject(U, (d) => void (d.type === 'solid' && (d.at = at)), false)
    }
  }
  if (t.id === 'pythagoras-3d') {
    const k = Math.max(0, Math.min(2, Math.round(value)))
    const [a, b, c] = [BOX.a[k], BOX.b[k], BOX.c[k]]
    const T = id('T')
    if (T) s.updateObject(T, (d) => void (d.type === 'solid' && (d.size = { l: String(a), w: String(b), h: String(c) })), false)
    const place = (n: string, p: V3) => {
      const pid = id(n)
      if (pid) s.updateObject(pid, (d) => void (d.type === 'point' && d.def.kind === 'free' && (d.def.p = p)), false)
    }
    place('D', [-a / 2, -b / 2, 0])
    place('E', [a / 2, b / 2, c])
  }
}

/** Puts a theorem's scene on the drawing; returns what it added. */
export async function playTheorem(t: Theorem3D): Promise<string[]> {
  const sc = THEOREM_SCENES[t.id]
  if (!sc) return []
  if (last) {
    const still = last.objects.filter((id) => scene().objects[id])
    if (still.length) scene().removeObjects(still)
  }
  const before = new Set(Object.keys(scene().objects))
  const b = new Builder()
  b.number(String(t.parameter.default), { name: sc.slider, slider: { min: t.parameter.min, max: t.parameter.max, step: t.parameter.step } })
  b.commit(false)
  for (const line of sc.lines) await runCommand(line)
  for (const [n, p] of Object.entries(sc.at ?? {})) {
    const id = scene().ev.names.get(n)
    if (id) scene().updateObject(id, (d) => void (d.type === 'solid' && (d.at = p)), false)
  }
  if (sc.faces) {
    const fb = new Builder()
    for (const face of sc.faces) {
      const ids = face.map(([x, y, z]) => fb.point({ kind: 'expr', expr: `(${x}, ${y}, ${z})` }, { visible: false, auxiliary: true }).id)
      fb.polygon(ids)
    }
    fb.commit(false)
  }
  syncTheorem(t, t.parameter.default)
  const added = Object.keys(scene().objects).filter((o) => !before.has(o))
  last = { id: t.id, objects: added }
  scene().select([])
  setTimeout(resetCamera, 300)
  return added
}
