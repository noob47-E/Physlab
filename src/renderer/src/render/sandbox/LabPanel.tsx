// SB51: the Collision Lab's panel - in the HUD's left column, under the clock, only while one of the three lab experiments is
// loaded. Sliders with a number beside each (bounciness, masses, speeds, the impact angle, the balls lifted, strings),
// "Run when I change something", "Pause just after the hit", and the facts line. A change is committed when the slider is
// let go (one Undo step): clamped (sim/labControls.ts), built (sim/labScenes.ts) and loaded with the viewer's own view kept.
// In a replay the panel changes nothing and says why.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useScene } from '../../core/store'
import { engine, useSandbox } from '../../sim/store'
import type { BodyState } from '../../sim/types'
import { replayRefusal } from '../../sim/recorder'
import { useTape } from '../../sim/tapeStore'
import { buildScene, isLab, type LabId, type LabParams } from '../../sim/labScenes'
import { clampLab, LabWatch, LAB_RANGES, paramsFromBuild } from '../../sim/labControls'
import { LAB_THEORY } from '../../sim/labTheory'
import { formatMeasure } from '../../math/format'

const FOLD_KEY = 'physlab.sandbox.labPanel'

const readFolded = (): boolean => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FOLD_KEY) === 'folded'
  } catch {
    return false
  }
}
const writeFolded = (folded: boolean) => {
  try {
    localStorage.setItem(FOLD_KEY, folded ? 'folded' : 'open')
  } catch {
    // Not remembered; it still folds.
  }
}

type Key = keyof typeof LAB_RANGES

/** The sliders each lab shows, with the words a student reads. */
const SLIDERS: Record<LabId, { key: Key; label: string }[]> = {
  lab1d: [
    { key: 'e', label: 'Bounciness e (1 = bounces back perfectly, 0 = they stick together)' },
    { key: 'mA', label: 'Mass of A (kg)' },
    { key: 'mB', label: 'Mass of B (kg)' },
    { key: 'uA', label: 'Speed of A (m/s)' },
    { key: 'uB', label: 'Speed of B (m/s)' }
  ],
  lab2d: [
    { key: 'e', label: 'Bounciness e (1 = bounces back perfectly, 0 = they stick together)' },
    { key: 'mA', label: 'Mass of A (kg)' },
    { key: 'mB', label: 'Mass of B (kg)' },
    { key: 'phi', label: 'Impact angle (degrees)' }
  ],
  labcradle: [
    { key: 'e', label: 'Bounciness e (1 = bounces back perfectly, 0 = they stick together)' },
    { key: 'n', label: 'Balls lifted' }
  ]
}

/** How long after the hit "Pause just after the hit" waits: half a second, or 0.03 s on the cradle's strings. */
const pauseAfter = (id: LabId, p: LabParams) => (id === 'labcradle' && p.strings ? 0.03 : 0.5)

export function LabPanel() {
  const presetId = useSandbox((s) => s.presetId)
  const bodies = useSandbox((s) => s.bodies)
  const world = useSandbox((s) => s.world)
  const settings = useScene((s) => s.settings)
  const replaying = useTape((s) => s.mode !== 'live')
  const [folded, setFolded] = useState(readFolded)
  // The draft a slider is being dragged through, kept only while it belongs to the scene it started from.
  const [drafting, setDrafting] = useState<{ base: LabParams; p: LabParams } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [runOnChange, setRunOnChange] = useState(true)
  const [pauseAfterHit, setPauseAfterHit] = useState(true)
  const lab = isLab(presetId) ? presetId : null

  // The panel shows the scene on the drawing: read from its bodies whenever they are loaded or edited (the list, a commit,
  // the object panel), never its defaults over a scene built otherwise.
  const params = useMemo(() => (lab ? paramsFromBuild(lab, bodies) : null), [lab, bodies])
  const draft = drafting && drafting.base === params ? drafting.p : params
  const setDraft = (p: LabParams | null) => setDrafting(p && params ? { base: params, p } : null)

  // "Pause just after the hit": every engine step tells LabWatch whether two of the lab's moving bodies touch.
  const watch = useRef<LabWatch | null>(null)
  useEffect(() => {
    const w = engine.world
    if (!lab || !params || !pauseAfterHit || !w) return
    const moving = new Set(bodies.filter((b) => b.motion === 'dynamic').map((b) => b.id))
    watch.current = new LabWatch(world.stepRate, pauseAfter(lab, params))
    let index = 0
    const off = w.onAfterStep((_w, s) => {
      const touching = s.contacts.some((c) => moving.has(c.a) && moving.has(c.b))
      if (!watch.current?.step(index++, touching)) return
      useScene.getState().setPlaying(false)
      // The panels and cards read the numbers published about ten times a second: paused 0.03 s after a cradle hit they still
      // showed the start. The moment it paused at is published at once.
      const live: Record<string, BodyState> = {}
      for (const b of bodies) {
        const st = w.state(b.id)
        if (st) live[b.id] = st
      }
      useSandbox.setState({ live, engineTime: w.time })
    })
    return () => off()
  }, [lab, params, pauseAfterHit, bodies, world.stepRate])

  const facts = useMemo(() => {
    if (!lab || !params) return []
    const n = (v: number) => formatMeasure(v, 'number', settings)
    const out: string[] = []
    if (lab === 'lab1d') out.push(`Centre of mass: moves on at ${n((params.mA * params.uA + params.mB * params.uB) / (params.mA + params.mB))} m/s whatever e is.`)
    if (lab === 'lab2d') {
      // The scene on the drawing, as the engine resolves it at its step rate (the line of centres a step before contact).
      const p = LAB_THEORY.lab2d.predict({ bodies, world }).find((x) => x.key === 'angle')
      const angle = p ? (p.stepped?.(world.stepRate) ?? p.value) : undefined
      if (angle !== undefined) out.push(`Angle between the two paths after the hit: ${n(angle)}° (90° when the masses are equal and e = 1).`)
    }
    out.push('Slower than 1 m/s the engine does not bounce at all.')
    return out
  }, [lab, params, settings, bodies, world])

  if (!lab || !params || !draft) return null

  const commit = (next: LabParams, run = runOnChange) => {
    const refusal = replayRefusal()
    if (refusal) {
      setNote(refusal)
      setDraft(params)
      return
    }
    const c = clampLab(lab, next, params)
    setNote(c.note)
    setDraft(c.params)
    if (c.refused) return
    useSandbox.getState().loadBuilt(lab, buildScene(lab, c.params), { applyViewHint: false })
    if (run) useScene.getState().setPlaying(true)
  }

  return (
    <div className="pointer-events-auto absolute left-16 top-14 w-[280px] max-w-[calc(100%-5rem)] rounded-lg border border-[color:var(--line-2)] bg-[var(--label-bg)] p-2 text-small text-[color:var(--text)] shadow" data-lab-panel="">
      <button
        type="button"
        className="flex min-h-[32px] w-full items-center gap-1 text-left font-semibold pointer-coarse:min-h-[44px]"
        aria-expanded={!folded}
        onClick={() => {
          writeFolded(!folded)
          setFolded(!folded)
        }}
      >
        {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        Collision Lab
      </button>
      {!folded && (
        <div className="flex flex-col gap-2 pt-1">
          {replaying && <p className="text-[color:var(--text-dim)]">{replayRefusal() ?? 'A replay cannot be changed. Back to live first.'}</p>}
          {SLIDERS[lab].map(({ key, label }) => {
            const r = LAB_RANGES[key]
            return (
              <label key={key} className="flex flex-col gap-0.5">
                <span>{label}</span>
                <span className="flex items-center gap-2">
                  <input
                    type="range"
                    className="min-h-[32px] flex-1 pointer-coarse:min-h-[44px]"
                    min={r.min}
                    max={r.max}
                    step={r.step}
                    value={draft[key]}
                    disabled={replaying}
                    aria-label={label}
                    onChange={(e) => setDraft({ ...draft, [key]: Number(e.currentTarget.value) })}
                    onPointerUp={() => commit(draft)}
                    onKeyUp={() => commit(draft)}
                  />
                  <input
                    className="field w-16 tabular-nums pointer-coarse:min-h-[44px]"
                    inputMode="decimal"
                    disabled={replaying}
                    aria-label={`${label}, typed`}
                    value={String(draft[key])}
                    onChange={(e) => setDraft({ ...draft, [key]: Number(e.currentTarget.value) })}
                    onBlur={() => commit(draft)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commit(draft)
                    }}
                  />
                </span>
              </label>
            )
          })}
          {lab === 'labcradle' && (
            <label className="flex min-h-[32px] items-center gap-2 pointer-coarse:min-h-[44px]">
              <input type="checkbox" checked={draft.strings} disabled={replaying} onChange={(e) => commit({ ...draft, strings: e.currentTarget.checked })} />
              Hang them from strings
            </label>
          )}
          <label className="flex min-h-[28px] items-center gap-2 pointer-coarse:min-h-[44px]">
            <input type="checkbox" checked={runOnChange} onChange={(e) => setRunOnChange(e.currentTarget.checked)} />
            Run when I change something
          </label>
          <label className="flex min-h-[28px] items-center gap-2 pointer-coarse:min-h-[44px]">
            <input type="checkbox" checked={pauseAfterHit} onChange={(e) => setPauseAfterHit(e.currentTarget.checked)} />
            Pause just after the hit
          </label>
          {note && <p className="text-[color:var(--warn)]">{note}</p>}
          {facts.map((f) => (
            <p key={f} className="text-[color:var(--text-dim)]">
              {f}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
