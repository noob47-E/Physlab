// The paths the traced bodies have taken.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import type { BodyDef } from '../../sim/types'
import type { V3 } from '../../math/vec'
import { drawnColour } from '../../sim/palette'
import { themeColor, useTheme } from '../../app/theme'
import { readoutRef } from './readout'

/** How many segments a traced body remembers: about twenty seconds of flight. */
const TRACE_POINTS = 600

/**
 * The path a body has taken. Drawn into a buffer that is updated in place each frame: the old
 * version rebuilt a React tree per frame for every moving trail, which kept the whole canvas busy
 * even while paused.
 */
export function Trails() {
  const bodies = useSandbox((s) => s.bodies)
  const traced = bodies.filter((d) => d.trace && d.motion === 'dynamic')
  return (
    <>
      {traced.map((def) => (
        <TraceLine key={def.id} def={def} />
      ))}
    </>
  )
}

function TraceLine({ def }: { def: BodyDef }) {
  const playing = useScene((s) => s.playing)
  // The body's colour as this theme draws it: a palette colour is a token three.js cannot read.
  const theme = useTheme((t) => t.theme)
  const colour = useMemo(() => ({ value: drawnColour(def.color, themeColor), key: `${theme}|${def.color}` }), [def.color, theme])
  const runNonce = useSandbox((s) => s.runNonce)
  const trailNonce = useSandbox((s) => s.trailNonce)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRACE_POINTS * 6), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  const count = useRef(0)
  const last = useRef<V3 | null>(null)
  const line = useRef<THREE.LineSegments>(null)
  // Reset, a new scene or "Clear trails": start the line again.
  useEffect(() => {
    count.current = 0
    last.current = null
    geo.setDrawRange(0, 0)
    if (line.current) line.current.visible = false
  }, [runNonce, trailNonce, geo])

  useFrame(() => {
    if (!playing) return
    const st = readoutRef.current?.state(def.id)
    if (!st) return
    const p = st.position
    const l = last.current
    // Only record when it has actually moved, or a body at rest fills the buffer with one point.
    if (l && Math.hypot(l[0] - p[0], l[1] - p[1], l[2] - p[2]) < 0.01) return
    if (l) {
      const attr = geo.getAttribute('position') as THREE.BufferAttribute
      const i = (count.current % TRACE_POINTS) * 6
      attr.array.set([l[0], l[1], l[2], p[0], p[1], p[2]], i)
      attr.needsUpdate = true
      count.current++
      geo.setDrawRange(0, Math.min(count.current, TRACE_POINTS) * 2)
      // An empty geometry drawn every frame makes WebGPU warn every frame.
      if (line.current) line.current.visible = true
    }
    last.current = [p[0], p[1], p[2]]
  })

  return (
    <lineSegments ref={line} geometry={geo} renderOrder={13} frustumCulled={false} visible={false}>
      <lineBasicMaterial key={colour.key} color={colour.value} transparent opacity={0.8} />
    </lineSegments>
  )
}
