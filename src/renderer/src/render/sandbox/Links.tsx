// The connections: springs, rods, strings, ropes, pulley ropes and hinge pins.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useSandbox } from '../../sim/store'
import type { BodyDef, Link } from '../../sim/types'
import type { V3 } from '../../math/vec'
import { comOffset, linkDepths, linkEnds } from '../../sim/links'
import { rotateByEuler } from '../../sim/rotate'
import { worldPerPixel } from '../cameraUtils'
import { themeColor, useThemed } from '../../app/theme'
import { BEAD_SCALE, beadMatrices, hingePin, LINK_LOOK, linkPlacement, pulleyRopePath, ropeMatrices, springLook, visibleRadius, writeCoil, type LinkPlacement } from '../sandboxLooks'
import { coilGeometry, unitBall, unitCylinder } from '../sandboxMeshes'
import { readoutRef, type SimReadout } from './readout'
import { useReleaseLater } from '../releaseLater'
import { isMetreRule } from '../../sim/apparatus'

/**
 * How strongly a connection catches the light: the steel of a spring, a rod and a pin shines a
 * little, a string and a rope do not. A grey, not a colour: it is the white of the lights, dimmed.
 */
const METAL_SHINE = new THREE.Color().setScalar(0.45)
const NO_SHINE = new THREE.Color().setScalar(0.04)

/** Pixels per metre on screen at a point: what visibleRadius needs to keep a thin thing in sight. */
export function pixelsPerMetre(state: { camera: THREE.Camera; size: { width: number; height: number } }, at: ArrayLike<number>): number {
  return 1 / worldPerPixel(state.camera, state.size, [at[0], at[1], at[2]])
}

/** A placement for a unit cylinder, filled in place each frame. */
export const newPlacement = (): LinkPlacement => ({ mid: [0, 0, 0], quat: [0, 0, 0, 1], length: 0 })

/** Stands a unit cylinder (radius 1, height 1, along y) on a placement, `r` thick. */
export function placeCylinder(m: THREE.Object3D, place: LinkPlacement, r: number): void {
  m.position.set(place.mid[0], place.mid[1], place.mid[2])
  m.quaternion.set(place.quat[0], place.quat[1], place.quat[2], place.quat[3])
  m.scale.set(r, Math.max(place.length, 1e-6), r)
}

/** The connections' colours in this theme, read once per theme. */
interface LinkColours {
  spring: string
  rod: string
  string: string
  rope: string
}

/**
 * The rods, strings, springs, ropes and hinge pins themselves. A connection you cannot see is a
 * mystery force, so each one is drawn between the two bodies as they move, from buffers and
 * transforms updated in place every frame. Each kind has its own shape and its own colour
 * (LINK_LOOK): they were all one-pixel lines in one grey.
 */
export function Links() {
  const links = useSandbox((s) => s.links)
  const bodies = useSandbox((s) => s.bodies)
  // Who hangs from whom (SB61): a link is drawn to the point it holds each end at, as the engine holds it.
  const depths = useMemo(() => linkDepths(bodies, links), [bodies, links])
  const colours = useThemed<LinkColours>(() => ({
    spring: themeColor(LINK_LOOK.spring.token),
    rod: themeColor(LINK_LOOK.rod.token),
    string: themeColor(LINK_LOOK.string.token),
    rope: themeColor(LINK_LOOK.rope.token)
  }))
  return (
    <>
      {links.map((l) => (
        <LinkView key={l.id} link={l} bodies={bodies} depths={depths} colours={colours} />
      ))}
    </>
  )
}

function LinkView({ link, bodies, depths, colours }: { link: Link; bodies: BodyDef[]; depths: Map<string, number>; colours: LinkColours }) {
  // The two points a rod, string or spring runs between now: each end's hold point (links.ts linkEnds), from the drawn poses.
  const a = bodies.find((b) => b.id === link.a)
  const b = bodies.find((b) => b.id === link.b)
  const ends = (w: SimReadout): [V3, V3] | null => {
    const sa = w.drawn(link.a)
    const sb = w.drawn(link.b)
    if (!sa || !sb || !a || !b) return null
    return linkEnds(link, a, b, depths, sa, sb)
  }
  switch (link.kind) {
    case 'spring':
      return <SpringCoil link={link} ends={ends} colour={colours.spring} />
    case 'rod':
      return <Bar ends={ends} look={LINK_LOOK.rod} colour={colours.rod} shine={METAL_SHINE} gloss={50} />
    case 'string':
      return <Bar ends={ends} look={LINK_LOOK.string} colour={colours.string} shine={NO_SHINE} gloss={4} />
    case 'rope':
      // A chain of 20 cm links in the engine: drawn through their centres, a bead on every joint.
      return <RopeTube pathOf={(w) => w.linkPath(link)} look={LINK_LOOK.rope} beadScale={BEAD_SCALE} beadTone={0.72} colour={colours.rope} />
    case 'pulley': {
      // One rope, no links: up to the rim, half way round the wheel, down to the other side.
      const wheel = bodies.find((b) => b.id === link.over)
      const axle: V3 = wheel ? rotateByEuler(wheel.rotation, [0, 1, 0]) : [0, 0, 1]
      const pathOf = (w: SimReadout): V3[] => {
        const p = w.linkPath(link)
        return p.length === 4 ? pulleyRopePath(p[0], p[1], p[2], p[3], axle, 16) : p
      }
      return <RopeTube pathOf={pathOf} look={LINK_LOOK.pulley} beadScale={1} beadTone={1} colour={colours.rope} />
    }
    case 'hinge': {
      const body = bodies.find((b) => b.id === link.a)
      return body ? <HingePinView link={link} body={body} colour={colours.rod} /> : null
    }
    default:
      // A weld is two bodies glued where they stand: there is nothing between them to draw.
      return null
  }
}

/**
 * A spring as a coil that stretches and squeezes with the link and keeps its turns (P28 L1): the
 * geometry is rewritten in place every frame for the length it has now, so the wire keeps its
 * thickness however far it is pulled. It was a 12-step zigzag one pixel wide.
 */
function SpringCoil({ link, ends, colour }: { link: Link; ends: (w: SimReadout) => [V3, V3] | null; colour: string }) {
  const look = useMemo(() => springLook(link.length), [link.length])
  const geo = useMemo(() => coilGeometry(look.shape), [look])
  useReleaseLater(geo, (g) => g.dispose())
  const mesh = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    const m = mesh.current
    const w = readoutRef.current
    if (!m || !w) return
    const e = ends(w)
    if (!e) {
      m.visible = false
      return
    }
    const [a, b] = e
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
    const wire = visibleRadius(look.wireRadius, LINK_LOOK.spring.minPixels, pixelsPerMetre(state, mid))
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute
    writeCoil(a, b, look.coilRadius, wire, pos.array as Float32Array, nor.array as Float32Array, look.shape)
    pos.needsUpdate = true
    nor.needsUpdate = true
    m.visible = true
  })
  return (
    <mesh ref={mesh} geometry={geo} frustumCulled={false} renderOrder={12} visible={false}>
      <meshPhongMaterial key={colour} color={colour} specular={METAL_SHINE} shininess={60} />
    </mesh>
  )
}

/** A rod (a solid bar) or a string (a thin thread): one unit cylinder between its hold points, never thinner on screen than its look allows. */
function Bar({ ends, look, colour, shine, gloss }: { ends: (w: SimReadout) => [V3, V3] | null; look: { radius: number; minPixels: number }; colour: string; shine: THREE.Color; gloss: number }) {
  const geo = useMemo(() => unitCylinder(), [])
  useReleaseLater(geo, (g) => g.dispose())
  const mesh = useRef<THREE.Mesh>(null)
  const place = useMemo(() => newPlacement(), [])
  useFrame((state) => {
    const m = mesh.current
    const w = readoutRef.current
    if (!m || !w) return
    const e = ends(w)
    if (!e) {
      m.visible = false
      return
    }
    linkPlacement(e[0], e[1], place)
    placeCylinder(m, place, visibleRadius(look.radius, look.minPixels, pixelsPerMetre(state, place.mid)))
    m.visible = place.length > 1e-6
  })
  return (
    <mesh ref={mesh} geometry={geo} frustumCulled={false} renderOrder={12} visible={false}>
      <meshPhongMaterial key={colour} color={colour} specular={shine} shininess={gloss} />
    </mesh>
  )
}

/** Room for the longest rope (60 links) and its two ends, or a pulley rope's arc. */
const ROPE_CAPACITY = 96

/**
 * A rope drawn through the points `pathOf` gives each frame: unit cylinders end to end, one per
 * gap, and a bead on every joint (`beadScale` of the rope's width, `beadTone` of its colour), all
 * as two instanced meshes so a sixty-link rope is two draw calls.
 */
function RopeTube({ pathOf, look, beadScale, beadTone, colour }: { pathOf: (w: SimReadout) => V3[]; look: { radius: number; minPixels: number }; beadScale: number; beadTone: number; colour: string }) {
  const piece = useMemo(() => unitCylinder(), [])
  const bead = useMemo(() => unitBall(), [])
  useEffect(
    () => () => {
      piece.dispose()
      bead.dispose()
    },
    [piece, bead]
  )
  const pieces = useRef<THREE.InstancedMesh>(null)
  const beads = useRef<THREE.InstancedMesh>(null)
  const beadColour = useMemo(() => '#' + new THREE.Color(colour).multiplyScalar(beadTone).getHexString(), [colour, beadTone])
  useEffect(() => {
    // Rewritten every frame: tell the GPU so.
    pieces.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    beads.current?.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
  }, [])
  useFrame((state) => {
    const w = readoutRef.current
    const p = pieces.current
    const k = beads.current
    if (!w || !p || !k) return
    const path = pathOf(w)
    const r = visibleRadius(look.radius, look.minPixels, pixelsPerMetre(state, path[Math.floor(path.length / 2)] ?? [0, 0, 0]))
    const n = ropeMatrices(path, r, p.instanceMatrix.array as Float32Array)
    p.count = n
    p.instanceMatrix.needsUpdate = true
    // An empty mesh drawn every frame makes WebGPU warn every frame.
    p.visible = n > 0
    const m = beadMatrices(path, r * beadScale, k.instanceMatrix.array as Float32Array)
    k.count = m
    k.instanceMatrix.needsUpdate = true
    k.visible = m > 0
  })
  return (
    <>
      <instancedMesh ref={pieces} args={[piece, undefined, ROPE_CAPACITY]} frustumCulled={false} renderOrder={12} visible={false}>
        <meshPhongMaterial key={colour} color={colour} specular={NO_SHINE} shininess={6} />
      </instancedMesh>
      <instancedMesh ref={beads} args={[bead, undefined, ROPE_CAPACITY]} frustumCulled={false} renderOrder={12} visible={false}>
        <meshPhongMaterial key={beadColour} color={beadColour} specular={NO_SHINE} shininess={6} />
      </instancedMesh>
    </>
  )
}

/** Half a hinge pin's length: through the body along its own z, and a little out of each side. */
function pinHalfLength(b: BodyDef): number {
  const [a, , c] = b.size.map(Math.abs)
  const round = b.shape === 'sphere' || b.shape === 'cylinder' || b.shape === 'capsule' || b.shape === 'pulley'
  return (round ? a : b.shape === 'cone' ? a / 2 : c / 2) + 0.03
}

/**
 * The pin a hinge turns about, through its pivot along the hinge axis, turning with the first
 * body. A hinge was drawn as nothing at all, so the seesaw's plank turned about a point no one
 * could see. The pivot is stored from the body's centre of mass and drawn from its position.
 */
function HingePinView({ link, body, colour }: { link: Link; body: BodyDef; colour: string }) {
  const geo = useMemo(() => unitCylinder(), [])
  useReleaseLater(geo, (g) => g.dispose())
  const mesh = useRef<THREE.Mesh>(null)
  const place = useMemo(() => newPlacement(), [])
  const pivot = useMemo((): V3 => {
    const c = comOffset(body)
    const p = link.pivotA ?? [0, 0, 0]
    return [c[0] + p[0], c[1] + p[1], c[2] + p[2]]
  }, [body, link.pivotA])
  const half = pinHalfLength(body)
  useFrame((state) => {
    const m = mesh.current
    const w = readoutRef.current
    if (!m || !w) return
    const st = w.drawn(link.a)
    if (!st) {
      m.visible = false
      return
    }
    const isThin = isMetreRule(body) || body.size[1] < 0.08
    const baseRadius = isThin ? Math.min(LINK_LOOK.hinge.radius, body.size[1] * 0.25) : LINK_LOOK.hinge.radius
    const minPx = isThin ? 2 : LINK_LOOK.hinge.minPixels
    hingePin(st.position, st.rotation, pivot, half, place)
    placeCylinder(m, place, visibleRadius(baseRadius, minPx, pixelsPerMetre(state, place.mid)))
    m.visible = true
  })
  return (
    <mesh ref={mesh} geometry={geo} frustumCulled={false} renderOrder={12} visible={false}>
      <meshPhongMaterial key={colour} color={colour} specular={METAL_SHINE} shininess={60} />
    </mesh>
  )
}
