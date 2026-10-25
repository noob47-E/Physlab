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
import { ChevronDown, ChevronUp, Eye, EyeOff, History, Keyboard, Sparkles, Trash2, X } from 'lucide-react'
import { casInDegrees } from '../calc/angle'
import { CHIP_MODES, MODE_HINTS, MODE_LABELS, MORE_MODES, STORED_LETTERS, clearCalcHistory, isFieldMode, useCalc, type CalcMode, type FieldMode, type HistoryItem } from '../calc/calcStore'
import { openPane, type Panes } from '../calc/drawers'
import { inRadians } from '../calc/formula'
import { reconcile, wantsWorking } from '../calc/working'
import { engineAnswer } from '../calc/engineAnswer'
import { formatValue, keypadToMath, withAngle, type Base } from '../calc/engine'
import { calcNum, setCalcPrecisionSource } from '../calc/format'
import { constantScope } from '../calc/constants'
import { answerStillFor, answerStillUnder, engChanges, equationGraph, evaluateInput, hasPicture, isHeavy, lettersIn, mainLine, readValueBoxes, shownText, tangentAt, varsAfter, type Answered, type EvalResult } from '../calc/evaluateInput'
import { groupsForMode, type KeyDef, type KeyGroupId } from '../calc/keys'
import { math } from '../math/expr'
import { calculusCall } from '../math/calculusCall'
import { latexToMath, tryLatexToMath } from '../math/latexToMath'
import type { StepPref } from '../math/pure/reveal'
import { checkCalculatorGuess } from '../calc/guessCalc'
import type { Check } from '../math/checkAnswer'
import { ask, useEngineStatus } from '../math/engine'
import { casStartingSentence } from '../ui/casStatus'
import { usePure, type PureEntry } from '../math/pure/store'
import { treatAs } from './treatAs'
import { JOBS, jobById } from '../math/pure/run'
import { parseExpr, varsOf } from '../math/pure/mono'
import { useScene } from '../core/store'
import { themeColor } from '../app/theme'
import { placeTourCard } from '../app/layoutMath'
import { hidePanel, showBeside } from '../app/panels'
import { enterMode } from '../app/layout'
import { visualizeArea, visualizeGraph, visualizePoint, visualizeTangent, visualizeVector } from '../core/visualize'
import { Builder } from '../core/factory'
import { Tex } from '../ui/Tex'
import { KeyGrid } from '../ui/Keypad'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { ModePanel } from './calcModes'
import { WorkingView, readStepPref, writeStepPref } from './WorkingView'

// Every number the screen shows follows the precision the student chose in Settings (Rule 4).
// The scene store is read lazily so calc/ never imports it back.
setCalcPrecisionSource(() => useScene.getState().settings)

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
  // A mode the Calculator does not offer (Complex is Numbers' now; the list modes that are away being redesigned) is never shown, however
  // it was reached — a stored history entry, an old shortcut: the student is on Numbers.
  const listed = (CHIP_MODES as readonly CalcMode[]).includes(mode) || (MORE_MODES as readonly CalcMode[]).includes(mode)
  useEffect(() => {
    if (!listed) useCalc.setState({ mode: 'COMP' })
  }, [listed])
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
  const other = (MORE_MODES as readonly CalcMode[]).includes(mode) ? mode : null
  // The field's text is one store value for every mode. Bases types plain text and the others
  // LaTeX, so crossing that line with the text kept showed 1\div3 in the Bases field; the
  // text is cleared on that crossing only (Numbers ↔ Complex keep it, and so does a recall).
  const setMode = (m: CalcMode): void => {
    const crossing = (m === 'BASE-N') !== (mode === 'BASE-N') && isFieldMode(m) && isFieldMode(mode)
    useCalc.setState(crossing ? { mode: m, input: '' } : { mode: m })
  }
  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {CHIP_MODES.map((m) => (
        <button key={m} title={MODE_HINTS[m]} onClick={() => setMode(m)} className={`${CHIP} ${mode === m ? CHIP_ON : CHIP_OFF}`}>
          {MODE_LABELS[m]}
        </button>
      ))}
      <button title="Distributions, equations, inequalities, ratio and constants" onClick={() => setMore(!more)} className={`${CHIP} flex items-center gap-1 ${other ? CHIP_ON : CHIP_OFF}`}>
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
  const [base, setBase] = useState<Base>(10)
  // The answer remembers the mode it was worked out under, the line it answers, and the angle unit and base it was
  // worked out in: a mode switch keeps the field's text (the store holds it) but an answer from the other mode's
  // rules is not shown under this one, and an answer to a line the student has since edited is
  // not shown under the new line either — on one screen it read as the answer to that line.
  // Switching DEG/RAD or the base leaves the text alone too, so sin(30) = 0.5 sat under a RAD screen (it is −0.988
  // there) and FF read as a hex number sat under Decimal (H4). The answer that does not belong to the settings now is
  // dropped while rendering — React's own way for state that follows a setting — so no stale card is ever painted,
  // and going back to the old setting does not bring an old card back.
  const [pref, setPref] = useState<StepPref>(readStepPref)
  const setPreference = (p: StepPref): void => {
    setPref(p)
    writeStepPref(p)
  }

  const [guess, setGuess] = useState<{ input: string; typed: string; check: Check | null; revealed: boolean } | null>(null)
  const [guessMsg, setGuessMsg] = useState<string | null>(null)

  const [answered, setAnswered] = useState<Answered | null>(null)
  const held = answerStillUnder(answered, { angle: angleUnit, base })
  if (held !== answered) setAnswered(held)
  const result = held?.mode === mode ? held.result : null
  /** A fresh answer belongs to what the field holds now. */
  const setResult = (r: EvalResult | null): void => {
    setAnswered(r ? { mode, input: useCalc.getState().input, angle: angleUnit, base, result: r } : null)
    if (!r) {
      setGuess(null)
      setGuessMsg(null)
    }
  }
  // Every keystroke lands here: one store write, and no render of this screen.
  const onEdit = useCallback((latex: string) => useCalc.setState({ input: latex }), [])
  // The answer follows the store's line, not the keystroke: it is dropped on the first change
  // that leaves the line it answered (an unchanged answer is no render), whichever way the line
  // changed. Dropping it in onEdit alone missed every write that bypasses the field — a
  // calculation recalled from History put 7×8 in the field with the answer to 2+3 still under it.
  useEffect(
    () =>
      useCalc.subscribe((s, prev) => {
        if (s.input !== prev.input) setAnswered((a) => answerStillFor(a, s.input))
        if (s.input !== prev.input) {
          setGuess((g) => (g && g.input === s.input ? g : null))
          setGuessMsg(null)
        }
      }),
    []
  )
  const [showExact, setShowExact] = useState(true)
  const [eng, setEng] = useState(false)
  const [asked, setAsked] = useState<{ mode: FieldMode; letters: string[] } | null>(null)
  // The keypad and the two drawers under the field: opening one never leaves another covered (calc/drawers.ts).
  const [panes, setPanes] = useState<Panes>({ keypad: false, vars: false, history: false })
  const { keypad, vars: showVars, history: showHistory } = panes
  // The working folded under the answer: closed until the student asks for it, open at once when the working was asked for from
  // somewhere else (the command bar's Show the working, a recalled entry, an offer, the tour).
  const [foldOpen, setFoldOpen] = useState(false)
  const [external, setExternal] = useState(false)
  // True while a press of = is asking the step engine for the line's working, so the working that arrives is not mistaken for one the
  // student asked for elsewhere. The store tells its listeners inside the call, so it is set and put back around the call.
  const ownRun = useRef(false)
  const answeredRef = useRef<Answered | null>(null)
  answeredRef.current = answered
  const evaluateRef = useRef<(o: { steps: boolean }) => void>(() => undefined)
  // A working that arrives takes the screen: the field now holds its line (calcStore follows the pure store), and the with-values form
  // belonged to the line before. The answer card stays while it answers the very line the working is for. One asked for from elsewhere
  // opens the fold, gets its answer card if the line has none, and closes the keypad, which hangs over exactly where the steps appear.
  useEffect(
    () =>
      usePure.subscribe((s, prev) => {
        if (s.runSeq === prev.runSeq) return
        setAnswered((a) => answerStillFor(a, s.inputLatex))
        setAsked(null)
        if (ownRun.current) return
        setPanes((p) => (p.keypad ? { ...p, keypad: false } : p))
        setFoldOpen(true)
        setExternal(true)
        evaluateRef.current({ steps: false })
      }),
    []
  )
  const withValues = asked?.mode === mode ? asked.letters : null
  const setWithValues = (letters: string[] | null): void => setAsked(letters ? { mode, letters } : null)

  // The working for the line the card answers, and the card the screen shows: "=" and the working never disagree, and when they do
  // neither is shown as final (calc/working.ts). The disagreement goes to the log once.
  const working = usePure((s) => s.working)
  const pureLatex = usePure((s) => s.inputLatex)
  const forCard = held && result && working && pureLatex === held.input ? working : null
  const shown = useMemo(() => (result ? reconcile(result, forCard) : null), [result, forCard])
  useEffect(() => {
    if (shown?.line) console.warn(shown.line)
  }, [shown?.line])
  // The fold belongs to the card: a working for another line (the field has moved on) is not offered.
  const foldAvailable = !!forCard
  const activeGuess = guess && guess.input === (held?.input ?? '') ? guess : null
  const isGuessPending = pref === 'guess' && !!shown && !shown.result.error && (!activeGuess || !activeGuess.revealed)

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

  const evaluate = (varsOverride?: Record<string, unknown>, o: { steps?: boolean } = {}): void => {
    const s = useCalc.getState()
    // A working asked for elsewhere comes with the answer card for its line, unless the line has one already.
    if (o.steps === false && answeredRef.current?.input === s.input) return
    const opts = { vars: { ...s.vars, ...varsOverride }, ans: s.ans, angle: angleUnit, base }
    const run = (): void => {
      const r = evaluateInput(mode, s.input, opts)
      if (!r) return
      setAnswered({ mode, input: s.input, angle: angleUnit, base, result: r })
      if (pref === 'guess' && !r.error) {
        setGuess({ input: s.input, typed: '', check: null, revealed: false })
        setGuessMsg(null)
      } else {
        setGuess(null)
        setGuessMsg(null)
      }
      // = is the one button: the step engine works the same line out underneath, folded, where it has a working to show. It is asked
      // quietly (no second opinion from the algebra engine for a line the step engine refused) and without moving the keyboard.
      if (o.steps !== false && mode !== 'BASE-N' && wantsWorking(r.src)) {
        setFoldOpen(false)
        setExternal(false)
        ownRun.current = true
        try {
          usePure.getState().runLatex(s.input, 'auto', { quiet: true })
        } finally {
          ownRun.current = false
        }
      }
      if (r.error) return
      if (r.engine) {
        // The algebra engine answers this line a moment later (seconds on its first start), and the card says so until
        // it does. The answer lands only while this very card is still the one held: a newer line, or another mode or
        // setting, has replaced it otherwise. History keeps the line once it has an answer.
        void engineAnswer(r.engine).then((res) => {
          const next: EvalResult = res.ok ? { ...r, engine: undefined, main: res.main, tex: res.tex } : { ...r, engine: undefined, main: '', error: { sentence: res.error } }
          setAnswered((a) => (a && a.mode === mode && a.input === s.input && a.result === r ? { ...a, result: next } : a))
          if (res.ok) useCalc.setState((c) => ({ history: [{ input: s.input, result: res.main, mode }, ...c.history].slice(0, 100) }))
        })
        return
      }
      useCalc.setState({
        // "No real solution. In complex numbers: …" is an answer with no number in it: Ans stays the
        // last number, where an undefined Ans would read as 0 in the next line.
        ans: r.value === undefined ? s.ans : r.value,
        vars: varsAfter(s.vars, r),
        history: [{ input: s.input, result: r.main, mode }, ...s.history].slice(0, 100)
      })
      if (r.askExact) {
        ask('exact', { expr: keypadToMath(r.src), deg: casInDegrees(angleUnit) }).then((res) => {
          if (!res.error && res.latex && !/\./.test(res.text) && res.text.length < 60) {
            // The exact form amends the answer it was asked for, and only while that answer is
            // still the one held. The algebra engine can take seconds on a cold start, and an answer worked
            // out in another mode meanwhile must stay: an amendment to an answer no longer held
            // used to clear whatever had replaced it.
            setAnswered((a) => (a && a.mode === mode && a.input === s.input && a.result.value === r.value ? { ...a, result: { ...a.result, exact: res.latex } } : a))
          }
        })
      }
    }
    // An integral or a sum can take a moment; letting the key press paint first is what makes
    // the screen feel quick rather than stuck.
    if (isHeavy(s.input)) setTimeout(run, 0)
    else run()
  }

  evaluateRef.current = (o) => evaluate(undefined, o)

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
          setGuess(null)
          setGuessMsg(null)
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

  const checkGuess = (guessText: string): void => {
    if (!shown) return
    const settings = useScene.getState().settings
    const chk = checkCalculatorGuess(guessText, shown.result, settings)
    if (chk.verdict === 'empty' || chk.verdict === 'unreadable') {
      setGuessMsg(chk.message || 'Type a guess first, or click "Show me" to reveal the answer.')
      return
    }
    setGuessMsg(null)
    setGuess({
      input: useCalc.getState().input,
      typed: guessText,
      check: chk,
      revealed: true
    })
  }

  const showAnswer = (): void => {
    setGuessMsg(null)
    setGuess({
      input: useCalc.getState().input,
      typed: '',
      check: null,
      revealed: true
    })
  }

  // The keypad and toolbar callbacks read the latest handlers through this ref, so the keys —
  // memoised, sixty of them — are never re-rendered by a change of answer or angle unit.
  const actions = useRef<Actions>({ press })
  actions.current = { press }
  const onKey = useCallback((k: KeyDef) => actions.current.press(k), [])
  const closeKeypad = useCallback(() => setPanes((p) => ({ ...p, keypad: false })), [])

  /** Draws the line in the viewport; true when something was drawn. Its numbers are read in the screen's unit (see draw). */
  const drawLine = (input: string): boolean => {
    const s = useCalc.getState()
    const ddx = input.match(/^ddx\((.*)\)$/)
    if (ddx) {
      // The point, the height and the slope all come from the engine the answer card uses, in the screen's unit, so the
      // tangent drawn has the slope the card shows: d/dx(sin(x), 30) in degrees drew cos(30 rad) = 0.154 under a card
      // that said 0.01511, because the slope was worked out in radians and the height in whatever mode the maths held (H3).
      const t = tangentAt(input, { vars: s.vars, ans: s.ans, angle: angleUnit })
      // The curve is drawn in radians whatever the screen's unit, as the tangent's height and slope were worked out: calculus is in radians.
      visualizeTangent(inRadians(keypadToMath(t.f), angleUnit), t.x0, t.fx, t.slope, false, keypadToMath(t.f))
      return true
    }
    const integ = input.match(/^integral\((.*)\)$/)
    if (integ) {
      const [f, a, b] = args(integ[1])
      const lo = Number(math.evaluate(keypadToMath(a), { ...constantScope(), ...s.vars }))
      const hi = Number(math.evaluate(keypadToMath(b), { ...constantScope(), ...s.vars }))
      visualizeArea(inRadians(keypadToMath(f), angleUnit), lo, hi, `∫ ${f} dx from ${a} to ${b}`, keypadToMath(f))
      return true
    }
    // d/dx(f) in x has a function for its answer, and the picture is that function's graph (the line itself, diff(f, x), is
    // not something the grapher can plot).
    const dif = calculusCall(input)
    if (dif?.name === 'diff' && (dif.args[1] ?? 'x') === 'x' && result?.formula) {
      visualizeGraph(`y = ${result.formula}`, [inRadians(result.formula, angleUnit)], 'explicit', { reuse: true })
      return true
    }
    const pol = input.match(/^(Pol|Rec)\((.*)\)$/i)
    if (pol) {
      const [p, q] = args(pol[2]).map((t) => Number(math.evaluate(keypadToMath(t), { ...constantScope(), ...s.vars })))
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
      const g = equationGraph(l, r)
      // reuse: Visualize again on the same line shows the graph already drawn rather than a second copy.
      visualizeGraph(g.label, [g.expr], 'explicit', { reuse: true })
      return true
    }
    if (/(^|[^a-z])x([^a-z]|$)/.test(input)) {
      visualizeGraph(`y = ${input}`, [keypadToMath(input)], 'explicit', { reuse: true })
      return true
    }
    const sig = input.match(/^sigma\((.*)\)$/)
    if (sig) {
      const [f, a, b] = args(sig[1])
      const lo = Number(math.evaluate(keypadToMath(a)))
      const hi = Math.min(Number(math.evaluate(keypadToMath(b))), lo + 60)
      const bld = new Builder()
      bld.graph({ kind: 'explicit', source: `y = ${f}`, exprs: [keypadToMath(f)] })
      for (let k = lo; k <= hi; k++) {
        const y = Number(math.evaluate(keypadToMath(f), { x: k }))
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

  // Every bare evaluation inside drawLine (a limit, a point, a sum's terms, a vector's angle) reads sin and atan in the
  // screen's unit and leaves the mode that was held as it was, whatever an earlier line set (H3).
  const draw = (input: string): boolean => withAngle(angleUnit, () => drawLine(input))
  // Set once Visualize has drawn something: then Open in Graphing has a picture to open.
  const [drew, setDrew] = useState(false)
  // The answered line has something to draw (calc/evaluateInput hasPicture): Visualize, and Open in Graphing after it, are offered only then.
  const picture = !!result && hasPicture(linearOrEmpty(), mode, result)

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
      // The drawing opens beside this screen, so the picture and the working are seen together.
      if (draw(input)) {
        showBeside('viewport', 'maths')
        setDrew(true)
      }
    } catch (e) {
      // The message alone: String(e) put "Error: " in front of the tangent's own sentence ("There is no tangent there…").
      setResult({ main: '', src: input, error: { sentence: 'I cannot draw that one.', detail: e instanceof Error ? e.message : String(e) } })
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
            onClick={() => setPanes(keypad ? { ...panes, keypad: false } : openPane(panes, 'keypad'))}
            title={keypad ? 'Close the keypad' : 'Open a keypad for √, ∫, π and the rest; typing keeps working'}
          >
            <Keyboard size={14} /> Keypad
          </button>
        </div>
        {keypad && <KeypadPopover mode={mode} anchorRef={headBox} onKey={onKey} onClose={closeKeypad} />}

        <div className="flex flex-wrap items-center gap-1.5">
          <button className="btn primary" data-tour="equals" onClick={() => evaluate()} title="Work out the answer, with its working under it (Enter does the same)">
            =
          </button>
          {/* Only once the line is answered, and only when it has a picture (calc/evaluateInput hasPicture): a plain number has none. */}
          {picture && (
            <button className="btn" onClick={visualize} title="Show this calculation in the viewport (graph, tangent, area, vector…)">
              <Eye size={13} /> Visualize
            </button>
          )}
          {/* Beside its Visualize only: under 2 + 3 = 5 it still offered the picture of the line before. */}
          {drew && picture && (
            <button className="btn" onClick={() => enterMode('graphing')} title="Open this picture in Graphing, with its list of expressions">
              Open in Graphing
            </button>
          )}
          {drew && (
            <button
              className="btn"
              onClick={() => {
                hidePanel('viewport')
                setDrew(false)
              }}
              title="Close the viewport and show Maths full-screen"
            >
              <EyeOff size={13} /> Hide drawing
            </button>
          )}
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
          <button
            className={`btn ghost ${showVars ? 'text-[color:var(--text-strong)]' : ''}`}
            onClick={() => setPanes(showVars ? { ...panes, vars: false } : openPane(panes, 'vars'))}
            title="The letters you can use in a calculation, and their values"
          >
            Variables
          </button>
          <button className={`btn ghost ${showHistory ? 'text-[color:var(--text-strong)]' : ''}`} onClick={() => setPanes(showHistory ? { ...panes, history: false } : openPane(panes, 'history'))}>
            <History size={13} /> History
          </button>
        </div>

        {isGuessPending && shown && (
          <GuessPromptCard
            pref={pref}
            onPref={setPreference}
            onCheck={checkGuess}
            onShow={showAnswer}
            errorMsg={guessMsg}
          />
        )}

        {!isGuessPending && shown && (
          <>
            {activeGuess?.revealed && activeGuess.check && (
              <GuessVerdictBadge check={activeGuess.check} typed={activeGuess.typed} />
            )}
            <Answer result={shown.result} showExact={showExact} onExact={setShowExact} eng={eng} onEng={mode === 'COMP' ? () => setEng(!eng) : undefined} />
          </>
        )}

        {/* The working, folded under its answer: one control, closed until the student asks. */}
        {!isGuessPending && foldAvailable && (!working?.error || external) && (
          <button
            className="btn ghost self-start"
            aria-expanded={foldOpen}
            title={foldOpen ? 'Fold the working away' : 'The steps, worked out exactly and checked'}
            onClick={() => {
              if (!foldOpen) setPanes((p) => (p.keypad ? { ...p, keypad: false } : p))
              setFoldOpen(!foldOpen)
            }}
          >
            {foldOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {foldOpen ? 'Hide the working' : 'Show the working'}
          </button>
        )}

        {withValues && (
          <div className="card p-2">
            <div className="mb-1 text-fine text-[color:var(--text-dim)]">Give each letter a value, then press Calculate</div>
            <WithValuesForm
              // A different set of letters is a new question: a form kept from the old one would still read, and name
              // in its sentence, boxes that are no longer on the screen, and would show no box value for the new letter.
              key={withValues.join(',')}
              vars={withValues}
              initial={useCalc.getState().vars}
              angleUnit={angleUnit}
              onSubmit={(vals) => {
                useCalc.setState({ vars: { ...useCalc.getState().vars, ...vals } })
                evaluate(vals)
              }}
            />
          </div>
        )}

        {showVars && <VariablesDrawer onInsert={(name) => insertTex(name)} onClose={() => setPanes((p) => ({ ...p, vars: false }))} />}
        {showHistory && <HistoryDrawer onClose={() => setPanes((p) => ({ ...p, history: false }))} />}
      </div>

      {!isGuessPending && foldAvailable && foldOpen && <WorkingBody pref={pref} onPref={setPreference} onTry={() => mathRef.current?.focus()} />}
      {!shown && !(foldAvailable && foldOpen) && <Intro pref={pref} onPref={setPreference} />}

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
        <button className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={onClose} title="Close the keypad (Esc)">
          <X size={12} /> Close
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
  // A formula (d/dx(x³ sin x), x² − 1 while x has no value) is typeset as it is: it has no decimal to put beside it.
  const formula = result.tex ?? null
  const exact = formula ? null : (result.exact ?? null)
  const exactShown = showExact && !!exact
  // Decided here, not when = was pressed, so the eng chip changes the number at once like the
  // exact/decimal chip beside it does.
  const main = mainLine(result, eng)
  // The eng chip changes how a number is written; a formula has none, and it is offered only where it would rewrite this one (engChanges).
  const showEng = onEng && !formula && engChanges(result)
  return (
    <div className={`maths-answer${result.unconfirmed ? ' is-warn' : ''}`}>
      <div className="maths-result">{formula ? <Tex tex={formula} /> : exactShown ? <Tex tex={exact} /> : main}</div>
      {exactShown && !/^-?\d+$/.test(exact) && <div className="text-lead text-[color:var(--text-dim)]">≈ {main}</div>}
      {result.extra && (
        <div className="text-small leading-5 text-[color:var(--text-dim)]">
          {result.extra.map((x, i) => (
            <div key={i}>{shownText(x)}</div>
          ))}
        </div>
      )}
      {result.complex && (
        <div className="text-small leading-5 text-[color:var(--text-dim)]">
          <div>{shownText(`size ${result.complex.size}, angle ${result.complex.angle}`)}</div>
          <div>{shownText(`conjugate ${result.complex.conjugate}`)}</div>
          <div>{shownText(`polar form ${result.complex.polar}`)}</div>
        </div>
      )}
      {(exact || showEng) && (
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
          {showEng && (
            <button className={`btn ghost ${eng ? 'text-[color:var(--text-strong)]' : ''}`} onClick={onEng} title="Engineering notation: the power of ten a multiple of three">
              eng
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function WithValuesForm({ vars, initial, angleUnit, onSubmit }: { vars: string[]; initial: Record<string, unknown>; angleUnit: 'deg' | 'rad'; onSubmit: (v: Record<string, number>) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(vars.map((v) => [v, String(initial[v] ?? 0)])))
  // The boxes the last press could not read, and the sentence that names them (H5). A box with letters or half a sum
  // used to throw out of the click handler and Calculate did nothing at all; an empty box, 1 ÷ 0 or an i went into the
  // stored letters as NaN or ∞. The boxes keep what the student typed; the next keystroke in any box clears the sentence.
  const [unread, setUnread] = useState<{ letters: string[]; sentence: string } | null>(null)
  const calculate = (): void => {
    const read = readValueBoxes(vals, angleUnit)
    if (!read.ok) return setUnread(read)
    setUnread(null)
    onSubmit(read.values)
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {vars.map((v) => (
        <label key={v} className="flex items-center gap-1">
          <span className="font-semibold italic text-[color:var(--text)]">{v} =</span>
          <input
            className="field num w-20"
            value={vals[v]}
            aria-invalid={unread?.letters.includes(v) ? true : undefined}
            onChange={(e) => {
              setVals({ ...vals, [v]: e.target.value })
              setUnread(null)
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      ))}
      <button className="btn primary" onClick={calculate}>
        Calculate
      </button>
      {unread && (
        <div role="alert" className="basis-full text-fine text-[color:var(--bad)]">
          {unread.sentence}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function GuessPromptCard({
  pref,
  onPref,
  onCheck,
  onShow,
  errorMsg
}: {
  pref: StepPref
  onPref: (p: StepPref) => void
  onCheck: (guess: string) => void
  onShow: () => void
  errorMsg: string | null
}) {
  const [typed, setTyped] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (): void => {
    const trimmed = typed.trim()
    if (!trimmed) {
      setLocalErr('Type a guess first, or click "Show me" to reveal the answer.')
      return
    }
    setLocalErr(null)
    onCheck(trimmed)
  }

  const err = errorMsg ?? localErr

  return (
    <div className="maths-answer flex flex-col gap-2.5" data-testid="guess-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--line)] pb-1.5 text-fine text-[color:var(--text-dim)]">
        <span className="font-semibold text-[color:var(--text-strong)]">Guess first</span>
        <div className="seg" title="Choose how steps and answers appear">
          <button className={pref === 'try' ? 'on' : ''} onClick={() => onPref('try')} title="Steps stay hidden so you can try first">
            Let me try first
          </button>
          <button className={pref === 'all' ? 'on' : ''} onClick={() => onPref('all')} title="Always show all steps">
            Always show all steps
          </button>
          <button className={pref === 'guess' ? 'on' : ''} onClick={() => onPref('guess')} title="Answer stays hidden until you type a guess">
            Guess first
          </button>
        </div>
      </div>

      <div className="text-small text-[color:var(--text-dim)]">
        What do you think the answer will be? Type a guess before revealing:
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          className="field flex-1 font-mono text-lead"
          placeholder="e.g. 14, 3/4, or x^2 - 1"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value)
            if (localErr) setLocalErr(null)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
            else if (e.key === 'Escape') onShow()
          }}
        />
        <button className="btn primary" onClick={submit} title="Check your guess against the calculated answer">
          Check my guess
        </button>
        <button className="btn ghost" onClick={onShow} title="Reveal the answer without guessing (Esc)">
          Show me
        </button>
      </div>

      {err && (
        <div role="alert" className="text-fine text-[color:var(--bad)]">
          {err}
        </div>
      )}
    </div>
  )
}

function GuessVerdictBadge({ check, typed }: { check: Check; typed: string }) {
  if (check.verdict === 'right') {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-[color:color-mix(in_srgb,var(--good)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--good)_15%,transparent)] px-3 py-2 text-small text-[color:var(--good)]">
        <span className="font-bold">✓ Right!</span>
        <span>
          You guessed <strong className="font-mono text-[color:var(--text-strong)]">{typed}</strong>.
        </span>
      </div>
    )
  }
  if (check.verdict === 'close') {
    return (
      <div className="mb-2 flex flex-col gap-1 rounded-lg border border-[color:color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--warn)_15%,transparent)] px-3 py-2 text-small text-[color:var(--warn)]">
        <div className="flex items-center gap-2">
          <span className="font-bold">≈ Close!</span>
          <span>
            You guessed <strong className="font-mono text-[color:var(--text-strong)]">{typed}</strong>.
          </span>
        </div>
        {check.message && <div className="text-fine text-[color:var(--text-dim)]">{check.message}</div>}
      </div>
    )
  }
  if (check.verdict === 'wrong') {
    const detail = check.message?.replace(/^(?:Not quite\.?\s*)+/i, '').trim()
    return (
      <div className="mb-2 flex flex-col gap-1 rounded-lg border border-[color:color-mix(in_srgb,var(--bad)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--bad)_15%,transparent)] px-3 py-2 text-small text-[color:var(--bad)]">
        <div className="flex items-center gap-2">
          <span className="font-bold">✗ Not quite.</span>
          <span>
            You guessed <strong className="font-mono text-[color:var(--text-strong)]">{typed}</strong>.
          </span>
        </div>
        {detail && <div className="text-fine text-[color:var(--text-dim)]">{detail}</div>}
      </div>
    )
  }
  return null
}

// ---------------------------------------------------------------------------

/** The letters a calculation can use, their values, and a way to keep the answer under one. */
function VariablesDrawer({ onInsert, onClose }: { onInsert: (name: string) => void; onClose: () => void }) {
  const vars = useCalc((s) => s.vars)
  const ans = useCalc((s) => s.ans)
  // Every letter is offered; a letter with a value is in `vars`, and one without is not 0 — it reads as itself (x stays x)
  // or, after a number, as a unit (C is the coulomb).
  const names = STORED_LETTERS
  const [storeAs, setStoreAs] = useState<string>(names[0])
  const ansText = typeof ans === 'number' ? calcNum(ans) : formatValue(ans)
  return (
    <div className="card p-2">
      <div className="mb-1 flex items-center gap-2 text-fine text-[color:var(--text-dim)]">
        <span className="flex-1">Variables — click a letter to put it in the field. An empty box means no value yet.</span>
        <button className="icon-btn h-5 w-5" onClick={onClose} title="Close">
          <X size={12} />
        </button>
      </div>
      <div className="mb-1 text-fine text-[color:var(--text-faint)]">
        A letter with no value stays itself (x stays x), and after a number C, A and F are the coulomb, ampere and farad. Give one a value and it is that value.
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
  const shown = value === undefined ? '' : typeof value === 'number' ? calcNum(value) : String(value)
  const [text, setText] = useState(shown)
  // The store's value changed from elsewhere (an x = 5 typed in the field, an answer stored).
  useEffect(() => setText(shown), [shown])
  const angleUnit = useScene((s) => s.settings.angleUnit)
  // Read as a "with values" box is, in the screen's angle unit: sin(30) typed here was worked out in whatever mode
  // the maths last held (H17). A box it cannot read goes back to the value it had.
  const commit = (): void => {
    // An emptied box takes the letter's value away: it is a letter with none again.
    if (!text.trim()) {
      if (name in useCalc.getState().vars) {
        const rest = { ...useCalc.getState().vars }
        delete rest[name]
        useCalc.setState({ vars: rest })
      }
      return
    }
    const read = readValueBoxes({ [name]: text }, angleUnit)
    if (read.ok) useCalc.setState({ vars: { ...useCalc.getState().vars, [name]: read.values[name] } })
    else setText(shown)
  }
  return (
    <input
      className="field num w-24"
      value={text}
      placeholder="no value"
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
  const pickCalc = (h: HistoryItem): void => useCalc.setState({ input: h.input, mode: h.mode === 'CMPLX' ? 'COMP' : h.mode })
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
          <span className="shrink-0 font-mono text-[color:var(--code-text)]">{shownText(h.result)}</span>
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

/** What the screen says before there is an answer: how to ask, and what it can work out. */
function Intro({ pref, onPref }: { pref?: StepPref; onPref?: (p: StepPref) => void }) {
  const run = usePure((s) => s.run)
  const [showExamples, setShowExamples] = useState(false)
  return (
    <div className="px-1 py-2 text-[color:var(--text-dim)]">
      <div>
        Type a line and press <b className="text-[color:var(--text)]">=</b> for the answer. Where there is working to show, <b className="text-[color:var(--text)]">Show the working</b> opens under it: every answer
        there is worked out exactly — in fractions, never in rounded decimals — and checked by putting it back together before it is shown. The steps stay hidden until you ask, so you can try first.
      </div>
      {onPref && pref && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-fine text-[color:var(--text-dim)]">Steps &amp; answers:</span>
          <div className="seg" title="Choose how steps and answers appear">
            <button className={pref === 'try' ? 'on' : ''} onClick={() => onPref('try')} title="Steps stay hidden so you can try first">
              Let me try first
            </button>
            <button className={pref === 'all' ? 'on' : ''} onClick={() => onPref('all')} title="Always show all steps">
              Always show all steps
            </button>
            <button className={pref === 'guess' ? 'on' : ''} onClick={() => onPref('guess')} title="Answer stays hidden until you type a guess">
              Guess first
            </button>
          </div>
        </div>
      )}
      <button className="btn ghost mt-2" onClick={() => setShowExamples(!showExamples)}>
        {showExamples ? <ChevronUp size={13} /> : <ChevronDown size={13} />} What can it do?
      </button>
      {showExamples && (
        <ul className="mt-2 space-y-1">
          {JOBS.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center gap-2">
              <button
                className="btn ghost"
                onClick={() => {
                  useCalc.setState({ input: j.exampleLatex })
                  run(j.id, j.example, j.exampleLatex)
                }}
              >
                {j.label}
              </button>
              <Tex tex={j.exampleLatex} className="text-[color:var(--text-faint)]" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The working itself, as the step engine made it: the fold's body. The step cards, rule badges, the second-way check and "Let me try first" are WorkingView's. */
function WorkingBody({ onTry, pref: outerPref, onPref: outerOnPref }: { onTry: () => void; pref?: StepPref; onPref?: (p: StepPref) => void }) {
  const working = usePure((s) => s.working)
  const asking = usePure((s) => s.asking)
  const input = usePure((s) => s.input)
  // The first-load stage, as a sentence (empty once the engine is ready): P17.
  const casNote = useEngineStatus((s) => (s.status === 'loading' ? casStartingSentence(s.stage) : ''))
  const [localPref, setLocalPref] = useState<StepPref>(readStepPref)
  const pref = outerPref ?? localPref
  const setPreference = (p: StepPref): void => {
    if (outerOnPref) outerOnPref(p)
    else {
      setLocalPref(p)
      writeStepPref(p)
    }
  }
  if (!working) return null
  return (
    <div className="maths-working">
      <WorkingView
        doc={working}
        pref={pref}
        invited={() => false}
        settled={() => undefined}
        onPref={setPreference}
        onOffer={(j) => treatAs(j)}
        onTry={onTry}
      />
      {asking && (
        <div className="px-3 pb-3 text-[color:var(--text-dim)]">
          {casNote ? `Checking that one a different way. ${casNote}` : 'Checking that one a different way…'}
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
              visualizeGraph(input, [input.split('=')[0].trim()], 'explicit', { reuse: true })
              showBeside('viewport', 'maths')
            }}
          >
            <Eye size={13} /> Show on the graph
          </button>
        </div>
      )}
    </div>
  )
}
