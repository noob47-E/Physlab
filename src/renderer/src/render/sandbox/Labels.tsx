// The live chips next to the moving objects.

import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { energyOf, groundTopOf } from '../../sim/energy'
import { overlay, SpanPool } from '../overlay'
import { toScreen } from '../cameraUtils'
import { formatMeasure } from '../../math/format'
import { readoutRef } from './readout'
import { isHangerBody, isMetreRule } from '../../sim/apparatus'

/**
 * Live numbers next to each object. Priority −1 like the world's step, and mounted after SandboxView, so the
 * chips are placed after the step, from this frame's poses, as they were inside the frame loop.
 */
export function Labels() {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const world = useSandbox((s) => s.world)
  const selection = useSandbox((s) => s.selection)
  const settings = useScene((s) => s.settings)
  const pool = useMemo(() => new SpanPool(() => overlay.labels, 'measure-label'), [])

  useEffect(() => () => pool.dispose(), [pool])

  /** Heights are quoted above the floor, not above the world origin. */
  const groundTop = useMemo(() => groundTopOf(bodies), [bodies])

  useFrame((state) => {
    const w = readoutRef.current
    if (!w) return
    // Live numbers next to each object, in the same chip style as the rest of PhysLab.
    pool.begin()
    if (settings.labelShow !== 'never') {
      bodies.forEach((def) => {
        if (def.motion === 'static') return
        const st = w.drawn(def.id)
        if (!st) return
        const show = settings.labelShow === 'always' || selection === def.id
        if (!show) return
        const p = toScreen(state.camera, state.size, st.position)
        if (!p.visible) return
        const num = (v: number) => formatMeasure(v, 'number', settings)
        const isHanger = isHangerBody(def)
        const link = isHanger ? links.find((l) => (l.a === def.id || l.b === def.id) && l.kind === 'string') : null
        const beam = link ? bodies.find((d) => d.id === (link.a === def.id ? link.b : link.a) && isMetreRule(d)) : null
        let text: string
        if (isHanger && beam && link) {
          const arm = Math.abs(link.pivotA ? link.pivotA[0] : st.position[0] - beam.position[0])
          const tau = (def.mass ?? 1) * world.gravity * arm
          text = `${def.name}  ${num(def.mass ?? 1)} kg  d = ${num(arm)} m  τ = ${num(tau)} N·m`
        } else {
          // Speed and mass alone could not answer the question a mechanics practical asks. Height
          // and kinetic energy are what a student needs to watch while something falls.
          const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
          const e = energyOf(def, st, world.gravity, groundTop)
          text = `${def.name}  ${num(speed)} m/s  h ${num(st.position[1] - groundTop)} m  KE ${num(e.kinetic)} J`
        }
        // Offset below mass stack for hangers so the rod and beam remain unobscured; standard 26px above for others
        const yOffset = isHanger && beam ? 24 : -26
        pool.place(text, p.x, p.y + yOffset, 'center', def.color)
      })
    }
    pool.end()
  }, -1)

  return null
}
