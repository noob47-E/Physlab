// One Maths screen: the field, the answer under it, and the working under that.
//
// It replaces the Calculator panel (a keypad drawn like a handheld, with a green LCD and a SHIFT
// key) and the Working panel it sent things to. A student types, presses Enter, reads the
// answer, and presses "Work it out" for the steps — all in one place, with no panel switch and
// nothing that looks like a 1990s calculator. The keypad is a popup under the field for the
// symbols a keyboard has no key for (√, ∫, π); physical typing goes through the same field.
//
// What re-renders on a keystroke matters here: the old panel subscribed to the whole store and
// redrew 60-odd keys per character. Only <Expression> follows the field's text; every other part
// reads the store when it acts (useCalc.getState()), and the keypad is memoised.

import { memo, Profiler, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Eye, History, Keyboard, Play, Sparkles, Trash2, X } from 'lucide-react'
import { casInDegrees } from '../calc/angle'
import { FIELD_MODES, MODE_HINTS, MODE_LABELS, clearCalcHistory, isFieldMode, useCalc, type CalcMode, type FieldMode, type HistoryItem } from '../calc/calcStore'
import { casioToMath, evaluateComp, type Base } from '../calc/engine'
import { calcNum, setCalcPrecisionSource } from '../calc/format'
import { constantScope } from '../calc/constants'
import { evaluateInput, isHeavy, lettersIn, mainLine, type EvalResult } from '../calc/evaluateInput'
import { groupsForMode, type KeyDef, type KeyGroup, type KeyGroupId } from '../calc/keys'
import { math } from '../math/expr'
import { latexToMath, tryLatexToMath } from '../math/latexToMath'
import { fieldHasText, type StepPref } from '../math/pure/reveal'
import { cas, useCasStatus } from '../math/cas'
import { usePure, type PureEntry } from '../math/pure/store'
import { JOBS, jobById, type JobId } from '../math/pure/run'
import { parseExpr, varsOf } from '../math/pure/mono'
import { useScene } from '../core/store'
import { themeColor } from '../app/theme'
import { placeTourCard } from '../app/layoutMath'
import { showPanel } from '../app/panels'
import { visualizeArea, visualizeGraph, visualizePoint, visualizeTangent, visualizeVector } from '../core/visualize'
import { Builder } from '../core/factory'
import { Tex } from '../ui/Tex'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { ModePanel } from './calcModes'
import { WorkingView, readStepPref, writeStepPref } from './WorkingView'

// Every number the screen shows follows the precision the student chose in Settings (Rule 4).
// The scene store is read lazily so calc/ never imports it back.
setCalcPrecisionSource(() => useScene.getState().settings)

const MORE_MODES: CalcMode[] = ['MATRIX', 'VECTOR', 'STAT', 'DIST', 'TABLE', 'EQUATION', 'INEQUALITY', 'RATIO', 'SHEET', 'UNITS', 'CONST', 'MEASURE']

const CHIP = 'rounded px-2 py-0.5 text-fine font-semibold'
const CHIP_ON = 'bg-[color:var(--accent-2)] text-[color:var(--on-accent)]'
const CHIP_OFF = 'bg-[color:var(--bg-3)] text-[color:var(--text-dim)] hover:text-[color:var(--text-strong)]'

/** Splits "f, a, b" at top-level commas. */
function args(inner: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/**
 * True when "y = this" is something the grapher can draw: one letter, and that letter is x.
 * Offering the button for 27a³ + 8b³ would only produce an error in the console.
 */
function graphable(src: string): boolean {
  if (!src.trim()) return false
  try {
    const vars = varsOf(parseExpr(src.split('=')[0]))
    return vars.length === 1 && vars[0] === 'x'
  } catch {
    return false
  }
}

// Development only: how many commits a keystroke costs, read from the console as
// __mathsCommits. This is how the "≤ 3 components per keystroke" figure in HISTORY was measured.
const devProfile = (id: string, phase: string, actual: number): void => {
  const w = window as unknown as { __mathsCommits?: { n: number; ms: number; last: string } }
  const c = (w.__mathsCommits ??= { n: 0, ms: 0, last: '' })
  c.n += 1
  c.ms += actual
  c.last = `${id}:${phase}`
}
const Measured = ({ children }: { children: ReactNode }) => (import.meta.env?.DEV ? <Profiler id="maths" onRender={devProfile}>{children}</Profiler> : <>{children}</>)

export function Maths() {
  const mode = useCalc((s) => s.mode)
  // Re-render when the precision setting changes, so every number on the screen follows it.
  useScene((s) => s.settings.decimals)
  useScene((s) => s.settings.precisionMode)
  return (
    <div className="maths panel">
      <ModeChips mode={mode} />
      <Measured>{isFieldMode(mode) ? <FieldScreen mode={mode} /> : <ModePanel mode={mode} />}</Measured>
    </div>
  )
}

function ModeChips({ mode }: { mode: CalcMode }) {
  const [more, setMore] = useState(false)
  const other = MORE_MODES.includes(mode) ? mode : null
  // The field's text is one store value for every mode. Bases types plain text and the others
  // LaTeX, so crossing that line with the text kept showed 1\div3 in the Bases field; the
  // text is cleared on that crossing only (Numbers ↔ Complex keep it, and so does a recall).
  const setMode = (m: CalcMode): void => {
    const crossing = (m === 'BASE-N') !== (mode === 'BASE-N') && isFieldMode(m) && isFieldMode(mode)
    useCalc.setState(crossing ? { mode: m, input: '' } : { mode: m })
  }
  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {FIELD_MODES.map((m) => (
        <button key={m} title={MODE_HINTS[m]} onClick={() => setMode(m)} className={`${CHIP} ${mode === m ? CHIP_ON : CHIP_OFF}`}>
          {MODE_LABELS[m]}
        </button>
      ))}
      <button title="Matrices, vectors, statistics, tables, equations and more" onClick={() => setMore(!more)} className={`${CHIP} flex items-center gap-1 ${other ? CHIP_ON : CHIP_OFF}`}>
        {other ? MODE_LABELS[other] : 'More'} <ChevronDown size={11} />
      </button>
      {more && (
        <div className="menu top-full mt-1" onMouseLeave={() => setMore(false)}>
          {MORE_MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? 'font-semibold' : ''}
              onClick={() => {
                setMode(m)
                setMore(false)
              }}
            >
              <span>{MODE_LABELS[m]}</span>
              <span className="sc">{MODE_HINTS[m]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** What the toolbar and keypad need from the screen, kept in a ref so their callbacks stay stable. */
interface Actions {
  press: (k: KeyDef) => void
}

function FieldScreen({ mode }: { mode: FieldMode }) {
  const angleUnit = useScene((s) => s.settings.angleUnit)
  const setSettings = useScene((s) => s.setSettings)
  const mathRef = useRef<MathInputHandle>(null)
  const baseRef = useRef<HTMLInputElement>(null)
  // The field, the toolbar, the answer and the drawers: what the keypad hangs under and what a
  // click inside leaves it open for. It used to hang under the field alone, exactly over the
  // answer card, so = on the keypad showed nothing until the keypad was closed.
  const headBox = useRef<HTMLDivElement>(null)
  // The answer remembers the mode it was worked out under and the line it answers: a mode
  // switch keeps the field's text (the store holds it) but an answer from the other mode's
  // rules is not shown under this one, and an answer to a line the student has since edited is
  // not shown under the new line either — on one screen it read as the answer to that line.
  const [answered, setAnswered] = useState<{ mode: FieldMode; input: string; result: EvalResult } | null>(null)
  const result = answered?.mode === mode ? answered.result : null
  const setResult = (next: EvalResult | null | ((prev: EvalResult | null) => EvalResult | null)): void =>
    setAnswered((prev) => {
      const cur = prev?.mode === mode ? prev : null
      const r = typeof next === 'function' ? next(cur?.result ?? null) : next
      if (!r) return null
      // A function only amends the answer already shown (the exact form arriving), so the line
      // it belongs to is the one it had; a fresh answer belongs to what the field holds now.
      return { mode, input: typeof next === 'function' ? (cur?.input ?? '') : useCalc.getState().input, result: r }
    })
  // Every keystroke lands here. The store is written first; the answer is dropped only on the
  // first keystroke that leaves the line it answered (an unchanged state is no render), so a
  // keystroke costs one store write and no render of this screen.
  const onEdit = useCallback((latex: string) => {
    useCalc.setState({ input: latex })
    setAnswered((prev) => (prev && prev.input !== latex ? null : prev))
  }, [])
  const [showExact, setShowExact] = useState(true)
  const [eng, setEng] = useState(false)
  const [base, setBase] = useState<Base>(10)
  const [asked, setAsked] = useState<{ mode: FieldMode; letters: string[] } | null>(null)
  // A new working — from Work it out, the command bar, a recalled entry or the tour — takes the
  // screen: the field now holds its line (calcStore follows the pure store), and the answer
  // card and the with-values form belonged to the line before.
  useEffect(
    () =>
      usePure.subscribe((s, prev) => {
        if (s.runSeq === prev.runSeq) return
        setAnswered(null)
        setAsked(null)
      }),
    []
  )
  const withValues = asked?.mode === mode ? asked.letters : null
  const setWithValues = (letters: string[] | null): void => setAsked(letters ? { mode, letters } : null)
  const [keypad, setKeypad] = useState(false)
  const [showVars, setShowVars] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [jobs, setJobs] = useState(false)
  // True from "Work it out" until the answer it produced has decided about taking the focus.
  const invite = useRef(false)

  /** The current input as PhysLab's linear syntax. Throws the converter's sentence on a ± it cannot use. */
  const linear = (): string => {
    const s = useCalc.getState().input
    return mode === 'BASE-N' ? s : latexToMath(s)
  }

  /** The same, but empty instead of thrown, for key handlers that only peek at the text. */
  const linearOrEmpty = (): string => {
    const s = useCalc.getState().input
    return mode === 'BASE-N' ? s : tryLatexToMath(s).src
  }

  const evaluate = (varsOverride?: Record<string, unknown>): void => {
    const s = useCalc.getState()
    const opts = { vars: { ...s.vars, ...varsOverride }, ans: s.ans, angle: angleUnit, base }
    const run = (): void => {
      const r = evaluateInput(mode, s.input, opts)
      if (!r) return
      setAnswered({ mode, input: s.input, result: r })
      if (r.error) return
      useCalc.setState({
        ans: r.value,
        vars: r.solved ? { ...s.vars, x: r.value } : s.vars,
        history: [{ input: s.input, result: r.main, mode }, ...s.history].slice(0, 100)
      })
      if (r.askExact) {
        cas('exact', { expr: casioToMath(r.src), deg: casInDegrees(angleUnit) }).then((res) => {
          if (!res.error && res.latex && !/\./.test(res.text) && res.text.length < 60) {
            setResult((prev) => (prev && prev.value === r.value ? { ...prev, exact: res.latex } : prev))
          }
        })
      }
    }
    // An integral or a sum can take a moment; letting the key press paint first is what makes
    // the screen feel quick rather than stuck.
    if (isHeavy(s.input)) setTimeout(run, 0)
    else run()
  }

  const workOut = (job: JobId | 'auto' = 'auto'): void => {
    setJobs(false)
    if (mode === 'BASE-N') return
    const latex = useCalc.getState().input
    if (!fieldHasText(latex)) {
      const def = job === 'auto' ? null : jobById(job)
      if (def) {
        // An empty field and a chosen job: show what that job does, on its own example.
        useCalc.setState({ input: def.exampleLatex })
        invite.current = true
        usePure.getState().run(def.id, def.example, def.exampleLatex)
        return
      }
      setResult({ main: '', src: '', error: { sentence: 'Type something first.' } })
      return
    }
    invite.current = true
    // The store converts the LaTeX itself, so a converter refusal reaches the student as a sentence.
    usePure.getState().runLatex(latex, job)
  }

  const insertTex = (tex: string): void => {
    if (mode === 'BASE-N') {
      const el = baseRef.current
      const cur = useCalc.getState().input
      const pos = el?.selectionStart ?? cur.length
      const next = cur.slice(0, pos) + tex + cur.slice(pos)
      useCalc.setState({ input: next })
      setTimeout(() => {
        el?.focus()
        el?.setSelectionRange(pos + tex.length, pos + tex.length)
      }, 0)
      return
    }
    mathRef.current?.insert(tex)
  }

  const press = (k: KeyDef): void => {
    const s = useCalc.getState()
    if (k.act) {
      const act = k.act
      if (act.startsWith('mode:')) return useCalc.setState({ mode: act.slice(5) as CalcMode })
      switch (act) {
        case 'left':
          return mathRef.current?.nextBox(-1)
        case 'right':
          // With empty boxes left, ▶ jumps to the next box to fill.
          return mathRef.current?.nextBox(1)
        case 'del':
          if (mode === 'BASE-N') return useCalc.setState({ input: s.input.slice(0, -1) })
          return mathRef.current?.command('deleteBackward')
        case 'clear':
          setResult(null)
          setWithValues(null)
          mathRef.current?.setLatex('')
          return useCalc.setState({ input: '' })
        case 'eq':
          return evaluate()
        case 'solve':
          if (!linearOrEmpty().includes('=')) insertTex('=')
          else evaluate()
          return
        case 'calc': {
          const used = lettersIn(linearOrEmpty())
          if (used.length) setWithValues(used)
          else evaluate()
          return
        }
      }
    }
    if (k.tex) insertTex(k.texDeg && angleUnit === 'deg' ? k.texDeg : k.tex)
  }

  // The keypad and toolbar callbacks read the latest handlers through this ref, so the keys —
  // memoised, sixty of them — are never re-rendered by a change of answer or angle unit.
  const actions = useRef<Actions>({ press })
  actions.current = { press }
  const onKey = useCallback((k: KeyDef) => actions.current.press(k), [])
  const closeKeypad = useCallback(() => setKeypad(false), [])

  /** Draws the line in the viewport; true when something was drawn. */
  const draw = (input: string): boolean => {
    const s = useCalc.getState()
    const ddx = input.match(/^ddx\((.*)\)$/)
    if (ddx) {
      const [f, a] = args(ddx[1])
      const x0 = Number(math.evaluate(casioToMath(a), { ...constantScope(), ...s.vars }))
      const fx = Number(math.evaluate(casioToMath(f), { ...constantScope(), ...s.vars, x: x0 }))
      const slope = Number(evaluateComp(input, { vars: s.vars, ans: s.ans, angle: 'rad' }).value)
      visualizeTangent(casioToMath(f), x0, fx, slope)
      return true
    }
    const integ = input.match(/^integral\((.*)\)$/)
    if (integ) {
      const [f, a, b] = args(integ[1])
      const lo = Number(math.evaluate(casioToMath(a), { ...constantScope(), ...s.vars }))
      const hi = Number(math.evaluate(casioToMath(b), { ...constantScope(), ...s.vars }))
      visualizeArea(casioToMath(f), lo, hi, `∫ ${f} dx from ${a} to ${b}`)
      return true
    }
    const pol = input.match(/^(Pol|Rec)\((.*)\)$/i)
    if (pol) {
      const [p, q] = args(pol[2]).map((t) => Number(math.evaluate(casioToMath(t), { ...constantScope(), ...s.vars })))
      const rad = angleUnit === 'deg' ? (q * Math.PI) / 180 : q
      visualizeVector(pol[1].toLowerCase() === 'pol' ? [p, q, 0] : [p * Math.cos(rad), p * Math.sin(rad), 0])
      return true
    }
    if (mode === 'CMPLX' && result?.value && typeof result.value === 'object') {
      const c = result.value as { re: number; im: number }
      visualizeVector([c.re, c.im, 0], 'z')
      return true
    }
    if (/=/.test(input) && /x/.test(input)) {
      const [l, r] = input.split('=')
      visualizeGraph(`y = ${l} − (${r})`, [`(${casioToMath(l)}) - (${casioToMath(r)})`], 'explicit')
      return true
    }
    if (/(^|[^a-z])x([^a-z]|$)/.test(input)) {
      visualizeGraph(`y = ${input}`, [casioToMath(input)], 'explicit')
      return true
    }
    const sig = input.match(/^sigma\((.*)\)$/)
    if (sig) {
      const [f, a, b] = args(sig[1])
      const lo = Number(math.evaluate(casioToMath(a)))
      const hi = Math.min(Number(math.evaluate(casioToMath(b))), lo + 60)
      const bld = new Builder()
      bld.graph({ kind: 'explicit', source: `y = ${f}`, exprs: [casioToMath(f)] })
      for (let k = lo; k <= hi; k++) {
        const y = Number(math.evaluate(casioToMath(f), { x: k }))
        const top = bld.point([k, y, 0], { auxiliary: true, showLabel: false })
        const baseP = bld.point([k, 0, 0], { auxiliary: true, visible: false })
        bld.segment(baseP.id, top.id, { color: themeColor('--accent'), showLabel: false })
      }
      bld.commit()
      useScene.getState().setViewMode('2d')
      return true
    }
    if (typeof result?.value === 'number') {
      const b = new Builder()
      b.number(String(result.value), { slider: { min: Math.min(0, result.value * 2), max: Math.max(10, result.value * 2), step: 0.01 } })
      b.commit()
      visualizePoint([result.value, 0, 0])
      return true
    }
    return false
  }

  const visualize = (): void => {
    let input: string
    try {
      input = linear().trim()
    } catch (e) {
      setResult({ main: '', src: '', error: { sentence: e instanceof Error ? e.message : String(e) } })
      return
    }
    if (!input || mode === 'BASE-N') return
    try {
      // The viewport is a tab beside this screen in the default layout, so a drawing made
      // without bringing it forward went where the student could not see it.
      if (draw(input)) showPanel('viewport')
    } catch (e) {
      setResult({ main: '', src: input, error: { sentence: 'I cannot draw that one.', detail: String(e) } })
    }
  }

  return (
    <>
      <div className="maths-head" ref={headBox} data-keypad-keep>
        <div className="maths-field">
          <Expression mode={mode} mathRef={mathRef} baseRef={baseRef} onChange={onEdit} onEnter={evaluate} />
          <button
            className={`btn ${keypad ? 'primary' : ''}`}
            data-keypad-toggle
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setKeypad(!keypad)}
            title={keypad ? 'Close the keypad' : 'Open a keypad for √, ∫, π and the rest; typing keeps working'}
          >
            <Keyboard size={14} /> Keypad
          </button>
        </div>
        {keypad && <KeypadPopover mode={mode} anchorRef={headBox} onKey={onKey} onClose={closeKeypad} />}

        <div className="flex flex-wrap items-center gap-1.5">
          <button className="btn primary" onClick={() => evaluate()} title="Work out the answer (Enter does the same)">
            =
          </button>
          <div className="relative flex items-center">
            <button className="btn" onClick={() => workOut()} disabled={mode === 'BASE-N'} title="Show the steps, worked out exactly">
              <Play size={13} /> Work it out
            </button>
            <button className="btn ghost px-1" onClick={() => setJobs(!jobs)} disabled={mode === 'BASE-N'} title="Work it out as a particular kind of question">
              <ChevronDown size={12} />
            </button>
            {jobs && (
              <div className="menu top-full mt-1" onMouseLeave={() => setJobs(false)}>
                {JOBS.map((j) => (
                  <button key={j.id} onClick={() => workOut(j.id)} title={j.about}>
                    <span>{j.label}</span>
                    <span className="sc">{j.example}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn" onClick={visualize} disabled={mode === 'BASE-N'} title="Show this calculation in the viewport (graph, tangent, area, vector…)">
            <Eye size={13} /> Visualize
          </button>
          <div className="seg" title="The angle unit for sin, cos and tan">
            <button className={angleUnit === 'deg' ? 'on' : ''} onClick={() => setSettings({ angleUnit: 'deg' })}>
              DEG
            </button>
            <button className={angleUnit === 'rad' ? 'on' : ''} onClick={() => setSettings({ angleUnit: 'rad' })}>
              RAD
            </button>
          </div>
          {mode === 'BASE-N' && (
            <div className="seg" title="The base the field is typed in">
              {([10, 16, 2, 8] as Base[]).map((b) => (
                <button key={b} className={base === b ? 'on' : ''} onClick={() => setBase(b)}>
                  {b === 10 ? 'Decimal' : b === 16 ? 'Hex' : b === 2 ? 'Binary' : 'Octal'}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <button className={`btn ghost ${showVars ? 'text-[color:var(--text-strong)]' : ''}`} onClick={() => setShowVars(!showVars)} title="The letters you can use in a calculation, and their values">
            Variables
          </button>
          <button className={`btn ghost ${showHistory ? 'text-[color:var(--text-strong)]' : ''}`} onClick={() => setShowHistory(!showHistory)}>
            <History size={13} /> History
          </button>
        </div>

        {result && (
          <Answer result={result} showExact={showExact} onExact={setShowExact} eng={eng} onEng={mode === 'COMP' ? () => setEng(!eng) : undefined} />
        )}

        {withValues && (
          <div className="card p-2">
            <div className="mb-1 text-fine text-[color:var(--text-dim)]">Give each letter a value, then press Calculate</div>
            <WithValuesForm
              vars={withValues}
              initial={useCalc.getState().vars}
              onSubmit={(vals) => {
                useCalc.setState({ vars: { ...useCalc.getState().vars, ...vals } })
                evaluate(vals)
              }}
            />
          </div>
        )}

        {showVars && <VariablesDrawer onInsert={(name) => insertTex(name)} onClose={() => setShowVars(false)} />}
        {showHistory && <HistoryDrawer onClose={() => setShowHistory(false)} />}
      </div>

      <WorkingArea
        invited={() => invite.current}
        settled={() => {
          invite.current = false
        }}
        onTry={() => mathRef.current?.focus()}
      />

      <div className="flex items-center gap-1.5 text-fine text-[color:var(--text-faint)]">
        <Sparkles size={12} /> Type straight from your keyboard: <code className="text-[color:var(--code-text)]">/</code> makes a fraction, <code className="text-[color:var(--code-text)]">^</code> a power,{' '}
        <code className="text-[color:var(--code-text)]">sqrt</code> a root.
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

/**
 * The field itself. This is the one component that follows the store's text, so a keystroke
 * re-renders it and nothing else on the screen.
 */
function Expression({ mode, mathRef, baseRef, onChange, onEnter }: { mode: FieldMode; mathRef: RefObject<MathInputHandle | null>; baseRef: RefObject<HTMLInputElement | null>; onChange: (latex: string) => void; onEnter: () => void }) {
  const input = useCalc((s) => s.input)

  // A constant chosen from the Constants list arrives here, because that list was on screen
  // instead of this field. It goes in at the caret, through MathLive, like any key press.
  useEffect(() => {
    // Taken inside the timer, not before it: React runs this effect twice in development and
    // clears the first timer, and the constant must not be taken by a run that never inserts it.
    const t = setTimeout(() => {
      const queued = useCalc.getState().takePending()
      if (queued) mathRef.current?.insert(queued)
    }, 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount: the field collects what was queued while it was away
  }, [])

  if (mode === 'BASE-N') {
    return (
      <input
        ref={baseRef}
        className="field font-mono text-lead"
        value={input}
        spellCheck={false}
        placeholder="e.g. FF + 1A   or   1010 and 0110"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') onEnter()
        }}
      />
    )
  }
  return <MathInput ref={mathRef} size="lg" value={input} onChange={onChange} onEnter={onEnter} placeholder={mode === 'CMPLX' ? '(3+4i)(1-2i)' : 'type here, or open the keypad'} />
}

// ---------------------------------------------------------------------------

const KeypadPopover = memo(function KeypadPopover({ mode, anchorRef, onKey, onClose }: { mode: FieldMode; anchorRef: RefObject<HTMLElement | null>; onKey: (k: KeyDef) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const groups = useMemo(() => groupsForMode(mode), [mode])
  const numbers = groups.find((g) => g.id === 'numbers')!
  const tabs = groups.filter((g) => g.id !== 'numbers')
  const [tab, setTab] = useState<KeyGroupId>(tabs[0]?.id ?? 'functions')
  const current = tabs.find((g) => g.id === tab) ?? tabs[0]
  const [moreOf, setMoreOf] = useState<string | null>(null)

  const place = useCallback(() => {
    const a = anchorRef.current?.getBoundingClientRect()
    const el = box.current
    if (!a || !el) return
    const next = placeTourCard({ left: a.left, top: a.top, width: a.width, height: a.height }, { w: el.offsetWidth, h: el.offsetHeight }, { w: window.innerWidth, h: window.innerHeight })
    setPos((cur) => (cur && cur.left === next.left && cur.top === next.top ? cur : next))
  }, [anchorRef])
  useLayoutEffect(place, [place, tab, mode])
  useEffect(() => {
    // The popover is fixed while the panel under it scrolls (capture catches the panel's own
    // scroll), and the block it hangs from grows when an answer or a drawer appears.
    window.addEventListener('resize', place)
    document.addEventListener('scroll', place, true)
    const watched = anchorRef.current
    const ro = typeof ResizeObserver !== 'undefined' && watched ? new ResizeObserver(place) : null
    if (watched) ro?.observe(watched)
    return () => {
      window.removeEventListener('resize', place)
      document.removeEventListener('scroll', place, true)
      ro?.disconnect()
    }
  }, [place, anchorRef])

  // Esc, or a press anywhere but the keypad, its own button and the block it hangs from, closes
  // it. A click in the field to move the caret, on =, on DEG/RAD or on a variable's letter
  // keeps it open — a student building an integral clicks into a limit box between key
  // presses. A press on a key never reaches here as "outside", and the field keeps the focus
  // throughout (mousedown is cancelled).
  useEffect(() => {
    const down = (e: PointerEvent): void => {
      const t = e.target as Element | null
      if (box.current?.contains(t) || t?.closest?.('[data-keypad-toggle],[data-keypad-keep]')) return
      onClose()
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  const onMore = useCallback((id: string | null) => setMoreOf((cur) => (cur === id ? null : id)), [])
  const pick = useCallback(
    (k: KeyDef) => {
      setMoreOf(null)
      onKey(k)
    },
    [onKey]
  )

  return createPortal(
    <div ref={box} className="keypad-pop" role="dialog" aria-label="Keypad" style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }} onMouseDown={(e) => e.preventDefault()}>
      <div className="keypad-tabs">
        {tabs.map((g) => (
          <button key={g.id} className={g.id === current?.id ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setTab(g.id)}>
            {g.label}
          </button>
        ))}
        <div className="flex-1" />
        <button className="icon-btn h-6 w-6" onMouseDown={(e) => e.preventDefault()} onClick={onClose} title="Close the keypad (Esc)">
          <X size={12} />
        </button>
      </div>
      <div className="keypad-body">
        <KeyGrid group={numbers} mode={mode} onKey={pick} moreOf={moreOf} onMore={onMore} />
        {current && <KeyGrid group={current} mode={mode} onKey={pick} moreOf={moreOf} onMore={onMore} />}
      </div>
    </div>,
    document.body
  )
})

const KeyGrid = memo(function KeyGrid({ group, mode, onKey, moreOf, onMore }: { group: KeyGroup; mode: FieldMode; onKey: (k: KeyDef) => void; moreOf: string | null; onMore: (id: string | null) => void }) {
  const keys = group.keys.filter((k) => !k.modes || k.modes.includes(mode))
  return (
    <div className={`keys keys-${group.id}`} style={{ gridTemplateColumns: `repeat(${group.cols}, minmax(0, 1fr))` }}>
      {keys.map((k) => (
        <Key key={k.id} k={k} onKey={onKey} moreOpen={moreOf === k.id} onMore={onMore} />
      ))}
    </div>
  )
})

const LONG_PRESS_MS = 450

const Key = memo(function Key({ k, onKey, moreOpen, onMore }: { k: KeyDef; onKey: (k: KeyDef) => void; moreOpen: boolean; onMore: (id: string | null) => void }) {
  const timer = useRef<number | null>(null)
  // A long press opened the relatives; the click that ends it must not also insert the key.
  const held = useRef(false)
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <div className={`key-cell ${k.wide ? 'wide' : ''}`}>
      <button
        className={`key ${k.primary ? 'primary' : ''} ${moreOpen ? 'open' : ''}`}
        title={k.hint}
        onMouseDown={(e) => e.preventDefault()}
        onPointerDown={() => {
          if (!k.more) return
          held.current = false
          clear()
          timer.current = window.setTimeout(() => {
            held.current = true
            onMore(k.id)
          }, LONG_PRESS_MS)
        }}
        onPointerUp={clear}
        onPointerLeave={clear}
        onClick={() => {
          if (held.current) {
            held.current = false
            return
          }
          onKey(k)
        }}
      >
        {k.label}
        {k.more && (
          <span
            className="key-more"
            title={`More: ${k.more.map((m) => m.label).join(', ')}`}
            onClick={(e) => {
              e.stopPropagation()
              onMore(k.id)
            }}
          >
            ▾
          </span>
        )}
      </button>
      {moreOpen && k.more && (
        <div className="key-variants">
          {k.more.map((v) => (
            <button key={v.id} className="key" title={v.hint} onMouseDown={(e) => e.preventDefault()} onClick={() => onKey(v)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

// ---------------------------------------------------------------------------

function Answer({ result, showExact, onExact, eng, onEng }: { result: EvalResult; showExact: boolean; onExact: (v: boolean) => void; eng: boolean; onEng?: () => void }) {
  if (result.error) {
    return (
      <div className="maths-answer is-error">
        <div className="text-lead text-[color:var(--bad)]">{result.error.sentence}</div>
        {result.error.detail && <div className="mt-1 text-fine text-[color:var(--text-faint)]">{result.error.detail}</div>}
      </div>
    )
  }
  const exact = result.exact ?? null
  const exactShown = showExact && !!exact
  // Decided here, not when = was pressed, so the eng chip changes the number at once like the
  // exact/decimal chip beside it does.
  const main = mainLine(result, eng)
  return (
    <div className="maths-answer">
      <div className="maths-result">{exactShown ? <Tex tex={exact} /> : main}</div>
      {exactShown && !/^-?\d+$/.test(exact) && <div className="text-lead text-[color:var(--text-dim)]">≈ {main}</div>}
      {result.extra && (
        <div className="text-small leading-5 text-[color:var(--text-dim)]">
          {result.extra.map((x, i) => (
            <div key={i}>{x}</div>
          ))}
        </div>
      )}
      {(exact || onEng) && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {exact && (
            <div className="seg" title="The answer as a fraction, surd or multiple of π, or as a decimal">
              <button className={showExact ? 'on' : ''} onClick={() => onExact(true)}>
                exact
              </button>
              <button className={!showExact ? 'on' : ''} onClick={() => onExact(false)}>
                decimal
              </button>
            </div>
          )}
          {onEng && (
            <button className={`btn ghost ${eng ? 'text-[color:var(--text-strong)]' : ''}`} onClick={onEng} title="Engineering notation: the power of ten a multiple of three">
              eng
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function WithValuesForm({ vars, initial, onSubmit }: { vars: string[]; initial: Record<string, unknown>; onSubmit: (v: Record<string, number>) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(vars.map((v) => [v, String(initial[v] ?? 0)])))
  return (
    <div className="flex flex-wrap items-center gap-2">
      {vars.map((v) => (
        <label key={v} className="flex items-center gap-1">
          <span className="font-semibold italic text-[color:var(--text)]">{v} =</span>
          <input className="field num w-20" value={vals[v]} onChange={(e) => setVals({ ...vals, [v]: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
        </label>
      ))}
      <button className="btn primary" onClick={() => onSubmit(Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(math.evaluate(casioToMath(v)))])))}>
        Calculate
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

/** The letters a calculation can use, their values, and a way to keep the answer under one. */
function VariablesDrawer({ onInsert, onClose }: { onInsert: (name: string) => void; onClose: () => void }) {
  const vars = useCalc((s) => s.vars)
  const ans = useCalc((s) => s.ans)
  const names = Object.keys(vars)
  const [storeAs, setStoreAs] = useState(names[0] ?? 'A')
  const ansText = typeof ans === 'number' ? calcNum(ans) : String(ans)
  return (
    <div className="card p-2">
      <div className="mb-1 flex items-center gap-2 text-fine text-[color:var(--text-dim)]">
        <span className="flex-1">Variables — click a letter to put it in the field</span>
        <button className="icon-btn h-5 w-5" onClick={onClose} title="Close">
          <X size={12} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-1">
        {names.map((n) => (
          <div key={n} className="flex items-center gap-1">
            <button className="btn ghost w-8 font-semibold italic" onMouseDown={(e) => e.preventDefault()} onClick={() => onInsert(n)} title={`Put ${n} in the field`}>
              {n}
            </button>
            <span className="text-[color:var(--text-faint)]">=</span>
            <VarField name={n} value={vars[n]} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[color:var(--text-dim)]">
        Store the answer {ansText} as
        <select className="field w-auto" value={storeAs} onChange={(e) => setStoreAs(e.target.value)}>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => useCalc.setState({ vars: { ...useCalc.getState().vars, [storeAs]: ans } })}>
          Store
        </button>
      </div>
    </div>
  )
}

function VarField({ name, value }: { name: string; value: unknown }) {
  const shown = typeof value === 'number' ? calcNum(value) : String(value)
  const [text, setText] = useState(shown)
  // The store's value changed from elsewhere (an equation solved for x, an answer stored).
  useEffect(() => setText(shown), [shown])
  const commit = (): void => {
    try {
      const v = Number(math.evaluate(casioToMath(text)))
      if (Number.isFinite(v)) useCalc.setState({ vars: { ...useCalc.getState().vars, [name]: v } })
      else setText(shown)
    } catch {
      setText(shown)
    }
  }
  return (
    <input
      className="field num w-24"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
      }}
    />
  )
}

// ---------------------------------------------------------------------------

const HISTORY_PAGE = 20

function HistoryDrawer({ onClose }: { onClose: () => void }) {
  const calcs = useCalc((s) => s.history)
  const pure = usePure((s) => s.history)
  const recall = usePure((s) => s.recall)
  const remove = usePure((s) => s.remove)
  const clearPure = usePure((s) => s.clearHistory)
  const [shownCalcs, setShownCalcs] = useState(HISTORY_PAGE)
  const [shownPure, setShownPure] = useState(HISTORY_PAGE)
  const pickCalc = (h: HistoryItem): void => useCalc.setState({ input: h.input, mode: h.mode })
  return (
    <div className="card max-h-72 overflow-auto">
      <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-2 py-1.5">
        <History size={13} className="text-[color:var(--text-dim)]" />
        <span className="flex-1 text-[color:var(--text-dim)]">History</span>
        <button className="icon-btn h-5 w-5" onClick={onClose} title="Close the history">
          <X size={12} />
        </button>
      </div>
      <div className="section-title">Calculations</div>
      {calcs.length === 0 && <div className="px-2 pb-2 text-[color:var(--text-faint)]">No calculations yet.</div>}
      {calcs.slice(0, shownCalcs).map((h, i) => (
        <button key={i} className="flex w-full items-center justify-between gap-3 px-2 py-1 text-left hover:bg-[color:var(--sel-row)]" onClick={() => pickCalc(h)} title="Put this back in the field">
          <span className="truncate text-[color:var(--text)]">{h.mode === 'BASE-N' ? h.input : <Tex tex={h.input} />}</span>
          <span className="shrink-0 font-mono text-[color:var(--code-text)]">{h.result}</span>
        </button>
      ))}
      {calcs.length > shownCalcs && (
        <button className="btn ghost mx-2 mb-1" onClick={() => setShownCalcs(shownCalcs + HISTORY_PAGE)}>
          Show {Math.min(HISTORY_PAGE, calcs.length - shownCalcs)} more
        </button>
      )}
      {calcs.length > 0 && (
        <button className="flex w-full items-center gap-1 px-2 py-1 text-left text-[color:var(--text-faint)] hover:text-[color:var(--bad)]" onClick={clearCalcHistory}>
          <Trash2 size={12} /> Clear the calculations
        </button>
      )}
      <div className="section-title">Worked out</div>
      {pure.length === 0 && <div className="px-2 pb-2 text-[color:var(--text-faint)]">Nothing worked out yet.</div>}
      {pure.slice(0, shownPure).map((h: PureEntry) => (
        <div key={h.id} className="pure-hist-row" onClick={() => recall(h.id)} title={`${h.title}: ${h.input}`}>
          <div className="min-w-0 flex-1">
            <span className="text-[color:var(--text-faint)]">{jobById(h.job).label} · </span>
            <span className="text-[color:var(--text)]">{h.latex ? <Tex tex={h.latex} /> : h.input}</span>
            {h.answer && (
              <span className="ml-2 text-[color:var(--text-dim)]">
                <Tex tex={h.answer} />
              </span>
            )}
          </div>
          <button
            className="icon-btn h-5 w-5"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation()
              remove(h.id)
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      {pure.length > shownPure && (
        <button className="btn ghost mx-2 mb-1" onClick={() => setShownPure(shownPure + HISTORY_PAGE)}>
          Show {Math.min(HISTORY_PAGE, pure.length - shownPure)} more
        </button>
      )}
      {pure.length > 0 && (
        <button className="flex w-full items-center gap-1 px-2 py-1 text-left text-[color:var(--text-faint)] hover:text-[color:var(--bad)]" onClick={clearPure}>
          <Trash2 size={12} /> Clear the worked-out list
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** The working under the answer: what "Work it out" produced, with its steps hidden until asked. */
function WorkingArea({ invited, settled, onTry }: { invited: () => boolean; settled: () => void; onTry: () => void }) {
  const working = usePure((s) => s.working)
  const asking = usePure((s) => s.asking)
  const job = usePure((s) => s.job)
  const input = usePure((s) => s.input)
  const inputLatex = usePure((s) => s.inputLatex)
  const run = usePure((s) => s.run)
  const casStatus = useCasStatus((s) => s.status)
  const [pref, setPref] = useState<StepPref>(readStepPref)
  const [showExamples, setShowExamples] = useState(false)
  const setPreference = (p: StepPref): void => {
    setPref(p)
    writeStepPref(p)
  }
  if (!working) {
    return (
      <div className="px-1 py-2 text-[color:var(--text-dim)]">
        <div>
          Press <b className="text-[color:var(--text)]">Work it out</b> to see the steps: every answer there is worked out exactly — in fractions, never in rounded decimals — and checked by putting it back together
          before it is shown. The steps stay hidden until you ask, so you can try first.
        </div>
        <button className="btn ghost mt-2" onClick={() => setShowExamples(!showExamples)}>
          {showExamples ? <ChevronUp size={13} /> : <ChevronDown size={13} />} What can it do?
        </button>
        {showExamples && (
          <ul className="mt-2 space-y-1">
            {JOBS.map((j) => (
              <li key={j.id}>
                <button
                  className="btn ghost"
                  onClick={() => {
                    useCalc.setState({ input: j.exampleLatex })
                    run(j.id, j.example, j.exampleLatex)
                  }}
                >
                  {j.label}
                </button>
                <span className="ml-2 text-[color:var(--text-faint)]">{j.example}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <div className="maths-working">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[color:var(--text-dim)]">
        <label className="flex items-center gap-1">
          Treat as
          <select
            className="field w-auto"
            value={job}
            title="What to do with what you typed: the same line, worked out as a different kind of question"
            onChange={(e) => run(e.target.value as JobId, input, inputLatex)}
          >
            {JOBS.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-[color:var(--text-faint)]">{jobById(job).about}</span>
      </div>
      <WorkingView
        doc={working}
        pref={pref}
        invited={invited}
        settled={settled}
        onPref={setPreference}
        onOffer={(j) => run(j, input, inputLatex)}
        onTry={onTry}
      />
      {asking && (
        <div className="px-3 pb-3 text-[color:var(--text-dim)]">
          Checking that one a different way{casStatus === 'loading' ? ' (starting the algebra engine, this takes a moment the first time)' : ''}…
        </div>
      )}
      {!working.error && graphable(input) && (
        <div className="px-3 pb-3">
          <button
            className="btn ghost"
            title="Draw y = this expression in the viewport, so you can see where the roots are"
            onClick={() => {
              // visualizeGraph wants the expression itself, not "y = …", and an equation is
              // graphed as its left-hand side so the roots land where the curve crosses y = 0.
              visualizeGraph(input, [input.split('=')[0].trim()], 'explicit')
              showPanel('viewport')
            }}
          >
            <Eye size={13} /> Show on the graph
          </button>
        </div>
      )}
    </div>
  )
}
