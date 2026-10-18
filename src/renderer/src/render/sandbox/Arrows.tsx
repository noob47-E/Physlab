// The arrows on the bodies: velocity, and a question's push.

import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useSandbox } from '../../sim/store'
import type { V3 } from '../../math/vec'
import { Arrow } from '../ObjectViews'
import { themeColor, useThemed } from '../../app/theme'
import { readoutRef } from './readout'
import { pushArrowScale, velocityArrowScale } from '../../sim/arrowScale'

/** The velocity arrows, then the pushes' force arrows; none at all when the Arrows switch (the Play/Reset row, or World) says Hide. */
export function Arrows() {
  const shown = useSandbox((s) => s.arrowsShown)
  if (!shown) return null
  return (
    <>
      <VelocityArrows />
      <PushArrows />
    </>
  )
}

/**
 * A velocity arrow on every moving object that asks for one. Each arrow reads its tail and
 * components from an array that is updated in place every frame, so no React work happens
 * while things move.
 */
function VelocityArrows() {
  const bodies = useSandbox((s) => s.bodies)
  const colour = useThemed(() => themeColor('--accent'))
  const shown = bodies.filter((d) => d.showArrows && d.motion !== 'static')
  // The slots are rebuilt only when the set of arrows changes, never on an edit to a body, or
  // every arrow would jump back to zero for a frame each time a slider moved.
  const key = shown.map((d) => d.id).join(',')
  const slots = useMemo(() => new Map(key.split(',').filter(Boolean).map((id) => [id, { tail: [0, 0, 0] as V3, comp: [0, 0, 0] as V3 }])), [key])
  useFrame(() => {
    const w = readoutRef.current
    if (!w) return
    for (const [id, slot] of slots) {
      const st = w.drawn(id)
      if (!st) continue
      const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
      if (speed < 0.05) {
        slot.comp[0] = slot.comp[1] = slot.comp[2] = 0
        continue
      }
      // One metre of arrow for every two metres per second, up to 2.5 m (sim/arrowScale.ts): uncapped, a fast body's
      // arrow shot up through the formula cards and the top bar (S3).
      const k = velocityArrowScale(speed)
      slot.tail[0] = st.position[0]
      slot.tail[1] = st.position[1]
      slot.tail[2] = st.position[2]
      slot.comp[0] = st.velocity[0] * k
      slot.comp[1] = st.velocity[1] * k
      slot.comp[2] = st.velocity[2] * k
    }
  })
  return (
    <>
      {shown.map((def) => {
        const s = slots.get(def.id)
        if (!s) return null
        return <Arrow key={def.id} tail={s.tail} comp={s.comp} color={colour} is3D thick={3.5} renderOrder={14} />
      })}
    </>
  )
}

/**
 * The force arrow of a question's push, drawn from the body's centre while the push acts (and
 * before Play, when it is waiting at t = 0). The push used to be invisible: the crate sped up
 * from 6 to 8 m/s with nothing on screen to say a 25 N force was on it. A metre of arrow for
 * every 20 N, never longer than 3 m so a large force stays on screen.
 */
function PushArrows() {
  const actuators = useSandbox((s) => s.actuators)
  const colour = useThemed(() => themeColor('--warn'))
  const slots = useMemo(() => actuators.map(() => ({ tail: [0, 0, 0] as V3, comp: [0, 0, 0] as V3 })), [actuators])
  useFrame(() => {
    const w = readoutRef.current
    if (!w) return
    actuators.forEach((a, i) => {
      const slot = slots[i]
      const st = w.drawn(a.bodyId)
      const t = w.time
      const f = st && a.from <= t && t < a.until ? a.force(t) : null
      const size = f ? Math.hypot(f[0], f[1], f[2]) : 0
      if (!st || !f || !(size > 1e-9)) {
        slot.comp[0] = slot.comp[1] = slot.comp[2] = 0
        return
      }
      const k = pushArrowScale(size)
      for (let c = 0; c < 3; c++) {
        slot.tail[c] = st.position[c]
        slot.comp[c] = f[c] * k
      }
    })
  })
  return (
    <>
      {slots.map((s, i) => (
        <Arrow key={i} tail={s.tail} comp={s.comp} color={colour} is3D thick={3.5} renderOrder={14} />
      ))}
    </>
  )
}
