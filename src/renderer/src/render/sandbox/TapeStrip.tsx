// The Sandbox HUD's bottom slot: the tape strip (SB17). A video editor's strip under the scene: transport buttons, speeds, a
// scrub bar over the recording (keyframes, bounce marks, bookmarks, the branch point, the loop, the playhead), Fine replay,
// Branch from here and Back to live. It shows from the first step of a run on. What a button does is in sim/transportActions.ts
// (one place for the panel, this strip and the keys); where things sit on the bar is in tapeStripMath.ts.
// Colours are the tape tokens in styles.css; every number goes through the app's writer; a control is 44 px tall.

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Bookmark, ChevronDown, FastForward, GitBranch, Microscope, Pause, Play, Radio, Rewind, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react'
import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { useSandboxView } from '../../sim/sandboxView'
import { nextSimpleSpeed, useTapeBar } from '../../sim/tapeBar'
import { tapes } from '../../sim/recorder'
import { shownTape, useTape, type TapeMode } from '../../sim/tapeStore'
import { rateOf } from '../../sim/types'
import { formatMeasure } from '../../math/format'
import {
  SPEEDS,
  backToLive,
  bookmarkHere,
  branchFromHere,
  chooseSpeed,
  clearLoop,
  fineReplay,
  loopEnd,
  loopStart,
  play,
  playBackwards,
  scrubTo,
  stepBack,
  stepForward,
  stepOnTitle,
  toEnd,
  toStart,
  togglePlay,
  useEditRefusal,
  useTransportFlags
} from '../../sim/transportActions'
import { hitTest, markerXs, stepToX, ticks, timeText, xToStep, type StripView } from './tapeStripMath'

/** A short recording sits at the left of a bar this long, so the bar does not rescale at every step of the first seconds. */
export const MIN_SPAN_SECONDS = 5

/** What the bar needs to know about a tape (a Tape has all of it). */
interface StripTape {
  first: number
  last: number
  rate: number
  timeOf(step: number): number
  keyframeSteps(): number[]
}

export interface StripInput {
  tape: StripTape
  mode: TapeMode
  /** The playhead in replay and fine (fractional); in live the head is the tape's last step. */
  playhead: number
  marks: number[]
  bookmarks: { step: number; label: string }[]
  loop: { a: number; b: number } | null
  /** The step the live recording was branched at, when it was. */
  branchStep: number | null
  /** The bar's width in px. */
  width: number
}

interface StripModel {
  view: StripView
  /** The last recorded step: a short recording leaves the rest of the bar empty. */
  end: number
  fillX: number
  /** The step the playhead is on, kept on the recording, and where it sits. */
  head: number
  headX: number
  ticks: { step: number; x: number; label: string }[]
  keys: { step: number; x: number }[]
  marks: { step: number; x: number }[]
  bookmarks: { step: number; x: number; label: string }[]
  branchX: number | null
  loop: { x0: number; x1: number } | null
  /** Everything a click can land on, for snapping: the marks first, then the bookmarks. */
  snaps: { step: number; x: number }[]
  /** "t = 0.783 s · step 188" for the head. */
  text: string
}

export function stripView(tape: StripTape, mode: TapeMode, width: number): StripView {
  // The fast re-run is one second and is shown whole; a recording is shown at least MIN_SPAN_SECONDS long.
  const last = mode === 'fine' ? tape.last : Math.max(tape.last, tape.first + Math.round(MIN_SPAN_SECONDS * tape.rate))
  return { first: tape.first, last, rate: tape.rate, startStep: tape.first, startTime: tape.timeOf(tape.first), width }
}

export function stripModel(i: StripInput): StripModel {
  const { tape } = i
  const view = stripView(tape, i.mode, i.width)
  const head = i.mode === 'live' ? tape.last : Math.min(tape.last, Math.max(tape.first, i.playhead))
  const shown = Math.floor(head + 1e-9)
  const onTape = (s: number) => s >= tape.first && s <= tape.last
  const marks = markerXs(view, i.marks.filter(onTape))
  // Bookmarks, the loop and the branch point belong to the live recording; the fast re-run is a different axis (600 steps a second).
  const fine = i.mode === 'fine'
  const bookmarks = (fine ? [] : i.bookmarks).filter((b) => onTape(b.step)).map((b) => ({ step: b.step, x: stepToX(view, b.step), label: b.label }))
  return {
    view,
    end: tape.last,
    fillX: stepToX(view, tape.last),
    head,
    headX: stepToX(view, head),
    ticks: ticks(view),
    keys: markerXs(view, tape.keyframeSteps(), 8),
    marks,
    bookmarks,
    branchX: !fine && i.branchStep !== null && onTape(i.branchStep) ? stepToX(view, i.branchStep) : null,
    loop: !fine && i.loop ? { x0: stepToX(view, i.loop.a), x1: stepToX(view, i.loop.b) } : null,
    // In time order: Page Up and Page Down walk this list, and a bookmark made late sits between two early marks.
    snaps: [...marks, ...bookmarks.map((b) => ({ step: b.step, x: b.x }))].sort((p, q) => p.step - q.step),
    text: timeText(tape.timeOf(shown), shown)
  }
}

/** The step a click or a drag at x asks for: a mark or bookmark close to it wins (so a click on a mark lands on the mark), else the nearest step; never past the recording. */
export function seekStep(m: StripModel, x: number, snap: boolean): number {
  const near = snap ? hitTest(m.view, x, m.snaps) : null
  return Math.min(m.end, near ?? xToStep(m.view, x))
}

/** The step a key on the focused bar goes to, or null when the key is not the bar's. Arrows step; with Shift they jump a second; Page Up and Page Down jump to the previous or next mark or bookmark. */
export function barKeyTarget(key: string, shift: boolean, m: StripModel): number | null {
  const head = Math.floor(m.head + 1e-9)
  const first = m.view.first
  const bound = (s: number) => Math.max(first, Math.min(m.end, s))
  switch (key) {
    case 'ArrowLeft':
      return bound(head - (shift ? m.view.rate : 1))
    case 'ArrowRight':
      return bound(head + (shift ? m.view.rate : 1))
    case 'Home':
      return first
    case 'End':
      return m.end
    case 'PageUp':
      return [...m.snaps].reverse().find((s) => s.step < head)?.step ?? first
    case 'PageDown':
      return m.snaps.find((s) => s.step > head)?.step ?? m.end
    default:
      return null
  }
}

/** The widest time text a run shows below 1000 s, laid invisibly in the time's cell so the strip never changes width as the digits grow (Fix 22). */
export const WIDEST_TIME_TEXT = timeText(888.888, 888888)

/** The speed buttons' labels, in the order of SPEEDS. */
const SPEED_LABEL: Record<number, string> = { 1: '×1', 0.5: '×½', 0.25: '×¼', 0.1: '×1/10', 0.01: '×1/100' }

const SPEED_TITLE: Record<number, string> = {
  1: 'Normal speed',
  0.5: 'Half speed',
  0.25: 'A quarter of the speed',
  0.1: 'A tenth of the speed',
  0.01: 'A hundredth of the speed, to see a bounce closely'
}

/** What the simple view's one speed button goes to next, in words for its title. */
const NEXT_WORDS: Record<number, string> = { 1: 'normal speed', 0.5: 'half speed', 0.25: 'a quarter of the speed' }

/** One button with a short name (read aloud), a title saying what it does and its key, and a 44 px target. */
function Btn({ name, title, onClick, disabled, on, children }: { name: string; title: string; onClick: () => void; disabled?: boolean; on?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`icon-btn min-h-[44px] min-w-[44px] ${on ? 'on' : ''}`} aria-label={name} title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

function TextBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="btn min-h-[44px]" title={title} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}

/** The bar: ticks, the recorded part, keyframes, marks, bookmarks, branch, loop, playhead. Click or drag to seek. */
function ScrubBar({ model, onWidth, isSimple, slim = false }: { model: StripModel; onWidth: (w: number) => void; isSimple?: boolean; slim?: boolean }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const dragging = useRef(false)
  const modelRef = useRef(model)
  useLayoutEffect(() => {
    modelRef.current = model
  })
  useLayoutEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => onWidth(box.clientWidth))
    ro.observe(box)
    return () => ro.disconnect()
  }, [box, onWidth])
  const seek = (e: PointerEvent<HTMLDivElement>, snap: boolean) => {
    const rect = e.currentTarget.getBoundingClientRect()
    scrubTo(seekStep(modelRef.current, e.clientX - rect.left, snap))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const to = barKeyTarget(e.key, e.shiftKey, modelRef.current)
    if (to === null) return
    // The bar's own keys: the window shortcuts (Home goes to the objects, the arrows turn a drawing) must not also act.
    e.preventDefault()
    e.stopPropagation()
    scrubTo(to)
  }
  const { view } = model
  // The slim bar (SB66, simple view): the track and the head without the tick labels, 28 px high in the row.
  const H = slim ? 28 : 46
  const lift = slim ? -12 : 0
  const ariaText = isSimple ? model.text.split(' · ')[0] : model.text
  return (
    <div
      ref={setBox}
      role="slider"
      tabIndex={0}
      aria-label="Position in the recording"
      aria-valuemin={view.first}
      aria-valuemax={model.end}
      aria-valuenow={Math.floor(model.head + 1e-9)}
      aria-valuetext={ariaText}
      title="Click or drag to move through the recording. Arrow keys step, Shift and arrows jump a second, Page Up and Page Down go to the previous or next bounce or bookmark, Home and End go to the ends."
      className={`relative ${slim ? 'h-[28px] min-w-0 flex-1' : 'h-[46px] w-full'} cursor-pointer touch-none select-none rounded outline-offset-2`}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        dragging.current = true
        e.currentTarget.setPointerCapture?.(e.pointerId)
        seek(e, true)
      }}
      onPointerMove={(e) => {
        if (dragging.current) seek(e, false)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        e.currentTarget.releasePointerCapture?.(e.pointerId)
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onKeyDown={onKey}
    >
      <svg width={view.width} height={H} viewBox={`0 0 ${view.width} ${H}`} className="absolute inset-0 overflow-visible" aria-hidden="true">
        <g transform={`translate(0 ${lift})`}>
        {!slim && model.ticks.map((t) => (
          <g key={t.step}>
            <line x1={t.x} x2={t.x} y1={14} y2={20} strokeWidth={1} style={{ stroke: 'var(--tape-key)' }} />
            <text x={t.x} y={11} fontSize={10} textAnchor={t.x < 14 ? 'start' : t.x > view.width - 14 ? 'end' : 'middle'} style={{ fill: 'var(--text-dim)' }}>
              {t.label}
            </text>
          </g>
        ))}
        <rect x={0} y={22} width={view.width} height={10} rx={3} style={{ fill: 'var(--tape-track)' }} />
        <rect x={0} y={22} width={model.fillX} height={10} rx={3} style={{ fill: 'var(--tape-fill)' }} />
        {model.loop && (
          <rect x={model.loop.x0} y={18} width={Math.max(2, model.loop.x1 - model.loop.x0)} height={18} rx={2} fillOpacity={0.35} strokeWidth={1} strokeDasharray="3 2" style={{ fill: 'var(--tape-fill)', stroke: 'var(--tape-head)' }} />
        )}
        {model.keys.map((k) => (
          <polygon key={k.step} points={`${k.x},24.5 ${k.x + 3.5},27 ${k.x},29.5 ${k.x - 3.5},27`} style={{ fill: 'var(--tape-key)' }} />
        ))}
        {model.marks.map((k) => (
          <polygon key={k.step} points={`${k.x},34 ${k.x + 4},41 ${k.x - 4},41`} style={{ fill: 'var(--tape-mark)' }} />
        ))}
        {model.bookmarks.map((b) => (
          <g key={b.step}>
            <line x1={b.x} x2={b.x} y1={14} y2={22} strokeWidth={1.5} style={{ stroke: 'var(--tape-key)' }} />
            <polygon points={`${b.x},14 ${b.x + 7},16.5 ${b.x},19`} style={{ fill: 'var(--tape-key)' }} />
          </g>
        ))}
        {model.branchX !== null && <line x1={model.branchX} x2={model.branchX} y1={16} y2={40} strokeWidth={2} strokeDasharray="3 2" style={{ stroke: 'var(--tape-branch)' }} />}
        <line x1={model.headX} x2={model.headX} y1={14} y2={44} strokeWidth={2} style={{ stroke: 'var(--tape-head)' }} />
        <polygon points={`${model.headX - 5},12 ${model.headX + 5},12 ${model.headX},19`} style={{ fill: 'var(--tape-head)' }} />
        </g>
      </svg>
    </div>
  )
}

/**
 * The strip: it reads the tape, the transport state and the settings, and draws them. `inline` puts it in the page flow (the
 * Timeline dock panel) instead of over the bottom of the drawing.
 */
export function TapeStrip({ inline = false }: { inline?: boolean }) {
  const view = useSandboxView((s) => s.view)
  const isSimple = view === 'simple'
  const flags = useTransportFlags()
  const mode = useTape((s) => s.mode)
  const playhead = useTape((s) => s.playhead)
  const marks = useTape((s) => s.marks)
  const bookmarks = useTape((s) => s.bookmarks)
  const loop = useTape((s) => s.loop)
  // A refused edit (Ctrl+Z in replay) says why here for a few seconds; otherwise the tape's own note.
  const refusal = useEditRefusal((s) => s.sentence)
  const tapeNote = useTape((s) => s.note)
  const note = refusal ?? tapeNote
  const speed = useTape((s) => s.speed)
  const settings = useScene((s) => s.settings)
  const world = useSandbox((s) => s.world)
  const [width, setWidth] = useState(640)
  const barShown = useTapeBar((s) => s.shown)
  const setBarShown = useTapeBar((s) => s.setShown)
  const tape = shownTape()
  if (!tape || !flags.hasRun) {
    return inline ? <p className="text-[color:var(--text-dim)]">The recording appears here once a run has started. Press Play.</p> : null
  }
  const shownBar = inline || barShown
  if (!shownBar) {
    // SB66: hidden (the default): a small pill at the bottom left of the drawing brings the bar back.
    return (
      <>
      {refusal && <p className="pointer-events-none absolute bottom-[52px] left-3 max-w-[60%] rounded bg-[var(--label-bg)] px-2 py-1 text-[color:var(--text)] shadow" role="status">{refusal}</p>}
      <button type="button" data-tape-pill="" className="pointer-events-auto absolute bottom-3 left-3 flex min-h-[32px] items-center gap-1.5 rounded-full border border-[color:var(--line-2)] bg-[var(--label-bg)] px-3 text-small text-[color:var(--text)] shadow" title="Show the replay bar" onClick={() => setBarShown(true)}>
        <Rewind size={14} aria-hidden="true" />
        <span>Replay</span>
      </button>
      </>
    )
  }
  const model = stripModel({ tape, mode, playhead, marks, bookmarks, loop, branchStep: tapes.parent?.step ?? null, width: Math.max(120, width) })
  // Live, the speeds are the Sandbox's slow motion; in replay they are the recording's own speed.
  const speedShown = mode === 'live' ? world.timeScale : speed
  const stepTitle = stepOnTitle(formatMeasure(mode === 'live' ? rateOf(world) : tape.rate, 'number', settings))
  // In simple view, hide the step number from the time text
  const timeText = isSimple ? model.text.split(' · ')[0] : model.text
  const hide = inline ? null : (
    <Btn name="Hide the replay bar" title="Hide the replay bar (the Replay button brings it back)" onClick={() => setBarShown(false)}>
      <ChevronDown size={15} />
    </Btn>
  )
  if (isSimple && !inline) {
    // SB66: the simple view's bar is ONE slim row, like a video player: start, step back, play, step on, the timeline, the
    // time (two decimals, the app's writer), one speed button and Hide. A refused edit says why just above it.
    const shownStep = Math.floor(model.head + 1e-9)
    const seconds = formatMeasure(tape.timeOf(shownStep), 'number', { ...settings, decimals: 2, precisionMode: 'dp' })
    const label = SPEED_LABEL[speedShown] ?? '×1'
    return (
      <div className="pointer-events-auto absolute bottom-[64px] left-14 right-3 flex items-center gap-1 rounded-lg border border-[color:var(--line-2)] bg-[var(--label-bg)] px-2 text-[color:var(--text)]" data-tape-strip="" data-tape-row="slim">
        {note && <p className="absolute -top-6 left-2 max-w-full truncate rounded bg-[var(--label-bg)] px-2 text-[color:var(--text-dim)]" title={note}>{note}</p>}
        <Btn name="To the start" title="Jump to the start of the recording" onClick={toStart} disabled={!flags.canStart}>
          <SkipBack size={15} />
        </Btn>
        <Btn name="Step back" title="Step back one step (comma key)" onClick={stepBack} disabled={!flags.canBack}>
          <StepBack size={15} />
        </Btn>
        <Btn name={flags.playing ? 'Pause' : 'Play'} title={flags.playing ? 'Pause (Space or K)' : 'Play (Space or L)'} onClick={togglePlay} on>
          {flags.playing ? <Pause size={15} /> : <Play size={15} />}
        </Btn>
        <Btn name="Step on" title={stepTitle} onClick={stepForward}>
          <StepForward size={15} />
        </Btn>
        <ScrubBar model={model} onWidth={setWidth} isSimple slim />
        <span className="ml-1 font-mono tabular-nums text-[color:var(--text-strong)]">t = {seconds} s</span>
        <button
          type="button"
          className="btn min-h-[44px] min-w-[52px] justify-center"
          aria-label="Speed"
          title={`${SPEED_TITLE[speedShown] ?? SPEED_TITLE[1]}: press for ${NEXT_WORDS[nextSimpleSpeed(speedShown)]}${mode === 'live' ? ' (the same as slow motion)' : ''}`}
          onClick={() => chooseSpeed(nextSimpleSpeed(speedShown))}
        >
          {label}
        </button>
        {hide}
      </div>
    )
  }
  const frame = inline
    ? 'flex flex-col gap-1'
    : 'pointer-events-auto absolute bottom-[72px] left-14 right-3 flex flex-col gap-1 rounded-lg border border-[color:var(--line-2)] bg-[var(--label-bg)] px-3 py-1 text-[color:var(--text)]'
  return (
    <div className={frame} data-tape-strip="">
      <ScrubBar model={model} onWidth={setWidth} isSimple={isSimple} />
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <Btn name="To the start" title="Jump to the start of the recording" onClick={toStart} disabled={!flags.canStart}>
          <SkipBack size={15} />
        </Btn>
        {!isSimple && (
          <Btn name="Play backwards" title="Play backwards (J)" onClick={playBackwards} disabled={!flags.canBack}>
            <Rewind size={15} />
          </Btn>
        )}
        <Btn name="Step back" title="Step back one step (comma key)" onClick={stepBack} disabled={!flags.canBack}>
          <StepBack size={15} />
        </Btn>
        <Btn name={flags.playing ? 'Pause' : 'Play'} title={flags.playing ? 'Pause (Space or K)' : 'Play (Space or L)'} onClick={togglePlay} on>
          {flags.playing ? <Pause size={15} /> : <Play size={15} />}
        </Btn>
        <Btn name="Step on" title={stepTitle} onClick={stepForward}>
          <StepForward size={15} />
        </Btn>
        {!isSimple && (
          <Btn name="Play forwards" title="Play forwards (L)" onClick={play}>
            <FastForward size={15} />
          </Btn>
        )}
        <Btn name="To the end" title="Jump to the end of the recording" onClick={toEnd} disabled={!flags.canEnd}>
          <SkipForward size={15} />
        </Btn>
        <div className="seg ml-2" role="group" aria-label="Speed">
          {SPEEDS.map((s) =>
            isSimple && (s === 0.1 || s === 0.01) ? null : (
            <button
              key={s}
              type="button"
              className={`min-h-[44px] min-w-[44px] justify-center ${speedShown === s ? 'on' : ''}`}
              title={`${SPEED_TITLE[s]}${mode === 'live' ? ' (the same as slow motion under World)' : ''}`}
              aria-pressed={speedShown === s}
              onClick={() => chooseSpeed(s)}
            >
              {SPEED_LABEL[s]}
            </button>
            )
          )}
        </div>
        {!isSimple && (
          <>
            <Btn name="Bookmark" title="Leave a bookmark at this moment (M)" onClick={bookmarkHere} disabled={mode === 'fine'}>
              <Bookmark size={15} />
            </Btn>
            <Btn name="Loop start" title="The loop starts here ([ key)" onClick={loopStart} disabled={mode === 'fine'}>
              <span className="font-semibold">A</span>
            </Btn>
            <Btn name="Loop end" title="The loop ends here (] key)" onClick={loopEnd} disabled={mode === 'fine'}>
              <span className="font-semibold">B</span>
            </Btn>
            {loop && mode !== 'fine' && (
              <TextBtn title="Stop looping: clear the start and end" onClick={clearLoop}>
                Clear loop
              </TextBtn>
            )}
            <TextBtn title={flags.fineWhy ?? 'Run the second around this moment again at 1/600 s, to see what falls between two ordinary pictures, such as the contact of a bounce'} onClick={fineReplay} disabled={flags.fineWhy !== null}>
              <Microscope size={15} /> Fine replay 1/600 s
            </TextBtn>
            <TextBtn title={flags.branchWhy ?? 'Continue the run from this moment, so something can be changed (B)'} onClick={branchFromHere} disabled={flags.branchWhy !== null}>
              <GitBranch size={15} /> Branch from here
            </TextBtn>
            {mode !== 'live' && (
              <TextBtn title="Back to the end of the recording, where the run goes on" onClick={backToLive}>
                <Radio size={15} /> Back to live
              </TextBtn>
            )}
          </>
        )}
        <span className="ml-auto grid justify-items-end font-mono tabular-nums text-[color:var(--text-strong)]">
          <span className="invisible col-start-1 row-start-1" aria-hidden="true">
            {WIDEST_TIME_TEXT}
          </span>
          <span className="col-start-1 row-start-1">{timeText}</span>
        </span>
        {hide}
      </div>
      {/* One line, always there, so a note arriving never moves the strip (Fix 22). */}
      <p className="min-h-[18px] truncate text-[color:var(--text-dim)]" title={note ?? undefined}>
        {note ?? ' '}
      </p>
    </div>
  )
}
