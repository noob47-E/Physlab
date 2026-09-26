// Builder that creates several objects at once with unique names and colours.

import { newId, nextColor, nextName, uniqueName } from './naming'
import { scene } from './store'
import type {
  AngleObj,
  CircleDef,
  CircleObj,
  GraphObj,
  LineDef,
  LineObj,
  NumberObj,
  ObjId,
  ObjType,
  PointDef,
  PointObj,
  PolygonObj,
  RayObj,
  SceneObject,
  SegmentObj,
  TextObj,
  VectorDef,
  VectorObj
} from './types'
import type { V3 } from '../math/vec'

type Common = { name?: string; color?: string; auxiliary?: boolean; visible?: boolean; showLabel?: boolean }

export class Builder {
  readonly created: SceneObject[] = []
  private objects = scene().objects

  private base<T extends ObjType>(type: T, opts: Common) {
    const pool = { ...this.objects }
    for (const o of this.created) pool[o.id] = o
    return {
      id: newId(),
      name: opts.name ? uniqueName(opts.name, pool) : nextName(type, pool),
      color: opts.color ?? nextColor(type, pool),
      visible: opts.visible ?? true,
      locked: false,
      showLabel: opts.showLabel ?? !opts.auxiliary,
      auxiliary: opts.auxiliary,
      // A graph always lives in Graphing, wherever it was asked for; everything else belongs to
      // the drawing the student is looking at.
      space: type === 'graph' ? ('graphing' as const) : (scene().activeSpace ?? undefined)
    }
  }

  private push<T extends SceneObject>(o: T): T {
    this.created.push(o)
    return o
  }

  point(def: PointDef | V3, opts: Common = {}): PointObj {
    const d: PointDef = Array.isArray(def) ? { kind: 'free', p: def } : def
    return this.push({ ...this.base('point', opts), type: 'point', def: d })
  }

  vector(def: VectorDef, opts: Common & { unit?: string; showComponents?: boolean } = {}): VectorObj {
    return this.push({ ...this.base('vector', opts), type: 'vector', def, unit: opts.unit, showComponents: opts.showComponents })
  }

  segment(a: ObjId, b: ObjId, opts: Common = {}): SegmentObj {
    return this.push({ ...this.base('segment', opts), type: 'segment', a, b })
  }

  ray(a: ObjId, b: ObjId, opts: Common = {}): RayObj {
    return this.push({ ...this.base('ray', opts), type: 'ray', a, b })
  }

  line(def: LineDef, opts: Common = {}): LineObj {
    return this.push({ ...this.base('line', opts), type: 'line', def })
  }

  circle(def: CircleDef, opts: Common = {}): CircleObj {
    return this.push({ ...this.base('circle', opts), type: 'circle', def })
  }

  polygon(points: ObjId[], opts: Common & { withSides?: boolean } = {}): PolygonObj {
    const poly = this.push({ ...this.base('polygon', opts), type: 'polygon', points, fill: true, showAngles: points.length === 3 })
    if (opts.withSides) {
      points.forEach((p, i) => this.segment(p, points[(i + 1) % points.length], { color: opts.color ?? poly.color }))
    }
    return poly
  }

  angle(a: ObjId, vertex: ObjId, b: ObjId, opts: Common & { oriented?: boolean } = {}): AngleObj {
    return this.push({ ...this.base('angle', opts), type: 'angle', a, vertex, b, oriented: opts.oriented ?? false })
  }

  number(expr: string, opts: Common & { slider?: NumberObj['slider'] } = {}): NumberObj {
    return this.push({ ...this.base('number', opts), type: 'number', expr, slider: opts.slider })
  }

  graph(g: Omit<GraphObj, 'id' | 'name' | 'color' | 'visible' | 'locked' | 'showLabel' | 'type'>, opts: Common = {}): GraphObj {
    return this.push({ ...this.base('graph', opts), type: 'graph', ...g })
  }

  text(p: V3, text: string, opts: Common = {}): TextObj {
    return this.push({ ...this.base('text', opts), type: 'text', p, text })
  }

  commit(select = true): SceneObject[] {
    if (this.created.length) scene().addObjects(this.created, { select })
    return this.created
  }
}
