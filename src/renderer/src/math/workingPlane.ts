// The 3-D drawing plane: the level plane z = h that clicks land on, and the integer lattice a
// point snaps to. Pure maths, so it is tested without a canvas.

import type { V3 } from './vec'

/** What the 3-D grid shows: the floor only, the floor with the xz and yz walls, or nothing. */
type Grid3DMode = 'floor' | 'walls' | 'off'
export const GRID3D_MODES: { id: Grid3DMode; label: string }[] = [
  { id: 'floor', label: 'Floor' },
  { id: 'walls', label: 'Floor + walls' },
  { id: 'off', label: 'Off' }
]

/** The working plane stays inside the drawn grid. */
const WORK_Z_MIN = -10
const WORK_Z_MAX = 10

/** A mode this build knows, so a file from elsewhere draws the floor. */
export const normaliseGrid3D = (m: unknown): Grid3DMode => (m === 'walls' || m === 'off' ? m : 'floor')

/** A working height: a finite number inside the grid, whole units (the lattice). */
export function clampWorkZ(z: number): number {
  if (!Number.isFinite(z)) return 0
  return Math.min(WORK_Z_MAX, Math.max(WORK_Z_MIN, Math.round(z)))
}

/** Where the ray `origin + t * dir` (t > 0) meets the level plane z = h, or null when it is parallel to it or points away. */
export function rayToLevelPlane(origin: V3, dir: V3, h: number): V3 | null {
  const dz = dir[2]
  if (Math.abs(dz) < 1e-9) return null
  const t = (h - origin[2]) / dz
  if (!(t > 0) || !Number.isFinite(t)) return null
  return [origin[0] + t * dir[0], origin[1] + t * dir[1], h]
}

/** The nearest lattice point of spacing `step` in x, y AND z (a non-positive step leaves the point as it is). */
export function snapLattice(p: V3, step: number): V3 {
  if (!(step > 0)) return [p[0], p[1], p[2]]
  const r = (v: number) => {
    const s = Math.round(v / step) * step
    return s === 0 ? 0 : s // no -0
  }
  return [r(p[0]), r(p[1]), r(p[2])]
}
