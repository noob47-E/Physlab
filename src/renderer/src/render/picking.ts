// Screen-space picking against evaluated geometry (works identically in 2D and 3D).

import type * as THREE from 'three/webgpu'
import { toScreen, type ViewSize } from './cameraUtils'
import type { Computed, EvalResult, ObjId, SceneObject } from '../core/types'
import { add, normalize, scale, type V3 } from '../math/vec'

export type HitPart = 'body' | 'head' | 'tail'

export interface Hit {
  id: ObjId
  part: HitPart
  dist: number
  priority: number
}

/** Sampled world polylines per graph id (written by the graph renderer). */
export const graphPolylines = new Map<ObjId, V3[][]>()

type S2 = { x: number; y: number }

function segDist(p: S2, a: S2, b: S2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  let t = l2 < 1e-9 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function lineDist(p: S2, a: S2, b: S2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const l = Math.hypot(dx, dy)
  if (l < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l
}

function rayDist(p: S2, a: S2, b: S2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = (p.x - a.x) * dx + (p.y - a.y) * dy
  return t < 0 ? Math.hypot(p.x - a.x, p.y - a.y) : lineDist(p, a, b)
}

function insidePolygon(p: S2, pts: S2[]): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface PickContext {
  camera: THREE.Camera
  size: ViewSize
  objects: Record<ObjId, SceneObject>
  order: ObjId[]
  ev: EvalResult
}

export function pickAt(ctx: PickContext, sx: number, sy: number, accept?: (o: SceneObject, c: Computed) => boolean): Hit | null {
  const { camera, size, objects, order, ev } = ctx
  const P = { x: sx, y: sy }
  const scr = (v: V3) => toScreen(camera, size, v)
  let best: Hit | null = null
  const offer = (h: Hit, tol: number) => {
    if (h.dist > tol) return
    if (!best || h.priority < best.priority || (h.priority === best.priority && h.dist < best.dist)) best = h
  }

  for (let idx = order.length - 1; idx >= 0; idx--) {
    const id = order[idx]
    const o = objects[id]
    const c = ev.values.get(id)
    if (!o || !c || !o.visible) continue
    if (accept && !accept(o, c)) continue
    switch (c.type) {
      case 'point': {
        const s = scr(c.p)
        if (s.visible) offer({ id, part: 'body', dist: Math.hypot(s.x - sx, s.y - sy), priority: 0 }, 12)
        break
      }
      case 'text': {
        const s = scr(c.p)
        if (s.visible) offer({ id, part: 'body', dist: Math.hypot(s.x - sx, s.y - sy), priority: 2 }, 24)
        break
      }
      case 'vector': {
        const head = add(c.tail, c.comp)
        const a = scr(c.tail)
        const b = scr(head)
        if (!a.visible || !b.visible) break
        offer({ id, part: 'head', dist: Math.hypot(b.x - sx, b.y - sy), priority: 1 }, 14)
        offer({ id, part: 'tail', dist: Math.hypot(a.x - sx, a.y - sy), priority: 2 }, 10)
        offer({ id, part: 'body', dist: segDist(P, a, b), priority: 3 }, 8)
        break
      }
      case 'angle': {
        const v = scr(c.vertex)
        const d = Math.hypot(v.x - sx, v.y - sy)
        offer({ id, part: 'body', dist: Math.abs(d - 32), priority: 4 }, 12)
        break
      }
      case 'segment':
      case 'ray':
      case 'line': {
        const a = scr(c.line.p)
        const b = scr(add(c.line.p, c.type === 'line' || c.type === 'ray' ? scale(normalize(c.line.d), Math.max(1, Math.hypot(...c.line.d))) : c.line.d))
        const d = c.type === 'segment' ? segDist(P, a, b) : c.type === 'ray' ? rayDist(P, a, b) : lineDist(P, a, b)
        offer({ id, part: 'body', dist: d, priority: 5 }, 8)
        break
      }
      case 'circle': {
        let min = Infinity
        let prev: S2 | null = null
        for (let i = 0; i <= 64; i++) {
          const t = (i / 64) * Math.PI * 2
          const s = scr([c.circle.c[0] + c.circle.r * Math.cos(t), c.circle.c[1] + c.circle.r * Math.sin(t), c.circle.c[2]])
          if (prev) min = Math.min(min, segDist(P, prev, s))
          prev = s
        }
        offer({ id, part: 'body', dist: min, priority: 6 }, 8)
        break
      }
      case 'graph': {
        const polys = graphPolylines.get(id)
        if (!polys) break
        let min = Infinity
        for (const poly of polys) {
          let prev: S2 | null = null
          const stride = Math.max(1, Math.floor(poly.length / 600))
          for (let i = 0; i < poly.length; i += stride) {
            const s = scr(poly[i])
            if (prev) min = Math.min(min, segDist(P, prev, s))
            prev = s
          }
        }
        offer({ id, part: 'body', dist: min, priority: 7 }, 8)
        break
      }
      case 'polygon': {
        const pts = c.pts.map(scr)
        if (pts.length >= 3 && insidePolygon(P, pts)) offer({ id, part: 'body', dist: 0, priority: 8 }, 1)
        break
      }
    }
  }
  return best
}
