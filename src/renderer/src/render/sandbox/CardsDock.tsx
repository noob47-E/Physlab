// The formula cards dock (SB18): live formula cards on the viewport HUD slot.
// Evaluates schools mechanics formulas against the live run or playhead readout, shows
// colour-linked symbols with tokens, and reports gaps against theory prediction when present.
// Numbers come directly from the card engine (never re-formatted here).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CardTex } from './CardTex'
import { evaluateCard } from '../../sim/cards'
import { readingOf } from '../../sim/cards/reading'
import type { CardView, Reading } from '../../sim/cards/types'
import { startStateOf } from '../../sim/energy'
import { massOf, useSandbox } from '../../sim/store'
import type { BodyDef, BodyState, Link, WorldSettings } from '../../sim/types'
import type { V3 } from '../../math/vec'
import { formatMeasure, type DigitSettings } from '../../math/format'
import { useScene } from '../../core/store'
import { useSandboxView, type SandboxView } from '../../sim/sandboxView'
import { shownTape, useTape } from '../../sim/tapeStore'
import { theoryFor } from '../../sim/theory'
import { cardsInView, gapRows, OPEN_CARDS, type GapRow } from '../../sim/cardGaps'
import { tapeReadout } from './playback'
import { cardLink } from '../../sim/cardLink'

const STORAGE_KEY_FOLDED = 'physlab.cardsDock.folded'
const STORAGE_KEY_BIG = 'physlab.cardsDock.big'

/** Safely read a boolean preference from localStorage inside try/catch. */
export function readStoredPref(key: string, fallback: boolean): boolean {
  try {
    if (typeof localStorage === 'undefined') return fallback
    const val = localStorage.getItem(key)
    if (val === null) return fallback
    return val === 'true'
  } catch {
    return fallback
  }
}

/** Safely write a boolean preference to localStorage inside try/catch. */
export function writeStoredPref(key: string, value: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, String(value))
  } catch {
    // Ignore storage quota or security errors
  }
}

interface TheoryLike {
  cards?: string[]
  roles?: Record<string, string>
  gapText?: string
}

/** Selects which cards to show: scene theory's cards if present, else KE/PE/energy for selected body. */
export function cardsForScene(options: {
  presetId?: string | null
  theory?: TheoryLike | null
  selectedBodyId?: string | null
  hasBodies?: boolean
}): string[] {
  const { theory, selectedBodyId, hasBodies = true } = options
  if (theory?.cards && theory.cards.length > 0) {
    return theory.cards
  }
  if (selectedBodyId || hasBodies) {
    return ['ke', 'pe', 'energy']
  }
  return []
}

/** Builds a Reading from the readout/live states and optional tape acceleration. */
export function readingFromReadout(options: {
  readout?: { time: number; state(id: string): BodyState | null } | null
  bodies: BodyDef[]
  starts: Record<string, BodyState>
  links: Link[]
  world: WorldSettings
  selectedBodyId?: string | null
  roles?: Record<string, string>
  getTapeAcc?: (bodyId: string) => V3 | undefined
}): Reading {
  const { readout, bodies, starts, links, world, selectedBodyId, roles: presetRoles, getTapeAcc } = options

  // 1. Establish roles mapping
  let roles = presetRoles
  if (!roles || Object.keys(roles).length === 0) {
    roles = {}
    const selectedDef = selectedBodyId ? bodies.find((b) => b.id === selectedBodyId) : undefined
    const dynamicDef = bodies.find((b) => b.motion === 'dynamic')
    const primary = selectedDef ?? dynamicDef ?? bodies[0]
    if (primary) {
      roles['A'] = primary.name
      const second = bodies.find((b) => b.id !== primary.id)
      if (second) roles['B'] = second.name
    }
  }

  // The link role S names a body or a 'Pivot – Bob' pair. An experiment's theory may leave it out (the pendulum) or name
  // it in words ('spring'): then it is the link on the A body (the bob's string, the mass's spring).
  const names = new Set(bodies.map((b) => b.name))
  const s = roles['S']
  if (roles['A'] && (!s || (!names.has(s) && !/\s+[–-]\s+/.test(s)))) roles = { ...roles, S: roles['A'] }

  // 2. Extract states from readout, live store, or starts
  const states: Record<string, BodyState> = {}
  for (const b of bodies) {
    const fromReadout = readout?.state(b.id)
    if (fromReadout) {
      states[b.id] = fromReadout
    } else {
      const liveState = useSandbox.getState().live[b.id]
      states[b.id] = liveState ?? starts[b.id] ?? startStateOf(b, massOf(b))
    }
  }

  const t = readout ? readout.time : useSandbox.getState().engineTime

  // 3. Construct the base Reading
  const reading = readingOf({
    bodies,
    states,
    starts,
    links,
    world,
    t,
    roles
  })

  // 4. Attach tape acceleration when provided
  if (getTapeAcc) {
    for (const bodyReading of Object.values(reading.bodies)) {
      const acc = getTapeAcc(bodyReading.def.id)
      if (acc) {
        bodyReading.acc = acc
      }
    }
  }

  return reading
}

interface CardsDockProps {
  /** The simple Sandbox shows one card (the loaded experiment's first); All tools every card. */
  view?: SandboxView
  /** SB15's honest gap, one row per quantity measured so far, under the cards. */
  gaps?: GapRow[]
  /** Changes whenever the moment shown changes (live clock, or the replay's playhead): the cards follow it. */
  moment?: number
  /** A replay: a new moment (scrub, step) is shown at once; only a live run is held to ten readings a second. */
  immediate?: boolean
  theory?: TheoryLike | null
  presetId?: string | null
  readout?: { time: number; state(id: string): BodyState | null } | null
  getTapeAcc?: (bodyId: string) => V3 | undefined
  digitSettings?: DigitSettings
}

export const CardsDockView = memo(function CardsDockView({
  view = 'all',
  gaps = [],
  moment,
  immediate = false,
  theory,
  presetId,
  readout,
  getTapeAcc,
  digitSettings = { decimals: 2, precisionMode: 'dp' }
}: CardsDockProps) {
  const bodies = useSandbox((s) => s.bodies)
  const selection = useSandbox((s) => s.selection)
  const links = useSandbox((s) => s.links)
  const world = useSandbox((s) => s.world)
  const engineTime = useSandbox((s) => s.engineTime)

  const [dockFolded, setDockFolded] = useState(() => readStoredPref(STORAGE_KEY_FOLDED, false))
  const [bigMode, setBigMode] = useState(() => readStoredPref(STORAGE_KEY_BIG, false))
  const [cardFoldedState, setCardFoldedState] = useState<Record<string, boolean>>({})

  const toggleDockFolded = useCallback(() => {
    setDockFolded((prev) => {
      const next = !prev
      writeStoredPref(STORAGE_KEY_FOLDED, next)
      return next
    })
  }, [])

  const toggleBigMode = useCallback(() => {
    setBigMode((prev) => {
      const next = !prev
      writeStoredPref(STORAGE_KEY_BIG, next)
      return next
    })
  }, [])

  const toggleCardFold = useCallback((id: string) => {
    setCardFoldedState((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? evaluatedIndex.current.get(id)! >= OPEN_CARDS)
    }))
  }, [])

  // Card IDs applicable for current scene
  const cardIds = useMemo(() => {
    const all = cardsForScene({
      presetId,
      theory,
      selectedBodyId: selection,
      hasBodies: bodies.length > 0
    })
    // The simple Sandbox: one card, and only for an experiment that has a theory (no generic energy trio there).
    if (view === 'simple') return theory?.cards?.length ? cardsInView(all, view) : []
    return all
  }, [presetId, theory, selection, bodies.length, view])

  // Throttled card evaluation: ~10 Hz while playing, immediate on scrub/step
  const [evaluatedCards, setEvaluatedCards] = useState<CardView[]>([])
  const evaluatedIndex = useRef(new Map<string, number>())
  evaluatedIndex.current = new Map(evaluatedCards.map((c, i) => [c.id, i]))
  const lastEvaluationTimeRef = useRef<number>(0)

  const evaluateActiveCards = useCallback(() => {
    if (bodies.length === 0 || cardIds.length === 0) {
      setEvaluatedCards([])
      return
    }

    const reading = readingFromReadout({
      readout,
      bodies,
      starts: {},
      links,
      world,
      selectedBodyId: selection,
      roles: theory?.roles,
      getTapeAcc
    })

    const views: CardView[] = []
    for (const id of cardIds) {
      const view = evaluateCard(id, reading, digitSettings)
      if (view) views.push(view)
    }
    setEvaluatedCards(views)
  }, [bodies, cardIds, readout, links, world, selection, theory?.roles, getTapeAcc, digitSettings])

  useEffect(() => {
    const now = performance.now()
    const elapsed = now - lastEvaluationTimeRef.current

    // Throttle evaluation to at most once per 100 ms (~10 Hz)
    if (immediate || elapsed >= 90) {
      lastEvaluationTimeRef.current = now
      evaluateActiveCards()
    } else {
      const timer = setTimeout(() => {
        lastEvaluationTimeRef.current = performance.now()
        evaluateActiveCards()
      }, 100 - elapsed)
      return () => clearTimeout(timer)
    }
  }, [engineTime, moment, immediate, evaluateActiveCards])

  if (bodies.length === 0 || cardIds.length === 0) {
    return null
  }

  // When dock is collapsed, render minimal toggle pill
  if (dockFolded) {
    return (
      <div className="pointer-events-auto select-none">
        <button
          type="button"
          onClick={toggleDockFolded}
          className="min-h-[44px] px-3 py-1.5 rounded border border-line bg-surface-1 text-small text-ink flex items-center gap-1.5 shadow hover:bg-surface-2 transition"
          aria-label="Expand formula cards"
        >
          <span>{'\u25F0'} Cards</span>
          {evaluatedCards.length > 0 && (
            <span className="text-fine text-ink-dim">({evaluatedCards.length})</span>
          )}
        </button>
      </div>
    )
  }

  const hasMomentPair = evaluatedCards.some((c) => c.id === 'lever-left-moment') && evaluatedCards.some((c) => c.id === 'lever-right-moment')

  const containerClasses = bigMode
    ? `pointer-events-auto select-none flex min-h-0 flex-col items-end gap-3 ${hasMomentPair ? 'w-[720px]' : 'w-[640px]'} max-w-full`
    : `pointer-events-auto select-none flex min-h-0 flex-col items-end gap-2 ${hasMomentPair ? 'w-[540px]' : 'w-[360px]'} max-w-full`

  const cardClasses = bigMode
    ? 'w-full rounded bg-surface-1/95 border-2 border-line p-4 shadow-lg backdrop-blur text-lead'
    : 'w-full rounded bg-surface-1/95 border border-line px-3 py-2 shadow-md backdrop-blur text-small'

  // Big: every formula line twice its normal step (the result larger still), the title the display step, for a projector at 3 m.
  const titleSize = bigMode ? 'text-display leading-tight font-semibold' : 'text-small font-semibold'
  const formulaSize = bigMode ? 'text-[length:calc(var(--text-small)*2)] leading-snug' : 'text-small'
  const resultSize = bigMode ? 'text-[length:calc(var(--text-body)*2.4)] leading-snug font-semibold' : 'text-body font-semibold'
  const gapSize = bigMode ? 'text-title leading-snug' : 'text-fine'
  // The same height as the graph dock's controls beside it; Big (for a projector) keeps the 44 px touch size.
  const control = bigMode ? 'min-h-[44px] px-2.5 py-1' : 'h-6 px-2'
  const titleRow = bigMode ? 'min-h-[44px]' : 'min-h-[28px]'
  // Big: fractions and roots at full size (KaTeX's display style), where the inline style shrinks L/g under the root.
  const big = (tex: string) => (bigMode ? '\\displaystyle ' + tex : tex)

  const leftCard = evaluatedCards.find((c) => c.id === 'lever-left-moment')
  const rightCard = evaluatedCards.find((c) => c.id === 'lever-right-moment')
  let momentStatusText = 'balanced'
  let momentStatusClass = 'text-good'
  if (leftCard && rightCard && Number.isFinite(leftCard.value) && Number.isFinite(rightCard.value)) {
    const diff = leftCard.value - rightCard.value
    if (Math.abs(diff) < 0.02) {
      momentStatusText = 'balanced'
      momentStatusClass = 'text-good'
    } else if (diff < 0) {
      momentStatusText = 'turns clockwise'
      momentStatusClass = 'text-warn'
    } else {
      momentStatusText = 'turns anticlockwise'
      momentStatusClass = 'text-warn'
    }
  }

  const renderCard = (card: CardView, index: number) => {
    const isFolded = cardFoldedState[card.id] ?? index >= OPEN_CARDS
    const formulaLine = card.lines[0]
    const substitutedLine = card.lines[1]
    const resultLine = card.lines[2]

    return (
      <div key={card.id} className={cardClasses}>
        {/* Card Title Bar */}
        <button
          type="button"
          onClick={() => toggleCardFold(card.id)}
          className={`w-full text-left flex items-center justify-between ${titleRow} group focus-visible:outline-none`}
          aria-expanded={!isFolded}
        >
          <div className="flex items-center gap-2">
            <span className={`${titleSize} text-ink group-hover:text-accent transition`}>
              {card.title}
            </span>
            {card.unitsCheck && (
              <span
                className="text-fine text-good border border-good/40 rounded px-1.5 py-0.5"
                title="Unit scaling verified"
              >
                units {'\u2713'}
              </span>
            )}
          </div>
          <span className="text-fine text-ink-dim ml-2 font-mono">
            {isFolded ? '\u25BC' : '\u25B2'}
          </span>
        </button>

        {/* Card Body (when unfolded) */}
        {!isFolded && (
          <div className="mt-1 pt-1.5 border-t border-line/60 flex flex-col gap-1">
            {formulaLine && (
              <div className={`${formulaSize} text-ink-dim`}>
                <CardTex tex={big(formulaLine.tex)} />
              </div>
            )}
            {substitutedLine && (
              <div className={`${formulaSize} text-ink`}>
                <CardTex tex={big(substitutedLine.tex)} />
              </div>
            )}
            <div className={`${resultSize} text-ink-strong mt-0.5`}>
              <CardTex tex={resultLine ? resultLine.tex : card.text} />
            </div>
          </div>
        )}
      </div>
    )
  }

  const otherCards = evaluatedCards.filter((c) => c.id !== 'lever-left-moment' && c.id !== 'lever-right-moment')

  return (
    <div className={containerClasses}>
      {/* Dock controls toolbar */}
      <div className={`flex items-center gap-2 bg-surface-1/90 border border-line rounded px-2 shadow ${bigMode ? 'py-1' : 'h-[30px]'}`}>
        <span className="text-fine text-ink-dim font-medium mr-1">Formula cards</span>
        <button
          type="button"
          onClick={toggleBigMode}
          className={`${control} rounded border text-fine font-medium transition ${
            bigMode
              ? 'bg-accent text-on-accent border-accent'
              : 'border-line text-ink-dim hover:text-ink hover:bg-surface-2'
          }`}
          aria-label="Toggle Big text mode for projectors"
        >
          Big
        </button>
        <button
          type="button"
          onClick={toggleDockFolded}
          className={`${control} rounded border border-line text-fine text-ink-dim hover:text-ink hover:bg-surface-2 transition`}
          aria-label="Fold formula cards dock"
        >
          Fold
        </button>
      </div>

      {/* Rendered cards */}
      <div className="flex min-h-0 flex-col gap-2 w-full overflow-y-auto pr-1">
        {hasMomentPair && leftCard && rightCard ? (
          <>
            <div className="grid grid-cols-2 gap-2 w-full">
              {renderCard(leftCard, 0)}
              {renderCard(rightCard, 1)}
            </div>
            <div
              className="w-full text-center py-1 px-3 rounded border border-line bg-surface-1/90 text-small flex items-center justify-center gap-2 shadow-sm"
              aria-live="polite"
            >
              <span className="text-ink-dim font-medium">Turning effect:</span>
              <span className={`font-semibold ${momentStatusClass}`}>{momentStatusText}</span>
            </div>
            {otherCards.map((card, idx) => renderCard(card, idx + 2))}
          </>
        ) : (
          evaluatedCards.map((card, index) => renderCard(card, index))
        )}
        {/* SB15's honest gap: the formula against the run, and why they differ. */}
        {gaps.length > 0 && (
          <div className={cardClasses} data-testid="cards-gaps">
            {gaps.map((g) => (
              <div key={g.key} className={`${gapSize} ${g.within ? 'text-ink-dim' : 'text-warn'} py-0.5`}>
                {g.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * The dock as the Sandbox HUD mounts it: the loaded experiment (SB15's presetId and theoryFor), the moment shown (live,
 * or the replay's playhead from SB16's tape), and the gap rows measured off the tape, worked out at most twice a second
 * while the run plays (measuring reads the whole tape) and at once when the playhead moves in a replay.
 */
export function CardsDock() {
  const view = useSandboxView((s) => s.view)
  const presetId = useSandbox((s) => s.presetId)
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const world = useSandbox((s) => s.world)
  const engineTime = useSandbox((s) => s.engineTime)
  const settings = useScene((s) => s.settings)
  const mode = useTape((s) => s.mode)
  const playhead = useTape((s) => s.playhead)
  const revision = useTape((s) => s.revision)
  const theory = useMemo(() => theoryFor(presetId), [presetId])
  // A highlighted symbol belongs to the scene and run it was tapped in: a new scene or a Reset clears it.
  const runNonce = useSandbox((s) => s.runNonce)
  useEffect(() => cardLink.clear(), [presetId, runNonce])
  const replaying = mode !== 'live'
  const tape = shownTape()
  const readout = useMemo(
    () => (replaying && tape && tape.last >= tape.first ? tapeReadout(tape, Math.round(playhead), { bodies }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the tape object stays the same while it grows: revision and playhead are its change signals
    [replaying, tape, playhead, revision, bodies]
  )

  const [gaps, setGaps] = useState<GapRow[]>([])
  const lastGaps = useRef(0)
  useEffect(() => {
    if (!theory || !tape) {
      setGaps([])
      return
    }
    const work = () => {
      lastGaps.current = performance.now()
      const num = (v: number) => formatMeasure(v, 'number', settings)
      try {
        setGaps(gapRows(theory, { bodies, links, world }, tape, tape.rate, num, replaying ? Math.round(playhead) : undefined))
      } catch {
        setGaps([])
      }
    }
    const wait = replaying ? 0 : 500 - (performance.now() - lastGaps.current)
    if (wait <= 0) {
      work()
      return
    }
    const timer = setTimeout(work, wait)
    return () => clearTimeout(timer)
  }, [theory, tape, engineTime, revision, playhead, replaying, bodies, links, world, settings])

  return (
    <CardsDockView
      view={view}
      gaps={view === 'simple' ? [] : gaps}
      moment={replaying ? playhead : engineTime}
      immediate={replaying}
      theory={theory}
      presetId={presetId}
      readout={readout}
      digitSettings={{ decimals: settings.decimals, precisionMode: settings.precisionMode }}
    />
  )
}
