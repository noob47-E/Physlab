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

/**
 * Live numbers next to each object. Priority −1 like the world's step, and mounted after SandboxView, so the
 * chips are placed after the step, from this frame's poses, as they were inside the frame loop.
 */
export function Labels() {
  const bodies = useSandbox((s) => s.bodies)
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
        // Speed and mass alone could not answer the question a mechanics practical asks. Height
        // and kinetic energy are what a student needs to watch while something falls.
        const speed = Math.hypot(st.velocity[0], st.velocity[1], st.velocity[2])
        const e = energyOf(def, st, world.gravity, groundTop)
        const num = (v: number) => formatMeasure(v, 'number', settings)
        const text = `${def.name}  ${num(speed)} m/s  h ${num(st.position[1] - groundTop)} m  KE ${num(e.kinetic)} J`
        // The chip's text is the body's colour; a theme colour is a CSS reference, read as it is.
        pool.place(text, p.x, p.y - 26, 'center', def.color)
      })
    }
    pool.end()
  }, -1)

  return null
}
