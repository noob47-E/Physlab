// 3D-3B: Geometry's solids and planes in the 3-D view, and the handles of what is selected. A solid is a soft fill (about
// 30 %, never hiding what is behind or inside it) with its edges as constant-pixel lines and, for a pyramid, cone or
// cylinder, its height as a dashed line; a plane through three points is a sheet round them. The handles (render/handles3d.ts)
// are small balls in their own tokens, the lift handle with a short arrow up from its point.

import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { FatLine } from './FatLine'
import { labelAnchors } from './overlay'
import { worldPerPixel } from './cameraUtils'
import { useReleaseLater } from './releaseLater'
import { drawnBoxes } from './Graph3DViews'
import { handlesOf } from './handles3d'
import { boxOf } from '../math/graph3d'
import { planeSheet } from '../math/solidShape'
import { shownColor, themeColor, useTheme } from '../app/theme'
import type { Computed, PlaneObj, SceneObject, SolidObj } from '../core/types'

type C<T extends Computed['type']> = Extract<Computed, { type: T }>

/** A solid or plane taken away leaves Home's box. */
function useForgetBox(id: string): void {
  useEffect(() => () => void drawnBoxes.delete(id), [id])
}

/** Kinds whose height is drawn as a dashed line from the centre of the base to the top. */
const HEIGHT_LINE = new Set(['pyramid', 'cone', 'cylinder', 'frustum'])

export function SolidView({ obj, c, selected, hovered }: { obj: SolidObj; c: C<'solid'>; selected: boolean; hovered: boolean }) {
  useForgetBox(obj.id)
  const theme = useTheme((t) => t.theme)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the signal that the stylesheet changed, not a value read here
  const edge = useMemo(() => shownColor(obj), [obj, theme])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the signal that the stylesheet changed, not a value read here
  const fill = useMemo(() => themeColor('--solid-fill', obj.color), [obj.color, theme])
  const sh = c.shape
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sh.vertices.flat()), 3))
    // A fan over each face (every face of a solid here is convex).
    g.setIndex(sh.faces.flatMap((f) => f.slice(2).flatMap((_, k) => [f[0], f[k + 1], f[k + 2]])))
    g.computeVertexNormals()
    return g
  }, [sh])
  useReleaseLater(geo, (g) => g.dispose())
  const edges = useMemo(() => sh.edges.flat(), [sh])
  useFrame(() => {
    labelAnchors.set(obj.id, { p: sh.top, dy: -14 })
    const box = boxOf(sh.vertices.flat())
    if (box) drawnBoxes.set(obj.id, box)
  })
  return (
    <group>
      <mesh geometry={geo} renderOrder={1}>
        <meshStandardMaterial key={fill} color={fill} side={THREE.DoubleSide} transparent opacity={selected ? 0.38 : hovered ? 0.34 : 0.28} depthWrite={false} roughness={0.8} />
      </mesh>
      {selected && <FatLine points={edges} segments color={themeColor('--sel-glow', edge)} width={4.6} depthTest renderOrder={2} />}
      <FatLine points={edges} segments color={edge} width={selected ? 2.4 : 1.8} depthTest renderOrder={3} />
      {HEIGHT_LINE.has(obj.kind) && <FatLine points={[sh.base, sh.top]} color={edge} width={1.4} dashed dashSize={0.18} gapSize={0.14} renderOrder={3} />}
    </group>
  )
}

export function PlaneObjView({ obj, c, selected, hovered }: { obj: PlaneObj; c: C<'plane'>; selected: boolean; hovered: boolean }) {
  useForgetBox(obj.id)
  const theme = useTheme((t) => t.theme)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the signal that the stylesheet changed, not a value read here
  const colour = useMemo(() => shownColor(obj), [obj, theme])
  const sheet = useMemo(() => planeSheet(...c.pts), [c.pts])
  const geo = useMemo(() => {
    if (sheet.length < 4) return null
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sheet.flat()), 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.computeVertexNormals()
    return g
  }, [sheet])
  useReleaseLater(geo ?? undefined, (g) => g.dispose())
  useFrame(() => {
    if (sheet.length) {
      labelAnchors.set(obj.id, { p: sheet[2] })
      const box = boxOf(sheet.flat())
      if (box) drawnBoxes.set(obj.id, box)
    }
  })
  if (!geo) return null
  return (
    <group>
      <mesh geometry={geo} renderOrder={1}>
        <meshStandardMaterial key={colour} color={colour} side={THREE.DoubleSide} transparent opacity={selected ? 0.42 : hovered ? 0.36 : 0.28} depthWrite={false} roughness={0.8} />
      </mesh>
      <FatLine points={sheet} closed color={colour} width={selected ? 2.6 : 1.6} depthTest renderOrder={3} />
    </group>
  )
}

/** One ball for every handle, never disposed: a handle comes and goes with the selection. */
const BALL = new THREE.SphereGeometry(1, 16, 12)

/** The handles of the selected objects in the 3-D view: an orange size ball, a cyan height ball, a lift arrow. */
export function Handles3D({ objects, values, selection }: { objects: Record<string, SceneObject>; values: Map<string, Computed>; selection: readonly string[] }) {
  const { camera, size } = useThree()
  const theme = useTheme((t) => t.theme)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- theme is the signal that the stylesheet changed, not a value read here
  const colours = useMemo(() => ({ size: themeColor('--handle-size'), height: themeColor('--handle-height') }), [theme])
  const list = selection.flatMap((id) => {
    const o = objects[id]
    const c = values.get(id)
    if (!o || !c || !o.visible) return []
    const anchor = c.type === 'point' ? c.p : c.type === 'solid' ? c.shape.base : null
    if (!anchor) return []
    const wpp = worldPerPixel(camera, size, anchor)
    return handlesOf(o, c, wpp).map((h) => ({ key: `${id}:${h.part}`, h, wpp }))
  })
  return (
    <>
      {list.map(({ key, h, wpp }) => {
        const colour = h.part === 'size' ? colours.size : colours.height
        return (
          <group key={key}>
            {h.from && <FatLine points={[h.from, h.at]} color={colour} width={2.2} renderOrder={7} />}
            <mesh geometry={BALL} dispose={null} position={h.at} renderOrder={8} scale={6 * wpp}>
              <meshBasicMaterial key={colour} color={colour} depthTest={false} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}
