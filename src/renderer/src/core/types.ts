import type { V3 } from '../math/vec'
import type { GCircle, GLine } from '../math/geometry'
import type { LabTable } from '../lab/types'
import type { BodyDef, Link, WorldSettings } from '../sim/types'
import type { Space } from './visibility'
import type { PQQuestion } from '../questions/pqjson'

/** The Sandbox as saved: what the student built, never the live run. */
export interface SandboxFile {
  bodies: BodyDef[]
  links: Link[]
  world: WorldSettings
  sideView: boolean
}

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

/**
 * 'area' shades between y = f(x) and the x-axis for x in [tMin, tMax] (integrals, probabilities).
 * 'piecewise' is one curve made of several formulas, each on its own stretch of x (`pieces`).
 * 'between' shades the region between y = exprs[0] (upper) and y = exprs[1] (lower) for x in [tMin, tMax].
 */
export type GraphKind = 'explicit' | 'implicit' | 'parametric' | 'polar' | 'inequality' | 'surface' | 'area' | 'piecewise' | 'between'

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
  /**
   * A stylesheet colour token (`--lego-new`) this object is drawn in, whichever theme is on;
   * `color` is then only what a reader without the stylesheet falls back to. A colour read once
   * and saved stayed Moonlight Gold's pale mint in the Light theme, where it nearly vanished.
   * Choosing a colour in Properties drops it.
   */
  themed?: string
  /** Free-text caption shown in the outliner. */
  caption?: string
  /** Shown on the drawing and in the Outliner instead of `name`, when the name a student reads (−B, â) is not one the scene can hold. */
  label?: string
  /** The drawing this belongs to (Vectors, Geometry, Graphing, Lab Data). Missing = shown everywhere,
   *  which is what an object made where no drawing is active (the Sandbox, say) gets. */
  space?: Space
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

/**
 * Where a Lego piece came from: a polygon broken apart into its simple shapes. Every piece of
 * one shape shares `sourceId`, and `sourceSignature` (`math/lego.ts` signatureOf) is the shape
 * itself, remembered so the pieces can be recognised as the original once the parent is gone.
 */
export interface LegoRecord {
  sourceId: ObjId
  sourceSignature: string
  pieceIndex: number
  /** The parent's colour, given back to the shape when the pieces fuse into it again. */
  originalColor: string
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
  /** Set on a piece of a shape that was broken apart; absent on an ordinary polygon. */
  lego?: LegoRecord
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
  /** The formulas of a piecewise curve, each with the stretch of x it holds on. */
  pieces?: { expr: string; from: number; to: number }[]
  showRoots?: boolean
  showExtrema?: boolean
  width?: number
}

export interface TextObj extends ObjectBase {
  type: 'text'
  p: V3
  text: string
  /**
   * The object this text describes, when it describes one: deleting that object deletes the text
   * too (`doomedBy`). The shaded region's "area = 4.5" was a free text, and a student who deleted
   * the region was left with the number floating over two bare curves.
   */
  owner?: ObjId
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
  /** The format this file is written in. `core/migrate.ts` lists the formats and steps older ones up. */
  version: 5
  objects: SceneObject[]
  settings: SceneSettings
  /** Lab tables. Optional, so an older file still opens here and a file from here still opens
   *  in an older build. */
  lab?: LabTable[]
  /** The Sandbox scene. Optional for the same reason: a 0.3.3 file has none, and still opens. */
  sandbox?: SandboxFile
  /**
   * The question set a teacher is writing in Question Author (format 5). Optional and left out
   * while empty, so a file with no questions reads exactly as it did in format 4. A question here
   * may be half-written; only its licence and its shape are checked on the way in
   * (`core/migrate.ts`), because Export is where a question must be complete.
   */
  questions?: PQQuestion[]
}

export type LengthUnit = 'unit' | 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft'

/** How the grid is drawn: squared lines, a dot at each crossing, finer squares, squared paper with a tinted page, polar circles and rays, a 60° isometric lattice, or a hexagon tiling. "Off" is `showGrid: false`; a file naming a style this build does not know draws lines (`normaliseGridStyle`). */
export type GridStyle = 'lines' | 'dots' | 'fine' | 'paper' | 'polar' | 'isometric' | 'hex'

export interface SceneSettings {
  angleUnit: 'deg' | 'rad'
  showGrid: boolean
  /** Saved with the drawing, like the unit. A file from before this setting existed draws lines. */
  gridStyle: GridStyle
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
  /** The arcs at a polygon's corners, a vector's angle from the x-axis and the congruence marks.
   *  A viewer preference like the label choices: it follows the person, not the file. Angle
   *  objects a student drew on purpose stay whatever this says. */
  showAngleMarks: boolean
  /** How vectors are written, so PhysLab matches whatever book is in front of the student. */
  vectorNotation: 'arrow' | 'bold' | 'underline'
  componentForm: 'ijk' | 'pair' | 'column' | 'polar'
  directionStyle: 'standard' | 'bearing'
}
