// Dependency-graph evaluation: turns object definitions into concrete geometry.
// Re-run on every change; objects whose parents are missing or invalid get an error.

import type { MathNode } from 'mathjs'
import {
  angleAt,
  angleBisector,
  circleFrom3,
  orientedAngleAt,
  perpendicularBisector,
  tangentPointsFromPoint,
  triangleInfo,
  type GCircle,
  type GLine
} from '../math/geometry'
import { asGLine, canIntersect, intersectionsOf } from '../math/intersections'
import { math, preprocess, symbolsOf, toV3, fromRadians, setAngleMode, setSceneNames, sceneNames, speltName } from '../math/expr'
import { evaluateWithRealRoots } from '../calc/engine'
import { add, dist, mid, scale, sub, type V3 } from '../math/vec'
import type { Computed, EvalResult, ObjId, SceneObject, SceneSettings } from './types'
import { planeThrough, solidShape } from '../math/solidShape'

// The viewport's snapping reads a line the same way the evaluator does; one definition keeps them agreeing.
export { asGLine }

interface ParsedExpr {
  node: MathNode
  compiled: { evaluate: (scope?: Record<string, unknown>) => unknown }
  symbols: string[]
  /** A power whose exponent is not a whole-number literal, or a cube or n-th root: an odd root of a negative number may stand in it. */
  mayHaveOddRoot: boolean
}

/** Whether a formula can hold an odd root at all; every other formula keeps its compiled form, which is evaluated on every drag. */
const mayHaveOddRoot = (node: MathNode): boolean =>
  node.filter((n) => {
    const m = n as MathNode & { op?: string; args?: MathNode[]; fn?: { name?: string } }
    if (n.type === 'OperatorNode' && m.op === '^' && m.args?.length === 2) {
      const e = m.args[1] as MathNode & { value?: unknown }
      return !(e.type === 'ConstantNode' && Number.isInteger(e.value))
    }
    return n.type === 'FunctionNode' && (m.fn?.name === 'cbrt' || m.fn?.name === 'nthRoot')
  }).length > 0

const exprCache = new Map<string, ParsedExpr>()

function parseExpr(src: string): ParsedExpr {
  let hit = exprCache.get(src)
  if (!hit) {
    // A scene object's own line reads the scene's names: b = p(1 + r) multiplies by the slider p.
    const node = math.parse(preprocess(src, sceneNames()))
    hit = { node, compiled: node.compile(), symbols: symbolsOf(node), mayHaveOddRoot: mayHaveOddRoot(node) }
    if (exprCache.size > 2000) exprCache.clear()
    exprCache.set(src, hit)
  }
  return hit
}

class Pending extends Error {}

export function evaluateScene(
  objects: Record<ObjId, SceneObject>,
  order: ObjId[],
  settings: Pick<SceneSettings, 'angleUnit'>,
  time: number
): EvalResult {
  setAngleMode(settings.angleUnit)
  // What this scene's names stand for before a bracket, for the routes that read its lines (math/expr.ts
  // sceneNames): a graph is called, f(2); a value — the kinds publish() below puts in the scope — multiplies,
  // p(1 + r). Recorded at every evaluation, so File New, Open, undo and redo leave exactly this scene's names.
  const named = order.map((id) => objects[id]).filter((o): o is SceneObject => !!o)
  // A line parsed under the old names would keep its old reading in the cache.
  if (setSceneNames({ values: named.filter((o) => ['point', 'vector', 'number', 'segment', 'circle', 'angle'].includes(o.type)).flatMap((o) => [o.name, speltName(o.name)]), functions: named.filter((o) => o.type === 'graph').map((o) => o.name) })) exprCache.clear()
  const values = new Map<ObjId, Computed>()
  const errors = new Map<ObjId, string>()
  const names = new Map<string, ObjId>()
  for (const id of order) {
    const o = objects[id]
    if (o) names.set(o.name, id)
  }

  const scope: Record<string, unknown> = { t: time }
  if (!names.has('i')) scope.i = [1, 0, 0]
  if (!names.has('j')) scope.j = [0, 1, 0]
  if (!names.has('k')) scope.k = [0, 0, 1]

  const need = (id: ObjId): Computed => {
    const v = values.get(id)
    if (v) return v
    if (errors.has(id) || !objects[id]) throw new Error('depends on an undefined object')
    throw new Pending()
  }
  const needPoint = (id: ObjId): V3 => {
    const v = need(id)
    if (v.type === 'point') return v.p
    if (v.type === 'vector') return add(v.tail, v.comp)
    throw new Error(`${objects[id]?.name} is not a point`)
  }
  const needLine = (id: ObjId): GLine => {
    const l = asGLine(need(id))
    if (l) return l
    throw new Error(`${objects[id]?.name} is not a line`)
  }
  const needCircle = (id: ObjId): GCircle => {
    const v = need(id)
    if (v.type === 'circle') return v.circle
    throw new Error(`${objects[id]?.name} is not a circle`)
  }
  const evalExpr = (src: string): unknown => {
    const parsed = parseExpr(src)
    for (const s of parsed.symbols) {
      const pid = names.get(s)
      if (pid && !(s in scope)) {
        if (errors.has(pid)) throw new Error(`${s} is undefined`)
        throw new Pending()
      }
    }
    // An odd root of a negative number is the real root, (−8)^(1/3) = −2, as on the Calculator and
    // the bar (owner, 2026-10-08): the principal value made a number such as n = (−8)^(1/3) "not a number".
    return parsed.mayHaveOddRoot ? evaluateWithRealRoots(parsed.node, { ...scope }).value : parsed.compiled.evaluate({ ...scope })
  }
  const evalNumber = (src: string): number => {
    const r = evalExpr(src)
    const n = typeof r === 'number' ? r : Number((r as { toNumber?: () => number })?.toNumber?.() ?? r)
    if (!Number.isFinite(n)) throw new Error('not a number')
    return n
  }

  const compute = (o: SceneObject): Computed => {
    switch (o.type) {
      case 'point': {
        const d = o.def
        switch (d.kind) {
          case 'free':
            return { type: 'point', p: d.p }
          case 'expr':
            return { type: 'point', p: toV3(evalExpr(d.expr)) }
          case 'midpoint':
            return { type: 'point', p: mid(needPoint(d.a), needPoint(d.b)) }
          case 'onObject': {
            const host = need(d.on)
            if (host.type === 'circle') {
              const a = d.t * 2 * Math.PI
              return { type: 'point', p: add(host.circle.c, [host.circle.r * Math.cos(a), host.circle.r * Math.sin(a), 0]) }
            }
            if (host.type !== 'segment' && host.type !== 'ray' && host.type !== 'line') throw new Error('not something a point can sit on')
            return { type: 'point', p: add(host.line.p, scale(host.line.d, d.t)) }
          }
          case 'vectorHead': {
            const v = need(d.vector)
            if (v.type !== 'vector') throw new Error('not a vector')
            return { type: 'point', p: add(v.tail, v.comp) }
          }
          case 'center':
            return { type: 'point', p: needCircle(d.circle).c }
          case 'triangleCenter': {
            const poly = need(d.poly)
            if (poly.type !== 'polygon' || poly.pts.length !== 3) throw new Error('needs a triangle')
            const info = triangleInfo(poly.pts[0], poly.pts[1], poly.pts[2])
            const p = d.which === 'centroid' ? info.centroid : d.which === 'incenter' ? info.incenter : d.which === 'circumcenter' ? info.circumcenter : info.orthocenter
            if (!p) throw new Error('undefined for a degenerate triangle')
            return { type: 'point', p }
          }
          case 'intersection': {
            const a = need(d.a)
            const b = need(d.b)
            if (!canIntersect(a, b)) throw new Error('cannot intersect these objects')
            // The same function, in the same order, that the viewport snapped the point with.
            const p = intersectionsOf(a, b)[d.index]
            if (!p) throw new Error('no intersection')
            return { type: 'point', p }
          }
        }
        break
      }
      case 'vector': {
        const d = o.def
        switch (d.kind) {
          case 'free':
            return { type: 'vector', tail: d.tail, comp: d.comp }
          case 'points': {
            const a = needPoint(d.a)
            return { type: 'vector', tail: a, comp: sub(needPoint(d.b), a) }
          }
          case 'expr': {
            const comp = toV3(evalExpr(d.expr))
            let tail: V3 = [0, 0, 0]
            if (d.tailOf) {
              const tv = need(d.tailOf)
              if (tv.type === 'vector') tail = tv.tail
            } else if (typeof d.tail === 'string') tail = needPoint(d.tail)
            else if (d.tail) tail = d.tail
            return { type: 'vector', tail, comp }
          }
          case 'placed': {
            const v = need(d.vector)
            if (v.type !== 'vector') throw new Error('not a vector')
            const tail = typeof d.tail === 'string' ? needPoint(d.tail) : d.tail
            return { type: 'vector', tail, comp: v.comp }
          }
        }
        break
      }
      case 'segment': {
        const a = needPoint(o.a)
        return { type: 'segment', line: { kind: 'segment', p: a, d: sub(needPoint(o.b), a) } }
      }
      case 'ray': {
        const a = needPoint(o.a)
        return { type: 'ray', line: { kind: 'ray', p: a, d: sub(needPoint(o.b), a) } }
      }
      case 'line': {
        const d = o.def
        switch (d.kind) {
          case 'twoPoints': {
            const a = needPoint(d.a)
            return { type: 'line', line: { kind: 'line', p: a, d: sub(needPoint(d.b), a) } }
          }
          case 'perpendicular': {
            const l = needLine(d.line)
            // A line along z has no perpendicular in the xy-plane; any horizontal direction is one.
            // eslint-disable-next-line no-restricted-syntax -- parked for the owner (OWNER-APPROVALS CW9-N2-3): absolute, and a typed vector reaches it, so the perpendicular to <3e-19, 4e-19> comes out level
            const flat = Math.abs(l.d[0]) > 1e-12 || Math.abs(l.d[1]) > 1e-12
            return { type: 'line', line: { kind: 'line', p: needPoint(d.through), d: flat ? [-l.d[1], l.d[0], 0] : [1, 0, 0] } }
          }
          case 'parallel': {
            const l = needLine(d.line)
            return { type: 'line', line: { kind: 'line', p: needPoint(d.through), d: l.d } }
          }
          case 'perpBisector':
            return { type: 'line', line: perpendicularBisector(needPoint(d.a), needPoint(d.b)) }
          case 'angleBisector':
            return { type: 'line', line: angleBisector(needPoint(d.a), needPoint(d.vertex), needPoint(d.b)) }
          case 'tangent': {
            const p = needPoint(d.point)
            const c = needCircle(d.circle)
            const tps = tangentPointsFromPoint(p, c)
            const tp = tps[d.index]
            if (!tp) throw new Error('no tangent from inside the circle')
            if (dist(tp, p) < 1e-9) {
              const r = sub(p, c.c)
              return { type: 'line', line: { kind: 'line', p, d: [-r[1], r[0], 0] } }
            }
            return { type: 'line', line: { kind: 'line', p, d: sub(tp, p) } }
          }
        }
        break
      }
      case 'circle': {
        const d = o.def
        switch (d.kind) {
          case 'centerPoint': {
            const c = needPoint(d.c)
            return { type: 'circle', circle: { c, r: dist(c, needPoint(d.p)) } }
          }
          case 'centerRadius': {
            const r = evalNumber(d.r)
            if (r < 0) throw new Error('radius must be positive')
            return { type: 'circle', circle: { c: needPoint(d.c), r } }
          }
          case 'threePoints': {
            const c = circleFrom3(needPoint(d.a), needPoint(d.b), needPoint(d.c))
            if (!c) throw new Error('the three points are collinear')
            return { type: 'circle', circle: c }
          }
        }
        break
      }
      case 'polygon':
        return { type: 'polygon', pts: o.points.map(needPoint) }
      case 'angle': {
        const a = needPoint(o.a)
        const v = needPoint(o.vertex)
        const b = needPoint(o.b)
        return { type: 'angle', a, vertex: v, b, value: o.oriented ? orientedAngleAt(a, v, b) : angleAt(a, v, b) }
      }
      case 'number': {
        if (o.slider && o.animate) {
          const { min, max } = o.slider
          const phase = 0.5 - 0.5 * Math.cos(time * 0.8)
          return { type: 'number', value: min + (max - min) * phase }
        }
        return { type: 'number', value: evalNumber(o.expr) }
      }
      case 'graph':
        return { type: 'graph' }
      case 'text':
        return { type: 'text', p: o.p }
      case 'solid': {
        // 3D-3B: each size is a formula (a typed 4, a slider); math/solidShape.ts refuses one that is not above 0, in words.
        const size: Record<string, number> = {}
        for (const [k, src] of Object.entries(o.size)) size[k] = evalNumber(src)
        return { type: 'solid', kind: o.kind, shape: solidShape(o.kind, size, o.at, o.pts ? { pts: o.pts, apex: o.apex } : undefined), size }
      }
      case 'plane': {
        const pts: [V3, V3, V3] = [needPoint(o.def.a), needPoint(o.def.b), needPoint(o.def.c)]
        const p = planeThrough(...pts)
        if (!p) throw new Error('the three points lie on one line: they make no plane')
        return { type: 'plane', n: p.n, d: p.d, pts }
      }
    }
    throw new Error('unknown definition')
  }

  const publish = (o: SceneObject, c: Computed) => {
    values.set(o.id, c)
    switch (c.type) {
      case 'point':
        scope[o.name] = [...c.p]
        break
      case 'vector':
        scope[o.name] = [...c.comp]
        break
      case 'number':
        scope[o.name] = c.value
        break
      case 'segment':
        scope[o.name] = Math.hypot(...c.line.d)
        break
      case 'circle':
        scope[o.name] = c.circle.r
        break
      case 'angle':
        scope[o.name] = fromRadians(c.value)
        break
    }
    // A formula reads θ as theta (math/expr.ts preprocess), so a slider named θ is published under that
    // spelling too: 2θ was "I don't know theta" right after θ = 30 (P-PARSE W2).
    const spelt = speltName(o.name)
    if (spelt !== o.name && Object.prototype.hasOwnProperty.call(scope, o.name) && !Object.prototype.hasOwnProperty.call(scope, spelt)) scope[spelt] = scope[o.name]
  }

  let pending = order.filter((id) => objects[id])
  // One pass resolves at least one level of dependencies, so the chain can never need more
  // passes than there are objects.
  const maxPasses = pending.length + 1
  for (let pass = 0; pass < maxPasses && pending.length; pass++) {
    const next: ObjId[] = []
    for (const id of pending) {
      const o = objects[id]
      try {
        publish(o, compute(o))
      } catch (e) {
        if (e instanceof Pending) next.push(id)
        else errors.set(id, e instanceof Error ? e.message : String(e))
      }
    }
    if (next.length === pending.length) {
      for (const id of next) errors.set(id, stuckMessage(id, next, objects))
      break
    }
    pending = next
  }

  return { values, errors, scope, names }
}

/** Plain explanation of why an object could not be worked out. */
function stuckMessage(id: ObjId, stuck: ObjId[], objects: Record<ObjId, SceneObject>): string {
  const name = (x: ObjId) => objects[x]?.name ?? x
  // Objects this one needs, both by reference and by name inside a formula.
  const usedNames = new Set(exprRefs(objects[id]).flatMap((e) => e.match(/[A-Za-zͰ-Ͽ][\w']*/g) ?? []))
  // "a = a + 1", or a midpoint of itself: the loop has one member, so the sentence below would
  // have nobody to name and the student used to get the vague fallback instead.
  if (parentRefs(objects[id]).includes(id) || usedNames.has(name(id))) {
    return `${name(id)} needs itself. This is a loop — give it a value that does not depend on it.`
  }
  const others = [
    ...parentRefs(objects[id]),
    ...stuck.filter((p) => usedNames.has(objects[p]?.name ?? ''))
  ].filter((p, i, arr) => p !== id && stuck.includes(p) && arr.indexOf(p) === i)
  if (others.length) {
    // "b, which in turn needs a" for one, "b and c, which in turn need a" for more.
    return `${name(id)} needs ${others.map(name).join(' and ')}, which in turn ${others.length === 1 ? 'needs' : 'need'} ${name(id)}. This is a loop — make one of them independent.`
  }
  const missing = parentRefs(objects[id]).filter((p) => !objects[p])
  if (missing.length) return `${name(id)} refers to something that no longer exists.`
  return `${name(id)} cannot be worked out yet: one of the things it depends on is missing or forms a loop.`
}

/** Parent id → the ids that use it directly, by reference or by name inside a formula. */
export function directDependents(objects: Record<ObjId, SceneObject>): Map<ObjId, Set<ObjId>> {
  const direct = new Map<ObjId, Set<ObjId>>()
  const byName = new Map(Object.values(objects).map((o) => [o.name, o.id]))
  const link = (parent: ObjId | undefined, child: ObjId) => {
    if (!parent) return
    if (!direct.has(parent)) direct.set(parent, new Set())
    direct.get(parent)!.add(child)
  }
  const linkExpr = (src: string, child: ObjId) => {
    try {
      for (const s of parseExpr(src).symbols) link(byName.get(s), child)
    } catch {
      /* unparsable expressions have no dependencies */
    }
  }
  for (const o of Object.values(objects)) {
    for (const ref of parentRefs(o)) link(ref, o.id)
    for (const e of exprRefs(o)) linkExpr(e, o.id)
  }
  return direct
}

/** Ids of objects that (directly or indirectly) depend on `id`. */
export function dependentsOf(id: ObjId, objects: Record<ObjId, SceneObject>): Set<ObjId> {
  const direct = directDependents(objects)
  const out = new Set<ObjId>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of direct.get(cur) ?? []) {
      if (!out.has(c)) {
        out.add(c)
        stack.push(c)
      }
    }
  }
  return out
}

export function parentRefs(o: SceneObject): ObjId[] {
  switch (o.type) {
    case 'point': {
      const d = o.def
      if (d.kind === 'midpoint' || d.kind === 'intersection') return [d.a, d.b]
      if (d.kind === 'onObject') return [d.on]
      if (d.kind === 'vectorHead') return [d.vector]
      if (d.kind === 'center') return [d.circle]
      if (d.kind === 'triangleCenter') return [d.poly]
      return []
    }
    case 'vector': {
      const d = o.def
      if (d.kind === 'points') return [d.a, d.b]
      if (d.kind === 'placed') return typeof d.tail === 'string' ? [d.vector, d.tail] : [d.vector]
      if (d.kind === 'expr') return [...(typeof d.tail === 'string' ? [d.tail] : []), ...(d.tailOf ? [d.tailOf] : [])]
      return []
    }
    case 'segment':
    case 'ray':
      return [o.a, o.b]
    case 'line': {
      const d = o.def
      if (d.kind === 'twoPoints' || d.kind === 'perpBisector') return [d.a, d.b]
      if (d.kind === 'perpendicular' || d.kind === 'parallel') return [d.through, d.line]
      if (d.kind === 'angleBisector') return [d.a, d.vertex, d.b]
      return [d.point, d.circle]
    }
    case 'circle': {
      const d = o.def
      if (d.kind === 'centerPoint') return [d.c, d.p]
      if (d.kind === 'centerRadius') return [d.c]
      return [d.a, d.b, d.c]
    }
    case 'polygon':
      return o.points
    case 'angle':
      return [o.a, o.vertex, o.b]
    case 'plane':
      return [o.def.a, o.def.b, o.def.c]
    default:
      return []
  }
}

export function exprRefs(o: SceneObject): string[] {
  if (o.type === 'point' && o.def.kind === 'expr') return [o.def.expr]
  if (o.type === 'vector' && o.def.kind === 'expr') return [o.def.expr]
  if (o.type === 'circle' && o.def.kind === 'centerRadius') return [o.def.r]
  if (o.type === 'number') return [o.expr]
  if (o.type === 'graph') return o.exprs
  if (o.type === 'solid') return Object.values(o.size)
  return []
}

/** A free object can be dragged directly. */
export function isFree(o: SceneObject): boolean {
  if (o.type === 'point') return o.def.kind === 'free'
  if (o.type === 'vector') return o.def.kind === 'free'
  if (o.type === 'text') return true
  return false
}
