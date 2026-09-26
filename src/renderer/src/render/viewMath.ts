// The pixel decisions of the object views, kept pure so they can be tested without a canvas:
// how big an arrow head is at this zoom, how big a point is drawn, and where a point's letter
// goes so it does not sit on the point or on a neighbour.

// ---------------------------------------------------------------------------
// Arrow heads
// ---------------------------------------------------------------------------

/** How a flat 2-D arrow head is drawn: a fixed 12 px length and a 25° half-angle at every zoom. */
export const HEAD_PX = 12
export const HEAD_HALF_ANGLE_DEG = 25

/**
 * How far the selection halo's tip reaches past the arrow's, in pixels. The halo is 2.2 px
 * thicker than the arrow, 1.1 px a side; the two heads share a tip and a 25° half-angle, so
 * along the slanted edges the outline would be no wider than zero. Moving the halo's tip on
 * by 1.1 / sin 25° puts its edges 1.1 px outside the head's as well.
 */
export const HALO_TIP_PX = 1.1 / Math.sin((HEAD_HALF_ANGLE_DEG * Math.PI) / 180)

export interface ArrowHead {
  /** Head length along the arrow, in world units. */
  headLen: number
  /** Half the width of the head's base, in world units. */
  halfWidth: number
  /** What is left for the shaft, in world units; never quite zero so the mesh keeps a scale. */
  shaftLen: number
}

/**
 * The head of an arrow of world length `L` when one pixel is `wpp` world units. The head is
 * `headPx` pixels long whatever the zoom, except on a very short arrow, where it gives up
 * most of the length to the shaft (a 10 px arrow drawn as one 12 px head reads as a blob).
 */
export function arrowHead(L: number, wpp: number, headPx = HEAD_PX, halfAngleDeg = HEAD_HALF_ANGLE_DEG): ArrowHead {
  const headLen = Math.min(headPx * wpp, L * 0.45)
  return { headLen, halfWidth: headLen * Math.tan((halfAngleDeg * Math.PI) / 180), shaftLen: Math.max(L - headLen, 1e-6) }
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

/** A free point's radius and a derived point's, in pixels; 0.6.0 drew them at 5 and 4. */
export const POINT_PX = { free: 3.4, derived: 2.7 }

/** The drawn radius of a point: its own size if it has one, else a free point is a touch larger. */
export function pointRadius(size: number | undefined, free: boolean, hovered: boolean): number {
  return (size ?? (free ? POINT_PX.free : POINT_PX.derived)) + (hovered ? 0.8 : 0)
}

/**
 * The halo behind a point, in the canvas colour, so it reads over a line: in proportion, but
 * never a ring thinner than a pixel, which anti-aliasing swallows (a derived point's 2.7 px dot
 * had a 0.86 px halo and vanished on a 2.2 px line).
 */
export const pointHalo = (r: number): number => Math.max(r * 1.32, r + 1)

/**
 * How far from a point's centre a click or a finger still picks it, in pixels: a 44 px target
 * (22 each side) for a touch screen, whatever size the dot is drawn at. Snapping keeps its own,
 * tighter radius in Interaction.tsx, so a new point does not leap onto one 20 px away.
 */
export const POINT_REACH_PX = 22

// ---------------------------------------------------------------------------
// Where a point's label goes
// ---------------------------------------------------------------------------

export interface Px {
  x: number
  y: number
}

/** A label's offset from its point, in screen pixels, to the label's centre. */
export interface LabelOffset {
  dx: number
  dy: number
}

/** The nominal size of a one-letter chip; the real box is measured later by the label layer. */
export const LABEL_BOX = { w: 24, h: 22 }

/** How far the label's box stays from the edge of the point, in pixels. */
const LABEL_GAP = 2

/**
 * The eight places a label may sit, best first: up-right is the textbook position, the other
 * corners keep the label clear of the point by its height alone (which is safe whatever the
 * label turns out to be), and the four sides are the last resort.
 */
const SLOTS: [number, number][] = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0]
]

/**
 * The offset for a point's label: the first of the eight slots whose box covers neither the
 * point (radius `r` px) nor any neighbouring point, or the one that clears the most when all of
 * them are crowded. Screen y grows downwards, so "up" is a negative dy.
 */
export function pickLabelOffset(point: Px & { r: number }, neighbours: Px[], box = LABEL_BOX): LabelOffset {
  const reach = point.r + LABEL_GAP
  let best: LabelOffset | null = null
  let bestScore = -Infinity
  for (const [sx, sy] of SLOTS) {
    // A corner slot puts the box's near corner just past the point; a side slot centres it.
    const dx = sx * (box.w / 2 + (sy === 0 ? reach : reach * 0.6))
    const dy = sy * (box.h / 2 + (sx === 0 ? reach : reach * 0.6))
    const left = point.x + dx - box.w / 2
    const top = point.y + dy - box.h / 2
    // How far every point (its own disc included) stays outside the box; negative means overlap.
    let clear = Infinity
    for (const n of [point, ...neighbours]) {
      const cx = Math.max(left, Math.min(n.x, left + box.w))
      const cy = Math.max(top, Math.min(n.y, top + box.h))
      clear = Math.min(clear, Math.hypot(n.x - cx, n.y - cy) - point.r)
    }
    if (clear >= 0) return { dx, dy }
    if (clear > bestScore) {
      bestScore = clear
      best = { dx, dy }
    }
  }
  return best ?? { dx: 0, dy: 0 }
}

// ---------------------------------------------------------------------------
// Turning the 3-D view
// ---------------------------------------------------------------------------
//
// The maths drawing stands with z up. The camera sits on a sphere round the point it looks at
// (the target); turning moves it round that sphere. One rule for every way of turning — a drag,
// the arrow keys, the buttons over the drawing: the drawing follows the direction you give it, the
// way it follows your hand when you drag it. "Turn left" sweeps the near side of the drawing to
// the left, which means the camera itself walks to the right round the target.

export type Vec3 = readonly [number, number, number]

/** Where the 3-D view opens and where Home puts it back. */
export const HOME_3D: { position: Vec3; target: Vec3 } = { position: [9, -12, 9], target: [0, 0, 0] }

/** One press of an arrow key or a turn button; Shift gives the small step. */
export const TURN_STEP_DEG = 15
export const FINE_TURN_STEP_DEG = 5

/**
 * How far above or below the floor the camera may go. Straight up, "up" on the screen and the
 * line of sight are the same line and the picture spins about unpredictably, so it stops a degree
 * short, as OrbitControls itself does.
 */
export const MAX_ELEVATION_DEG = 89

/** A camera position as seen from the target: distance, compass angle from +x, height angle above the floor (radians). */
export interface Orbit {
  r: number
  azimuth: number
  elevation: number
}

const DEG = Math.PI / 180
const MAX_EL = MAX_ELEVATION_DEG * DEG

export function orbitOf(position: Vec3, target: Vec3): Orbit {
  const dx = position[0] - target[0]
  const dy = position[1] - target[1]
  const dz = position[2] - target[2]
  const r = Math.hypot(dx, dy, dz)
  return { r, azimuth: Math.atan2(dy, dx), elevation: r > 0 ? Math.asin(Math.max(-1, Math.min(1, dz / r))) : 0 }
}

export function positionOf(o: Orbit, target: Vec3): [number, number, number] {
  const h = o.r * Math.cos(o.elevation)
  return [target[0] + h * Math.cos(o.azimuth), target[1] + h * Math.sin(o.azimuth), target[2] + o.r * Math.sin(o.elevation)]
}

export type TurnDirection = 'left' | 'right' | 'up' | 'down'

/**
 * The camera's own move, in radians, for one turn of the drawing. Left: the camera goes round to
 * the right (azimuth grows). Up: the near side of the drawing rises, which means the camera drops
 * towards the floor — the same as dragging the drawing upwards.
 */
export function turnAngles(dir: TurnDirection, fine = false): { az: number; el: number } {
  const a = (fine ? FINE_TURN_STEP_DEG : TURN_STEP_DEG) * DEG
  switch (dir) {
    case 'left':
      return { az: a, el: 0 }
    case 'right':
      return { az: -a, el: 0 }
    case 'up':
      return { az: 0, el: -a }
    case 'down':
      return { az: 0, el: a }
  }
}

/** Moves the camera round the target by the given angles, keeping its distance; the height angle stops short of the poles. */
export function turnOrbit(position: Vec3, target: Vec3, dAz: number, dEl: number): [number, number, number] {
  const o = orbitOf(position, target)
  return positionOf({ r: o.r, azimuth: o.azimuth + dAz, elevation: Math.max(-MAX_EL, Math.min(MAX_EL, o.elevation + dEl)) }, target)
}

/**
 * One frame of a turn that is still owed. A press asks for 15°, and jumping there in one frame
 * loses the student — they cannot see which way the drawing went — so each frame takes a share
 * of what is left (about 90 % in a fifth of a second, whatever the frame rate) and the last
 * scrap in one go. When the height angle is already at its stop, the rest of an upward or
 * downward turn is dropped: kept, it would have to be "paid back" by the next press the other way
 * before anything moved.
 */
export function stepTurn(
  position: Vec3,
  target: Vec3,
  pending: { az: number; el: number },
  dt: number
): { position: [number, number, number]; pending: { az: number; el: number } } {
  const share = 1 - Math.exp(-Math.max(dt, 0) / 0.08)
  const last = Math.abs(pending.az) < 1e-3 && Math.abs(pending.el) < 1e-3
  const az = last ? pending.az : pending.az * share
  const el = last ? pending.el : pending.el * share
  const before = orbitOf(position, target)
  const next = turnOrbit(position, target, az, el)
  const gotEl = orbitOf(next, target).elevation - before.elevation
  const stopped = Math.abs(el) > 1e-12 && Math.abs(gotEl - el) > 1e-9
  return { position: next, pending: { az: pending.az - az, el: stopped ? 0 : pending.el - el } }
}

/** Screen position of a world point for a perspective camera with z up, in pixels from the top left, and its distance along the line of sight. */
export function projectPx(
  p: Vec3,
  cam: { position: Vec3; target: Vec3; fovDeg: number; width: number; height: number }
): { x: number; y: number; depth: number } {
  const f = norm(sub3(cam.target, cam.position))
  const right = norm(cross3(f, [0, 0, 1]))
  const up = cross3(right, f)
  const d = sub3(p, cam.position)
  const depth = dot3(d, f)
  const t = Math.tan((cam.fovDeg * DEG) / 2)
  const aspect = cam.width / cam.height
  const nx = dot3(d, right) / (depth * t * aspect)
  const ny = dot3(d, up) / (depth * t)
  return { x: ((nx + 1) / 2) * cam.width, y: ((1 - ny) / 2) * cam.height, depth }
}

const sub3 = (a: Vec3, b: Vec3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vec3, b: Vec3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec3): [number, number, number] => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** What a press on the 3-D drawing does: turn the view, slide it (pan), or belong to the tool. */
export type CameraDrag = 'turn' | 'pan' | 'tool'

/**
 * The one rule for who owns a press on the 3-D drawing. Until 0.9 the only way to turn was a
 * left-drag on empty space with the Move tool: every drawing tool claims the left button, and the
 * right button panned, which is all a student with the Point tool out could find. Now the right
 * button turns whatever tool is out, the middle button pans, Shift or Ctrl swaps the two (as
 * OrbitControls does), Space held with the left button pans (as in 2-D), and the Turn switch over the
 * drawing gives the left button — and one finger on a touch screen — to turning outright.
 * A touch counts as the left button.
 */
export function drag3D(press: {
  button: number
  tool: string
  onObject: boolean
  spaceHeld?: boolean
  turnMode?: boolean
  shift?: boolean
  ctrl?: boolean
}): CameraDrag {
  const base = baseDrag3D(press)
  // Shift or Ctrl swaps turning and sliding, exactly as OrbitControls does when it acts.
  if (base === 'tool' || !(press.shift || press.ctrl)) return base
  return base === 'turn' ? 'pan' : 'turn'
}

function baseDrag3D(press: { button: number; tool: string; onObject: boolean; spaceHeld?: boolean; turnMode?: boolean }): CameraDrag {
  if (press.button === 1) return 'pan'
  if (press.button === 2) return 'turn'
  if (press.button !== 0) return 'tool'
  if (press.spaceHeld) return 'pan'
  if (press.turnMode) return 'turn'
  return press.tool === 'select' && !press.onObject ? 'turn' : 'tool'
}

/** The arrow keys turn the 3-D drawing; they are free everywhere else in the window's shortcuts. */
export const TURN_KEYS: Readonly<Record<string, TurnDirection>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down'
}

/**
 * Which turn a key press asks for, or null when the key is not the view's: only in a maths
 * drawing's 3-D view, never while the tour is open (it takes ← and → for its own Back and Next)
 * and never while something is being typed (a caret moves with the arrows). The drawing must also
 * be on screen (`viewShown`: in the Calculator its tab can be behind the Maths tab, and a turn
 * nobody sees would be saved up and sprung on the student later), and the key must not already be
 * `claimed` by something in front of it, such as the right-click menu walking its items.
 */
export function turnForKey(
  key: string,
  shift: boolean,
  at: {
    drawing: boolean
    viewMode: '2d' | '3d'
    tourOpen: boolean
    typing: boolean
    viewShown: boolean
    claimed: boolean
  }
): { dir: TurnDirection; fine: boolean } | null {
  const dir = TURN_KEYS[key]
  if (!dir || !at.drawing || at.viewMode !== '3d' || at.tourOpen || at.typing) return null
  if (!at.viewShown || at.claimed) return null
  return { dir, fine: shift }
}
