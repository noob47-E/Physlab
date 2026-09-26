import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  drag3D,
  FINE_TURN_STEP_DEG,
  HOME_3D,
  MAX_ELEVATION_DEG,
  orbitOf,
  positionOf,
  projectPx,
  stepTurn,
  TURN_STEP_DEG,
  turnAngles,
  turnForKey,
  turnOrbit,
  TURN_KEYS,
  type Vec3
} from '../src/renderer/src/render/viewMath'
import { TOOLS as TOOLS_LIST } from '../src/renderer/src/render/tools'
import { isViewShown, onTurnRequested, pendingTurn, turnView } from '../src/renderer/src/render/viewState'
import { readSource } from './helpers/repo'

// shortcuts.ts pulls in the whole app; its one exported constant is copied here and checked against the source below.
const VIEW_KEY = '3'

// Fix 3: the 3-D view could not be turned. These pin the maths every way of turning shares.

const FOV = 45 // CameraRig's perspective camera
const W = 800
const H = 600
const cam = (position: Vec3) => ({ position, target: HOME_3D.target, fovDeg: FOV, width: W, height: H })
const DEG = Math.PI / 180

// The issue record's FIG. 2: from the view the 3-D drawing opens with, a point 1.5 above the
// floor and a floor point further back lie on one line of sight.
const P: Vec3 = [2, 0, 1.5]
const Q: Vec3 = [0.6, 2.4, 0]

/** A three.js camera placed the way CameraRig places it: z up, looking at the target. */
function threeCamera(position: Vec3): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(FOV, W / H, 0.01, 5000)
  c.up.set(0, 0, 1)
  c.position.set(...position)
  c.lookAt(...HOME_3D.target)
  c.updateMatrixWorld()
  return c
}

function threePx(p: Vec3, c: THREE.PerspectiveCamera) {
  const v = new THREE.Vector3(...p).project(c)
  return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H }
}

describe('seeing depth needs a turn (issue record FIG. 2)', () => {
  it('P (2, 0, 1.5) and Q (0.6, 2.4, 0) land on the same dot from the opening view', () => {
    const p = projectPx(P, cam(HOME_3D.position))
    const q = projectPx(Q, cam(HOME_3D.position))
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(1e-9)
    // …but P is nearer: it hides Q.
    expect(p.depth).toBeLessThan(q.depth)
  })

  it('one press of a turn key pulls them well apart, and a tilt shows P standing above the floor', () => {
    const { az } = turnAngles('left')
    const turned = turnOrbit(HOME_3D.position, HOME_3D.target, az, 0)
    const p = projectPx(P, cam(turned))
    const q = projectPx(Q, cam(turned))
    expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(25)
    // Looking along the floor from the side, P's height is plain: it is drawn higher than Q.
    const low = turnOrbit(HOME_3D.position, HOME_3D.target, 0, -35 * DEG)
    const p2 = projectPx(P, cam(low))
    const q2 = projectPx(Q, cam(low))
    expect(p2.y).toBeLessThan(q2.y - 20)
  })
})

describe('the projection agrees with three.js', () => {
  it('matches Vector3.project for the home view and after turns', () => {
    const views: Vec3[] = [
      HOME_3D.position,
      turnOrbit(HOME_3D.position, HOME_3D.target, 1.1, -0.3),
      turnOrbit(HOME_3D.position, HOME_3D.target, -2.4, 0.5)
    ]
    for (const v of views) {
      const c = threeCamera(v)
      for (const p of [P, Q, [3, -1, 2] as Vec3, [-4, 5, -1] as Vec3]) {
        const a = projectPx(p, cam(v))
        const b = threePx(p, c)
        expect(a.x).toBeCloseTo(b.x, 6)
        expect(a.y).toBeCloseTo(b.y, 6)
      }
    }
  })
})

describe('which way a turn goes', () => {
  // A floor point between the camera and the target: the near side of the drawing.
  const near: Vec3 = [3.6, -4.8, 0]

  it('turn left sweeps the near side of the drawing to the left, turn right to the right', () => {
    const home = projectPx(near, cam(HOME_3D.position))
    const l = turnAngles('left')
    const r = turnAngles('right')
    expect(projectPx(near, cam(turnOrbit(HOME_3D.position, HOME_3D.target, l.az, l.el))).x).toBeLessThan(home.x - 5)
    expect(projectPx(near, cam(turnOrbit(HOME_3D.position, HOME_3D.target, r.az, r.el))).x).toBeGreaterThan(home.x + 5)
  })

  it('turn up lifts the near side, turn down lowers it', () => {
    const home = projectPx(near, cam(HOME_3D.position))
    const u = turnAngles('up')
    const d = turnAngles('down')
    expect(projectPx(near, cam(turnOrbit(HOME_3D.position, HOME_3D.target, u.az, u.el))).y).toBeLessThan(home.y - 5)
    expect(projectPx(near, cam(turnOrbit(HOME_3D.position, HOME_3D.target, d.az, d.el))).y).toBeGreaterThan(home.y + 5)
  })

  it('the keys and buttons go the same way as a mouse drag in the same direction (OrbitControls)', () => {
    // A drag to the left hands OrbitControls a negative rotateLeft angle, a drag upwards a
    // negative rotateUp angle (OrbitControls._handleMouseMoveRotate).
    const a = 10 * DEG
    const drag = (fn: (c: OrbitControls) => void): Vec3 => {
      const c = threeCamera(HOME_3D.position)
      const controls = new OrbitControls(c)
      controls.update()
      fn(controls)
      return [c.position.x, c.position.y, c.position.z]
    }
    const home = orbitOf(HOME_3D.position, HOME_3D.target)
    const draggedLeft = orbitOf(drag((c) => c.rotateLeft(-a)), HOME_3D.target)
    const draggedUp = orbitOf(drag((c) => c.rotateUp(-a)), HOME_3D.target)
    expect(Math.sign(draggedLeft.azimuth - home.azimuth)).toBe(Math.sign(turnAngles('left').az))
    expect(draggedLeft.azimuth - home.azimuth).toBeCloseTo(a, 9)
    expect(Math.sign(draggedUp.elevation - home.elevation)).toBe(Math.sign(turnAngles('up').el))
    expect(draggedUp.elevation - home.elevation).toBeCloseTo(-a, 9)
  })

  it('a step is 15°, 5° with Shift', () => {
    expect(turnAngles('left').az).toBeCloseTo(TURN_STEP_DEG * DEG, 12)
    expect(turnAngles('down', true).el).toBeCloseTo(FINE_TURN_STEP_DEG * DEG, 12)
  })
})

describe('turning keeps the drawing where it was', () => {
  it('keeps the distance to the target, and 24 turns of 15° come back home', () => {
    const target: Vec3 = [1, 2, 0.5]
    let p: Vec3 = [6, -3, 4]
    const r0 = orbitOf(p, target).r
    for (let i = 0; i < 24; i++) {
      p = turnOrbit(p, target, turnAngles('left').az, 0)
      expect(orbitOf(p, target).r).toBeCloseTo(r0, 9)
    }
    expect(p[0]).toBeCloseTo(6, 9)
    expect(p[1]).toBeCloseTo(-3, 9)
    expect(p[2]).toBeCloseTo(4, 9)
  })

  it('orbitOf and positionOf undo each other', () => {
    const t: Vec3 = [-2, 1, 3]
    const p: Vec3 = [4, 7, -1]
    const back = positionOf(orbitOf(p, t), t)
    back.forEach((v, k) => expect(v).toBeCloseTo(p[k], 12))
  })

  it('stops a degree short of straight overhead and straight underneath', () => {
    let p: Vec3 = HOME_3D.position
    for (let i = 0; i < 20; i++) p = turnOrbit(p, HOME_3D.target, 0, turnAngles('down').el)
    expect(orbitOf(p, HOME_3D.target).elevation / DEG).toBeCloseTo(MAX_ELEVATION_DEG, 9)
    for (let i = 0; i < 40; i++) p = turnOrbit(p, HOME_3D.target, 0, turnAngles('up').el)
    expect(orbitOf(p, HOME_3D.target).elevation / DEG).toBeCloseTo(-MAX_ELEVATION_DEG, 9)
  })
})

describe('a turn is eased in over a few frames', () => {
  const run = (start: Vec3, pending: { az: number; el: number }, fps: number, frames: number) => {
    let p = start
    let rest = pending
    let n = 0
    while ((rest.az !== 0 || rest.el !== 0) && n < frames) {
      const s = stepTurn(p, HOME_3D.target, rest, 1 / fps)
      p = s.position
      rest = s.pending
      n++
    }
    return { p, rest, n }
  }

  it('ends exactly where one jump would have, in under three quarters of a second at 60 or 30 frames a second', () => {
    const want = turnOrbit(HOME_3D.position, HOME_3D.target, 0.4, -0.2)
    for (const fps of [60, 30]) {
      const { p, rest, n } = run(HOME_3D.position, { az: 0.4, el: -0.2 }, fps, 1000)
      expect(rest).toEqual({ az: 0, el: 0 })
      expect(n / fps).toBeLessThan(0.75)
      p.forEach((v, k) => expect(v).toBeCloseTo(want[k], 9))
    }
    // Most of the way there in a fifth of a second, so the student sees the drawing move at once.
    const partial = run(HOME_3D.position, { az: 0.4, el: 0 }, 60, 12)
    expect(Math.abs(partial.rest.az)).toBeLessThan(0.4 * 0.15)
  })

  it('drops the rest of a tilt that has reached the stop, so the next press the other way moves at once', () => {
    const top = positionOf({ r: 15, azimuth: 0.3, elevation: MAX_ELEVATION_DEG * DEG }, HOME_3D.target)
    const { rest } = run(top, { az: 0, el: 10 * turnAngles('down').el }, 60, 3)
    expect(rest.el).toBe(0)
    const s = stepTurn(top, HOME_3D.target, { az: 0, el: turnAngles('up').el }, 1 / 60)
    expect(orbitOf(s.position, HOME_3D.target).elevation).toBeLessThan(MAX_ELEVATION_DEG * DEG - 1e-3)
  })
})

describe('who owns a press on the 3-D drawing (drag3D)', () => {
  const TOOLS = ['select', 'point', 'segment', 'polygon', 'circle', 'vector', 'sketch', 'delete', 'text']

  it('the right button turns the view whatever tool is out — the tester had no way to turn with a tool out', () => {
    for (const tool of TOOLS) {
      for (const onObject of [false, true]) expect(drag3D({ button: 2, tool, onObject })).toBe('turn')
    }
  })

  it('the middle button, and Space with the left button, slide the view; Shift or Ctrl swaps turning and sliding as OrbitControls does', () => {
    expect(drag3D({ button: 2, tool: 'point', onObject: false, shift: true })).toBe('pan')
    expect(drag3D({ button: 2, tool: 'point', onObject: false, ctrl: true })).toBe('pan')
    expect(drag3D({ button: 1, tool: 'point', onObject: false, shift: true })).toBe('turn')
    expect(drag3D({ button: 0, tool: 'select', onObject: false, shift: true })).toBe('pan')
    // A press the tool owns stays the tool's: Shift is its own (a straight line, adding to the selection).
    expect(drag3D({ button: 0, tool: 'point', onObject: false, shift: true })).toBe('tool')
    for (const tool of TOOLS) expect(drag3D({ button: 1, tool, onObject: false })).toBe('pan')
    for (const tool of TOOLS) expect(drag3D({ button: 0, tool, onObject: true, spaceHeld: true })).toBe('pan')
  })

  it('the left button (and one finger) stays the tool’s, except on empty space with Move', () => {
    expect(drag3D({ button: 0, tool: 'select', onObject: false })).toBe('turn')
    expect(drag3D({ button: 0, tool: 'select', onObject: true })).toBe('tool')
    for (const tool of TOOLS.filter((t) => t !== 'select')) expect(drag3D({ button: 0, tool, onObject: false })).toBe('tool')
  })

  it('with the Turn switch on, the left button and one finger turn with any tool, even over an object', () => {
    for (const tool of TOOLS) {
      expect(drag3D({ button: 0, tool, onObject: true, turnMode: true })).toBe('turn')
      expect(drag3D({ button: 0, tool, onObject: false, turnMode: true })).toBe('turn')
    }
  })

  it('the back and forward buttons are not the camera’s', () => {
    expect(drag3D({ button: 3, tool: 'select', onObject: false })).toBe('tool')
  })
})

describe('the arrow keys turn the 3-D drawing (turnForKey)', () => {
  const at = { drawing: true, viewMode: '3d' as const, tourOpen: false, typing: false, viewShown: true, claimed: false }

  it('← → ↑ ↓ turn the drawing the way they point, Shift for a small step', () => {
    expect(turnForKey('ArrowLeft', false, at)).toEqual({ dir: 'left', fine: false })
    expect(turnForKey('ArrowRight', false, at)).toEqual({ dir: 'right', fine: false })
    expect(turnForKey('ArrowUp', true, at)).toEqual({ dir: 'up', fine: true })
    expect(turnForKey('ArrowDown', false, at)).toEqual({ dir: 'down', fine: false })
  })

  it('leave the keys alone in 2-D, in the Sandbox and GPU Lab, during the tour and while typing', () => {
    expect(turnForKey('ArrowLeft', false, { ...at, viewMode: '2d' })).toBeNull()
    expect(turnForKey('ArrowLeft', false, { ...at, drawing: false })).toBeNull()
    expect(turnForKey('ArrowLeft', false, { ...at, tourOpen: true })).toBeNull()
    expect(turnForKey('ArrowLeft', false, { ...at, typing: true })).toBeNull()
    expect(turnForKey('a', false, at)).toBeNull()
  })

  it('leave the keys alone when the drawing is not on screen (the Calculator’s Maths tab in front)', () => {
    expect(turnForKey('ArrowLeft', false, { ...at, viewShown: false })).toBeNull()
  })

  it('leave a key alone that the right-click menu already took to walk its items', () => {
    expect(turnForKey('ArrowDown', false, { ...at, claimed: true })).toBeNull()
  })

  it('the window shortcuts pass whether the drawing is shown and whether the key was taken', () => {
    const src = readSource('src/renderer/src/app/shortcuts.ts')
    expect(src).toMatch(/viewShown: isViewShown\(\)/)
    expect(src).toMatch(/claimed: e\.defaultPrevented/)
    // The menu takes its arrows in the capture phase, so it has already spoken by then.
    expect(readSource('src/renderer/src/ui/ContextMenu.tsx')).toMatch(/addEventListener\('keydown', onKey, true\)/)
  })

  it('a turn with no drawing on screen is not saved up for later', () => {
    pendingTurn.az = 0
    pendingTurn.el = 0
    expect(isViewShown()).toBe(false)
    turnView('left')
    turnView('up', true)
    expect(pendingTurn).toEqual({ az: 0, el: 0 })
  })

  it('with a drawing to turn, the turns add up and the frame is asked for', () => {
    pendingTurn.az = 0
    pendingTurn.el = 0
    let frames = 0
    const off = onTurnRequested(() => frames++)
    turnView('left')
    turnView('left')
    expect(frames).toBe(2)
    expect(pendingTurn.az).toBeCloseTo(2 * turnAngles('left', false).az, 12)
    off()
    pendingTurn.az = 0
    turnView('left')
    expect(pendingTurn.az).toBe(0)
  })

  it('no turn key is already a tool key, the 2D/3D key or Home', () => {
    const taken = new Set([...TOOLS_LIST.map((t) => t.key.toLowerCase()).filter(Boolean), VIEW_KEY.toLowerCase(), 'home', ' ', 'escape', 'delete', 'backspace', 'enter', '/', 'tab'])
    for (const k of Object.keys(TURN_KEYS)) expect(taken.has(k.toLowerCase())).toBe(false)
  })

  it('the window shortcuts ask turnForKey before anything else takes an arrow key', () => {
    const src = readSource('src/renderer/src/app/shortcuts.ts')
    expect(src).toContain(`export const VIEW_KEY = '${VIEW_KEY}'`)
    expect(src).toMatch(/turnForKey\(e\.key, e\.shiftKey/)
  })
})
