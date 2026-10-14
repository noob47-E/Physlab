// The paths the traced bodies have taken, drawn from the tape (SB16): a trail is the shown recording's positions from
// its start (or from the moment "Clear trails" was pressed) up to the playhead, so it shrinks when the run is rewound
// and grows as it plays, live or replayed; in fine replay it is the fine re-run's own path. Reset and a new scene start
// a new recording, and with it a new trail.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { useSandbox } from '../../sim/store'
import type { BodyDef } from '../../sim/types'
import { drawnColour } from '../../sim/palette'
import { themeColor, useTheme } from '../../app/theme'
import { tapes } from '../../sim/recorder'
import { shownTape, useTape } from '../../sim/tapeStore'
import { fillTrail, newTrailBuffer, trailStart } from './playback'
import { readoutRef } from './readout'

/** The moment (s) "Clear trails" was last pressed in this run, or null: the trails start there. */
let clearedAt: number | null = null

/** The moment on screen: the end of a live run, else the playhead's. */
function shownMoment(): number | null {
  const tape = shownTape()
  if (!tape || tape.last < tape.first) return null
  const s = useTape.getState()
  return tape.timeOf(s.mode === 'live' ? tape.last : Math.min(tape.last, Math.max(tape.first, s.playhead)))
}

useSandbox.subscribe((now, before) => {
  if (now.runNonce !== before.runNonce) clearedAt = null
  else if (now.trailNonce !== before.trailNonce) clearedAt = shownMoment()
})

/** The traced bodies' trails. */
export function Trails() {
  const bodies = useSandbox((s) => s.bodies)
  const traced = bodies.filter((d) => d.trace && d.motion === 'dynamic')
  // "Clear trails" while paused changes nothing the canvas watches: ask for the frame that shows it.
  const trailNonce = useSandbox((s) => s.trailNonce)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => invalidate(), [trailNonce, invalidate])
  return (
    <>
      {traced.map((def) => (
        <TraceLine key={def.id} def={def} />
      ))}
    </>
  )
}

/** One body's trail: its points from the tape up to the playhead (`fillTrail`), uploaded only when they change. */
function TraceLine({ def }: { def: BodyDef }) {
  // The body's colour as this theme draws it: a palette colour is a token three.js cannot read.
  const theme = useTheme((t) => t.theme)
  const colour = useMemo(() => ({ value: drawnColour(def.color, themeColor), key: `${theme}|${def.color}` }), [def.color, theme])
  const buf = useMemo(() => newTrailBuffer(), [])
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    // The trail's own array, not a copy: fillTrail writes straight into what is drawn.
    g.setAttribute('position', new THREE.BufferAttribute(buf.out, 3))
    g.setDrawRange(0, 0)
    return g
  }, [buf])
  useEffect(() => () => geo.dispose(), [geo])
  const line = useRef<THREE.LineSegments>(null)

  useFrame(() => {
    const tape = shownTape()
    const s = useTape.getState()
    const head = tape ? (s.mode === 'live' ? tape.last : s.playhead) : 0
    // The last piece ends where the body is drawn this frame (the readout: the live world, or the tape at the playhead).
    const tip = readoutRef.current?.drawn(def.id)?.position ?? null
    const { segments, changed } = tape ? fillTrail(buf, tape, def.id, trailStart(tape, clearedAt), head, tapes.parent, tip) : { segments: 0, changed: false }
    if (changed) geo.getAttribute('position').needsUpdate = true
    if (geo.drawRange.count !== segments * 2) geo.setDrawRange(0, segments * 2)
    // An empty geometry drawn every frame makes WebGPU warn every frame.
    if (line.current) line.current.visible = segments > 0
  })

  return (
    <lineSegments ref={line} geometry={geo} renderOrder={13} frustumCulled={false} visible={false}>
      <lineBasicMaterial key={colour.key} color={colour.value} transparent opacity={0.8} />
    </lineSegments>
  )
}
