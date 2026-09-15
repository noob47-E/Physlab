import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MapControls, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { niceStep, orthoBounds, worldPerPixel } from './cameraUtils'
import { useCameraCommand, useView } from './viewState'
import { useScene } from '../core/store'

/** Bounding box of all visible geometry (graphs excluded). */
function sceneBounds(): { min: [number, number, number]; max: [number, number, number] } | null {
  const { ev, objects } = useScene.getState()
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
    if (!objects[id]?.visible) continue
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
    }
  }
  if (!Number.isFinite(min[0])) return null
  // Keep the origin in view so axes stay meaningful.
  add([0, 0, 0])
  return { min, max }
}

export function CameraRig() {
  const viewMode = useScene((s) => s.viewMode)
  const { camera, size, controls } = useThree()
  const command = useCameraCommand()
  const last = useRef({ cx: NaN, cy: NaN, wpp: NaN, w: 0, h: 0 })

  useEffect(() => {
    if (!command.nonce) return
    const c = controls as unknown as { target: THREE.Vector3; update: () => void } | null
    if (command.kind === 'fit') {
      const box = sceneBounds()
      if (box) {
        const cx = (box.min[0] + box.max[0]) / 2
        const cy = (box.min[1] + box.max[1]) / 2
        const cz = (box.min[2] + box.max[2]) / 2
        const w = Math.max(box.max[0] - box.min[0], 1)
        const h = Math.max(box.max[1] - box.min[1], 1)
        if (viewMode === '2d') {
          camera.position.set(cx, cy, 100)
          ;(camera as THREE.OrthographicCamera).zoom = Math.max(2, Math.min(size.width / (w * 1.35), size.height / (h * 1.45), 400))
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
      camera.position.set(9, -12, 9)
      c?.target.set(0, 0, 0)
    }
    c?.update()
  }, [command.nonce, viewMode, camera, controls])

  useFrame(() => {
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
          zoomSpeed={1.2}
          mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }}
          minZoom={0.05}
          maxZoom={20000}
        />
      </>
    )
  }
  return (
    <>
      <PerspectiveCamera makeDefault position={[9, -12, 9]} fov={45} near={0.01} far={5000} up={[0, 0, 1]} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.12} mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, -8, 14]} intensity={2.2} />
      <directionalLight position={[-10, 6, -4]} intensity={0.6} color="#9ec5ff" />
    </>
  )
}
