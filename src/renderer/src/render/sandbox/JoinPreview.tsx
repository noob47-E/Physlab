// The connection being made, from the first object to the cursor.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useSandbox } from '../../sim/store'
import type { V3 } from '../../math/vec'
import { themeColor, useThemed } from '../../app/theme'
import { LINK_LOOK, linkPlacement, visibleRadius } from '../sandboxLooks'
import { unitCylinder } from '../sandboxMeshes'
import { newPlacement, pixelsPerMetre, placeCylinder } from './Links'
import { readoutRef } from './readout'
import { useReleaseLater } from '../releaseLater'

/**
 * Where the cursor is while the second object of a connection is being chosen, in the world,
 * so the preview line from the first object can follow it. Written by the pointer handler and
 * read in a frame; the store never sees it, or every mouse move would re-render the panel.
 */
export const joinCursor: { p: V3 | null } = { p: null }

/**
 * The connection being made: a thread from the first object to the cursor, until the second is
 * chosen. A mesh like the strings, so it shows at any zoom; it was a one-pixel line.
 */
export function JoinPreview() {
  const joinMode = useSandbox((s) => s.joinMode)
  const colour = useThemed(() => themeColor('--accent'))
  const geo = useMemo(() => unitCylinder(), [])
  useReleaseLater(geo, (g) => g.dispose())
  const mesh = useRef<THREE.Mesh>(null)
  const place = useMemo(() => newPlacement(), [])
  const from = joinMode?.step === 'second' ? joinMode.a : undefined
  // Leaving the second step drops the last cursor point, or the next Connect would start with a
  // stale line before the mouse moved.
  useEffect(() => {
    if (!from) joinCursor.p = null
  }, [from])
  useFrame((state) => {
    const m = mesh.current
    const w = readoutRef.current
    if (!m) return
    const st = from && w ? w.state(from) : null
    const p = joinCursor.p
    if (!st || !p) {
      m.visible = false
      return
    }
    linkPlacement(st.position, p, place)
    placeCylinder(m, place, visibleRadius(LINK_LOOK.string.radius, LINK_LOOK.string.minPixels, pixelsPerMetre(state, place.mid)))
    m.visible = place.length > 1e-6
  })
  return (
    <mesh ref={mesh} geometry={geo} renderOrder={15} frustumCulled={false} visible={false}>
      <meshBasicMaterial key={colour} color={colour} transparent opacity={0.9} />
    </mesh>
  )
}
