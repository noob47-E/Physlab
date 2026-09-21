import { useMemo, useState } from 'react'
import { Eye, ListOrdered, Minus, Plus, Search } from 'lucide-react'
import { useCalc, type CalcMode } from '../calc/calcStore'
import {
  binomialCd,
  binomialPd,
  casioToMath,
  countSigFigs,
  dimensionsOf,
  exactForm,
  inverseNormal,
  normalCdf,
  normalPdf,
  poissonCd,
  poissonPd,
  polyInequality,
  polyRoots,
  polyToExpr,
  propagate,
  roundSig,
  solveLinearSystem,
  statistics,
  type RegressionType
} from '../calc/engine'
import { calcNum, mathFormatOptions } from '../calc/format'
import { CONSTANTS } from '../calc/constants'
import { themeColor } from '../app/theme'
import { math } from '../math/expr'
import { Builder } from '../core/factory'
import { useScene } from '../core/store'
import { visualizeArea, visualizeGraph, visualizeSolution } from '../core/visualize'
import * as VS from '../math/vectorSolver'
import type { V3 } from '../math/vec'
import { NumField } from '../ui/fields'
import { Tex } from '../ui/Tex'

export function ModePanel({ mode }: { mode: CalcMode }) {
  switch (mode) {
    case 'MATRIX':
      return <MatrixMode />
    case 'VECTOR':
      return <VectorMode />
    case 'STAT':
      return <StatMode />
    case 'DIST':
      return <DistMode />
    case 'TABLE':
      return <TableMode />
    case 'EQUATION':
      return <EquationMode />
    case 'INEQUALITY':
      return <InequalityMode />
    case 'RATIO':
      return <RatioMode />
    case 'SHEET':
      return <SheetMode />
    case 'UNITS':
      return <UnitsMode />
    case 'CONST':
      return <ConstMode />
    case 'MEASURE':
      return <MeasureMode />
    default:
      return null
  }
}

const Screen = ({ children }: { children: React.ReactNode }) => <div className="lcd min-h-0 text-lead">{children}</div>
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2">
    <span className="w-28 shrink-0 text-right text-[color:var(--text-dim)]">{label}</span>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
)

const matTex = (m: unknown): string => {
  const arr = (m as { toArray?: () => unknown }).toArray ? (m as { toArray: () => unknown }).toArray() : m
  if (!Array.isArray(arr)) return typeof arr === 'number' ? calcNum(arr) : String(arr)
  const rows = (Array.isArray(arr[0]) ? arr : [arr]) as unknown[][]
  return `\\begin{bmatrix}${rows.map((r) => r.map((v) => (typeof v === 'number' ? calcNum(v) : math.format(v as never, mathFormatOptions()))).join(' & ')).join(' \\\\ ')}\\end{bmatrix}`
}

// ---------------------------------------------------------------------------

function MatrixEditor({ name }: { name: string }) {
  const m = useCalc((s) => s.matrices[name])
  const set = (next: number[][]) => useCalc.setState((s) => ({ matrices: { ...s.matrices, [name]: next } }))
  const rows = m.length
  const cols = m[0]?.length ?? 1
  const resize = (r: number, c: number) => set(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => m[i]?.[j] ?? 0)))
  return (
    <div className="card p-2">
      <div className="mb-1 flex items-center gap-2">
        <b className="text-[color:var(--text-strong)]">{name}</b>
        <span className="text-[color:var(--text-faint)]">
          {rows}×{cols}
        </span>
        <div className="flex-1" />
        <span className="text-[color:var(--text-faint)]">rows</span>
        <button className="icon-btn h-5 w-5" onClick={() => resize(Math.max(1, rows - 1), cols)}>
          <Minus size={11} />
        </button>
        <button className="icon-btn h-5 w-5" onClick={() => resize(Math.min(6, rows + 1), cols)}>
          <Plus size={11} />
        </button>
        <span className="text-[color:var(--text-faint)]">cols</span>
        <button className="icon-btn h-5 w-5" onClick={() => resize(rows, Math.max(1, cols - 1))}>
          <Minus size={11} />
        </button>
        <button className="icon-btn h-5 w-5" onClick={() => resize(rows, Math.min(6, cols + 1))}>
          <Plus size={11} />
        </button>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {m.map((row, i) => row.map((v, j) => <NumField key={`${i}-${j}`} value={v} onChange={(n) => set(m.map((r, a) => r.map((x, b) => (a === i && b === j ? n : x))))} />))}
      </div>
    </div>
  )
}

function visualizeMatrix2D(M: number[][], label: string) {
  const b = new Builder()
  const [[a, c], [bb, d]] = M
  const o = b.point([0, 0, 0], { name: 'O', auxiliary: true, visible: false })
  b.vector({ kind: 'free', tail: [0, 0, 0], comp: [1, 0, 0] }, { name: 'i', color: themeColor('--grid-axis') })
  b.vector({ kind: 'free', tail: [0, 0, 0], comp: [0, 1, 0] }, { name: 'j', color: themeColor('--grid-axis') })
  b.vector({ kind: 'free', tail: [0, 0, 0], comp: [a, bb, 0] }, { name: 'Mi', color: themeColor('--bad') })
  b.vector({ kind: 'free', tail: [0, 0, 0], comp: [c, d, 0] }, { name: 'Mj', color: themeColor('--good') })
  const p1 = b.point([a, bb, 0], { auxiliary: true, showLabel: false })
  const p2 = b.point([a + c, bb + d, 0], { auxiliary: true, showLabel: false })
  const p3 = b.point([c, d, 0], { auxiliary: true, showLabel: false })
  b.polygon([o.id, p1.id, p2.id, p3.id], { name: 'image', color: themeColor('--warn') })
  b.text([a + c, bb + d, 0], `${label}: area × det = ${calcNum(a * d - bb * c)}`)
  b.commit()
  useScene.getState().setViewMode('2d')
}

function MatrixMode() {
  const matrices = useCalc((s) => s.matrices)
  const [expr, setExpr] = useState('MatA * MatB')
  const [out, setOut] = useState<{ tex: string; value: unknown } | null>(null)
  const [err, setErr] = useState('')
  const run = (e = expr) => {
    setErr('')
    try {
      const v = math.evaluate(casioToMath(e.replace(/\bInv\(/g, 'inv(').replace(/\bTrn\(/g, 'transpose(').replace(/\bIdn\(/g, 'identity(')), { ...matrices })
      const eig = e.startsWith('eigs(') ? v : null
      if (eig) {
        const vals = (eig as { values: unknown }).values
        setOut({ tex: `\\lambda = ${matTex(vals)}`, value: vals })
      } else setOut({ tex: matTex(v), value: v })
    } catch (x) {
      setErr(String(x))
    }
  }
  const quick = ['MatA + MatB', 'MatA * MatB', 'det(MatA)', 'inv(MatA)', 'transpose(MatA)', 'MatA^2', 'eigs(MatA)', 'trace(MatA)', 'MatA * inv(MatB)']
  const vis = () => {
    const v = out?.value ?? matrices.MatA
    const arr = ((v as { toArray?: () => number[][] }).toArray ? (v as { toArray: () => number[][] }).toArray() : v) as number[][]
    if (Array.isArray(arr) && arr.length === 2 && Array.isArray(arr[0]) && arr[0].length === 2) visualizeMatrix2D(arr, 'Transformed unit square')
    else setErr('Visualize works for 2×2 matrices: it shows how the matrix transforms the unit square.')
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1">
        {['MatA', 'MatB', 'MatC', 'MatD'].map((n) => (
          <MatrixEditor key={n} name={n} />
        ))}
      </div>
      <div className="flex gap-1">
        <input className="field font-mono" value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && run())} />
        <button className="btn primary" onClick={() => run()}>
          =
        </button>
        <button className="btn" onClick={vis}>
          <Eye size={13} /> Visualize
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {quick.map((q) => (
          <button key={q} className="btn h-6 font-mono text-fine" onClick={() => (setExpr(q), run(q))}>
            {q}
          </button>
        ))}
      </div>
      {err && <div className="text-[color:var(--bad)]">{err}</div>}
      {out && (
        <Screen>
          <Tex tex={out.tex} display />
        </Screen>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function VectorMode() {
  const vectors = useCalc((s) => s.vectors)
  const showSolution = useScene((s) => s.showSolution)
  const set = (name: string, v: number[]) => useCalc.setState((s) => ({ vectors: { ...s.vectors, [name]: v } }))
  const [a, setA] = useState('VctA')
  const [b, setB] = useState('VctB')
  const v3 = (n: string): V3 => [vectors[n][0] ?? 0, vectors[n][1] ?? 0, vectors[n][2] ?? 0]
  const nv = (n: string) => ({ name: n.replace('Vct', ''), v: v3(n) })
  const ops: { label: string; sol: () => VS.Solution }[] = [
    { label: `${a} + ${b}`, sol: () => VS.solveAddition([nv(a), nv(b)]) },
    { label: `${a} − ${b}`, sol: () => VS.solveSubtraction(nv(a), nv(b)) },
    { label: `${a} · ${b}`, sol: () => VS.solveDot(nv(a), nv(b)) },
    { label: `${a} × ${b}`, sol: () => VS.solveCross(nv(a), nv(b)) },
    { label: `|${a}|`, sol: () => VS.solveMagnitudeDirection(nv(a)) },
    { label: `unit ${a}`, sol: () => VS.solveUnitVector(nv(a)) },
    { label: `proj ${b} on ${a}`, sol: () => VS.solveProjection(nv(b), nv(a)) }
  ]
  const [sol, setSol] = useState<VS.Solution | null>(null)
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(vectors).map(([name, v]) => (
        <div key={name} className="card flex items-center gap-2 p-2">
          <b className="w-12 text-[color:var(--text-strong)]">{name}</b>
          <div className="seg">
            <button className={v.length === 2 ? 'on' : ''} onClick={() => set(name, v.slice(0, 2))}>
              2D
            </button>
            <button className={v.length === 3 ? 'on' : ''} onClick={() => set(name, [v[0], v[1], v[2] ?? 0])}>
              3D
            </button>
          </div>
          <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${v.length}, 1fr)` }}>
            {v.map((c, i) => (
              <NumField key={i} value={c} onChange={(n) => set(name, v.map((x, j) => (i === j ? n : x)))} />
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="text-[color:var(--text-dim)]">Use</span>
        <select className="field w-24" value={a} onChange={(e) => setA(e.target.value)}>
          {Object.keys(vectors).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <span className="text-[color:var(--text-dim)]">and</span>
        <select className="field w-24" value={b} onChange={(e) => setB(e.target.value)}>
          {Object.keys(vectors).map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1">
        {ops.map((o) => (
          <button key={o.label} className="btn" onClick={() => setSol(o.sol())}>
            {o.label}
          </button>
        ))}
      </div>
      {sol && (
        <Screen>
          {sol.answers.map((x) => (
            <div key={x.label} className="flex justify-between gap-2">
              <span>{x.label}</span>
              <Tex tex={x.tex} />
            </div>
          ))}
          <div className="mt-2 flex gap-1">
            <button className="btn h-6" onClick={() => showSolution(sol)}>
              <ListOrdered size={12} /> Steps
            </button>
            <button className="btn h-6" onClick={() => visualizeSolution(sol)}>
              <Eye size={12} /> Visualize
            </button>
          </div>
        </Screen>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function StatMode() {
  const [type, setType] = useState<RegressionType>('linear')
  const [rows, setRows] = useState<{ x: number; y: number; f: number }[]>([
    { x: 1, y: 2.1, f: 1 },
    { x: 2, y: 3.9, f: 1 },
    { x: 3, y: 6.2, f: 1 },
    { x: 4, y: 7.8, f: 1 },
    { x: 5, y: 10.1, f: 1 }
  ])
  const [useFreq, setUseFreq] = useState(false)
  const [predictX, setPredictX] = useState(6)
  const paired = type !== 'single'
  const res = useMemo(() => {
    try {
      return statistics(rows.map((r) => r.x), paired ? rows.map((r) => r.y) : null, useFreq ? rows.map((r) => r.f) : null, type)
    } catch (e) {
      return String(e)
    }
  }, [rows, type, useFreq, paired])

  const visualize = () => {
    if (typeof res === 'string') return
    const b = new Builder()
    rows.forEach((r) => b.point([r.x, paired ? r.y : 0, 0], { auxiliary: true, showLabel: false }))
    if (res.expr) b.graph({ kind: 'explicit', source: res.label ?? 'regression', exprs: [res.expr], showRoots: false, showExtrema: false }, { name: 'fit', color: themeColor('--warn') })
    b.commit()
    useScene.getState().setViewMode('2d')
  }
  const predict = typeof res !== 'string' && res.expr ? Number(math.evaluate(res.expr.replace(/ln\(/g, 'log(').replace(/log\(x\)/g, 'log(x)'), { x: predictX })) : NaN

  return (
    <div className="flex flex-col gap-2">
      <select className="field" value={type} onChange={(e) => setType(e.target.value as RegressionType)}>
        <option value="single">1-variable (x only)</option>
        <option value="linear">y = a + bx</option>
        <option value="quadratic">y = a + bx + cx²</option>
        <option value="log">y = a + b·ln x</option>
        <option value="exp">y = a·e^(bx)</option>
        <option value="abExp">y = a·b^x</option>
        <option value="power">y = a·x^b</option>
        <option value="inverse">y = a + b/x</option>
      </select>
      <label className="flex items-center gap-2 text-[color:var(--text-dim)]">
        <input type="checkbox" checked={useFreq} onChange={(e) => setUseFreq(e.target.checked)} /> Frequency column
      </label>
      <div className="card max-h-56 overflow-auto p-1">
        <div className="grid gap-1" style={{ gridTemplateColumns: `24px 1fr ${paired ? '1fr' : ''} ${useFreq ? '70px' : ''} 22px` }}>
          <span />
          <b className="text-center text-[color:var(--text-dim)]">x</b>
          {paired && <b className="text-center text-[color:var(--text-dim)]">y</b>}
          {useFreq && <b className="text-center text-[color:var(--text-dim)]">freq</b>}
          <span />
          {rows.map((r, i) => (
            <FragmentRow key={i}>
              <span className="text-right text-[color:var(--text-faint)]">{i + 1}</span>
              <NumField value={r.x} onChange={(v) => setRows(rows.map((q, j) => (j === i ? { ...q, x: v } : q)))} />
              {paired && <NumField value={r.y} onChange={(v) => setRows(rows.map((q, j) => (j === i ? { ...q, y: v } : q)))} />}
              {useFreq && <NumField value={r.f} onChange={(v) => setRows(rows.map((q, j) => (j === i ? { ...q, f: v } : q)))} />}
              <button className="text-[color:var(--text-faint)] hover:text-[color:var(--bad)]" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                ×
              </button>
            </FragmentRow>
          ))}
        </div>
        <button className="btn ghost mt-1 h-6" onClick={() => setRows([...rows, { x: (rows.at(-1)?.x ?? 0) + 1, y: 0, f: 1 }])}>
          <Plus size={12} /> Row
        </button>
      </div>
      {typeof res === 'string' ? (
        <div className="text-[color:var(--bad)]">{res}</div>
      ) : (
        <Screen>
          <div className="grid grid-cols-2 gap-x-4 font-mono text-small">
            <span>n = {res.n}</span>
            <span>x̄ = {calcNum(res.mean)}</span>
            <span>σx = {calcNum(res.sigmaX)}</span>
            <span>sx = {calcNum(res.sx)}</span>
            <span>Σx = {calcNum(res.sum)}</span>
            <span>Σx² = {calcNum(res.sumSq)}</span>
            <span>min = {calcNum(res.min)}</span>
            <span>max = {calcNum(res.max)}</span>
            <span>Q1 = {calcNum(res.q1)}</span>
            <span>Med = {calcNum(res.median)}</span>
            <span>Q3 = {calcNum(res.q3)}</span>
            {res.meanY !== undefined && <span>ȳ = {calcNum(res.meanY)}</span>}
            {res.coef && Object.entries(res.coef).map(([k, v]) => <span key={k}>{k} = {calcNum(v)}</span>)}
            {res.r !== undefined && <span>r = {calcNum(res.r)}</span>}
          </div>
          {res.label && <div className="mt-1 text-small">Model: {res.label}</div>}
          {res.expr && (
            <div className="mt-1 flex items-center gap-2 text-small">
              ŷ at x =
              <input className="w-16 rounded border border-[color:var(--lcd-line)] bg-[color:var(--lcd-field)] px-1" type="number" value={predictX} onChange={(e) => setPredictX(Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} />
              → <b>{calcNum(predict)}</b>
            </div>
          )}
        </Screen>
      )}
      <button className="btn w-fit" onClick={visualize}>
        <Eye size={13} /> Visualize data {paired ? '& best-fit curve' : ''}
      </button>
    </div>
  )
}

const FragmentRow = ({ children }: { children: React.ReactNode }) => <>{children}</>

// ---------------------------------------------------------------------------

function DistMode() {
  const [kind, setKind] = useState<'normPD' | 'normCD' | 'invNorm' | 'binPD' | 'binCD' | 'poiPD' | 'poiCD'>('normCD')
  const [p, setP] = useState({ x: 0, lo: -1, hi: 1, mu: 0, sigma: 1, area: 0.95, N: 10, prob: 0.5, lambda: 3 })
  const [tail, setTail] = useState<'left' | 'right' | 'center'>('left')
  let result = NaN
  let error = ''
  try {
    switch (kind) {
      case 'normPD':
        result = normalPdf(p.x, p.mu, p.sigma)
        break
      case 'normCD':
        result = normalCdf(p.lo, p.hi, p.mu, p.sigma)
        break
      case 'invNorm':
        result = inverseNormal(p.area, p.mu, p.sigma, tail)
        break
      case 'binPD':
        result = binomialPd(p.x, p.N, p.prob)
        break
      case 'binCD':
        result = binomialCd(p.x, p.N, p.prob)
        break
      case 'poiPD':
        result = poissonPd(p.x, p.lambda)
        break
      case 'poiCD':
        result = poissonCd(p.x, p.lambda)
        break
    }
  } catch (e) {
    error = String(e)
  }
  const f = (key: keyof typeof p, label: string) => (
    <Row label={label}>
      <NumField value={p[key]} onChange={(v) => setP({ ...p, [key]: v })} />
    </Row>
  )
  const visualize = () => {
    const pdf = `exp(-0.5*((x-${p.mu})/${p.sigma})^2)/(${p.sigma}*sqrt(2*pi))`
    if (kind === 'normCD') visualizeArea(pdf, Math.max(p.lo, p.mu - 8 * p.sigma), Math.min(p.hi, p.mu + 8 * p.sigma), `P(${p.lo} ≤ X ≤ ${p.hi})`)
    else if (kind === 'normPD' || kind === 'invNorm') visualizeGraph('normal curve', [pdf])
    else {
      const b = new Builder()
      const n = kind.startsWith('bin') ? p.N : Math.ceil(p.lambda * 3 + 5)
      for (let k = 0; k <= Math.min(n, 60); k++) {
        const y = kind.startsWith('bin') ? binomialPd(k, p.N, p.prob) : poissonPd(k, p.lambda)
        const hi = kind.endsWith('CD') && k <= p.x
        const base = b.point([k, 0, 0], { auxiliary: true, visible: false })
        const top = b.point([k, y * 10, 0], { auxiliary: true, showLabel: false })
        b.segment(base.id, top.id, { color: hi || (kind.endsWith('PD') && k === p.x) ? themeColor('--warn') : themeColor('--accent'), showLabel: false })
      }
      b.text([0, -0.8, 0], 'bar heights ×10')
      b.commit()
      useScene.getState().setViewMode('2d')
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <select className="field" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
        <option value="normPD">Normal PD — f(x)</option>
        <option value="normCD">Normal CD — P(a ≤ X ≤ b)</option>
        <option value="invNorm">Inverse Normal — x for an area</option>
        <option value="binPD">Binomial PD — P(X = x)</option>
        <option value="binCD">Binomial CD — P(X ≤ x)</option>
        <option value="poiPD">Poisson PD — P(X = x)</option>
        <option value="poiCD">Poisson CD — P(X ≤ x)</option>
      </select>
      {(kind === 'normPD' || kind.startsWith('bin') || kind.startsWith('poi')) && f('x', 'x')}
      {kind === 'normCD' && (
        <>
          {f('lo', 'Lower')}
          {f('hi', 'Upper')}
        </>
      )}
      {kind === 'invNorm' && (
        <>
          {f('area', 'Area')}
          <Row label="Tail">
            <div className="seg">
              {(['left', 'right', 'center'] as const).map((t) => (
                <button key={t} className={tail === t ? 'on' : ''} onClick={() => setTail(t)}>
                  {t}
                </button>
              ))}
            </div>
          </Row>
        </>
      )}
      {kind.startsWith('norm') || kind === 'invNorm' ? (
        <>
          {f('sigma', 'σ')}
          {f('mu', 'μ')}
        </>
      ) : kind.startsWith('bin') ? (
        <>
          {f('N', 'N (trials)')}
          {f('prob', 'p')}
        </>
      ) : (
        f('lambda', 'λ')
      )}
      <Screen>
        {error ? <span className="text-[color:var(--lcd-bad)]">{error}</span> : <div className="text-right text-display">{calcNum(result)}</div>}
      </Screen>
      <button className="btn w-fit" onClick={visualize}>
        <Eye size={13} /> Visualize
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function TableMode() {
  const [fx, setFx] = useState('x^2 - 2x')
  const [gx, setGx] = useState('')
  const [range, setRange] = useState({ start: -3, end: 3, step: 0.5 })
  const rows = useMemo(() => {
    const out: { x: number; f: number | string; g: number | string }[] = []
    const count = Math.min(200, Math.floor((range.end - range.start) / range.step + 1e-9) + 1)
    for (let i = 0; i < count; i++) {
      const x = range.start + i * range.step
      const ev = (e: string) => {
        if (!e.trim()) return ''
        try {
          return Number(math.evaluate(casioToMath(e), { x }))
        } catch {
          return 'ERROR'
        }
      }
      out.push({ x, f: ev(fx), g: ev(gx) })
    }
    return out
  }, [fx, gx, range])
  return (
    <div className="flex flex-col gap-2">
      <Row label="f(x) =">
        <input className="field font-mono" value={fx} onChange={(e) => setFx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </Row>
      <Row label="g(x) =">
        <input className="field font-mono" value={gx} placeholder="optional" onChange={(e) => setGx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </Row>
      <div className="grid grid-cols-3 gap-1">
        {(['start', 'end', 'step'] as const).map((k) => (
          <div key={k} className="relative">
            <span className="pointer-events-none absolute left-1.5 top-1 text-fine text-[color:var(--text-faint)]">{k}</span>
            <NumField value={range[k]} onChange={(v) => setRange({ ...range, [k]: k === 'step' ? Math.max(1e-6, v) : v })} />
          </div>
        ))}
      </div>
      <div className="card max-h-64 overflow-auto">
        <table className="w-full font-mono text-small">
          <thead className="sticky top-0 bg-[color:var(--bg-2)] text-[color:var(--text-dim)]">
            <tr>
              <th className="px-2 py-1 text-right">x</th>
              <th className="px-2 py-1 text-right">f(x)</th>
              {gx.trim() && <th className="px-2 py-1 text-right">g(x)</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-surface-1">
                <td className="px-2 text-right text-[color:var(--text-dim)]">{calcNum(r.x)}</td>
                <td className="px-2 text-right">{typeof r.f === 'number' ? calcNum(r.f) : r.f}</td>
                {gx.trim() && <td className="px-2 text-right">{typeof r.g === 'number' ? calcNum(r.g) : r.g}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="btn w-fit"
        onClick={() => {
          visualizeGraph(`f(x) = ${fx}`, [casioToMath(fx)], 'explicit', { name: 'f' })
          if (gx.trim()) visualizeGraph(`g(x) = ${gx}`, [casioToMath(gx)], 'explicit', { name: 'g' })
        }}
      >
        <Eye size={13} /> Visualize graphs
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function EquationMode() {
  const [kind, setKind] = useState<'simul' | 'poly'>('simul')
  const [n, setN] = useState(2)
  const [A, setA] = useState<number[][]>([
    [2, 1, 7],
    [1, -1, 2],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ].map((r) => [...r, 0, 0, 0, 0]))
  const [deg, setDeg] = useState(2)
  const [coef, setCoef] = useState<number[]>([1, -5, 6, 0, 0, 0, 0])
  const letters = ['x', 'y', 'z', 't', 'u', 'v']

  let out: React.ReactNode = null
  let visualize: (() => void) | null = null
  try {
    if (kind === 'simul') {
      const M = A.slice(0, n).map((r) => r.slice(0, n))
      const bvec = A.slice(0, n).map((r) => r[n])
      const sol = solveLinearSystem(M, bvec)
      out = sol.map((v, i) => (
        <div key={i} className="flex justify-between">
          <span>{letters[i]} =</span>
          <span>{exactForm(v) ? <Tex tex={exactForm(v)!} /> : calcNum(v)}</span>
        </div>
      ))
      if (n === 2) {
        visualize = () => {
          const [[a1, b1], [a2, b2]] = M
          visualizeGraph(`${a1}x + ${b1}y = ${bvec[0]}`, [`${a1}*x + ${b1}*y - (${bvec[0]})`], 'implicit', { name: 'eq1' })
          visualizeGraph(`${a2}x + ${b2}y = ${bvec[1]}`, [`${a2}*x + ${b2}*y - (${bvec[1]})`], 'implicit', { name: 'eq2' })
          const b = new Builder()
          b.point([sol[0], sol[1], 0], { name: 'S' })
          b.commit()
        }
      }
    } else {
      const c = coef.slice(0, deg + 1)
      const roots = polyRoots(c)
      const expr = polyToExpr(c)
      out = (
        <>
          {roots.map((r, i) => (
            <div key={i} className="flex justify-between">
              <span>x{i + 1} =</span>
              <span>
                {r.im === 0 ? exactForm(r.re) ? <Tex tex={exactForm(r.re)!} /> : calcNum(r.re) : `${calcNum(r.re)} ${r.im < 0 ? '−' : '+'} ${calcNum(Math.abs(r.im))}i`}
              </span>
            </div>
          ))}
          {deg === 2 && c[0] !== 0 && (
            <div className="mt-1 border-t border-[color:var(--lcd-line)] pt-1 text-small">
              Turning point: ({calcNum(-c[1] / (2 * c[0]))}, {calcNum(c[2] - (c[1] * c[1]) / (4 * c[0]))}) · discriminant b²−4ac = {calcNum(c[1] * c[1] - 4 * c[0] * c[2])}
            </div>
          )}
        </>
      )
      visualize = () => visualizeGraph(`y = ${expr}`, [expr], 'explicit')
    }
  } catch (e) {
    out = <span className="text-[color:var(--lcd-bad)]">{e instanceof Error ? e.message : String(e)}</span>
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="seg w-fit">
        <button className={kind === 'simul' ? 'on' : ''} onClick={() => setKind('simul')}>
          Simultaneous
        </button>
        <button className={kind === 'poly' ? 'on' : ''} onClick={() => setKind('poly')}>
          Polynomial
        </button>
      </div>
      {kind === 'simul' ? (
        <>
          <Row label="Unknowns">
            <div className="seg">
              {[2, 3, 4, 5, 6].map((k) => (
                <button key={k} className={n === k ? 'on' : ''} onClick={() => setN(k)}>
                  {k}
                </button>
              ))}
            </div>
          </Row>
          <div className="card overflow-auto p-2">
            {A.slice(0, n).map((row, i) => (
              <div key={i} className="mb-1 flex items-center gap-1">
                {row.slice(0, n).map((v, j) => (
                  <span key={j} className="flex items-center gap-0.5">
                    <NumField className="w-14" value={v} onChange={(x) => setA(A.map((r, a) => r.map((q, b) => (a === i && b === j ? x : q))))} />
                    <i className="text-[color:var(--text-dim)]">{letters[j]}</i>
                    {j < n - 1 && <span className="text-[color:var(--text-faint)]">+</span>}
                  </span>
                ))}
                <span className="px-1 text-[color:var(--text-dim)]">=</span>
                <NumField className="w-14" value={row[n]} onChange={(x) => setA(A.map((r, a) => r.map((q, b) => (a === i && b === n ? x : q))))} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Row label="Degree">
            <div className="seg">
              {[2, 3, 4, 5, 6].map((k) => (
                <button key={k} className={deg === k ? 'on' : ''} onClick={() => setDeg(k)}>
                  {k}
                </button>
              ))}
            </div>
          </Row>
          <div className="card flex flex-wrap items-center gap-1 p-2">
            {coef.slice(0, deg + 1).map((v, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <NumField className="w-14" value={v} onChange={(x) => setCoef(coef.map((q, j) => (j === i ? x : q)))} />
                <i className="text-[color:var(--text-dim)]">{deg - i > 1 ? `x${'⁰¹²³⁴⁵⁶'[deg - i]}` : deg - i === 1 ? 'x' : ''}</i>
                {i < deg && <span className="text-[color:var(--text-faint)]">+</span>}
              </span>
            ))}
            <span className="text-[color:var(--text-dim)]">= 0</span>
          </div>
        </>
      )}
      <Screen>{out}</Screen>
      {visualize && (
        <button className="btn w-fit" onClick={visualize}>
          <Eye size={13} /> Visualize
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function InequalityMode() {
  const [deg, setDeg] = useState(2)
  const [coef, setCoef] = useState([1, -5, 6, 0, 0])
  const [op, setOp] = useState<'<' | '<=' | '>' | '>='>('<')
  const c = coef.slice(0, deg + 1)
  let text = ''
  try {
    const iv = polyInequality(c, op)
    const f = (v: number) => (Number.isFinite(v) ? calcNum(v) : v > 0 ? '∞' : '−∞')
    text = iv.length
      ? iv.map((r) => (r.from === r.to ? `x = ${f(r.from)}` : !Number.isFinite(r.from) && !Number.isFinite(r.to) ? 'All real numbers' : !Number.isFinite(r.from) ? `x ${r.closedTo ? '≤' : '<'} ${f(r.to)}` : !Number.isFinite(r.to) ? `x ${r.closedFrom ? '≥' : '>'} ${f(r.from)}` : `${f(r.from)} ${r.closedFrom ? '≤' : '<'} x ${r.closedTo ? '≤' : '<'} ${f(r.to)}`)).join('   or   ')
      : 'No solution'
  } catch (e) {
    text = String(e)
  }
  const expr = polyToExpr(c)
  return (
    <div className="flex flex-col gap-2">
      <Row label="Degree">
        <div className="seg">
          {[2, 3, 4].map((k) => (
            <button key={k} className={deg === k ? 'on' : ''} onClick={() => setDeg(k)}>
              {k}
            </button>
          ))}
        </div>
      </Row>
      <div className="card flex flex-wrap items-center gap-1 p-2">
        {c.map((v, i) => (
          <span key={i} className="flex items-center gap-0.5">
            <NumField className="w-14" value={v} onChange={(x) => setCoef(coef.map((q, j) => (j === i ? x : q)))} />
            <i className="text-[color:var(--text-dim)]">{deg - i > 1 ? `x${'⁰¹²³⁴'[deg - i]}` : deg - i === 1 ? 'x' : ''}</i>
            {i < deg && <span className="text-[color:var(--text-faint)]">+</span>}
          </span>
        ))}
        <select className="field w-14" value={op} onChange={(e) => setOp(e.target.value as typeof op)}>
          <option value="<">&lt;</option>
          <option value="<=">≤</option>
          <option value=">">&gt;</option>
          <option value=">=">≥</option>
        </select>
        <span className="text-[color:var(--text-dim)]">0</span>
      </div>
      <Screen>
        <div className="text-lead">{text}</div>
      </Screen>
      <button
        className="btn w-fit"
        onClick={() => {
          visualizeGraph(`y = ${expr}`, [expr], 'explicit')
          visualizeGraph(`${expr} ${op} 0`, [expr], 'inequality', { op, color: themeColor('--good') })
        }}
      >
        <Eye size={13} /> Visualize
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------

function RatioMode() {
  const [v, setV] = useState({ a: 3, b: 4, c: 9, d: 0 })
  const [unknown, setUnknown] = useState<'c' | 'd'>('d')
  const result = unknown === 'd' ? (v.b * v.c) / v.a : (v.a * v.d) / v.b
  return (
    <div className="flex flex-col gap-2">
      <div className="seg w-fit">
        <button className={unknown === 'd' ? 'on' : ''} onClick={() => setUnknown('d')}>
          A : B = C : X
        </button>
        <button className={unknown === 'c' ? 'on' : ''} onClick={() => setUnknown('c')}>
          A : B = X : D
        </button>
      </div>
      <div className="flex items-center gap-1">
        <NumField className="w-16" value={v.a} onChange={(x) => setV({ ...v, a: x })} />
        <b>:</b>
        <NumField className="w-16" value={v.b} onChange={(x) => setV({ ...v, b: x })} />
        <b>=</b>
        {unknown === 'd' ? <NumField className="w-16" value={v.c} onChange={(x) => setV({ ...v, c: x })} /> : <span className="w-16 text-center text-[color:var(--warn)]">X</span>}
        <b>:</b>
        {unknown === 'c' ? <NumField className="w-16" value={v.d} onChange={(x) => setV({ ...v, d: x })} /> : <span className="w-16 text-center text-[color:var(--warn)]">X</span>}
      </div>
      <Screen>
        <div className="text-right text-display">X = {calcNum(result)}</div>
      </Screen>
    </div>
  )
}

// ---------------------------------------------------------------------------

const COLS = ['A', 'B', 'C', 'D', 'E']

function SheetMode() {
  const [cells, setCells] = useState<Record<string, string>>({ A1: '1', A2: '2', A3: '3', B1: '=A1^2', B2: '=A2^2', B3: '=A3^2', C1: '=sum(B1:B3)' })
  const [edit, setEdit] = useState<string | null>(null)
  const values = useMemo(() => {
    const vals: Record<string, number | string> = {}
    const evalCell = (id: string, depth = 0): number | string => {
      if (id in vals) return vals[id]
      const raw = cells[id] ?? ''
      if (depth > 50) return 'CIRC'
      if (!raw.startsWith('=')) {
        const n = Number(raw)
        vals[id] = raw === '' ? '' : Number.isFinite(n) ? n : raw
        return vals[id]
      }
      try {
        const expr = raw.slice(1).replace(/([A-E])(\d+):([A-E])(\d+)/g, (_m, c1, r1, c2, r2) => {
          const list: string[] = []
          for (let c = COLS.indexOf(c1); c <= COLS.indexOf(c2); c++) for (let r = Number(r1); r <= Number(r2); r++) list.push(`${COLS[c]}${r}`)
          return `[${list.join(',')}]`
        })
        const scope: Record<string, number> = {}
        for (const ref of expr.match(/\b[A-E]\d+\b/g) ?? []) {
          const v = evalCell(ref, depth + 1)
          scope[ref] = typeof v === 'number' ? v : 0
        }
        const r = Number(math.evaluate(casioToMath(expr), scope))
        vals[id] = Number.isFinite(r) ? r : 'ERROR'
      } catch {
        vals[id] = 'ERROR'
      }
      return vals[id]
    }
    for (let r = 1; r <= 15; r++) for (const c of COLS) evalCell(`${c}${r}`)
    return vals
  }, [cells])
  return (
    <div className="flex flex-col gap-2">
      <div className="text-fine text-[color:var(--text-faint)]">Type numbers or formulas starting with = (e.g. =A1*2, =sum(A1:A5), =mean(B1:B4)).</div>
      <div className="card overflow-auto">
        <table className="w-full font-mono text-small">
          <thead className="bg-[color:var(--bg-2)] text-[color:var(--text-dim)]">
            <tr>
              <th className="w-6" />
              {COLS.map((c) => (
                <th key={c} className="py-1">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }, (_, r) => (
              <tr key={r}>
                <td className="text-center text-[color:var(--text-faint)]">{r + 1}</td>
                {COLS.map((c) => {
                  const id = `${c}${r + 1}`
                  return (
                    <td key={id} className="border border-[color:var(--line)] p-0">
                      {edit === id ? (
                        <input
                          autoFocus
                          className="w-full bg-[color:var(--input-bg)] px-1 outline-none"
                          defaultValue={cells[id] ?? ''}
                          onBlur={(e) => {
                            setCells({ ...cells, [id]: e.target.value })
                            setEdit(null)
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                        />
                      ) : (
                        <div className="min-h-5 cursor-cell px-1 text-right" onClick={() => setEdit(id)}>
                          {typeof values[id] === 'number' ? calcNum(values[id] as number) : values[id]}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

const UNIT_PRESETS: [string, string[]][] = [
  ['Length', ['m', 'cm', 'mm', 'km', 'inch', 'ft', 'yard', 'mile', 'angstrom', 'lightyear']],
  ['Mass', ['kg', 'g', 'mg', 'tonne', 'lb', 'oz', 'u']],
  ['Time', ['s', 'ms', 'minute', 'hour', 'day', 'year']],
  ['Speed', ['m/s', 'km/h', 'mi/h', 'ft/s', 'knot']],
  ['Force', ['N', 'kN', 'dyn', 'lbf', 'kgf']],
  ['Energy', ['J', 'kJ', 'cal', 'kcal', 'eV', 'kWh', 'erg', 'BTU']],
  ['Power', ['W', 'kW', 'hp']],
  ['Pressure', ['Pa', 'kPa', 'bar', 'atm', 'mmHg', 'psi', 'torr']],
  ['Temperature', ['degC', 'K', 'degF']],
  ['Angle', ['deg', 'rad', 'grad']],
  ['Area', ['m^2', 'cm^2', 'km^2', 'hectare', 'acre']],
  ['Volume', ['m^3', 'L', 'mL', 'cm^3', 'gallon']],
  ['Charge & current', ['C', 'mC', 'uC', 'A', 'mA']]
]

function UnitsMode() {
  const [value, setValue] = useState(72)
  const [cat, setCat] = useState(3)
  const [from, setFrom] = useState('km/h')
  const [to, setTo] = useState('m/s')
  const [free, setFree] = useState('5 N m to J')
  let result = ''
  try {
    result = calcNum(Number(math.unit(value, from).toNumber(to)))
  } catch (e) {
    result = String(e instanceof Error ? e.message : e)
  }
  let freeOut = ''
  try {
    freeOut = math.format(math.evaluate(free), { precision: 10 })
  } catch (e) {
    freeOut = String(e instanceof Error ? e.message : e)
  }
  const units = UNIT_PRESETS[cat][1]
  return (
    <div className="flex flex-col gap-2">
      <select
        className="field"
        value={cat}
        onChange={(e) => {
          const i = Number(e.target.value)
          setCat(i)
          setFrom(UNIT_PRESETS[i][1][0])
          setTo(UNIT_PRESETS[i][1][1])
        }}
      >
        {UNIT_PRESETS.map(([n], i) => (
          <option key={n} value={i}>
            {n}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <NumField className="w-28" value={value} onChange={setValue} />
        <select className="field w-28" value={from} onChange={(e) => setFrom(e.target.value)}>
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <span className="text-[color:var(--text-dim)]">→</span>
        <select className="field w-28" value={to} onChange={(e) => setTo(e.target.value)}>
          {units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      <Screen>
        <div className="text-right text-display">
          {result} {to}
        </div>
      </Screen>
      <div className="text-[color:var(--text-dim)]">Or type any conversion (any units, even combined):</div>
      <input className="field font-mono" value={free} onChange={(e) => setFree(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <Screen>
        <div className="text-right">{freeOut}</div>
      </Screen>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ConstMode() {
  const [q, setQ] = useState('')
  const list = CONSTANTS.filter((c) => !q || `${c.name} ${c.symbol} ${c.id}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search size={13} className="absolute left-2 top-1.5 text-[color:var(--text-faint)]" />
        <input className="field pl-7" placeholder="Search constants…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <div className="card min-h-0 overflow-auto">
        {list.map((c) => (
          <button
            key={c.id}
            className="grid w-full grid-cols-[28px_52px_1fr_auto] items-baseline gap-2 px-2 py-1 text-left hover:bg-[color:var(--sel-row)]"
            title={`Insert ${c.id} into the calculator`}
            onClick={() => useCalc.getState().insert(c.id)}
          >
            <span className="text-[color:var(--text-faint)]">{String(c.no).padStart(2, '0')}</span>
            <span className="font-semibold text-[color:var(--text-strong)]">{c.symbol}</span>
            <span className="truncate text-[color:var(--text)]">{c.name}</span>
            <span className="font-mono text-fine text-[color:var(--code-text)]">
              {calcNum(c.value)} {c.unit}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function MeasureMode() {
  const [num, setNum] = useState('0.004560')
  const [sig, setSig] = useState(3)
  const [a, setA] = useState({ value: 5.2, unc: 0.1 })
  const [b, setB] = useState({ value: 2.1, unc: 0.05 })
  const [op, setOp] = useState<'+' | '-' | '×' | '÷' | '^'>('×')
  const [power, setPower] = useState(2)
  const [unitExpr, setUnitExpr] = useState('kg*m^2/s^2')

  let sf: { count: number; explanation: string } | string
  try {
    sf = countSigFigs(num)
  } catch (e) {
    sf = String(e instanceof Error ? e.message : e)
  }
  const numVal = Number(num.replace(/[×x]\s*10\^?/i, 'e'))
  const prop = propagate(op, a, op === '^' ? power : b)
  let dims = ''
  try {
    dims = dimensionsOf(unitExpr)
  } catch (e) {
    dims = String(e instanceof Error ? e.message : e)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-2">
        <div className="section-title px-0">Significant figures</div>
        <input className="field font-mono" value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        {typeof sf === 'string' ? (
          <div className="mt-1 text-[color:var(--bad)]">{sf}</div>
        ) : (
          <div className="mt-1 text-[color:var(--text)]">
            <b className="text-[color:var(--text-strong)]">{sf.count}</b> significant figure{sf.count === 1 ? '' : 's'}. <span className="text-[color:var(--text-dim)]">{sf.explanation}</span>
            <div className="mt-1">Scientific notation: {Number.isFinite(numVal) ? numVal.toExponential(Math.max(0, sf.count - 1)).replace('e', ' × 10^') : '—'}</div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          Round to
          <NumField className="w-14" value={sig} onChange={(v) => setSig(Math.max(1, Math.min(15, Math.round(v))))} />
          sig. figs → <b className="font-mono text-[color:var(--code-text)]">{Number.isFinite(numVal) ? roundSig(numVal, sig) : '—'}</b>
        </div>
      </div>

      <div className="card p-2">
        <div className="section-title px-0">Uncertainty in results</div>
        <div className="flex flex-wrap items-center gap-1">
          (<NumField className="w-16" value={a.value} onChange={(v) => setA({ ...a, value: v })} /> ±
          <NumField className="w-14" value={a.unc} onChange={(v) => setA({ ...a, unc: v })} />)
          <select className="field w-12" value={op} onChange={(e) => setOp(e.target.value as typeof op)}>
            {['+', '-', '×', '÷', '^'].map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
          {op === '^' ? (
            <NumField className="w-14" value={power} onChange={setPower} />
          ) : (
            <>
              (<NumField className="w-16" value={b.value} onChange={(v) => setB({ ...b, value: v })} /> ±
              <NumField className="w-14" value={b.unc} onChange={(v) => setB({ ...b, unc: v })} />)
            </>
          )}
        </div>
        <div className="mt-2 text-lead text-[color:var(--text-strong)]">
          = {calcNum(prop.value)} ± {calcNum(prop.unc)} <span className="text-[color:var(--text-dim)]">({calcNum((100 * prop.unc) / Math.abs(prop.value))} %)</span>
        </div>
        <div className="text-[color:var(--text-dim)]">{prop.rule}</div>
      </div>

      <div className="card p-2">
        <div className="section-title px-0">Dimensions of a unit</div>
        <input className="field font-mono" value={unitExpr} onChange={(e) => setUnitExpr(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <div className="mt-1 text-lead text-[color:var(--text-strong)]">{dims}</div>
        <div className="text-[color:var(--text-faint)]">Try N, J, W, Pa, m/s^2, N*m^2/kg^2. Both sides of a correct equation must have the same dimensions.</div>
      </div>
    </div>
  )
}
