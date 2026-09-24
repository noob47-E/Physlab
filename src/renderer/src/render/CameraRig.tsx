import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MapControls, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { niceStep, orthoBounds, worldPerPixel } from './cameraUtils'
import { onTurnRequested, pendingTurn, useCameraCommand, useView } from './viewState'
import { drag3D, HOME_3D, stepTurn, type CameraDrag } from './viewMath'
import { useScene } from '../core/store'
import { isDrawingMode, useApp } from '../app/modes'
import { engine, useSandbox } from '../sim/store'
import { visibleIn } from '../core/visibility'
import { graphBox } from '../core/visualize'
import { themeColor, useThemed } from '../app/theme'

/** Bounding box of all visible geometry (graphs only where they have ends). */
function sceneBounds(): { min: [number, number, number]; max: [number, number, number] } | null {
  const { ev, objects, activeSpace } = useScene.getState()
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const add = (p: readonly number[]) => {
    for (let k = 0; k < 3; k++) {
      if (!Number.isFinite(p[k])) return
    }
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k])
      max[k] = Math.max(max[k], p[k])
    }
  }
  for (const [id, c] of ev.values) {
    if (!objects[id]?.visible || !visibleIn(objects[id], activeSpace)) continue
    switch (c.type) {
      case 'point':
      case 'text':
        add(c.p)
        break
      case 'vector':
        add(c.tail)
        add([c.tail[0] + c.comp[0], c.tail[1] + c.comp[1], c.tail[2] + c.comp[2]])
        break
      case 'segment':
        add(c.line.p)
        add([c.line.p[0] + c.line.d[0], c.line.p[1] + c.line.d[1], c.line.p[2] + c.line.d[2]])
        break
      case 'circle':
        add([c.circle.c[0] - c.circle.r, c.circle.c[1] - c.circle.r, c.circle.c[2]])
        add([c.circle.c[0] + c.circle.r, c.circle.c[1] + c.circle.r, c.circle.c[2]])
        break
      case 'polygon':
        c.pts.forEach(add)
        break
      case 'graph': {
        // A graph with ends (a piecewise curve, a shaded region) has a box; one that runs for
        // ever does not, and is left out as before.
        const o = objects[id]
        const g = o?.type === 'graph' ? graphBox(o) : null
        if (g) {
          add(g.min)
          add(g.max)
        }
        break
      }
    }
  }
  if (!Number.isFinite(min[0])) return null
  // Keep the origin in view so axes stay meaningful.
  add([0, 0, 0])
  return { min, max }
}

/** True while Ctrl is held, so the wheel can zoom in small steps when a scale has to be exact. */
function useFineZoom(): boolean {
  const [fine, setFine] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Control' && setFine(true)
    const up = (e: KeyboardEvent) => e.key === 'Control' && setFine(false)
    // Alt-tabbing away with Ctrl held would otherwise leave the fine zoom stuck on.
    const blur = () => setFine(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  return fine
}

/** OrbitControls' name for a camera action. */
const MOUSE_FOR: Record<CameraDrag, THREE.MOUSE> = { turn: THREE.MOUSE.ROTATE, pan: THREE.MOUSE.PAN, tool: THREE.MOUSE.ROTATE }

export function CameraRig() {
  const viewMode = useScene((s) => s.viewMode)
  const mode = useApp((s) => s.mode)
  const sideView = useSandbox((s) => s.sideView)
  const fineZoom = useFineZoom()
  const { camera, size, controls, get, invalidate } = useThree()
  const drawing = isDrawingMode(mode)
  // Every 3-D view takes its buttons from the one rule in drag3D: right turns, middle slides. The
  // Sandbox's own hint had always said "right-drag turns the view" while its right button panned.
  // In the maths drawing the left button is set per press by Interaction, which knows the tool
  // and what is under the cursor; in the Sandbox and the GPU Lab a left drag on empty space turns.
  const mouseButtons = useMemo(
    () => ({
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: MOUSE_FOR[drag3D({ button: 1, tool: 'select', onObject: false })],
      RIGHT: MOUSE_FOR[drag3D({ button: 2, tool: 'select', onObject: false })]
    }),
    []
  )

  // A press of an arrow key or a turn button asks for a frame; the frames that follow ease it in.
  useEffect(() => onTurnRequested(() => invalidate()), [invalidate])
  const command = useCameraCommand()
  const last = useRef({ cx: NaN, cy: NaN, wpp: NaN, w: 0, h: 0 })
  // The fill light's tint comes from the stylesheet and is re-read when the theme flips.
  const fillLight = useThemed(() => themeColor('--light-fill'))

  // The sandbox stands the world up the other way (y is up) and frames the floor.
  useEffect(() => {
    if (mode !== 'sandbox' || viewMode !== '3d') return
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    camera.up.set(0, 1, 0)
    if (sideView) camera.position.set(0, 2.5, 16)
    else camera.position.set(9, 6, 13)
    c?.target.set(0, 1.2, 0)
    camera.lookAt(0, 1.2, 0)
    c?.update()
    return () => {
      // Put the maths view back the way it was when leaving the sandbox.
      camera.up.set(0, 0, 1)
    }
  }, [mode, viewMode, sideView, camera, controls])

  useEffect(() => {
    if (!command.nonce) return
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    // Read at the moment of the command: a window resize must not repeat the last "fit".
    const { width, height } = get().size
    if (useApp.getState().mode === 'sandbox') {
      // The maths presets below put the camera 12 m under the floor. Frame the objects instead,
      // where they are now rather than where they started.
      const { bodies, sideView } = useSandbox.getState()
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      for (const b of bodies) {
        if (b.shape === 'ground') continue
        const p = engine.world?.state(b.id)?.position ?? b.position
        const r = Math.max(...b.size) / 2
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p[k] - r)
          max[k] = Math.max(max[k], p[k] + r)
        }
      }
      const floor = bodies.find((b) => b.shape === 'ground')
      const top = floor ? floor.position[1] + floor.size[1] / 2 : 0
      if (!Number.isFinite(min[0])) {
        min[0] = -4
        max[0] = 4
        min[1] = top
        max[1] = top + 3
        min[2] = -1
        max[2] = 1
      }
      min[1] = Math.min(min[1], top)
      const cx = (min[0] + max[0]) / 2
      const cy = (min[1] + max[1]) / 2
      const cz = (min[2] + max[2]) / 2
      const r = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 3)
      camera.up.set(0, 1, 0)
      if (sideView) camera.position.set(cx, cy + r * 0.25, cz + r * 1.6)
      else camera.position.set(cx + r * 0.9, cy + r * 0.7, cz + r * 1.2)
      c?.target.set(cx, cy, cz)
      camera.lookAt(cx, cy, cz)
      c?.update()
      return
    }
    if (command.kind === 'fit') {
      const box = command.box ?? sceneBounds()
      if (box) {
        const cx = (box.min[0] + box.max[0]) / 2
        const cy = (box.min[1] + box.max[1]) / 2
        const cz = (box.min[2] + box.max[2]) / 2
        const w = Math.max(box.max[0] - box.min[0], 1)
        const h = Math.max(box.max[1] - box.min[1], 1)
        if (viewMode === '2d') {
          camera.position.set(cx, cy, 100)
          ;(camera as THREE.OrthographicCamera).zoom = Math.max(2, Math.min(width / (w * 1.35), height / (h * 1.45), 400))
          camera.updateProjectionMatrix()
          c?.target.set(cx, cy, 0)
        } else {
          const r = Math.max(w, h, box.max[2] - box.min[2], 2)
          const dir = camera.position.clone().sub(c?.target ?? new THREE.Vector3()).normalize()
          c?.target.set(cx, cy, cz)
          camera.position.set(cx + dir.x * r * 2.2, cy + dir.y * r * 2.2, cz + dir.z * r * 2.2)
        }
        c?.update()
        return
      }
    }
    if (viewMode === '2d') {
      camera.position.set(0, 0, 100)
      ;(camera as THREE.OrthographicCamera).zoom = 50
      camera.updateProjectionMatrix()
      c?.target.set(0, 0, 0)
    } else {
      camera.position.set(...HOME_3D.position)
      c?.target.set(...HOME_3D.target)
    }
    c?.update()
  }, [command, viewMode, camera, controls, get])

  useFrame((_state, dt) => {
    if (pendingTurn.az !== 0 || pendingTurn.el !== 0) {
      const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
      // Only the maths drawing's 3-D view turns this way; anywhere else a leftover turn is dropped.
      if (viewMode === '3d' && drawing && c) {
        const t = c.target
        // On a canvas that draws on demand the first frame after a pause reports the whole pause
        // as its dt, which would jump the full turn in one go instead of easing it in.
        const s = stepTurn([camera.position.x, camera.position.y, camera.position.z], [t.x, t.y, t.z], pendingTurn, Math.min(dt, 1 / 30))
        camera.position.set(...s.position)
        pendingTurn.az = s.pending.az
        pendingTurn.el = s.pending.el
        c.update()
        invalidate()
      } else {
        pendingTurn.az = 0
        pendingTurn.el = 0
      }
    }
    const L = last.current
    if (viewMode === '2d') {
      const b = orthoBounds(camera, size)
      const wpp = worldPerPixel(camera, size)
      const w = b.xMax - b.xMin
      const h = b.yMax - b.yMin
      const cx = (b.xMin + b.xMax) / 2
      const cy = (b.yMin + b.yMax) / 2
      const moved = Math.abs(cx - L.cx) > w * 0.25 || Math.abs(cy - L.cy) > h * 0.25
      const zoomed = !(Math.abs(wpp / L.wpp - 1) < 0.04)
      const resized = size.width !== L.w || size.height !== L.h
      if (moved || zoomed || resized) {
        last.current = { cx, cy, wpp, w: size.width, h: size.height }
        useView.setState((s) => ({
          xMin: cx - w,
          xMax: cx + w,
          yMin: cy - h,
          yMax: cy + h,
          viewH: h,
          wpp,
          widthPx: size.width,
          version: s.version + 1
        }))
      }
    } else {
      const wpp = worldPerPixel(camera, size, [0, 0, 0])
      if (!(Math.abs(wpp / L.wpp - 1) < 0.04)) {
        last.current = { ...L, wpp }
        const half = niceStep(camera.position.length() / 12) * 10
        useView.setState((s) => ({ xMin: -half, xMax: half, yMin: -half, yMax: half, viewH: half * 2, wpp, widthPx: size.width, version: s.version + 1 }))
      }
    }
  })

  if (viewMode === '2d') {
    return (
      <>
        <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={50} near={0.1} far={1000} />
        <MapControls
          makeDefault
          enableRotate={false}
          screenSpacePanning
          zoomToCursor
          // A notch of the wheel used to jump; this is a drawing with measurements on it, so
          // getting the scale you want matters. Hold Ctrl for a finer step still.
          zoomSpeed={fineZoom ? 0.15 : 0.6}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
          minZoom={0.05}
          maxZoom={20000}
        />
      </>
    )
  }
  return (
    <>
      <PerspectiveCamera makeDefault position={[...HOME_3D.position]} fov={45} near={0.01} far={5000} up={[0, 0, 1]} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} mouseButtons={mouseButtons} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, -8, 14]} intensity={2.2} />
      <directionalLight position={[-10, 6, -4]} intensity={0.6} color={fillLight} />
    </>
  )
}
