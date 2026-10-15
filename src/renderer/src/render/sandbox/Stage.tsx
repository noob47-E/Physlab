// The Sandbox's stage: the lights and the floor's metre grid.

import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { useSandbox } from '../../sim/store'
import type { BodyDef } from '../../sim/types'
import { themeColor, useThemed } from '../../app/theme'
import { useReleaseLater } from '../releaseLater'

/** The lights, and the floor's grid. */
export function Stage() {
  const bodies = useSandbox((s) => s.bodies)
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 12, 8]} intensity={1.3} />
      <directionalLight position={[-8, 5, -6]} intensity={0.35} />
      <FloorGrid bodies={bodies} />
    </>
  )
}

/** How far out from the middle the floor's grid reaches, in metres (a whole number of 5 m tiles). */
const GRID_REACH = 40

/** One tile of the grid texture: 5 m square, a bold line on its first edge and a thin line every metre. */
const TILE_METRES = 5
const TILE_PIXELS = 640

/**
 * Metre lines on the floor. Without them two balls three metres apart and two balls thirty centimetres apart look the same,
 * and every distance has to be read off the panel instead of seen.
 *
 * They are painted INTO a texture on a plane lying on the floor, not drawn as lines (the owner, 13 Oct: "the grid lines on
 * the floor are blinking, it is annoying and makes me dizzy"). As GL lines a few millimetres above a floor kilometres wide,
 * the floor and its lines took turns in front as the camera moved (z-fighting), and far lines thinner than a pixel shimmered.
 * A texture cannot do either: its mipmaps (and anisotropic filtering at a slant) blend far lines into a soft tint, and the
 * plane is pulled towards the camera by a depth offset, so it always wins against the floor under it.
 */
function FloorGrid({ bodies }: { bodies: BodyDef[] }) {
  // Read once per theme, not on every render: the grid re-renders whenever the bodies change.
  const gridColour = useThemed(() => themeColor('--grid-major'))
  const floor = bodies.find((b) => b.shape === 'ground')
  // Only the floor's footprint and height shape the grid, so a change to anything else about the floor leaves it alone.
  const width = floor?.size[0]
  const thickness = floor?.size[1]
  const y = floor?.position[1]
  const half = width === undefined ? 0 : Math.min(GRID_REACH, Math.max(TILE_METRES, Math.floor(width / 2 / TILE_METRES) * TILE_METRES))
  const geometry = useMemo(() => {
    if (!half) return null
    const g = new THREE.PlaneGeometry(half * 2, half * 2)
    // One unit of UV is one tile, so the texture repeats by itself and its lines land on whole metres.
    const uv = g.getAttribute('uv') as THREE.BufferAttribute
    const tiles = (half * 2) / TILE_METRES
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * tiles, uv.getY(i) * tiles)
    return g
  }, [half])
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = TILE_PIXELS
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const metre = TILE_PIXELS / TILE_METRES
    ctx.clearRect(0, 0, TILE_PIXELS, TILE_PIXELS)
    ctx.fillStyle = gridColour
    // Thin lines every metre, then the bold 5 m line on the tile's first edge (it repeats on every tile).
    ctx.globalAlpha = 0.45
    for (let m = 1; m < TILE_METRES; m++) {
      ctx.fillRect(m * metre - 1, 0, 2, TILE_PIXELS)
      ctx.fillRect(0, m * metre - 1, TILE_PIXELS, 2)
    }
    ctx.globalAlpha = 0.85
    ctx.fillRect(0, 0, 4, TILE_PIXELS)
    ctx.fillRect(0, 0, TILE_PIXELS, 4)
    const t = new THREE.CanvasTexture(canvas)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 16
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [gridColour])
  useReleaseLater(geometry, (g) => g.dispose())
  useReleaseLater(texture, (t) => t.dispose())
  if (!geometry || !texture || thickness === undefined || y === undefined) return null
  const top = y + thickness / 2
  return (
    <mesh geometry={geometry} position={[0, top, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <meshBasicMaterial
        key={gridColour}
        map={texture}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
        toneMapped={false}
      />
    </mesh>
  )
}
