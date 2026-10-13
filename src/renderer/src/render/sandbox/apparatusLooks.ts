// Apparatus looks (SB59): realistic school laboratory visuals for the lever and Atwood machine.
// Code-drawn textures for metre rules, symmetrical knife-edge pivot, slotted-mass hangers with
// slotted discs, spoked pulley wheel, retort stand with boss-head clamp and fork bracket.
// Pure math & Three.js geometry, fully runnable in headless Node tests.

import * as THREE from 'three/webgpu'
import type { BodyDef } from '../../sim/types'
import type { V3 } from '../../math/vec'
import { discCountOf } from '../../sim/apparatus'
import { EDGE_TONE, mergeMeshes, type MeshData } from '../sandboxLooks'

// ---------------------------------------------------------------------------
// A. Detection of apparatus parts
// ---------------------------------------------------------------------------

export function isMetreRule(def: BodyDef): boolean {
  const name = def.name.toLowerCase()
  // By name, or by an id the apparatus builders give a rule ('rule', 'atwood_rule', 'metre_rule', 'lever_beam').
  return name === 'beam' || name === 'metre rule' || def.id === 'rule' || def.id.endsWith('_rule') || def.id.includes('lever_beam')
}

function isKnifeEdgeWedge(def: BodyDef): boolean {
  const name = def.name.toLowerCase()
  return name.includes('knife') || name.includes('wedge') || def.id.includes('wedge') || def.id.includes('knife')
}

function isSlottedHanger(def: BodyDef): boolean {
  const name = def.name.toLowerCase()
  return name.includes('hanger') || def.id.includes('hanger') || name === 'm₁' || name === 'm₂'
}

function isAtwoodPulley(def: BodyDef): boolean {
  return def.shape === 'pulley' && (def.name.toLowerCase().includes('pulley') || def.id.includes('atwood'))
}

function isPulleyBracket(def: BodyDef): boolean {
  const name = def.name.toLowerCase()
  return name.includes('bracket') || def.id.includes('bracket')
}

// ---------------------------------------------------------------------------
// B. Code-drawn textures for metre rules (Canvas 2D)
// ---------------------------------------------------------------------------

let beamTextureCache: THREE.CanvasTexture | null = null
let vertTextureCache: THREE.CanvasTexture | null = null

/**
 * Creates or retrieves the code-drawn CanvasTexture for the metre rule.
 * - 'beam': marked 50 … 0 … 50 cm from centre pivot.
 * - 'vertical': marked 0 … 100 cm along the 1 m rule.
 * Returns null in headless Node / Vitest environments where document is undefined.
 */
export function getMetreRuleTexture(kind: 'beam' | 'vertical'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null

  if (kind === 'beam') {
    if (!beamTextureCache) beamTextureCache = createBeamRuleTexture()
    return beamTextureCache
  } else {
    if (!vertTextureCache) vertTextureCache = createVerticalRuleTexture()
    return vertTextureCache
  }
}

function createBeamRuleTexture(): THREE.CanvasTexture {
  const w = 2048
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Light wood grain background
  ctx.fillStyle = '#deb887'
  ctx.fillRect(0, 0, w, h)

  // Subtle wood grain streaks
  ctx.fillStyle = 'rgba(180, 130, 70, 0.12)'
  for (let y = 8; y < h; y += 14) {
    ctx.fillRect(0, y, w, 3 + (y % 4))
  }

  // Border lines along edges
  ctx.strokeStyle = '#2d2319'
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, w, h)

  // 100 cm along the 1.0 m rule
  ctx.fillStyle = '#1e293b'
  ctx.strokeStyle = '#1e293b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = 'bold 24px monospace'

  for (let cm = 0; cm <= 100; cm++) {
    const x = (cm / 100) * (w - 24) + 12
    if (cm % 10 === 0) {
      // 10 cm mark: long tick and number
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 52)
      ctx.stroke()

      // Distance from pivot at 50 cm: 50 … 0 … 50
      const distFromPivot = Math.abs(50 - cm)
      ctx.fillText(`${distFromPivot}`, x, 60)
    } else if (cm % 5 === 0) {
      // 5 cm mark: medium tick
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 38)
      ctx.stroke()
    } else {
      // 1 cm mark: short tick
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 22)
      ctx.stroke()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

function createVerticalRuleTexture(): THREE.CanvasTexture {
  const w = 128
  const h = 2048
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Light wood background
  ctx.fillStyle = '#deb887'
  ctx.fillRect(0, 0, w, h)

  // Wood grain
  ctx.fillStyle = 'rgba(180, 130, 70, 0.12)'
  for (let x = 8; x < w; x += 14) {
    ctx.fillRect(x, 0, 3 + (x % 4), h)
  }

  ctx.strokeStyle = '#2d2319'
  ctx.lineWidth = 3
  ctx.strokeRect(0, 0, w, h)

  ctx.fillStyle = '#1e293b'
  ctx.strokeStyle = '#1e293b'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 24px monospace'

  // 0 at bottom (y = h - margin), 100 at top (y = margin)
  for (let cm = 0; cm <= 100; cm++) {
    const y = h - 16 - (cm / 100) * (h - 32)
    if (cm % 10 === 0) {
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(52, y)
      ctx.stroke()
      ctx.fillText(`${cm}`, 60, y)
    } else if (cm % 5 === 0) {
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(38, y)
      ctx.stroke()
    } else {
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(22, y)
      ctx.stroke()
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  return texture
}

// ---------------------------------------------------------------------------
// C. Helpers for converting BufferGeometry to MeshData and back
// ---------------------------------------------------------------------------

function dataOf(g: THREE.BufferGeometry): MeshData {
  const positions = Float32Array.from(g.getAttribute('position').array as ArrayLike<number>)
  const normals = Float32Array.from(g.getAttribute('normal').array as ArrayLike<number>)
  const count = positions.length / 3
  const index = g.getIndex()
  const source: ArrayLike<number> = index ? (index.array as ArrayLike<number>) : Array.from({ length: count }, (_, i) => i)
  const indices = count <= 65536 ? new Uint16Array(source) : new Uint32Array(source)
  g.dispose()
  return { positions, normals, indices }
}

function meshGeometry(m: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3))
  if (m.factors) g.setAttribute('color', new THREE.BufferAttribute(m.factors, 3))
  g.setIndex(new THREE.BufferAttribute(m.indices, 1))
  return g
}

// ---------------------------------------------------------------------------
// D. Symmetrical Knife-Edge Wedge Pivot
// ---------------------------------------------------------------------------

/** Symmetrical triangular prism with sharp knife-edge along top z-axis. */
function buildKnifeEdgeMesh(size: V3): MeshData {
  const [w, h, d] = size.map(Math.abs)
  const hw = w / 2
  const hh = h / 2
  const hd = d / 2

  // 6 vertices of an isosceles triangular prism:
  // Base corners at y = -hh:
  // 0: [-hw, -hh, -hd], 1: [hw, -hh, -hd], 2: [hw, -hh, hd], 3: [-hw, -hh, hd]
  // Top ridge at y = hh (x = 0):
  // 4: [0, hh, -hd], 5: [0, hh, hd]

  const p: V3[] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, -hh, hd],
    [-hw, -hh, hd],
    [0, hh, -hd],
    [0, hh, hd]
  ]

  // Normal for slanted left face: from [-hw, -hh] to [0, hh] -> tangent is [hw, 2hh], normal is [-2hh, hw]
  const leftLen = Math.hypot(2 * hh, hw) || 1
  const nLeft: V3 = [-(2 * hh) / leftLen, hw / leftLen, 0]
  const nRight: V3 = [(2 * hh) / leftLen, hw / leftLen, 0]

  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  function addQuad(v0: V3, v1: V3, v2: V3, v3: V3, norm: V3) {
    const base = positions.length / 3
    positions.push(...v0, ...v1, ...v2, ...v3)
    normals.push(...norm, ...norm, ...norm, ...norm)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }

  function addTri(v0: V3, v1: V3, v2: V3, norm: V3) {
    const base = positions.length / 3
    positions.push(...v0, ...v1, ...v2)
    normals.push(...norm, ...norm, ...norm)
    indices.push(base, base + 1, base + 2)
  }

  // Bottom face (pointing down)
  addQuad(p[0], p[3], p[2], p[1], [0, -1, 0])
  // Left slanted face
  addQuad(p[0], p[1], p[4], p[4], nLeft) // degenerate quad replaced below:
  positions.length = 0
  normals.length = 0
  indices.length = 0

  // Crisp faces with correct vertex normals:
  // Bottom:
  addQuad(p[3], p[2], p[1], p[0], [0, -1, 0])
  // Slanted right face: 1 -> 2 -> 5 -> 4
  addQuad(p[1], p[2], p[5], p[4], nRight)
  // Slanted left face: 3 -> 0 -> 4 -> 5
  addQuad(p[3], p[0], p[4], p[5], nLeft)
  // Front triangle (+z): 3 -> 5 -> 2
  addTri(p[3], p[5], p[2], [0, 0, 1])
  // Back triangle (-z): 0 -> 1 -> 4
  addTri(p[0], p[1], p[4], [0, 0, -1])

  const mesh: MeshData = {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: indices.length <= 65536 ? new Uint16Array(indices) : new Uint32Array(indices),
    factors: new Float32Array(positions.length).fill(1)
  }

  return mesh
}

// ---------------------------------------------------------------------------
// E. Slotted-Mass Hanger Geometry with stacked slotted discs
// ---------------------------------------------------------------------------

/**
 * Builds a realistic school laboratory slotted-mass hanger:
 * - Central vertical stem with top hook
 * - Bottom support flange
 * - Stack of N slotted discs (0.5 kg each), with keyhole radial slots
 */
function buildSlottedHangerMesh(def: BodyDef): MeshData {
  const parts: MeshData[] = []
  const mass = Math.max(0.05, def.mass)
  const discCount = discCountOf(mass)
  const [radius, fullH] = def.size

  const stemR = 0.003
  const discR = Math.max(0.025, radius)
  const discH = 0.009
  const flangeR = discR * 0.95
  const flangeH = 0.004

  // 1. Central stem cylinder
  const stem = dataOf(new THREE.CylinderGeometry(stemR, stemR, fullH, 12))
  parts.push({ ...stem, factors: new Float32Array(stem.positions.length).fill(0.9) })

  // 2. Bottom flange plate
  const flangeY = -fullH / 2 + flangeH / 2
  const flangeGeo = new THREE.CylinderGeometry(flangeR, flangeR, flangeH, 20)
  flangeGeo.translate(0, flangeY, 0)
  const flange = dataOf(flangeGeo)
  parts.push({ ...flange, factors: new Float32Array(flange.positions.length).fill(EDGE_TONE) })

  // 3. Stacked slotted discs
  const slotW = 0.007
  const halfSlot = slotW / 2
  const slotAngle = Math.asin(Math.min(0.9, halfSlot / discR))

  for (let k = 0; k < discCount; k++) {
    const discY = -fullH / 2 + flangeH + k * (discH + 0.0015) + discH / 2
    if (discY + discH / 2 > fullH / 2 - 0.02) break // stay below hook

    // Build disc as a cylinder with a radial slot cut out along +x
    // Extrude a 2D shape with slot
    const shape = new THREE.Shape()
    // Start at edge of slot on positive y
    shape.moveTo(stemR, halfSlot)
    shape.lineTo(Math.cos(slotAngle) * discR, halfSlot)
    // Arc around to negative y
    shape.absarc(0, 0, discR, slotAngle, Math.PI * 2 - slotAngle, false)
    shape.lineTo(stemR, -halfSlot)
    shape.closePath()

    // Inner hole for stem
    const hole = new THREE.Path()
    hole.absarc(0, 0, stemR * 1.1, 0, Math.PI * 2, true)
    shape.holes.push(hole)

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: discH,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.0008,
      bevelThickness: 0.0008
    }

    const discGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    discGeo.rotateX(Math.PI / 2) // lay flat horizontally
    // Rotate each disc slightly for realistic school apparatus stack look
    const stagger = ((k * 37) % 360) * (Math.PI / 180)
    discGeo.rotateY(stagger)
    discGeo.translate(0, discY, 0)

    const discData = dataOf(discGeo)
    // Alternate slight tone so discs in the stack are clearly distinct
    const tone = k % 2 === 0 ? 1.0 : 0.88
    parts.push({ ...discData, factors: new Float32Array(discData.positions.length).fill(tone) })
  }

  // 4. Top hook loop (torus segment)
  const hookR = 0.008
  const hookTube = 0.0025
  const hookGeo = new THREE.TorusGeometry(hookR, hookTube, 8, 16, Math.PI * 1.5)
  hookGeo.rotateZ(Math.PI / 4)
  hookGeo.translate(0, fullH / 2 - hookR, 0)
  const hookData = dataOf(hookGeo)
  parts.push({ ...hookData, factors: new Float32Array(hookData.positions.length).fill(0.85) })

  return mergeMeshes(parts)
}

// ---------------------------------------------------------------------------
// F. Spoked Pulley Wheel
// ---------------------------------------------------------------------------

/**
 * Builds a realistic school laboratory pulley:
 * - Grooved rim for string
 * - Central hub with axle
 * - 6 spokes radiating from hub to rim
 */
function buildSpokedPulleyMesh(size: V3): MeshData {
  const parts: MeshData[] = []
  const [r, h] = size
  const rimR = Math.max(0.02, r)
  const rimThickness = Math.max(0.01, h)
  const hubR = rimR * 0.22
  const spokeR = 0.0025

  // 1. Central hub
  const hubGeo = new THREE.CylinderGeometry(hubR, hubR, rimThickness * 1.2, 16)
  hubGeo.rotateZ(Math.PI / 2) // wheel spins on horizontal axle
  const hubData = dataOf(hubGeo)
  parts.push({ ...hubData, factors: new Float32Array(hubData.positions.length).fill(0.85) })

  // 2. Axle pin extending past hub
  const axleGeo = new THREE.CylinderGeometry(hubR * 0.45, hubR * 0.45, rimThickness * 2.2, 12)
  axleGeo.rotateZ(Math.PI / 2)
  const axleData = dataOf(axleGeo)
  parts.push({ ...axleData, factors: new Float32Array(axleData.positions.length).fill(EDGE_TONE) })

  // 3. 6 spokes from hub to rim
  const spokeCount = 6
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i * Math.PI * 2) / spokeCount
    const spokeLen = rimR - hubR
    const spokeGeo = new THREE.CylinderGeometry(spokeR, spokeR, spokeLen, 8)
    spokeGeo.translate(0, spokeLen / 2 + hubR, 0)
    spokeGeo.rotateZ(angle)
    const spokeData = dataOf(spokeGeo)
    parts.push({ ...spokeData, factors: new Float32Array(spokeData.positions.length).fill(0.95) })
  }

  // 4. Outer grooved rim (lathe or tube ring)
  const rimGeo = new THREE.TorusGeometry(rimR - spokeR, rimThickness * 0.45, 12, 32)
  const rimData = dataOf(rimGeo)
  parts.push({ ...rimData, factors: new Float32Array(rimData.positions.length).fill(1.0) })

  return mergeMeshes(parts)
}

// ---------------------------------------------------------------------------
// G. Pulley Fork Bracket
// ---------------------------------------------------------------------------

/**
 * U-shaped fork bracket holding the pulley axle.
 */
function buildForkBracketMesh(size: V3): MeshData {
  const parts: MeshData[] = []
  const [w, h, d] = size
  const armThickness = 0.008

  // Top crossbar
  const topGeo = new THREE.BoxGeometry(w, armThickness, d)
  topGeo.translate(0, h / 2 - armThickness / 2, 0)
  parts.push(dataOf(topGeo))

  // Left prong hanging down
  const prongGeoL = new THREE.BoxGeometry(armThickness, h, d)
  prongGeoL.translate(-w / 2 + armThickness / 2, 0, 0)
  parts.push(dataOf(prongGeoL))

  // Right prong hanging down
  const prongGeoR = new THREE.BoxGeometry(armThickness, h, d)
  prongGeoR.translate(w / 2 - armThickness / 2, 0, 0)
  parts.push(dataOf(prongGeoR))

  const merged = mergeMeshes(parts)
  return { ...merged, factors: new Float32Array(merged.positions.length).fill(0.7) }
}

// ---------------------------------------------------------------------------
// H. Main dispatcher for apparatus geometry
// ---------------------------------------------------------------------------

export function apparatusGeometry(def: BodyDef): THREE.BufferGeometry | null {
  if (isKnifeEdgeWedge(def)) {
    return meshGeometry(buildKnifeEdgeMesh(def.size))
  }
  if (isSlottedHanger(def)) {
    return meshGeometry(buildSlottedHangerMesh(def))
  }
  if (isAtwoodPulley(def)) {
    return meshGeometry(buildSpokedPulleyMesh(def.size))
  }
  if (isPulleyBracket(def)) {
    return meshGeometry(buildForkBracketMesh(def.size))
  }
  // Retort stand parts (base, rod, clamp, arm) use default bodyGeometry rendering
  return null
}
