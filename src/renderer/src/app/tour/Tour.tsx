// A short guided tour, small practice tasks, and the keyboard shortcut list.
// Everything is built in, so it works offline like the rest of PhysLab.

import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Check, Keyboard, X } from 'lucide-react'
import { useScene } from '../../core/store'
import { useCalc } from '../../calc/calcStore'
import { enterMode } from '../TopBar'
import { MISSIONS, SHORTCUTS, TOUR } from './steps'

const SEEN_KEY = 'physlab.tourSeen'
const DONE_KEY = 'physlab.missionsDone'

const readDone = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

interface TourState {
  step: number | null
  showWelcome: boolean
  showMissions: boolean
  showShortcuts: boolean
  done: string[]
  start: () => void
  next: () => void
  back: () => void
  stop: () => void
  setMissions: (v: boolean) => void
  setShortcuts: (v: boolean) => void
  markDone: (id: string) => void
}

export const useTour = create<TourState>((set, get) => ({
  step: null,
  showWelcome: (() => {
    try {
      return !localStorage.getItem(SEEN_KEY)
    } catch {
      return false
    }
  })(),
  showMissions: false,
  showShortcuts: false,
  done: readDone(),
  start: () => set({ step: 0, showWelcome: false }),
  next: () => {
    const s = get().step ?? 0
    if (s + 1 >= TOUR.length) get().stop()
    else set({ step: s + 1 })
  },
  back: () => set({ step: Math.max(0, (get().step ?? 0) - 1) }),
  stop: () => {
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Not remembered; the tour may greet them again.
    }
    set({ step: null, showWelcome: false })
  },
  setMissions: (showMissions) => set({ showMissions }),
  setShortcuts: (showShortcuts) => set({ showShortcuts }),
  markDone: (id) => {
    if (get().done.includes(id)) return
    const done = [...get().done, id]
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(done))
    } catch {
      // Progress just will not be remembered.
    }
    set({ done })
  }
}))

/** Watches the scene so a task ticks itself off as soon as the user does it. */
function useMissionWatcher() {
  const markDone = useTour((t) => t.markDone)
  useEffect(() => {
    const check = () => {
      for (const m of MISSIONS) {
        try {
          if (m.done()) markDone(m.id)
        } catch {
          // A task that cannot be checked is simply skipped.
        }
      }
    }
    check()
    const unsubs = [useScene.subscribe(check), useCalc.subscribe(check)]
    return () => unsubs.forEach((u) => u())
  }, [markDone])
}

function useAnchorRect(name: string | undefined, step: number | null) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!name) return setRect(null)
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`)
      setRect(el ? el.getBoundingClientRect() : null)
    }
    find()
    const t = setTimeout(find, 120)
    window.addEventListener('resize', find)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', find)
    }
  }, [name, step])
  return rect
}

export function Tour() {
  const { step, showWelcome, showMissions, showShortcuts, done, start, next, back, stop, setMissions, setShortcuts } = useTour()
  const current = step === null ? null : TOUR[step]
  const rect = useAnchorRect(current?.anchor, step)
  useMissionWatcher()

  useEffect(() => {
    if (current?.mode) enterMode(current.mode)
  }, [current])

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [step, next, back, stop])

  return (
    <>
      {showWelcome && <Welcome onTour={start} onSkip={stop} />}
      {current && <Spotlight step={step!} current={current} rect={rect} onNext={next} onBack={back} onStop={stop} />}
      {showMissions && <Missions done={done} onClose={() => setMissions(false)} />}
      {showShortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
    </>
  )
}

function Welcome({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  const tiles = [
    { mode: 'calculator' as const, label: 'Calculator', text: 'Fractions, roots, powers, ∫ and Σ, just as they look in a book.' },
    { mode: 'vectors' as const, label: 'Vectors', text: 'Draw and add vectors, with the working written out.' },
    { mode: 'shapes' as const, label: 'Shapes & Geometry', text: 'Sketch a shape and get its area with the formula.' },
    { mode: 'graphing' as const, label: 'Graphing', text: 'y = x² − 4, circles, inequalities, 3D surfaces.' }
  ]
  return (
    <div className="tour-backdrop">
      <div className="tour-card w-[34rem]">
        <div className="mb-1 text-[18px] font-semibold text-white">Welcome to PhysLab</div>
        <div className="mb-3 text-zinc-300">Maths and physics you can see. What would you like to do first?</div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <button
              key={t.mode}
              className="card m-0 p-2 text-left hover:border-[var(--accent)]"
              onClick={() => {
                enterMode(t.mode)
                onSkip()
              }}
            >
              <div className="font-semibold text-white">{t.label}</div>
              <div className="text-zinc-400">{t.text}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn primary" onClick={onTour}>
            Take the 2-minute tour
          </button>
          <button className="btn" onClick={onSkip}>
            Skip
          </button>
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-500">You can start it again from the Help menu.</span>
        </div>
      </div>
    </div>
  )
}

function Spotlight({
  step,
  current,
  rect,
  onNext,
  onBack,
  onStop
}: {
  step: number
  current: { title: string; body: string }
  rect: DOMRect | null
  onNext: () => void
  onBack: () => void
  onStop: () => void
}) {
  const pad = 6
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null
  // Put the card under the highlighted thing, or centred when there is nothing to point at.
  const cardStyle: React.CSSProperties = hole
    ? {
        left: Math.min(Math.max(8, hole.left), window.innerWidth - 380),
        top: hole.top + hole.height + 12 > window.innerHeight - 190 ? Math.max(8, hole.top - 186) : hole.top + hole.height + 12
      }
    : { left: '50%', top: '38%', transform: 'translate(-50%, -50%)' }

  return (
    <div className="tour-backdrop" onClick={onStop}>
      {hole && <div className="tour-hole" style={hole} />}
      <div className="tour-card w-[22rem]" style={{ position: 'fixed', ...cardStyle }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[11px] text-zinc-500">
            {step + 1} / {TOUR.length}
          </span>
          <span className="flex-1" />
          <button className="text-zinc-500 hover:text-white" onClick={onStop} title="Close the tour">
            <X size={14} />
          </button>
        </div>
        <div className="mb-1 text-[15px] font-semibold text-white">{current.title}</div>
        <div className="mb-3 text-zinc-300">{current.body}</div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={onBack} disabled={step === 0}>
            Back
          </button>
          <button className="btn primary" onClick={onNext}>
            {step + 1 === TOUR.length ? 'Finish' : 'Next'}
          </button>
          <span className="flex-1" />
          <button className="btn ghost" onClick={onStop}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}

function Missions({ done, onClose }: { done: string[]; onClose: () => void }) {
  return (
    <div className="tour-backdrop" onClick={onClose}>
      <div className="tour-card w-[28rem]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-[15px] font-semibold text-white">Practice tasks</span>
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-500">
            {done.length} / {MISSIONS.length} done
          </span>
          <button className="text-zinc-500 hover:text-white" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="mb-2 text-zinc-400">Each one ticks itself off as soon as you do it. Close this and try them whenever you like.</div>
        {MISSIONS.map((m) => {
          const ok = done.includes(m.id)
          return (
            <button
              key={m.id}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-[var(--bg-3)]"
              onClick={() => {
                enterMode(m.mode)
                onClose()
              }}
            >
              <span className={`mt-0.5 ${ok ? 'text-emerald-400' : 'text-zinc-600'}`}>{ok ? <Check size={14} /> : '○'}</span>
              <span className="min-w-0 flex-1">
                <span className={ok ? 'text-zinc-500 line-through' : 'text-zinc-100'}>{m.label}</span>
                <span className="block text-[11.5px] text-zinc-500">{m.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="tour-backdrop" onClick={onClose}>
      <div className="tour-card w-[32rem]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <Keyboard size={15} className="text-sky-300" />
          <span className="text-[15px] font-semibold text-white">Keyboard and mouse</span>
          <span className="flex-1" />
          <button className="text-zinc-500 hover:text-white" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="kv px-0">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <div className="k font-mono text-zinc-200">{keys}</div>
              <div className="v text-left text-zinc-400">{what}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
