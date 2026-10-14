// Draws the sandbox world and drives the engine: one step per frame while the timeline plays.
// The engine hands back a plain array of positions, so nothing here touches Jolt itself.
//
// How things look (P28) is worked out in render/sandboxLooks.ts and built in sandboxMeshes.ts:
// every body is one mesh with its outline or marking tinted in, every connection a mesh thick
// enough to see at any zoom — a coil, a bar, a thread, a chain of links, a pin. Under WebGPU a
// line is one device pixel whatever the camera does, which is why none of them is a line.
//
// The drawing itself is one file per job under render/sandbox/ (bodies, stage, links, trails,
// arrows, labels, the join preview), and each reads the run from readoutRef, never the engine.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useScene } from '../core/store'
import { useApp } from '../app/modes'
import { engine, massOf, useSandbox } from '../sim/store'
import { grabForceCap, SimWorld, STRIDE } from '../sim/world'
import type { BodyDef, BodyId, BodyState } from '../sim/types'
import type { V3 } from '../math/vec'
import { energyOf, groundTopOf } from '../sim/energy'
import { chaosDrivers } from '../sim/chaosTwins'
import { FALL_LIMIT, recordReadings } from '../sim/stepping'
import { dragSetsStart, grabAction } from '../sim/inspector'
import { toScreen } from './cameraUtils'
import { readoutRef, type SimReadout } from './sandbox/readout'
import { newReplayView, panelStates, replayViewFrame } from './sandbox/playback'
import { Stage } from './sandbox/Stage'
import { Bodies } from './sandbox/Bodies'
import { Arrows } from './sandbox/Arrows'
import { Trails } from './sandbox/Trails'
import { Links } from './sandbox/Links'
import { JoinPreview, joinCursor } from './sandbox/JoinPreview'
import { Labels } from './sandbox/Labels'
import { replayRefusal, startRecorder } from '../sim/recorder'
import { useTape } from '../sim/tapeStore'
import { refuseEdit } from '../sim/transportActions'


// What the engine was last told to hold. These live outside the component so that leaving the
// Sandbox for another mode and coming back does not throw the run away: the world is created
// once and kept in `engine.world`.
let applied: BodyDef[] = []
let appliedNonce = -1
/** Engine time the live values were last published at. */
let published = 0
/** The pose array the last step handed back: the readout's `transforms`, as SimWorld keeps its own private. */
const posed: { transforms: Float32Array } = { transforms: new Float32Array(0) }
/** The live world as the drawing reads it, made once for the one engine (it outlives the view, as the engine does). */
let liveRO: { world: SimWorld; readout: SimReadout } | null = null
/** What the frame loop keeps between frames of a shown recording (SB16), the panels' moment with it. */
const replayView = newReplayView()

/** A press on an object while a recording is shown: no drag, and the replay sentence once the pointer moves. */
type Refused = { x: number; y: number; said: boolean }

/** How far (in CSS pixels) the pointer moves before a press on an object counts as a drag. */
const DRAG_SLOP = 4

type Drag = {
  id: BodyId
  plane: THREE.Plane
  /** Centre of the body minus the point that was clicked: the grabbed spot stays under the cursor. */
  offset: THREE.Vector3
  /** Arranging (moving the definition) rather than pulling with the hand. */
  place: boolean
  samples: { p: THREE.Vector3; t: number }[]
}

/**
 * The mouse in the sandbox. Paused, dragging arranges: any object — a wall or the floor too — goes
 * straight to where the cursor puts it and the scene definition follows, so Reset, undo and the
 * save file all know. Playing, dragging is a hand: a spring to the cursor that can push other
 * things on the way and keeps the hand's speed on release.
 *
 * While a recording is shown (replay or fine replay) nothing is moved (D5): a click still chooses an object, but
 * a drag says the replay sentence (`replayRefusal()`, in the strip's note) instead, and the cursor says no.
 */
function useGrabAndThrow(sim: React.RefObject<SimWorld | null>, group: React.RefObject<THREE.Group | null>) {
  const { gl, camera, size, controls, invalidate } = useThree()
  const select = useSandbox((s) => s.select)
  const setPartner = useSandbox((s) => s.setPartner)
  const joinPick = useSandbox((s) => s.joinPick)
  const twoD = useSandbox((s) => s.world.twoD)
  const drag = useRef<Drag | null>(null)
  const refused = useRef<Refused | null>(null)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const point = new THREE.Vector3()

    const aim = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
    }
    const pick = (e: PointerEvent) => {
      aim(e)
      // Only the body meshes: the velocity arrows share this group and used to swallow the click.
      const meshes = (group.current?.children ?? []).filter((c) => (c as THREE.Mesh).isMesh && (c.userData as { bodyId?: string }).bodyId)
      const hit = raycaster.intersectObjects(meshes, false)[0]
      return hit ? { id: (hit.object.userData as { bodyId: string }).bodyId, point: hit.point } : null
    }
    /** Where the cursor is, on the plane the drag happens in. */
    const onPlane = (e: PointerEvent, plane: THREE.Plane): THREE.Vector3 | null => {
      aim(e)
      return raycaster.ray.intersectPlane(plane, point.clone())
    }
    const setControls = (enabled: boolean) => {
      const c = controls as unknown as { enabled: boolean } | null
      if (c) c.enabled = enabled
    }
    const defOf = (id: BodyId) => useSandbox.getState().bodies.find((b) => b.id === id)

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || useApp.getState().mode !== 'sandbox') return
      const w = sim.current
      const hit = pick(e)
      // Connecting: a click on an object is a pick, and a click on nothing is nothing — it must
      // not clear the first choice, or the student who missed the ball has to start again.
      if (useSandbox.getState().joinMode) {
        // Joining is an edit: on a shown recording the click says why nothing happens.
        if (hit && !refuseEdit()) joinPick(hit.id)
        return
      }
      const def = hit ? defOf(hit.id) : undefined
      const action = def ? grabAction(def, useScene.getState().playing) : 'none'
      // A press on the floor is a press on empty space (owner, 2026-10-09): it used to arrange the
      // floor like any fixed body, so dragging across the ground to turn the view slid the whole
      // floor out from under the experiment. Left alone, the drag turns the view instead.
      if (!w || !hit || !def || action === 'none') {
        if (!e.shiftKey) select(null)
        return
      }
      // Shift-click on a second body chooses it as the partner to join to, and does not drag;
      // a second shift-click lets it go, the same as in the list.
      const chosen = useSandbox.getState().selection
      if (e.shiftKey && chosen && chosen !== hit.id) {
        setPartner(useSandbox.getState().partner === hit.id ? null : hit.id)
        return
      }
      select(hit.id)
      // A shown recording is read-only: the object is chosen, nothing is grabbed or placed, and the view holds still
      // under the press, so the drag that follows can only say why.
      if (replayRefusal() !== null) {
        refused.current = { x: e.clientX, y: e.clientY, said: false }
        setControls(false)
        el.setPointerCapture(e.pointerId)
        return
      }
      const place = action === 'place'
      // In 2D everything lives in one flat plane; in 3D drag in the plane facing the camera.
      const plane = twoD
        ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -def.position[2])
        : new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), hit.point)
      const start = onPlane(e, plane)
      if (!start) return
      const st = w.state(hit.id)
      const centre = st ? new THREE.Vector3(st.position[0], st.position[1], st.position[2]) : hit.point.clone()
      const offset = centre.sub(start)
      drag.current = { id: hit.id, plane, offset, place, samples: [{ p: start.clone(), t: performance.now() }] }
      if (!place) w.grab(hit.id, [start.x + offset.x, start.y + offset.y, start.z + offset.z])
      setControls(false)
      el.setPointerCapture(e.pointerId)
      el.style.cursor = place ? 'grabbing' : 'grabbing'
    }

    const onMove = (e: PointerEvent) => {
      const no = refused.current
      if (no) {
        if (!no.said && Math.hypot(e.clientX - no.x, e.clientY - no.y) > DRAG_SLOP) {
          no.said = true
          refuseEdit()
        }
        return
      }
      const d = drag.current
      const w = sim.current
      if (!w) return
      // A recording came on screen part-way through a drag (a step back by key): let go at once, with no throw,
      // and say why the object stopped following.
      if (d && replayRefusal() !== null) {
        finish(e, false)
        refuseEdit()
        return
      }
      if (!d) {
        if (useApp.getState().mode !== 'sandbox') return
        const hit = pick(e)
        const join = useSandbox.getState().joinMode
        if (join && replayRefusal() !== null) {
          // A recording on screen: no connecting (a click says why), so no line follows the cursor either.
          if (joinCursor.p) {
            joinCursor.p = null
            invalidate()
          }
          el.style.cursor = hit ? 'not-allowed' : ''
          return
        }
        if (join) {
          // The line from the first object follows the cursor, in the plane the object is in,
          // until the second is chosen. The canvas draws on demand, so ask for the frame.
          const st = join.step === 'second' && join.a ? w.state(join.a) : null
          if (st) {
            const plane = twoD ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -st.position[2]) : new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()).negate(), new THREE.Vector3(...st.position))
            const p = onPlane(e, plane)
            joinCursor.p = p ? [p.x, p.y, p.z] : null
            invalidate()
          }
          el.style.cursor = hit ? 'crosshair' : ''
          return
        }
        // Say what a click would do: arrange, pull, or (on the floor) nothing; on a shown recording, that it cannot.
        const over = hit ? defOf(hit.id) : undefined
        const action = over ? grabAction(over, useScene.getState().playing) : 'none'
        if (action !== 'none' && replayRefusal() !== null) el.style.cursor = 'not-allowed'
        else el.style.cursor = action === 'pull' ? 'grab' : action === 'place' ? 'move' : ''
        return
      }
      const p = onPlane(e, d.plane)
      if (!p) return
      const target: V3 = [p.x + d.offset.x, p.y + d.offset.y, p.z + d.offset.z]
      if (d.place) {
        // Nothing asks for a frame while the run is paused, so ask for one.
        w.placeBody(d.id, target)
        invalidate()
      } else w.moveGrab(target)
      d.samples.push({ p: p.clone(), t: performance.now() })
      if (d.samples.length > 8) d.samples.shift()
    }

    const onUp = (e: PointerEvent) => {
      if (refused.current) {
        refused.current = null
        setControls(true)
        el.style.cursor = ''
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
        return
      }
      // Let go on a shown recording (a step back by key while the button was held): no throw, nothing written.
      finish(e, replayRefusal() === null)
    }

    /**
     * The end of a drag. With `act`, an arranged body's definition follows it and a pulled one is thrown with the hand's
     * speed; without (a recording came on screen meanwhile), the hand just lets go and nothing is written.
     */
    function finish(e: PointerEvent, act: boolean): void {
      const d = drag.current
      const w = sim.current
      drag.current = null
      setControls(true)
      el.style.cursor = ''
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      if (!d || !w) return
      if (d.place) {
        // The definition follows the drag, so Reset, undo and the file all agree with the screen —
        // before the run. Paused part-way, a moving body is only put somewhere to go on from: its
        // start stays where the run began (H18).
        const st = w.state(d.id)
        const def = defOf(d.id)
        if (act && st && def && dragSetsStart(w.time, def)) useSandbox.getState().updateBody(d.id, { position: [st.position[0], st.position[1], st.position[2]] })
        invalidate()
        return
      }
      w.release_()
      if (!act) return
      // Throw: the speed of the hand over the last few samples. A hand that could barely move the
      // object cannot fling it either, so the speed is bounded by what the grab force could give
      // it in a moment — a two-tonne block no longer leaves at 25 m/s from a flick.
      const first = d.samples[0]
      const last = d.samples[d.samples.length - 1]
      const dt = (last.t - first.t) / 1000
      const def = defOf(d.id)
      if (dt > 0.008 && def) {
        const v = last.p.clone().sub(first.p).divideScalar(dt)
        const speed = v.length()
        const m = massOf(def)
        const cap = Math.min(25, (grabForceCap(m, useSandbox.getState().world.gravity) * 0.15) / m)
        if (speed > 0.2) {
          if (speed > cap) v.multiplyScalar(cap / speed)
          w.setVelocity(d.id, [v.x, v.y, v.z])
        }
      }
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('lostpointercapture', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('lostpointercapture', onUp)
      // Unmounting mid-drag (a mode switch) must not leave the hand closed and the camera locked.
      if (refused.current) {
        refused.current = null
        setControls(true)
        el.style.cursor = ''
      }
      if (drag.current) {
        drag.current = null
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `sim` holds the physics world, not a DOM node: it is the same object for the life of the view, so reading it at cleanup is exactly what is wanted
        sim.current?.release_()
        setControls(true)
        el.style.cursor = ''
      }
    }
  }, [gl, camera, size, controls, select, setPartner, joinPick, twoD, sim, group, invalidate])
}

export function SandboxView() {
  const bodies = useSandbox((s) => s.bodies)
  const world = useSandbox((s) => s.world)
  const links = useSandbox((s) => s.links)
  const runNonce = useSandbox((s) => s.runNonce)
  const pushContacts = useSandbox((s) => s.pushContacts)
  const playing = useScene((s) => s.playing)
  const mode = useApp((s) => s.mode)
  const sim = useRef<SimWorld | null>(null)
  const group = useRef<THREE.Group>(null)
  const [ready, setReady] = useState(false)
  const { invalidate } = useThree()
  const check = useRef(location.hash.includes('sandbox') ? { last: -1, contacts: 0 } : null)
  useGrabAndThrow(sim, group)

  // Start the engine the first time the sandbox is opened; afterwards pick the running one up
  // again, so switching modes and back does not restart the experiment.
  useEffect(() => {
    let alive = true
    if (engine.world) {
      sim.current = engine.world
      readoutRef.current = liveOf(engine.world)
      setReady(true)
      invalidate()
      return () => {
        alive = false
      }
    }
    SimWorld.create(useSandbox.getState().world).then((w) => {
      if (!alive) return
      engine.world = w
      // The tape (SB12) records every step of this world from now on. Once, here, with the engine: the engine
      // outlives the view, and the recorder's stop would free the tape, so no view's unmount ever stops it.
      startRecorder(w)
      sim.current = w
      const s = useSandbox.getState()
      w.rebuild(s.bodies, s.links)
      applied = s.bodies
      appliedNonce = s.runNonce
      published = 0
      if (import.meta.env?.DEV) (window as unknown as { __sim?: SimWorld }).__sim = w
      readoutRef.current = liveOf(w)
      setReady(true)
      invalidate()
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount: the engine outlives the view and must not be created twice; `invalidate` is R3F's stable function
  }, [])

  // A change to the objects is applied to the running world where it can be, and only forces a
  // rebuild when the change is structural — and even then the untouched bodies keep going.
  // Rebuilding on every edit meant renaming a ball reset every position in the scene.
  useEffect(() => {
    const w = sim.current
    if (!w || !ready) return
    const before = applied
    const sameBodies = before.length === bodies.length && bodies.every((b, i) => before[i]?.id === b.id)
    const inPlace = sameBodies && bodies.every((b, i) => before[i] === b || w.updateBody(b))
    if (!inPlace) w.rebuild(bodies, links, true)
    applied = bodies
    invalidate()
  }, [bodies, links, ready, invalidate])

  // SB60: bodies that follow a known path (the chaos twins on the exact double-pendulum solution) are driven from their
  // definitions, so the paths follow an edited start or gravity, and a scene without them drives nothing.
  useEffect(() => {
    const w = sim.current
    if (!w || !ready) return
    w.setDrivers(chaosDrivers(bodies, links, world.gravity))
  }, [bodies, links, world.gravity, ready])

  // Reset: everything back to its definition, clock at zero. This is the only path that rebuilds
  // without preserving; it is keyed on a counter because comparing the objects proved nothing.
  useEffect(() => {
    const w = sim.current
    if (!w || !ready || appliedNonce === runNonce) return
    const s = useSandbox.getState()
    w.rebuild(s.bodies, s.links)
    applied = s.bodies
    appliedNonce = runNonce
    published = 0
    invalidate()
  }, [runNonce, ready, invalidate])

  // Connections are cheap to rebuild and each one needs both of its bodies to exist, so they are
  // rebuilt on their own rather than dragging the whole world down with them.
  useEffect(() => {
    if (!sim.current || !ready) return
    sim.current.setLinks(links)
    invalidate()
  }, [links, ready, invalidate])

  useEffect(() => {
    if (!sim.current || !ready) return
    sim.current.setWorldSettings(world)
    invalidate()
  }, [world, ready, invalidate])

  // A shown recording is drawn on demand too: a scrub, a step, Play, Pause or Back to live asks for the frame that
  // shows it. A live run's steps, and a recording that plays on, ask for their own frames, so they are left out.
  useEffect(
    () =>
      useTape.subscribe((now, before) => {
        if (now.mode === 'live' && before.mode === 'live') return
        if (now.playing && before.playing && now.mode === before.mode) return
        if (now.mode !== before.mode || now.playhead !== before.playhead || now.playing !== before.playing || now.direction !== before.direction || now.revision !== before.revision) invalidate()
      }),
    [invalidate]
  )

  /** Heights are quoted above the floor, not above the world origin. */
  const groundTop = useMemo(() => groundTopOf(bodies), [bodies])

  // Priority −1: the world steps before anything else draws this frame. The links, arrows and
  // trails read the drawn poses in their own frame callbacks, which run in mount order — children
  // first — so at priority 0 they drew last frame's poses, a frame behind the bodies they join.
  //
  // While a recording is shown ('replay' or 'fine', SB16) the engine is neither stepped nor read: the readout is the
  // tape at the playhead, which moves on while the recording plays, and the panels follow it.
  useFrame((state, dt) => {
    const w = sim.current
    const g = group.current
    if (!w || !g) return
    const shown = replayViewFrame(replayView, dt, bodies, performance.now())
    if (shown) {
      readoutRef.current = shown.readout
      applyTransforms(g, shown.readout.transforms, shown.readout.bodyOrder)
      // The panels follow the playhead: the Selected and Now boxes, the ledger and the cards read `live` and `engineTime`.
      if (shown.panels) useSandbox.setState(shown.panels)
      if (shown.more) state.invalidate()
      return
    }
    readoutRef.current = liveOf(w)
    if (replayView.panels) {
      // Back from a recording: the panels show the world again, where the run waits.
      replayView.panels = null
      published = w.time
      useSandbox.setState({ live: panelStates(liveOf(w), bodies), engineTime: w.time })
    }
    if (playing && mode === 'sandbox') {
      const { transforms, contacts, samples } = w.step(Math.min(dt, 0.1))
      posed.transforms = transforms
      applyTransforms(g, transforms, w.bodyOrder)
      if (contacts.length) pushContacts(contacts)
      // The recording comes from the engine's own readings, not from the live publish below: that
      // one fires when a frame happens to land past 0.1 s, which put the readings 0.1167 s apart
      // (0.15 s on a slow frame) with none at t = 0.
      recordReadings(samples, bodies, world.gravity, groundTop)
      // Live values for the panel, about ten times a second. Publishing every frame would
      // re-render the whole panel sixty times a second to move a digit no one can read that fast.
      if (w.time - published > 0.1 || w.time < published) {
        published = w.time
        const live: Record<string, BodyState> = {}
        for (const d of bodies) {
          const s = w.state(d.id)
          if (!s) continue
          if (d.motion === 'dynamic' && s.position[1] < groundTop - FALL_LIMIT) {
            // Off the edge of the world. Put it back at rest where it started and say so, rather
            // than let it fall for ever below a floor the student can no longer see.
            w.placeBody(d.id, d.position)
            useScene.getState().pushLog({ input: 'sandbox', kind: 'info', text: `${d.name} fell off the floor and was put back where it started.` })
            continue
          }
          live[d.id] = s
        }
        useSandbox.setState({ live, engineTime: w.time })
      }
      if (check.current && Math.floor(w.time) !== check.current.last) {
        check.current.last = Math.floor(w.time)
        const lines = bodies
          .filter((d) => d.motion === 'dynamic')
          .map((d) => {
            const st = w.state(d.id)
            if (!st) return ''
            // Where it lands on the screen, so a terminal check can tell it is actually in view.
            const sp = toScreen(state.camera, state.size, st.position)
            const onScreen = sp.visible && sp.x > 0 && sp.y > 0 && sp.x < state.size.width && sp.y < state.size.height
            const en = energyOf(d, st, world.gravity, groundTop)
            // eslint-disable-next-line no-restricted-syntax -- a PHYSLAB_CHECK log line read by the test harness, not the screen
            return `${d.name} pos=${st.position.map((n) => n.toFixed(2)).join(',')} v=${Math.hypot(...st.velocity).toFixed(2)} KE=${en.kinetic.toFixed(1)} PE=${en.potential.toFixed(1)} E=${en.total.toFixed(1)} screen=${sp.x.toFixed(0)},${sp.y.toFixed(0)} size=${state.size.width}x${state.size.height} cam=${state.camera.position.toArray().map((n) => n.toFixed(1)).join(',')}${onScreen ? '' : ' OFFSCREEN'}`
          })
        // eslint-disable-next-line no-restricted-syntax -- a PHYSLAB_CHECK log line read by the test harness, not the screen
        console.info(`PHYSLAB_CHECK sandbox t=${w.time.toFixed(1)} bodies=${bodies.length} contacts=${check.current.contacts} ${lines.join(' | ')}`)
      }
      if (check.current) check.current.contacts += contacts.length
    } else {
      posed.transforms = w.step(0).transforms
      applyTransforms(g, posed.transforms, w.bodyOrder)
    }
  }, -1)

  return (
    <group ref={group}>
      <Stage />
      <Bodies />
      {ready && <Arrows />}
      {ready && <Trails />}
      {ready && <Links />}
      {ready && <JoinPreview />}
      {/* After the frame loop above, at the same priority: the chips are placed once the world has stepped. */}
      {ready && <Labels />}
    </group>
  )
}

/** The live world as the drawing reads it (I-6): the same calls, and the poses the last step gave. */
function liveReadout(w: SimWorld): SimReadout {
  return {
    get time() {
      return w.time
    },
    get bodyOrder() {
      return w.bodyOrder
    },
    get transforms() {
      return posed.transforms
    },
    state: (id) => w.state(id),
    drawn: (id) => w.drawn(id),
    linkPath: (link) => w.linkPath(link)
  }
}

/** The one live readout of the engine (made again only for another world, which the app never has). */
function liveOf(w: SimWorld): SimReadout {
  if (liveRO?.world !== w) liveRO = { world: w, readout: liveReadout(w) }
  return liveRO.readout
}

/** Meshes are matched to the engine by body id, not by their place in the list. */
function applyTransforms(group: THREE.Group, transforms: Float32Array, order: BodyId[]) {
  const index = new Map(order.map((id, i) => [id, i]))
  for (const child of group.children) {
    const id = (child.userData as { bodyId?: string }).bodyId
    if (!id) continue
    const i = index.get(id)
    if (i === undefined) continue
    const o = i * STRIDE
    if (o + 6 >= transforms.length) continue
    child.position.set(transforms[o], transforms[o + 1], transforms[o + 2])
    child.quaternion.set(transforms[o + 3], transforms[o + 4], transforms[o + 5], transforms[o + 6])
  }
}

