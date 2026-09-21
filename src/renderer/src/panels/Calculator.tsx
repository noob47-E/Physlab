import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Eye, History, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { casInDegrees } from '../calc/angle'
import { clearCalcHistory, useCalc, type CalcMode } from '../calc/calcStore'
import { casioToMath, evaluateBaseN, evaluateComp, exactForm, formatBase, formatValue, type Base } from '../calc/engine'
import { calcEng, calcNum, setCalcPrecisionSource } from '../calc/format'
import { constantScope } from '../calc/constants'
import { math, setAngleMode } from '../math/expr'
import { latexToMath, tryLatexToMath } from '../math/latexToMath'
import { fieldHasText } from '../math/pure/reveal'
import { cas, warmupCas } from '../math/cas'
import { useScene } from '../core/store'
import { themeColor } from '../app/theme'
import { visualizeArea, visualizeGraph, visualizePoint, visualizeTangent, visualizeVector } from '../core/visualize'
import { Builder } from '../core/factory'
import { Tex } from '../ui/Tex'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { ModePanel } from './calcModes'
import { usePure } from '../math/pure/store'
import { type JobId } from '../math/pure/run'
import { showPanel } from '../app/panels'

// Every number the calculator shows follows the precision the student chose in Settings
// (Rule 4). The scene store is read lazily so calc/ never imports it back.
setCalcPrecisionSource(() => useScene.getState().settings)

/** The three modes with a keypad are always in reach; the rest sit behind "More modes". */
const MAIN_MODES: { id: CalcMode; label: string; desc: string }[] = [
  { id: 'COMP', label: 'COMP', desc: 'Calculate' },
  { id: 'CMPLX', label: 'CMPLX', desc: 'Complex numbers' },
  { id: 'BASE-N', label: 'BASE-N', desc: 'Binary, octal, hex' }
]
const MORE_MODES: { id: CalcMode; label: string; desc: string }[] = [
  { id: 'MATRIX', label: 'MATRIX', desc: 'Matrices' },
  { id: 'VECTOR', label: 'VECTOR', desc: 'Vectors' },
  { id: 'STAT', label: 'STAT', desc: 'Statistics & regression' },
  { id: 'DIST', label: 'DIST', desc: 'Distributions' },
  { id: 'TABLE', label: 'TABLE', desc: 'Function table' },
  { id: 'EQUATION', label: 'EQN', desc: 'Equations' },
  { id: 'INEQUALITY', label: 'INEQ', desc: 'Inequalities' },
  { id: 'RATIO', label: 'RATIO', desc: 'Proportions' },
  { id: 'SHEET', label: 'SHEET', desc: 'Spreadsheet' },
  { id: 'UNITS', label: 'UNITS', desc: 'Unit conversion' },
  { id: 'CONST', label: 'CONST', desc: 'Physical constants' },
  { id: 'MEASURE', label: 'MEASURE', desc: 'Significant figures & uncertainty' }
]

/** A key inserts LaTeX (#0 = selection/cursor, #? = placeholder to fill) or runs an action. */
type KeyDef = { label: string; tex?: string; act?: string; cls?: string; shift?: { label: string; tex?: string; act?: string }; alpha?: { label: string; tex?: string } }

/** Templates whose first box to fill is the lower limit (subscript). */
const LOWER_FIRST = /^\\(int|sum|prod)_/

/** Whether the function keys are folded away; remembered, because it is a preference not a state. */
const FN_KEY = 'physlab.calc.fnKeys'
const readFnOpen = (): boolean => {
  try {
    return localStorage.getItem(FN_KEY) !== 'closed'
  } catch {
    return true
  }
}

const fn = (name: string, args = 1) => `\\${name}\\left(#0${',#?'.repeat(args - 1)}\\right)`
const op = (name: string, args = 1) => `\\operatorname{${name}}\\left(#0${',#?'.repeat(args - 1)}\\right)`

const FN_KEYS: KeyDef[] = [
  { label: 'SHIFT', act: 'shift', cls: 'shift-key' },
  { label: 'ALPHA', act: 'alpha', cls: 'alpha-key' },
  { label: '◀', act: 'left', cls: 'fn' },
  { label: '▶', act: 'right', cls: 'fn' },
  { label: 'S⇔D', act: 'sd', cls: 'fn', shift: { label: 'ENG', act: 'eng' } },
  { label: 'STO', act: 'sto', cls: 'fn', shift: { label: 'RCL', act: 'rcl' } },

  { label: 'd/dx', tex: op('ddx', 2), cls: 'fn', shift: { label: 'Σ', tex: '\\sum_{x=#?}^{#?}#0' } },
  { label: '∫', tex: '\\int_{#?}^{#?}#0\\,dx', cls: 'fn', shift: { label: 'Π', tex: '\\prod_{x=#?}^{#?}#0' } },
  { label: 'x⁻¹', tex: '^{-1}', cls: 'fn', shift: { label: 'x!', tex: '!' } },
  { label: 'logₐb', tex: '\\log_{#?}\\left(#0\\right)', cls: 'fn', shift: { label: 'GCD', tex: op('GCD', 2) } },
  { label: 'nPr', tex: op('nPr', 2), cls: 'fn', shift: { label: 'nCr', tex: op('nCr', 2) } },
  { label: 'Pol', tex: op('Pol', 2), cls: 'fn', shift: { label: 'Rec', tex: op('Rec', 2) } },

  { label: 'a/b', tex: '\\frac{#0}{#?}', cls: 'fn', shift: { label: '%', tex: '\\%' } },
  { label: '√', tex: '\\sqrt{#0}', cls: 'fn', shift: { label: '∛', tex: '\\sqrt[3]{#0}' } },
  { label: 'x²', tex: '^2', cls: 'fn', shift: { label: 'x³', tex: '^3' } },
  { label: 'xʸ', tex: '^{#0}', cls: 'fn', shift: { label: 'ˣ√', tex: '\\sqrt[#?]{#0}' } },
  { label: 'log', tex: fn('log'), cls: 'fn', shift: { label: '10ˣ', tex: '10^{#0}' } },
  { label: 'ln', tex: fn('ln'), cls: 'fn', shift: { label: 'eˣ', tex: 'e^{#0}' } },

  { label: '(−)', tex: '-', cls: 'fn', alpha: { label: 'A', tex: 'A' } },
  { label: "°'\"", tex: '^{\\circ}', cls: 'fn', shift: { label: "'", tex: "'" }, alpha: { label: 'B', tex: 'B' } },
  { label: 'hyp', tex: fn('sinh'), cls: 'fn', shift: { label: 'cosh', tex: fn('cosh') }, alpha: { label: 'C', tex: 'C' } },
  { label: 'sin', tex: fn('sin'), cls: 'fn', shift: { label: 'sin⁻¹', tex: '\\sin^{-1}\\left(#0\\right)' }, alpha: { label: 'D', tex: 'D' } },
  { label: 'cos', tex: fn('cos'), cls: 'fn', shift: { label: 'cos⁻¹', tex: '\\cos^{-1}\\left(#0\\right)' }, alpha: { label: 'E', tex: 'E' } },
  { label: 'tan', tex: fn('tan'), cls: 'fn', shift: { label: 'tan⁻¹', tex: '\\tan^{-1}\\left(#0\\right)' }, alpha: { label: 'F', tex: 'F' } },

  { label: 'Abs', tex: '\\left|#0\\right|', cls: 'fn', shift: { label: 'Int', tex: op('Int') } },
  { label: '(', tex: '(', cls: 'fn', alpha: { label: 'x', tex: 'x' } },
  { label: ')', tex: ')', cls: 'fn', alpha: { label: 'y', tex: 'y' } },
  { label: ',', tex: ',', cls: 'fn', alpha: { label: 'M', tex: 'M' } },
  { label: 'π', tex: '\\pi', cls: 'fn', shift: { label: 'e', tex: 'e' } },
  { label: '=?', act: 'solve', cls: 'fn', shift: { label: 'CALC', act: 'calc' } }
]

const NUM_KEYS: KeyDef[] = [
  { label: '7', tex: '7', cls: 'digit', shift: { label: 'CONST', act: 'const' } },
  { label: '8', tex: '8', cls: 'digit', shift: { label: 'UNITS', act: 'units' } },
  { label: '9', tex: '9', cls: 'digit' },
  { label: 'DEL', act: 'del', cls: 'del' },
  { label: 'AC', act: 'ac', cls: 'ac' },
  { label: '4', tex: '4', cls: 'digit', shift: { label: 'MATRIX', act: 'matrix' } },
  { label: '5', tex: '5', cls: 'digit', shift: { label: 'VECTOR', act: 'vector' } },
  { label: '6', tex: '6', cls: 'digit', shift: { label: 'STAT', act: 'stat' } },
  { label: '×', tex: '\\times', cls: 'digit' },
  { label: '÷', tex: '\\div', cls: 'digit' },
  { label: '1', tex: '1', cls: 'digit', shift: { label: 'EQN', act: 'eqn' } },
  { label: '2', tex: '2', cls: 'digit', shift: { label: 'CMPLX', act: 'cmplx' } },
  { label: '3', tex: '3', cls: 'digit', shift: { label: 'BASE', act: 'base' } },
  { label: '+', tex: '+', cls: 'digit' },
  { label: '−', tex: '-', cls: 'digit' },
  { label: '0', tex: '0', cls: 'digit', shift: { label: 'Ran#', tex: '\\operatorname{Ran}()' } },
  { label: '.', tex: '.', cls: 'digit', shift: { label: 'RanInt', tex: op('RanInt', 2) } },
  { label: '×10ˣ', tex: '\\times10^{#?}', cls: 'digit', shift: { label: 'π', tex: '\\pi' } },
  { label: 'Ans', tex: '\\operatorname{Ans}', cls: 'digit' },
  { label: '=', act: 'eq', cls: 'eq' }
]

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
 * Sends whatever is in the calculator across to the Working area, which is the big panel in the
 * middle. Keeping the two apart means the keypad stays a keypad and long working gets real room.
 */
function PureMathRow({ latex }: { latex: string }) {
  const runLatex = usePure((s) => s.runLatex)
  const text = fieldHasText(latex)
  const go = (job?: JobId) => {
    if (!text) return
    // The field's own LaTeX goes across: the Working panel's field reads LaTeX, and handing it
    // the linear form put x^(2) with a stray bracket in front of the student. The store does the
    // conversion, so a refusal thrown by the converter is shown as a sentence, not a crash.
    runLatex(latex, job ?? 'auto')
    showPanel('working')
  }
  const QUICK: { id: JobId; label: string }[] = [
    { id: 'factor', label: 'Factorise' },
    { id: 'expand', label: 'Expand' },
    { id: 'solve', label: 'Solve' },
    { id: 'partial', label: 'Partial fr.' },
    { id: 'complex', label: 'Complex' }
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-fine text-[color:var(--text-faint)]">Pure Math</span>
      <button
        className="btn"
        disabled={!text}
        onClick={() => go()}
        title={text ? 'Work this out step by step in the Working panel' : 'Type something first'}
      >
        <Wand2 size={13} /> Work it out
      </button>
      {QUICK.map((q) => (
        <button key={q.id} className="btn ghost" disabled={!text} onClick={() => go(q.id)} title={`${q.label} — step by step, in the Working panel`}>
          {q.label}
        </button>
      ))}
    </div>
  )
}

function Keypad({ keys, cols, onKey }: { keys: KeyDef[]; cols: number; onKey: (k: KeyDef) => void }) {
  const shift = useCalc((s) => s.shift)
  const alpha = useCalc((s) => s.alpha)
  return (
    <div className="keys" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {keys.map((k, i) => (
        <button
          key={i}
          className={`key ${k.cls ?? ''} ${(k.act === 'shift' && shift) || (k.act === 'alpha' && alpha) ? 'lit' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onKey(k)}
          title={[k.shift && `SHIFT: ${k.shift.label}`, k.alpha && `ALPHA: ${k.alpha.label}`].filter(Boolean).join('   ')}
        >
          {k.shift && <span className="shift">{k.shift.label}</span>}
          {k.alpha && <span className="alpha">{k.alpha.label}</span>}
          {k.label}
        </button>
      ))}
    </div>
  )
}

interface Result {
  main: string
  extra?: string[]
  exact?: string | null
  value?: unknown
  error?: boolean
}

const CHIP = 'rounded px-2 py-0.5 text-fine font-semibold'
const CHIP_ON = 'bg-[color:var(--accent-2)] text-[color:var(--text-strong)]'
const CHIP_OFF = 'bg-[color:var(--bg-3)] text-[color:var(--text-dim)] hover:text-[color:var(--text-strong)]'

export function Calculator() {
  const mode = useCalc((s) => s.mode)
  const setMode = useCalc((s) => s.setMode)
  const [more, setMore] = useState(false)
  // Re-render when the precision setting changes, so every number on the panel follows it.
  useScene((s) => s.settings.decimals)
  useScene((s) => s.settings.precisionMode)
  // SymPy takes a few seconds to wake; starting it when the calculator opens means the first
  // exact form or fallback answer is ready by the time it is wanted.
  useEffect(() => {
    void warmupCas()
  }, [])
  const other = MORE_MODES.find((m) => m.id === mode)
  return (
    <div className="calc">
      <div className="relative flex flex-wrap gap-1">
        {MAIN_MODES.map((m) => (
          <button key={m.id} title={m.desc} onClick={() => setMode(m.id)} className={`${CHIP} ${mode === m.id ? CHIP_ON : CHIP_OFF}`}>
            {m.label}
          </button>
        ))}
        <button
          title="Matrices, vectors, statistics, tables, equations and more"
          onClick={() => setMore(!more)}
          className={`${CHIP} flex items-center gap-1 ${other ? CHIP_ON : CHIP_OFF}`}
        >
          {other ? other.label : 'More modes'} <ChevronDown size={11} />
        </button>
        {more && (
          <div className="menu top-full mt-1" onMouseLeave={() => setMore(false)}>
            {MORE_MODES.map((m) => (
              <button
                key={m.id}
                className={mode === m.id ? 'font-semibold' : ''}
                onClick={() => {
                  setMode(m.id)
                  setMore(false)
                }}
              >
                <span>{m.label}</span>
                <span className="sc">{m.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === 'COMP' || mode === 'CMPLX' || mode === 'BASE-N' ? <ScientificMode key={mode} mode={mode} /> : <ModePanel mode={mode} />}
    </div>
  )
}

function ScientificMode({ mode }: { mode: 'COMP' | 'CMPLX' | 'BASE-N' }) {
  const calc = useCalc()
  const angleUnit = useScene((s) => s.settings.angleUnit)
  const setSettings = useScene((s) => s.setSettings)
  const mathRef = useRef<MathInputHandle>(null)
  const baseRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [showExact, setShowExact] = useState(true)
  const [eng, setEng] = useState(false)
  const [base, setBase] = useState<Base>(10)
  const [calcVars, setCalcVars] = useState<string[] | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [fnOpen, setFnOpen] = useState(readFnOpen)

  // A constant chosen from the CONST list arrives here, because that list was on screen instead
  // of this field. It goes in at the caret, through MathLive, like any key press.
  useEffect(() => {
    // Taken inside the timer, not before it: React runs this effect twice in development and
    // clears the first timer, and the constant must not be taken by a run that never inserts it.
    const t = setTimeout(() => {
      const queued = useCalc.getState().takePending()
      if (queued) mathRef.current?.insert(queued)
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const toggleFn = (): void => {
    setFnOpen(!fnOpen)
    try {
      localStorage.setItem(FN_KEY, fnOpen ? 'closed' : 'open')
    } catch {
      // Not remembered; the keys still fold.
    }
  }

  /** The current input as PhysLab's linear syntax. Throws the converter's sentence on a ± it cannot use. */
  const linear = (): string => {
    const s = useCalc.getState().input
    return mode === 'BASE-N' ? s : latexToMath(s)
  }

  /**
   * The same, but empty instead of thrown, for key handlers that only peek at the text: a ± typed
   * before SOLVE or CALC must fall through to evaluate(), which puts the refusal on the LCD.
   */
  const linearOrEmpty = (): string => {
    const s = useCalc.getState().input
    return mode === 'BASE-N' ? s : tryLatexToMath(s).src
  }

  const evaluate = async (varsOverride?: Record<string, unknown>) => {
    const s = useCalc.getState()
    // The conversion can refuse (a ± the engine cannot use); its sentence belongs on the LCD
    // with every other error, not in an unhandled rejection.
    let input: string
    try {
      input = linear().trim()
    } catch (e) {
      setResult({ main: 'Syntax ERROR', extra: [e instanceof Error ? e.message : String(e)], error: true })
      return
    }
    if (!input) return
    try {
      if (mode === 'BASE-N') {
        const v = evaluateBaseN(input, base)
        setResult({ main: formatBase(v, base), extra: [`DEC ${formatBase(v, 10)}`, `HEX ${formatBase(v, 16)}`, `BIN ${formatBase(v, 2)}`, `OCT ${formatBase(v, 8)}`], value: v })
        useCalc.setState({ ans: v, history: [{ input: s.input, result: formatBase(v, base), mode }, ...s.history].slice(0, 100) })
        return
      }
      if (mode === 'CMPLX') {
        setAngleMode(angleUnit)
        const v = math.evaluate(casioToMath(input), { ...constantScope(), ...s.vars, ...varsOverride, i: math.complex(0, 1), Ans: s.ans }) as unknown
        const c = math.complex(v as never) as unknown as { re: number; im: number }
        const r = Math.hypot(c.re, c.im)
        const th = Math.atan2(c.im, c.re)
        // The same formatter as COMP mode, so 2 + i never reads "2 + 1i" here and "2 + i" there.
        const main = formatValue(math.complex(c.re, c.im))
        setResult({ main, extra: [`r∠θ = ${calcNum(r)} ∠ ${calcNum(angleUnit === 'deg' ? (th * 180) / Math.PI : th)}${angleUnit === 'deg' ? '°' : ''}`, `conjugate ${formatValue(math.conj(math.complex(c.re, c.im)))}`], value: c })
        useCalc.setState({ ans: v, history: [{ input: s.input, result: main, mode }, ...s.history].slice(0, 100) })
        return
      }
      const out = evaluateComp(input, { vars: { ...s.vars, ...varsOverride }, ans: s.ans, angle: angleUnit })
      const num = typeof out.value === 'number' ? out.value : NaN
      const exact = Number.isFinite(num) && !/=/.test(input) && !/^(Pol|Rec)/i.test(input) ? exactForm(num) : null
      setResult({ main: eng && Number.isFinite(num) ? calcEng(num) : out.text, extra: out.extra, exact: exact && exact !== String(num) ? exact : null, value: out.value })
      useCalc.setState({ ans: out.value, vars: /=/.test(input) ? { ...s.vars, x: out.value } : s.vars, history: [{ input: s.input, result: out.text, mode }, ...s.history].slice(0, 100) })
      if (!exact && Number.isFinite(num) && !Number.isInteger(num) && !/[xy=]|ddx|integral|sigma|product|Ran/.test(input)) {
        cas('exact', { expr: casioToMath(input), deg: casInDegrees(angleUnit) }).then((r) => {
          if (!r.error && r.latex && !/\./.test(r.text) && r.text.length < 60) {
            setResult((prev) => (prev && prev.value === out.value ? { ...prev, exact: r.latex } : prev))
          }
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setResult({ main: /Undefined symbol|Unexpected|Parenthesis|Syntax|Value expected/i.test(msg) ? 'Syntax ERROR' : /No solution/.test(msg) ? "Can't Solve" : 'Math ERROR', extra: [msg], error: true })
    }
  }

  const visualize = () => {
    const s = useCalc.getState()
    const input = linear().trim()
    if (!input || mode === 'BASE-N') return
    try {
      const ddx = input.match(/^ddx\((.*)\)$/)
      if (ddx) {
        const [f, a] = args(ddx[1])
        const x0 = Number(math.evaluate(casioToMath(a), { ...constantScope(), ...s.vars }))
        const fx = Number(math.evaluate(casioToMath(f), { ...constantScope(), ...s.vars, x: x0 }))
        const slope = Number(evaluateComp(input, { vars: s.vars, ans: s.ans, angle: 'rad' }).value)
        visualizeTangent(casioToMath(f), x0, fx, slope)
        return
      }
      const integ = input.match(/^integral\((.*)\)$/)
      if (integ) {
        const [f, a, b] = args(integ[1])
        const lo = Number(math.evaluate(casioToMath(a), { ...constantScope(), ...s.vars }))
        const hi = Number(math.evaluate(casioToMath(b), { ...constantScope(), ...s.vars }))
        visualizeArea(casioToMath(f), lo, hi, `∫ ${f} dx from ${a} to ${b}`)
        return
      }
      const pol = input.match(/^(Pol|Rec)\((.*)\)$/i)
      if (pol) {
        const [p, q] = args(pol[2]).map((t) => Number(math.evaluate(casioToMath(t), { ...constantScope(), ...s.vars })))
        const rad = angleUnit === 'deg' ? (q * Math.PI) / 180 : q
        visualizeVector(pol[1].toLowerCase() === 'pol' ? [p, q, 0] : [p * Math.cos(rad), p * Math.sin(rad), 0])
        return
      }
      if (mode === 'CMPLX' && result?.value && typeof result.value === 'object') {
        const c = result.value as { re: number; im: number }
        visualizeVector([c.re, c.im, 0], 'z')
        return
      }
      if (/=/.test(input) && /x/.test(input)) {
        const [l, r] = input.split('=')
        visualizeGraph(`y = ${l} − (${r})`, [`(${casioToMath(l)}) - (${casioToMath(r)})`], 'explicit')
        return
      }
      if (/(^|[^a-z])x([^a-z]|$)/.test(input)) {
        visualizeGraph(`y = ${input}`, [casioToMath(input)], 'explicit')
        return
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
        return
      }
      if (typeof result?.value === 'number') {
        const b = new Builder()
        b.number(String(result.value), { slider: { min: Math.min(0, result.value * 2), max: Math.max(10, result.value * 2), step: 0.01 } })
        b.commit()
        visualizePoint([result.value, 0, 0])
      }
    } catch (e) {
      setResult({ main: 'Cannot visualize', extra: [String(e)], error: true })
    }
  }

  const insertTex = (tex: string) => {
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
    if (LOWER_FIRST.test(tex)) mathRef.current?.command('moveToNextPlaceholder')
  }

  const onKey = (k: KeyDef) => {
    const s = useCalc.getState()
    const useShift = s.shift && k.shift
    const useAlpha = s.alpha && k.alpha
    if (s.sto && k.alpha) {
      const letter = k.alpha.tex!
      useCalc.setState({ vars: { ...s.vars, [letter]: s.ans }, sto: false, alpha: false, shift: false })
      setResult({ main: `${calcNum(Number(s.ans))} → ${letter}` })
      return
    }
    const act = useShift ? k.shift!.act : useAlpha ? undefined : k.act
    const tex = useShift ? k.shift!.tex : useAlpha ? k.alpha!.tex : k.tex
    if (act) {
      switch (act) {
        case 'shift':
          return useCalc.setState({ shift: !s.shift, alpha: false })
        case 'alpha':
          return useCalc.setState({ alpha: !s.alpha, shift: false })
        case 'left':
          return mathRef.current?.nextBox(-1)
        case 'right':
          // With empty boxes left, ▶ jumps to the next box to fill (like the calculator's cursor).
          return mathRef.current?.nextBox(1)
        case 'del':
          if (mode === 'BASE-N') return useCalc.setState({ input: s.input.slice(0, -1) })
          return mathRef.current?.command('deleteBackward')
        case 'ac':
          setResult(null)
          setCalcVars(null)
          mathRef.current?.setLatex('')
          return useCalc.setState({ input: '', shift: false, alpha: false, sto: false })
        case 'eq':
          return void evaluate()
        case 'sd':
          useCalc.setState({ shift: false })
          return setShowExact(!showExact)
        case 'eng':
          useCalc.setState({ shift: false })
          return setEng(!eng)
        case 'sto':
          setResult({ main: 'STO → press a letter key (A–F, x, y, M)' })
          return useCalc.setState({ sto: true, alpha: true, shift: false })
        case 'rcl':
          useCalc.setState({ shift: false })
          return setResult({ main: 'Variables', extra: Object.entries(s.vars).map(([n, v]) => `${n} = ${typeof v === 'number' ? calcNum(v) : String(v)}`) })
        case 'solve':
          if (!linearOrEmpty().includes('=')) insertTex('=')
          else void evaluate()
          return
        case 'calc': {
          useCalc.setState({ shift: false })
          const used = [...new Set((linearOrEmpty().match(/\b[A-FMxy]\b/g) ?? []).filter((v) => v !== 'e'))]
          if (used.length) setCalcVars(used)
          else void evaluate()
          return
        }
        case 'const':
          return useCalc.setState({ mode: 'CONST', shift: false })
        case 'units':
          return useCalc.setState({ mode: 'UNITS', shift: false })
        case 'matrix':
          return useCalc.setState({ mode: 'MATRIX', shift: false })
        case 'vector':
          return useCalc.setState({ mode: 'VECTOR', shift: false })
        case 'stat':
          return useCalc.setState({ mode: 'STAT', shift: false })
        case 'eqn':
          return useCalc.setState({ mode: 'EQUATION', shift: false })
        case 'cmplx':
          return useCalc.setState({ mode: 'CMPLX', shift: false })
        case 'base':
          return useCalc.setState({ mode: 'BASE-N', shift: false })
      }
    }
    if (tex) {
      useCalc.setState({ shift: false, alpha: false })
      insertTex(tex)
    }
  }

  const baseKeys: KeyDef[] = [
    ...(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((l) => ({ label: l, tex: l, cls: 'fn' })),
    { label: 'and', tex: ' and ', cls: 'fn' },
    { label: 'or', tex: ' or ', cls: 'fn' },
    { label: 'xor', tex: ' xor ', cls: 'fn' },
    { label: 'xnor', tex: ' xnor ', cls: 'fn' },
    { label: 'Not', tex: 'not(', cls: 'fn' },
    { label: 'Neg', tex: 'neg(', cls: 'fn' }
  ]
  const cmplxKeys: KeyDef[] = [
    { label: 'i', tex: 'i', cls: 'fn' },
    { label: '∠', tex: '\\times e^{i\\times#?}', cls: 'fn' },
    { label: 'arg', tex: op('arg'), cls: 'fn' },
    { label: 'Conjg', tex: op('conj'), cls: 'fn' },
    { label: 'Re', tex: op('re'), cls: 'fn' },
    { label: 'Im', tex: op('im'), cls: 'fn' }
  ]

  const exactTex = result?.exact
  return (
    <>
      <div className="lcd">
        <div className="status">
          {calc.shift && <span className="text-[color:var(--lcd-shift)]">S</span>}
          {calc.alpha && <span className="text-[color:var(--lcd-alpha)]">A</span>}
          {calc.sto && <span>STO</span>}
          <span>{angleUnit === 'deg' ? 'D' : 'R'}</span>
          <span>{mode === 'BASE-N' ? ({ 2: 'BIN', 8: 'OCT', 10: 'DEC', 16: 'HEX' } as Record<number, string>)[base] : mode}</span>
          {eng && <span>ENG</span>}
          <span className="flex-1" />
          <span>Math▲</span>
        </div>
        {mode === 'BASE-N' ? (
          <input
            ref={baseRef}
            className="w-full bg-transparent font-mono text-lead text-[color:var(--lcd-text)] outline-none"
            value={calc.input}
            spellCheck={false}
            placeholder="e.g. FF + 1A   or   1010 and 0110"
            onChange={(e) => useCalc.setState({ input: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') void evaluate()
            }}
          />
        ) : (
          <MathInput ref={mathRef} size="lg" value={calc.input} onChange={(l) => useCalc.setState({ input: l })} onEnter={() => void evaluate()} placeholder={mode === 'CMPLX' ? '(3+4i)(1-2i)' : 'type or use the keys'} />
        )}
        <div className="result">
          {result && (
            <>
              {showExact && exactTex && !result.error ? <Tex tex={exactTex} /> : <span className={result.error ? 'text-[color:var(--lcd-bad)]' : ''}>{result.main}</span>}
              {showExact && exactTex && !result.error && !/^-?\d+$/.test(exactTex) && <div className="text-body opacity-70">≈ {result.main}</div>}
            </>
          )}
        </div>
        {result?.extra && (
          <div className="text-right text-small leading-5 text-[color:var(--lcd-dim)]">
            {result.extra.map((x, i) => (
              <div key={i}>{x}</div>
            ))}
          </div>
        )}
      </div>

      {calcVars && (
        <div className="card p-2">
          <div className="mb-1 text-fine text-[color:var(--text-dim)]">CALC: enter the values, then press Calculate</div>
          <CalcVarForm
            vars={calcVars}
            initial={calc.vars}
            onSubmit={(vals) => {
              useCalc.setState({ vars: { ...useCalc.getState().vars, ...vals } })
              void evaluate(vals)
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <button className="btn primary" onClick={() => void evaluate()}>
          =
        </button>
        <button className="btn" onClick={visualize} disabled={mode === 'BASE-N'} title="Show this calculation in the viewport (graph, tangent, area, vector…)">
          <Eye size={13} /> Visualize
        </button>
        <button className="btn" onClick={() => setShowExact(!showExact)} title="Switch between exact form and decimal">
          S⇔D
        </button>
        <div className="seg">
          <button className={angleUnit === 'deg' ? 'on' : ''} onClick={() => setSettings({ angleUnit: 'deg' })}>
            DEG
          </button>
          <button className={angleUnit === 'rad' ? 'on' : ''} onClick={() => setSettings({ angleUnit: 'rad' })}>
            RAD
          </button>
        </div>
        {mode === 'BASE-N' && (
          <div className="seg">
            {([10, 16, 2, 8] as Base[]).map((b) => (
              <button key={b} className={base === b ? 'on' : ''} onClick={() => setBase(b)}>
                {b === 10 ? 'DEC' : b === 16 ? 'HEX' : b === 2 ? 'BIN' : 'OCT'}
              </button>
            ))}
          </div>
        )}
        <button className={`btn ghost ${showHistory ? 'text-[color:var(--text-strong)]' : ''}`} onClick={() => setShowHistory(!showHistory)}>
          <History size={13} /> History
        </button>
      </div>

      <PureMathRow latex={calc.input} />

      {showHistory && (
        <div className="card max-h-40 overflow-auto">
          {calc.history.length === 0 && <div className="p-2 text-[color:var(--text-faint)]">No calculations yet.</div>}
          {calc.history.length > 0 && (
            <button className="flex w-full items-center gap-1 px-2 py-1 text-left text-[color:var(--text-faint)] hover:text-[color:var(--bad)]" onClick={clearCalcHistory}>
              <Trash2 size={12} /> Clear history
            </button>
          )}
          {calc.history.map((h, i) => (
            <button key={i} className="flex w-full items-center justify-between gap-3 px-2 py-1 text-left hover:bg-[color:var(--sel-row)]" onClick={() => useCalc.setState({ input: h.input, mode: h.mode })}>
              <span className="truncate text-[color:var(--text)]">{h.mode === 'BASE-N' ? h.input : <Tex tex={h.input} />}</span>
              <span className="shrink-0 font-mono text-[color:var(--code-text)]">{h.result}</span>
            </button>
          ))}
        </div>
      )}

      {mode === 'BASE-N' && <Keypad keys={baseKeys} cols={6} onKey={onKey} />}
      {mode === 'CMPLX' && <Keypad keys={cmplxKeys} cols={6} onKey={onKey} />}
      {mode !== 'BASE-N' && (
        <button className="flex items-center gap-1 self-start text-fine text-[color:var(--text-faint)] hover:text-[color:var(--text)]" onClick={toggleFn} title={fnOpen ? 'Fold the function keys away' : 'Show the function keys'}>
          {fnOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Function keys
        </button>
      )}
      {mode !== 'BASE-N' && fnOpen && <Keypad keys={FN_KEYS} cols={6} onKey={onKey} />}
      <Keypad keys={NUM_KEYS} cols={5} onKey={onKey} />
      <div className="flex items-center gap-1.5 text-fine text-[color:var(--text-faint)]">
        <Sparkles size={12} /> Tip: type straight on your keyboard too: <code className="text-[color:var(--code-text)]">/</code> makes a fraction, <code className="text-[color:var(--code-text)]">^</code> a power, <code className="text-[color:var(--code-text)]">sqrt</code> a root.
      </div>
    </>
  )
}

function CalcVarForm({ vars, initial, onSubmit }: { vars: string[]; initial: Record<string, unknown>; onSubmit: (v: Record<string, number>) => void }) {
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
