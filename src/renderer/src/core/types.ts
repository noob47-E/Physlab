import type { V3 } from '../math/vec'
import type { GCircle, GLine } from '../math/geometry'

export type ObjId = string

/**
 * How an object is defined. Free objects hold their own data; dependent objects
 * reference parents by id (structural) or by name inside an expression.
 */
export type PointDef =
  | { kind: 'free'; p: V3 }
  | { kind: 'expr'; expr: string }
  | { kind: 'midpoint'; a: ObjId; b: ObjId }
  /** Sits on a segment/ray/line at fraction t of its direction, and slides along it when dragged. */
  | { kind: 'onObject'; on: ObjId; t: number }
  | { kind: 'intersection'; a: ObjId; b: ObjId; index: number }
  | { kind: 'vectorHead'; vector: ObjId }
  | { kind: 'center'; circle: ObjId }
  | { kind: 'triangleCenter'; poly: ObjId; which: 'centroid' | 'circumcenter' | 'incenter' | 'orthocenter' }

export type VectorDef =
  | { kind: 'free'; tail: V3; comp: V3 }
  | { kind: 'points'; a: ObjId; b: ObjId }
  /** tail: a fixed point, a point object, or (tailOf) the tail of another vector. */
  | { kind: 'expr'; expr: string; tail?: V3 | ObjId; tailOf?: ObjId }
  /** Positions a copy of another vector at a tail point (for head-to-tail drawings). */
  | { kind: 'placed'; vector: ObjId; tail: ObjId | V3 }

export type LineDef =
  | { kind: 'twoPoints'; a: ObjId; b: ObjId }
  | { kind: 'perpendicular'; through: ObjId; line: ObjId }
  | { kind: 'parallel'; through: ObjId; line: ObjId }
  | { kind: 'perpBisector'; a: ObjId; b: ObjId }
  | { kind: 'angleBisector'; a: ObjId; vertex: ObjId; b: ObjId }
  | { kind: 'tangent'; point: ObjId; circle: ObjId; index: number }

export type CircleDef =
  | { kind: 'centerPoint'; c: ObjId; p: ObjId }
  | { kind: 'centerRadius'; c: ObjId; r: string }
  | { kind: 'threePoints'; a: ObjId; b: ObjId; c: ObjId }

/** 'area' shades between y = f(x) and the x-axis for x in [tMin, tMax] (integrals, probabilities). */
export type GraphKind = 'explicit' | 'implicit' | 'parametric' | 'polar' | 'inequality' | 'surface' | 'area'

export interface ObjectBase {
  id: ObjId
  name: string
  visible: boolean
  locked: boolean
  color: string
  showLabel: boolean
  /** What the viewport label shows. */
  labelMode?: 'name' | 'value' | 'nameValue'
  /** Overrides the global label setting: 'always' pins the label on the drawing, 'never' hides it. */
  labelPin?: 'always' | 'never'
  /** Hidden helper objects (e.g. auxiliary points) are not listed prominently. */
  auxiliary?: boolean
  /** Free-text caption shown in the outliner. */
  caption?: string
}

export interface PointObj extends ObjectBase {
  type: 'point'
  def: PointDef
  size?: number
}

export interface VectorObj extends ObjectBase {
  type: 'vector'
  def: VectorDef
  showComponents?: boolean
  showAngle?: boolean
  unit?: string
}

export interface SegmentObj extends ObjectBase {
  type: 'segment'
  a: ObjId
  b: ObjId
}

export interface RayObj extends ObjectBase {
  type: 'ray'
  a: ObjId
  b: ObjId
}

export interface LineObj extends ObjectBase {
  type: 'line'
  def: LineDef
}

export interface CircleObj extends ObjectBase {
  type: 'circle'
  def: CircleDef
  fill?: boolean
}

export interface PolygonObj extends ObjectBase {
  type: 'polygon'
  points: ObjId[]
  fill: boolean
  showAngles?: boolean
  /** Show as simple component shapes with gap lines. */
  decomposed?: boolean
  /** Which shapes the split may use: 'basic' = rectangles and triangles only. */
  decomposeGoal?: 'basic' | 'formula'
  /** Which of the possible splits to show ("Other way" cycles it). */
  decomposeIndex?: number
}

export interface AngleObj extends ObjectBase {
  type: 'angle'
  a: ObjId
  vertex: ObjId
  b: ObjId
  /** Reflex (oriented, 0..360°) or interior (0..180°). */
  oriented: boolean
}

export interface NumberObj extends ObjectBase {
  type: 'number'
  expr: string
  slider?: { min: number; max: number; step: number }
  /** Animates the slider back and forth when the timeline plays. */
  animate?: boolean
}

export interface GraphObj extends ObjectBase {
  type: 'graph'
  kind: GraphKind
  /** User-facing source text, e.g. "y = sin(x)". */
  source: string
  /** Main expression(s), e.g. f(x), F(x,y), [x(t), y(t)], r(θ), z(x,y). */
  exprs: string[]
  /** Parameter range for parametric/polar. */
  tMin?: number
  tMax?: number
  /** Inequality operator. */
  op?: '<' | '<=' | '>' | '>='
  showRoots?: boolean
  showExtrema?: boolean
  width?: number
}

export interface TextObj extends ObjectBase {
  type: 'text'
  p: V3
  text: string
}

export type SceneObject =
  | PointObj
  | VectorObj
  | SegmentObj
  | RayObj
  | LineObj
  | CircleObj
  | PolygonObj
  | AngleObj
  | NumberObj
  | GraphObj
  | TextObj

export type ObjType = SceneObject['type']

/** Evaluated (computed) values, recomputed whenever the scene changes. */
export type Computed =
  | { type: 'point'; p: V3 }
  | { type: 'vector'; tail: V3; comp: V3 }
  | { type: 'segment'; line: GLine }
  | { type: 'ray'; line: GLine }
  | { type: 'line'; line: GLine }
  | { type: 'circle'; circle: GCircle }
  | { type: 'polygon'; pts: V3[] }
  | { type: 'angle'; a: V3; vertex: V3; b: V3; value: number }
  | { type: 'number'; value: number }
  | { type: 'graph' }
  | { type: 'text'; p: V3 }

export interface EvalResult {
  values: Map<ObjId, Computed>
  errors: Map<ObjId, string>
  /** Name → numeric value / [x,y,z] array, for expressions and graphs. */
  scope: Record<string, unknown>
  /** Name → object id. */
  names: Map<string, ObjId>
}

export type ViewMode = '2d' | '3d'

export type ToolId =
  | 'select'
  | 'point'
  | 'vector'
  | 'segment'
  | 'line'
  | 'ray'
  | 'circle'
  | 'polygon'
  | 'triangle'
  | 'angle'
  | 'midpoint'
  | 'perpendicular'
  | 'parallel'
  | 'perpBisector'
  | 'angleBisector'
  | 'intersect'
  | 'distance'
  | 'text'
  | 'sketch'
  | 'delete'

export interface SceneFile {
  app: 'PhysLab'
  version: 1
  objects: SceneObject[]
  settings: SceneSettings
}

export type LengthUnit = 'unit' | 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft'

export interface SceneSettings {
  angleUnit: 'deg' | 'rad'
  showGrid: boolean
  showAxes: boolean
  snap: boolean
  /** Digits: decimal places ('dp') or significant figures ('sf'). */
  decimals: number
  precisionMode: 'dp' | 'sf'
  /** One grid square equals `unitPerSquare` of `unit`. */
  unit: LengthUnit
  unitPerSquare: number
  /** When labels appear: all the time, only while pointed at (or selected), or never (side panel only). */
  labelShow: 'always' | 'hover' | 'never'
  /** What a label contains. */
  measureLabels: 'name' | 'measure' | 'full'
  /** Keep point letters (A, B, C…) on the drawing even when other labels are hidden. */
  pointLetters: boolean
  /** How vectors are written, so PhysLab matches whatever book is in front of the student. */
  vectorNotation: 'arrow' | 'bold' | 'underline'
  componentForm: 'ijk' | 'pair' | 'column' | 'polar'
  directionStyle: 'standard' | 'bearing'
}
