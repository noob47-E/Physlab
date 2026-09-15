// Vector Calculator: vectors typed in natural textbook math, one-click operations,
// big answers with optional steps, and "Draw on graph" with full measurements.

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Eye, Plus, Sigma, Trash2 } from 'lucide-react'
import { create } from 'zustand'
import { useScene } from '../core/store'
import { visualizeSolution, type DrawStyle } from '../core/visualize'
import { latexToMath } from '../math/latexToMath'
import { math, preprocess, setAngleMode, toV3 } from '../math/expr'
import { formatMeasure, texIJK } from '../math/format'
import { fromPolar, heading, len, toRad, type V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'
import { MathInput, type MathInputHandle } from '../ui/MathInput'
import { Tex } from '../ui/Tex'

type Entry = 'comp' | 'polar' | 'scene'

interface Card {
  id: number
  name: string
  entry: Entry
  latex: string
  mag: string
  angle: string
  sceneId: string
}

let nextCard = 3

interface VCState {
  cards: Card[]
  expr: string
  k: string
  q: string
  style: DrawStyle
  result: { sol: VS.Solution; label: string } | null
  showSteps: boolean
}

const useVC = create<VCState>(() => ({
  cards: [
    { id: 1, name: 'A', entry: 'comp', latex: '3\\hat{i}+4\\hat{j}', mag: '10', angle: '30', sceneId: '' },
    { id: 2, name: 'B', entry: 'polar', latex: '', mag: '5', angle: '120', sceneId: '' }
  ],
  expr: '\\vec{A}+\\vec{B}',
  k: '2',
  q: '1.6\\times10^{-19}',
  style: 'head-to-tail',
  result: null,
  showSteps: false
}))

const UNIT_VECTORS = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }

function evalNumber(latex: string): number {
  const v = math.evaluate(preprocess(latexToMath(latex)))
  const n = typeof v === 'number' ? v : Number((v as { toNumber?: () => number }).toNumber?.() ?? v)
  if (!Number.isFinite(n)) throw new Error('Not a number')
  return n
}

/** The vector value of a card, or an error message. */
function cardValue(card: Card, cards: Card[]): V3 | string {
  try {
    setAngleMode('deg')
    if (card.entry === 'polar') return fromPolar(evalNumber(card.mag), toRad(evalNumber(card.angle)))
    if (card.entry === 'scene') {
      const c = useScene.getState().ev.values.get(card.sceneId)
      if (c?.type === 'vector') return c.comp
      return 'Pick a vector from the drawing'
    }
    if (!card.latex.trim()) return 'Type the vector, e.g. 3î + 4ĵ or 10∠30°'
    const scope: Record<string, unknown> = { ...UNIT_VECTORS }
    for (const other of cards) {
      if (other.id === card.id) break
      const v = cardValue(other, cards)
      if (typeof v !== 'string') scope[other.name] = v
    }
    return toV3(math.evaluate(preprocess(latexToMath(card.latex, { vectorOps: true })), scope))
  } catch (e) {
    return e instanceof Error ? e.message.replace(/^Undefined symbol/, 'Unknown name') : 'Cannot read this vector'
  }
}

const OPS: { id: string; label: string; tex: string; need: number; help: string }[] = [
  { id: 'sum', label: 'Add all', tex: '\\vec{A}+\\vec{B}+\\dots', need: 2, help: 'Resultant by rectangular components' },
  { id: 'sub', label: 'Subtract', tex: '\\vec{A}-\\vec{B}', need: 2, help: 'A + (−B)' },
  { id: 'scale', label: 'Scalar ×', tex: 'k\\vec{A}', need: 1, help: 'Multiply by k' },
  { id: 'dot', label: 'Dot', tex: '\\vec{A}\\cdot\\vec{B}', need: 2, help: 'Scalar product and angle between' },
  { id: 'cross', label: 'Cross', tex: '\\vec{A}\\times\\vec{B}', need: 2, help: 'Vector product and parallelogram area' },
  { id: 'mag', label: 'Size & angle', tex: '|\\vec{A}|,\\ \\theta', need: 1, help: 'Magnitude and direction' },
  { id: 'unit', label: 'Unit vector', tex: '\\hat{A}', need: 1, help: 'Direction with length 1' },
  { id: 'angle', label: 'Angle between', tex: '\\theta_{AB}', need: 2, help: 'cos θ = A·B / AB' },
  { id: 'proj', label: 'Projection', tex: '\\mathrm{proj}_{A}\\vec{B}', need: 2, help: 'Shadow of B on A' },
  { id: 'resolve', label: 'Components', tex: 'A_x,\\ A_y', need: 1, help: 'Aₓ = A cos θ, A_y = A sin θ' },
  { id: 'equil', label: 'Equilibrium', tex: '\\vec{E}=-\\sum\\vec{F}', need: 1, help: 'Force that balances all' },
  { id: 'torque', label: 'Torque', tex: '\\vec{\\tau}=\\vec{r}\\times\\vec{F}', need: 2, help: 'First card = r, second = F' },
  { id: 'work', label: 'Work', tex: 'W=\\vec{F}\\cdot\\vec{d}', need: 2, help: 'First card = F, second = d' },
  { id: 'lorentz', label: 'Magnetic force', tex: 'q(\\vec{v}\\times\\vec{B})', need: 2, help: 'First card = v, second = B, charge q' },
  { id: 'relvel', label: 'Relative velocity', tex: '\\vec{v}_{AB}=\\vec{v}_A-\\vec{v}_B', need: 2, help: 'Velocity of A as seen from B' }
]

export function VectorCalc() {
  const st = useVC()
  const settings = useScene((s) => s.settings)
  const objects = useScene((s) => s.objects)
  const [error, setError] = useState('')
  const exprRef = useRef<MathInputHandle>(null)
  const set = useVC.setState

  const values = useMemo(() => st.cards.map((c) => cardValue(c, st.cards)), [st.cards, objects])
  const named = (): VS.NamedVec[] => st.cards.map((c, i) => ({ name: c.name, v: values[i] as V3 })).filter((_, i) => typeof values[i] !== 'string')
  const sceneVectors = Object.values(objects).filter((o) => o.type === 'vector')

  const updateCard = (id: number, patch: Partial<Card>) => set({ cards: st.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const run = (op: string) => {
    setError('')
    const vs = named()
    const info = OPS.find((o) => o.id === op)!
    if (vs.length < info.need) {
      setError(`${info.label} needs ${info.need} valid vector${info.need > 1 ? 's' : ''}. Fix the red cards first.`)
      return
    }
    try {
      let sol: VS.Solution
      const [A, B] = vs
      switch (op) {
        case 'sum':
          sol = VS.solveAddition(vs)
          break
        case 'sub':
          sol = VS.solveSubtraction(A, B)
          break
        case 'scale':
          sol = VS.solveScalarMultiply(evalNumber(st.k), A)
          break
        case 'dot':
        case 'angle':
          sol = VS.solveDot(A, B)
          break
        case 'cross':
          sol = VS.solveCross(A, B)
          break
        case 'mag':
          sol = VS.solveMagnitudeDirection(A)
          break
        case 'unit':
          sol = VS.solveUnitVector(A)
          break
        case 'proj':
          sol = VS.solveProjection(B, A)
          break
        case 'resolve':
          sol = VS.solveComponents(A.name, len(A.v), (heading(A.v) * 180) / Math.PI)
          break
        case 'equil':
          sol = VS.solveEquilibrium(vs)
          break
        case 'torque':
          sol = VS.solveTorque(A.v, B.v)
          break
        case 'work':
          sol = VS.solveWork(A.v, B.v)
          break
        case 'lorentz':
          sol = VS.solveMagneticForce(evalNumber(st.q), A.v, B.v)
          break
        case 'relvel': {
          const s = VS.solveSubtraction({ name: `v_${A.name}`, v: A.v }, { name: `v_${B.name}`, v: B.v }, `v_{${A.name}${B.name}}`)
          sol = { ...s, title: `Velocity of ${A.name} relative to ${B.name}` }
          break
        }
        default:
          return
      }
      set({ result: { sol, label: info.label } })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Free expression: A + 2B − C, A × B, |A|… */
  const runExpr = () => {
    setError('')
    try {
      setAngleMode('deg')
      const scope: Record<string, unknown> = { ...UNIT_VECTORS }
      st.cards.forEach((c, i) => {
        if (typeof values[i] !== 'string') scope[c.name] = values[i]
      })
      const src = preprocess(latexToMath(st.expr, { vectorOps: true }))
      const node = math.parse(src)
      const out = node.compile().evaluate(scope)
      if (typeof out === 'number') {
        set({
          result: {
            label: 'Expression',
            sol: { title: 'Result', steps: [{ tex: `${st.expr} = ${formatMeasure(out, 'number', settings)}` }], answers: [{ label: 'value', tex: formatMeasure(out, 'number', settings) }] }
          }
        })
        return
      }
      const v = toV3(out)
      const inputs = st.cards.map((c, i) => ({ name: c.name, v: values[i] })).filter((x): x is { name: string; v: V3 } => typeof x.v !== 'string' && new RegExp(`\\b${x.name}\\b`).test(src))
      const sol: VS.Solution = {
        title: 'Resultant of the expression',
        steps: [{ text: 'Evaluate component by component:', tex: `\\vec{R} = ${st.expr} = ${texIJK(v, 4)}` }, ...VS.solveMagnitudeDirection({ name: 'R', v }).steps.slice(1)],
        answers: [{ label: 'R', tex: texIJK(v, 4) }, ...VS.solveMagnitudeDirection({ name: 'R', v }).answers],
        visual: { vectors: [...inputs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: 'R', v, role: 'result' as const, color: '#ffd43b' }], mode: 'common-tail' }
      }
      set({ result: { sol, label: 'Expression' } })
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Undefined symbol/, 'Unknown name') : String(e))
    }
  }

  return (
    <div className="panel pb-8">
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <Sigma size={16} className="text-sky-300" />
        <div className="font-semibold text-white">Vector Calculator</div>
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-500">Type like a textbook: 3î + 4ĵ, 10∠30°, ½A</span>
      </div>

      {st.cards.map((card, idx) => {
        const v = values[idx]
        const ok = typeof v !== 'string'
        return (
          <div key={card.id} className={`card p-2 ${ok ? '' : 'border-red-500/50'}`}>
            <div className="mb-1.5 flex items-center gap-2">
              <input
                className="field w-11 text-center text-[15px] font-semibold italic"
                style={{ fontFamily: 'Cambria, serif' }}
                value={card.name}
                onChange={(e) => updateCard(card.id, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 4) || card.name })}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="seg">
                {(
                  [
                    ['comp', 'î ĵ k̂'],
                    ['polar', 'size ∠ angle'],
                    ['scene', 'from drawing']
                  ] as [Entry, string][]
                ).map(([k, l]) => (
                  <button key={k} className={card.entry === k ? 'on' : ''} onClick={() => updateCard(card.id, { entry: k })}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              {st.cards.length > 1 && (
                <button className="text-zinc-500 hover:text-red-400" title="Remove" onClick={() => set({ cards: st.cards.filter((c) => c.id !== card.id) })}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {card.entry === 'comp' && (
              <MathInput value={card.latex} onChange={(l) => updateCard(card.id, { latex: l })} onEnter={() => run('sum')} placeholder="3i + 4j" />
            )}
            {card.entry === 'polar' && (
              <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                <MathInput size="sm" value={card.mag} onChange={(l) => updateCard(card.id, { mag: l })} placeholder="size" />
                <span className="text-lg text-zinc-400">∠</span>
                <MathInput size="sm" value={card.angle} onChange={(l) => updateCard(card.id, { angle: l })} placeholder="angle" />
                <span className="text-zinc-400">°</span>
              </div>
            )}
            {card.entry === 'scene' && (
              <select className="field" value={card.sceneId} onChange={(e) => updateCard(card.id, { sceneId: e.target.value, name: objects[e.target.value]?.name ?? card.name })}>
                <option value="">— pick a vector on the drawing —</option>
                {sceneVectors.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <div className="mt-1 min-h-5 pl-1 text-[13px]">
              {ok ? (
                <span className="text-zinc-300">
                  <Tex tex={`\\vec{${card.name}} = ${texIJK(v as V3, 4)}`} />
                  <span className="ml-3 text-zinc-400">
                    |{card.name}| = {formatMeasure(len(v as V3), 'length', settings)}
                    {Math.abs((v as V3)[2]) < 1e-12 && <> · θ = {formatMeasure(heading(v as V3), 'angle', settings)}</>}
                  </span>
                </span>
              ) : (
                <span className="text-red-400">{v as string}</span>
              )}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-2 px-2">
        <button
          className="btn ghost"
          onClick={() => {
            const used = new Set(st.cards.map((c) => c.name))
            const name = 'ABCDEFGHJKLMNPQRSTUVW'.split('').find((l) => !used.has(l)) ?? `V${nextCard}`
            set({ cards: [...st.cards, { id: nextCard++, name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '' }] })
          }}
        >
          <Plus size={13} /> Add vector
        </button>
        <div className="flex-1" />
        <span className="text-zinc-400">k =</span>
        <div className="w-20">
          <MathInput size="sm" value={st.k} onChange={(l) => set({ k: l })} />
        </div>
        <span className="text-zinc-400">q =</span>
        <div className="w-28">
          <MathInput size="sm" value={st.q} onChange={(l) => set({ q: l })} />
        </div>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 px-2">
        {OPS.map((op) => (
          <button key={op.id} className="btn h-auto flex-col items-start gap-0 py-1 text-left" title={op.help} onClick={() => run(op.id)}>
            <span className="text-[12px] text-white">{op.label}</span>
            <span className="text-[11px] text-zinc-400">
              <Tex tex={op.tex} />
            </span>
          </button>
        ))}
      </div>

      <div className="card mt-2 p-2">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">Or type any vector expression</div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <MathInput ref={exprRef} value={st.expr} onChange={(l) => set({ expr: l })} onEnter={runExpr} />
          </div>
          <button className="btn primary h-9" onClick={runExpr}>
            =
          </button>
        </div>
      </div>

      {error && <div className="mx-3 mt-2 rounded bg-red-500/10 px-2 py-1 text-red-300">{error}</div>}

      {st.result && (
        <div className="card mt-2 border-amber-400/40 bg-amber-400/5">
          <div className="flex items-center gap-2 border-b border-amber-400/20 px-2 py-1.5">
            <span className="flex-1 font-semibold text-amber-200">{st.result.sol.title}</span>
          </div>
          <div className="px-3 py-2">
            {st.result.sol.answers.map((a) => (
              <div key={a.label} className="flex items-baseline gap-3 py-0.5">
                <span className="w-24 shrink-0 text-zinc-400">{a.label}</span>
                <Tex tex={a.tex} className="text-[18px] text-white" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-amber-400/20 px-2 py-1.5">
            {st.result.sol.visual && (
              <>
                <button className="btn primary" onClick={() => visualizeSolution(st.result!.sol, st.style)}>
                  <Eye size={13} /> Draw on graph
                </button>
                <div className="seg">
                  {(
                    [
                      ['head-to-tail', 'Head-to-tail'],
                      ['parallelogram', 'Parallelogram'],
                      ['common-tail', 'From origin']
                    ] as [DrawStyle, string][]
                  ).map(([k, l]) => (
                    <button key={k} className={st.style === k ? 'on' : ''} onClick={() => set({ style: k })}>
                      {l}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="flex-1" />
            <button className="btn ghost" onClick={() => set({ showSteps: !st.showSteps })}>
              {st.showSteps ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Steps
            </button>
          </div>
          {st.showSteps && (
            <ol className="steps space-y-1 px-2 pb-2">
              {st.result.sol.steps.map((s, i) => (
                <li key={i} className="rounded bg-black/20 px-2 py-1.5">
                  <span className="mr-2 text-[11px] text-zinc-500">{i + 1}.</span>
                  {s.text && <span className="text-zinc-300">{s.text}</span>}
                  {s.tex && <Tex tex={s.tex} display />}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
