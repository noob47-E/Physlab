// A short guided tour, small practice tasks, and the keyboard shortcut list.
// Everything is built in, so it works offline like the rest of PhysLab.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { Check, Keyboard, X } from 'lucide-react'
import { enterMode } from '../layout'
import { showPanel } from '../panels'
import { useSandboxView } from '../../sim/sandboxView'
import { usePure } from '../../math/pure/store'
import { JOBS } from '../../math/pure/run'
import { AFTER_SANDBOX, MISSION_STORES, MISSIONS, resetMissionBaseline, runAsPhysLab, SHORTCUTS, TOUR, WELCOME_JOB, WELCOME_PROMISE } from './steps'
import type { Mission } from './steps'
import { usePracticeMission } from '../../panels/practiceMission'
import { isTyping } from '../keyTargets'
import { placeTourCard } from '../layoutMath'

export const ALL_DONE_MESSAGE =
  'All done. You have used every part of PhysLab you need to start. Help ▸ Start here brings this list back.'

/**
 * A touch screen, by its pointer: a touchscreen laptop used with a mouse keeps the mouse words
 * (the old test, 'ontouchstart' or touch points, called every such laptop a touch screen).
 */
const isCoarse = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches

export function formatMissionHint(hint: string, isTouch: boolean): string {
  if (!isTouch) return hint
  return hint
    // A touch screen has no Esc key: the Move tool does what Esc does here (leaves the Sketch tool).
    .replace('Press Esc, then click', 'Tap the Move tool, then tap')
    .replace('Press Esc, then drag the tip of the arrow', 'Tap the Move tool, then slide the tip of the arrow with your finger')
    .replace('drag the tip of the arrow', 'slide the tip of the arrow with your finger')
    .replace(/\bdrag\b/g, 'slide your finger')
    // Mission 4: "click the rectangle" is a tap on a touch screen.
    .replace(/\bclick\b/g, 'tap')
}

const SEEN_KEY = 'physlab.tourSeen'
// Not the old Practice tasks' key: those used the ids calc, graph and vector for other tasks, so a
// returning student would have seen new missions ticked that they never did.
const DONE_KEY = 'physlab.startHereDone'
const CHIP_HIDDEN_KEY = 'physlab.chipHidden'

export const readDone = (): string[] => {
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
  chipHidden: boolean
  spotlightMission: Mission | null
  done: string[]
  start: () => void
  next: () => void
  back: () => void
  stop: () => void
  setMissions: (v: boolean) => void
  setShortcuts: (v: boolean) => void
  hideChip: () => void
  setChipHidden: (v: boolean) => void
  showMe: (m: Mission) => void
  clearSpotlight: () => void
  markDone: (id: string) => void
  startOver: () => void
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
  chipHidden: (() => {
    try {
      return localStorage.getItem(CHIP_HIDDEN_KEY) === '1'
    } catch {
      return false
    }
  })(),
  spotlightMission: null,
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
  hideChip: () => {
    try {
      localStorage.setItem(CHIP_HIDDEN_KEY, '1')
    } catch {
      // Not remembered.
    }
    set({ chipHidden: true })
  },
  setChipHidden: (chipHidden) => {
    try {
      if (chipHidden) localStorage.setItem(CHIP_HIDDEN_KEY, '1')
      else localStorage.removeItem(CHIP_HIDDEN_KEY)
    } catch {
      // Not remembered.
    }
    set({ chipHidden })
  },
  showMe: (m) => {
    enterMode(m.mode)
    set({ spotlightMission: m })
  },
  clearSpotlight: () => set({ spotlightMission: null }),
  markDone: (id) => {
    if (get().done.includes(id)) return
    const done = [...get().done, id]
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(done))
    } catch {
      // Progress just will not be remembered.
    }
    set({ done })
  },
  startOver: () => {
    try {
      localStorage.removeItem(DONE_KEY)
      localStorage.removeItem(CHIP_HIDDEN_KEY)
    } catch {
      // Not remembered; nothing else to clear.
    }
    // Counting starts afresh before the practice flag is cleared: clearing it re-runs the checks,
    // which must already see the new starting point.
    resetMissionBaseline()
    usePracticeMission.getState().reset()
    set({ done: [], chipHidden: false, spotlightMission: null })
  }
}))

/**
 * Checks the missions now and again on every change of a store they read, so a task ticks itself
 * off as soon as the user does it. Returns the unsubscribe. Outside the hook so a test drives the
 * very watcher the app runs: it is called inside a store's set(), before the caller's next line.
 */
export function watchMissions(markDone: (id: string) => void): () => void {
  const check = () => {
    for (const m of MISSIONS) {
      try {
        if (m.done()) markDone(m.id)
      } catch {
        // A task that cannot be checked is simply skipped.
      }
    }
  }
  // What is on screen when the app starts (a restored drawing, last session's working) was not
  // done for the missions.
  resetMissionBaseline()
  check()
  const unsubs = MISSION_STORES.map((store) => store.subscribe(check))
  return () => unsubs.forEach((u) => u())
}

/** Watches the scene so a task ticks itself off as soon as the user does it. */
function useMissionWatcher() {
  const markDone = useTour((t) => t.markDone)
  useEffect(() => watchMissions(markDone), [markDone])
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

export function StartHereChip() {
  const done = useTour((s) => s.done)
  const chipHidden = useTour((s) => s.chipHidden)
  const setMissions = useTour((s) => s.setMissions)
  const hideChip = useTour((s) => s.hideChip)

  // Only ids that are missions count: a stray id in storage must not make the chip say 7 of 6.
  const count = MISSIONS.filter((m) => done.includes(m.id)).length
  if (chipHidden || count >= MISSIONS.length) return null

  return (
    <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-[var(--line-2)] bg-[var(--bg-2)] py-0.5 pl-2.5 pr-1 text-fine text-[var(--text)]">
      <button
        type="button"
        className="flex items-center gap-1.5 font-medium hover:text-[var(--accent)] pointer-coarse:min-h-[44px]"
        onClick={() => setMissions(true)}
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        <span>
          Start here {count} of {MISSIONS.length}
        </span>
      </button>
      <button
        type="button"
        className="rounded-full p-0.5 text-[var(--text-faint)] hover:text-[var(--text-strong)] pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
        onClick={(e) => {
          e.stopPropagation()
          hideChip()
        }}
        title="Hide Start here chip"
        aria-label="Hide Start here chip"
      >
        <X size={12} />
      </button>
    </div>
  )
}

export function Tour() {
  const {
    step,
    showWelcome,
    showMissions,
    showShortcuts,
    spotlightMission,
    done,
    start,
    next,
    back,
    stop,
    setMissions,
    setShortcuts,
    clearSpotlight
  } = useTour()
  const current = step === null ? null : TOUR[step]
  const rect = useAnchorRect(current?.anchor, step)
  useMissionWatcher()

  // A step whose anchor lives in the Sandbox's All tools (Connect) borrows that view for the step and gives the student's
  // own choice back when the step is left (SB63). Declared before the mode effect, so enterMode sees the view the step wants.
  useEffect(() => {
    if (!current?.sandboxView) return
    const before = useSandboxView.getState().view
    if (before === current.sandboxView) return
    useSandboxView.getState().setView(current.sandboxView, { remember: false })
    return () => useSandboxView.getState().setView(before, { remember: false })
  }, [current])

  useEffect(() => {
    if (current?.mode) enterMode(current.mode)
  }, [current])

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        stop()
        return
      }
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
      {spotlightMission && <MissionSpotlight mission={spotlightMission} onClose={clearSpotlight} />}
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
  // PhysLab runs this one, not the student: it does not tick mission 1.
  runAsPhysLab(() => usePure.getState().run(job.id, job.example, job.exampleLatex))
  // enterMode already opened the Maths screen; asking again makes it the active tab of its group.
  showPanel('maths')
}

export const WELCOME_TILES = [
  { mode: 'calculator' as const, label: 'Calculator', text: 'Fractions, roots, powers, ∫ and Σ, just as they look in a book.' },
  { mode: 'vectors' as const, label: 'Vectors', text: 'Draw and add vectors, with the working written out.' },
  { mode: 'shapes' as const, label: 'Geometry', text: 'Sketch a shape and get its area with the formula.' },
  { mode: 'graphing' as const, label: 'Graphing', text: 'y = x² − 4, circles, inequalities, 3D surfaces.' },
  { mode: 'sandbox' as const, label: 'Sandbox', text: 'Collisions, ramps, pendulums, gravity and springs.' },
  { mode: 'problems' as const, label: 'Problem Sets', text: 'Practice questions with hints and step-by-step solutions.' },
  { mode: 'lab' as const, label: 'Lab Data', text: 'Type your readings, plot them and read the gradient off the best-fit line.' }
]

function Welcome({ onTour, onSkip }: { onTour: () => void; onSkip: () => void }) {
  return (
    <div className="tour-backdrop">
      <div className="tour-card w-[34rem] max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div id="welcome-title" className="mb-1 text-title font-semibold text-[var(--text-strong)]">Welcome to PhysLab</div>
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
          {WELCOME_TILES.map((t, i) => (
            <button
              key={t.mode}
              // An odd last tile takes the whole row, so the grid ends even.
              className={`card m-0 p-2 text-left hover:border-[var(--accent)] ${i === WELCOME_TILES.length - 1 && WELCOME_TILES.length % 2 === 1 ? 'col-span-2' : ''}`}
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
          <button
            className="btn"
            onClick={() => {
              onSkip()
              useTour.getState().setChipHidden(false)
              useTour.getState().setMissions(true)
            }}
          >
            Start here (6 missions)
          </button>
          <button className="btn" onClick={onSkip}>
            Skip
          </button>
        </div>
        <div className="mt-2 text-fine text-[var(--text-faint)]">
          The tour and the missions are both in the Help menu.
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

function MissionSpotlight({ mission, onClose }: { mission: Mission; onClose: () => void }) {
  const rect = useAnchorRect(mission.anchor, 0)
  const pad = 6
  const hole = rect ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null
  const cardRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 352, h: 180 })

  useLayoutEffect(() => {
    const el = cardRef.current
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [mission])

  const cardStyle: React.CSSProperties = hole
    ? placeTourCard(hole, size, { w: window.innerWidth, h: window.innerHeight })
    : { left: '50%', top: '38%', transform: 'translate(-50%, -50%)' }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isTyping(e.target as HTMLElement)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const isTouch = typeof window !== 'undefined' && isCoarse()
  const hint = formatMissionHint(mission.hint, isTouch)

  return (
    <div className="tour-backdrop" onClick={onClose}>
      {hole && <div className="tour-hole" style={hole} />}
      <div
        ref={cardRef}
        className="tour-card w-[22rem]"
        style={{ position: 'fixed', ...cardStyle }}
        role="dialog"
        aria-label={mission.label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="text-lead font-semibold text-[var(--text-strong)]">{mission.label}</span>
          <span className="flex-1" />
          <button className="text-[var(--text-faint)] hover:text-[var(--text-strong)] pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
        <div className="mb-3 text-[var(--text)]">{hint}</div>
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <button className="btn primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

function Missions({ done, onClose }: { done: string[]; onClose: () => void }) {
  const showMe = useTour((s) => s.showMe)
  const startOver = useTour((s) => s.startOver)
  const count = MISSIONS.filter((m) => done.includes(m.id)).length
  const allDone = count >= MISSIONS.length
  const cardRef = useRef<HTMLDivElement>(null)

  const [isNarrowOrTouch, setIsNarrowOrTouch] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < 1150 || isCoarse()
  })

  useEffect(() => {
    const check = () => {
      const touch = isCoarse()
      setIsNarrowOrTouch(window.innerWidth < 1150 || touch)
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const isTouch = typeof window !== 'undefined' && isCoarse()

  const [openId, setOpenId] = useState<string | null>(() => {
    const firstUndone = MISSIONS.find((m) => !done.includes(m.id))
    return firstUndone ? firstUndone.id : MISSIONS[0]?.id ?? null
  })

  useEffect(() => {
    // Esc closes the card only when the student is in it: mission 4 asks for Esc to leave the
    // Sketch tool, and Esc in the command bar or the Maths field belongs to that field.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && cardRef.current?.contains(document.activeElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const containerClasses = isNarrowOrTouch
    ? 'fixed inset-x-0 bottom-0 z-40 w-full tour-card rounded-b-none border-x-0 border-b-0 max-h-[85vh] overflow-y-auto'
    : 'fixed right-4 bottom-4 z-40 w-[26rem] max-w-[calc(100vw-2rem)] tour-card'

  return (
    <div ref={cardRef} className={containerClasses} role="dialog" aria-label="Start here">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lead font-semibold text-[var(--text-strong)]">Start here</span>
          <span className="text-fine text-[var(--text-faint)]">
            {count} of {MISSIONS.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn ghost py-0.5 px-2 text-fine pointer-coarse:min-h-[44px]" onClick={onClose}>
            Hide
          </button>
          <button
            type="button"
            className="p-1 text-[var(--text-faint)] hover:text-[var(--text-strong)] pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px]"
            onClick={onClose}
            aria-label="Hide"
            title="Hide"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {allDone && (
        <div className="mb-3 rounded border border-[var(--line-2)] bg-[var(--bg-3)] p-2.5 text-small text-[var(--text-strong)]">
          {ALL_DONE_MESSAGE}
        </div>
      )}

      <div className="space-y-1">
        {MISSIONS.map((m) => {
          const ok = done.includes(m.id)
          const isOpen = m.id === openId
          const hint = formatMissionHint(m.hint, isTouch)
          return (
            <div
              key={m.id}
              className={`rounded border border-transparent p-2 transition-colors ${
                isOpen ? 'bg-[var(--bg-3)] border-[var(--line-2)]' : 'hover:bg-[var(--bg-3)]'
              }`}
            >
              <button
                type="button"
                className={`flex w-full gap-2.5 text-left ${
                  isNarrowOrTouch ? 'min-h-[44px] items-center' : 'items-start'
                }`}
                onClick={() => setOpenId(isOpen ? null : m.id)}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    ok ? 'text-[var(--good)]' : 'border border-[var(--text-faint)] text-transparent'
                  }`}
                >
                  {ok ? <Check size={13} strokeWidth={2.5} /> : ''}
                </span>
                <span
                  className={`flex-1 text-small font-medium ${
                    ok ? 'text-[var(--text-faint)] line-through' : 'text-[var(--text-strong)]'
                  }`}
                >
                  {m.label}
                </span>
              </button>

              {m.id === 'sandbox' && ok && <div className="mt-1 pl-6 text-fine text-[var(--text-dim)]">{AFTER_SANDBOX}</div>}

              {isOpen && (
                <div className="mt-1.5 pl-6">
                  <div className="mb-2 text-fine text-[var(--text-dim)]">{hint}</div>
                  <button
                    type="button"
                    className="btn primary text-fine pointer-coarse:min-h-[44px]"
                    onClick={(e) => {
                      e.stopPropagation()
                      showMe(m)
                      onClose()
                    }}
                  >
                    Show me
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[var(--line-2)] pt-2.5">
        <button type="button" className="btn ghost text-small pointer-coarse:min-h-[44px]" onClick={startOver}>
          Start over
        </button>
        <button type="button" className="btn text-small pointer-coarse:min-h-[44px]" onClick={onClose}>
          Hide
        </button>
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
