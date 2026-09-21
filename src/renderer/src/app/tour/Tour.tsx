// A short guided tour, small practice tasks, and the keyboard shortcut list.
// Everything is built in, so it works offline like the rest of PhysLab.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Check, Keyboard, X } from 'lucide-react'
import { useScene } from '../../core/store'
import { useCalc } from '../../calc/calcStore'
import { enterMode } from '../layout'
import { showPanel } from '../panels'
import { usePure } from '../../math/pure/store'
import { JOBS } from '../../math/pure/run'
import { MISSIONS, SHORTCUTS, TOUR, WELCOME_JOB, WELCOME_PROMISE } from './steps'
import { isTyping } from '../keyTargets'
import { placeTourCard } from '../layoutMath'

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
      const r = el ? el.getBoundingClientRect() : null
      setRect((old) => (old && r && old.left === r.left && old.top === r.top && old.width === r.width && old.height === r.height ? old : r))
    }
    find()
    const t = setTimeout(find, 120)
    // The bar folds and unfolds as the window changes, and a mode switch swaps the tool shelf,
    // neither of which is a window resize: a slow poll keeps the ring on the thing it names.
    const poll = setInterval(find, 300)
    window.addEventListener('resize', find)
    return () => {
      clearTimeout(t)
      clearInterval(poll)
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
      // This listener is on window in the capture phase, so without this guard it would take the
      // arrow keys and Enter out of whatever the student is typing in before the field sees them.
      if (isTyping(e.target as HTMLElement)) return
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

/**
 * Open the calculator on a worked example, so the first thing a student sees is board-style
 * working for a real homework question rather than an empty field.
 */
export function showWorkingExample(): void {
  enterMode('calculator')
  const job = JOBS.find((j) => j.id === WELCOME_JOB) ?? JOBS[0]
  usePure.getState().run(job.id, job.example, job.exampleLatex)
  // enterMode already opened Working; asking again makes it the active tab of its group.
  showPanel('working')
}

function Welcome({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  const tiles = [
    { mode: 'calculator' as const, label: 'Calculator', text: 'Fractions, roots, powers, ∫ and Σ, just as they look in a book.' },
    { mode: 'vectors' as const, label: 'Vectors', text: 'Draw and add vectors, with the working written out.' },
    { mode: 'shapes' as const, label: 'Geometry', text: 'Sketch a shape and get its area with the formula.' },
    { mode: 'graphing' as const, label: 'Graphing', text: 'y = x² − 4, circles, inequalities, 3D surfaces.' }
  ]
  return (
    <div className="tour-backdrop">
      <div className="tour-card w-[34rem]">
        <div className="mb-1 text-title font-semibold text-[var(--text-strong)]">Welcome to PhysLab</div>
        <div className="mb-3 text-[var(--text)]">Maths and physics you can see. What would you like to do first?</div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            className="card col-span-2 m-0 p-2 text-left hover:border-[var(--accent)]"
            onClick={() => {
              showWorkingExample()
              onSkip()
            }}
          >
            <div className="font-semibold text-[var(--text-strong)]">Show your working</div>
            <div className="text-[var(--text-dim)]">{WELCOME_PROMISE} step by step, the way it is set out on the board. Then try your own.</div>
          </button>
          {tiles.map((t) => (
            <button
              key={t.mode}
              className="card m-0 p-2 text-left hover:border-[var(--accent)]"
              onClick={() => {
                enterMode(t.mode)
                onSkip()
              }}
            >
              <div className="font-semibold text-[var(--text-strong)]">{t.label}</div>
              <div className="text-[var(--text-dim)]">{t.text}</div>
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
          <span className="text-fine text-[var(--text-faint)]">You can start it again from the Help menu.</span>
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
  // The card is measured, not guessed: the old fixed offsets assumed a 186 px card and a 380 px
  // width, and a longer step or a bigger font pushed the card off the bottom of the screen.
  const cardRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 352, h: 180 })
  useLayoutEffect(() => {
    const el = cardRef.current
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [step, current])
  const cardStyle: React.CSSProperties = hole
    ? placeTourCard(hole, size, { w: window.innerWidth, h: window.innerHeight })
    : { left: '50%', top: '38%', transform: 'translate(-50%, -50%)' }

  // Clicking the dimmed background does nothing: a stray click used to end the tour.
  return (
    <div className="tour-backdrop">
      {hole && <div className="tour-hole" style={hole} />}
      <div ref={cardRef} className="tour-card w-[22rem]" style={{ position: 'fixed', ...cardStyle }} role="dialog" aria-label={current.title}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-fine text-[var(--text-faint)]">
            {step + 1} / {TOUR.length}
          </span>
          <span className="flex-1" />
          <button className="text-[var(--text-faint)] hover:text-[var(--text-strong)]" onClick={onStop} title="Close the tour">
            <X size={14} />
          </button>
        </div>
        <div className="mb-1 text-lead font-semibold text-[var(--text-strong)]">{current.title}</div>
        <div className="mb-3 text-[var(--text)]">{current.body}</div>
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
          <span className="text-lead font-semibold text-[var(--text-strong)]">Practice tasks</span>
          <span className="flex-1" />
          <span className="text-fine text-[var(--text-faint)]">
            {done.length} / {MISSIONS.length} done
          </span>
          <button className="text-[var(--text-faint)] hover:text-[var(--text-strong)]" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="mb-2 text-[var(--text-dim)]">Each one ticks itself off as soon as you do it. Close this and try them whenever you like.</div>
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
              <span className={`mt-0.5 ${ok ? 'text-[var(--good)]' : 'text-[var(--text-faint)]'}`}>{ok ? <Check size={14} /> : '○'}</span>
              <span className="min-w-0 flex-1">
                <span className={ok ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text-strong)]'}>{m.label}</span>
                <span className="block text-fine text-[var(--text-faint)]">{m.hint}</span>
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
          <Keyboard size={15} className="text-[var(--accent)]" />
          <span className="text-lead font-semibold text-[var(--text-strong)]">Keyboard and mouse</span>
          <span className="flex-1" />
          <button className="text-[var(--text-faint)] hover:text-[var(--text-strong)]" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="kv px-0">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="contents">
              <div className="k font-mono text-[var(--text)]">{keys}</div>
              <div className="v text-left text-[var(--text-dim)]">{what}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
