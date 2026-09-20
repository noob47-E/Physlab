// Vector Calculator: vectors typed in natural textbook math, one-click operations,
// big answers with optional steps, and "Draw on graph" with full measurements.
//
// The panel is kept calm on purpose: the answer sits straight under the vector cards, six
// everyday operations are visible and the rest wait behind "More", and k and q only appear
// beside the operations that use them. Fifteen buttons plus two fields plus an expression box
// used to push the answer below the fold of a 430 px panel.

import { useEffect, useMemo, useRef, useState } from 'react'
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

const DEFAULT_CARDS: Card[] = [
  { id: 1, name: 'A', entry: 'comp', latex: '3\\hat{i}+4\\hat{j}', mag: '10', angle: '30', sceneId: '' },
  { id: 2, name: 'B', entry: 'polar', latex: '', mag: '5', angle: '120', sceneId: '' }
]

// ---------------------------------------------------------------------------
// The cards survive a restart: a student comes back to the vectors of the problem they were on.
// ---------------------------------------------------------------------------

const CARDS_KEY = 'physlab.vectors.cards'

function loadCards(): Card[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY)
    if (!raw) return DEFAULT_CARDS
    const cards = JSON.parse(raw) as Card[]
    // A card that read a vector from a drawing that is no longer open would show an error; it
    // comes back as a typed card so the panel opens clean.
    const usable = cards.filter((c) => c && typeof c.name === 'string' && typeof c.latex === 'string').map((c) => (c.entry === 'scene' ? { ...c, entry: 'comp' as Entry, sceneId: '' } : c))
    return usable.length ? usable : DEFAULT_CARDS
  } catch {
    return DEFAULT_CARDS
  }
}

function saveCards(cards: Card[]): void {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards))
  } catch {
    // Not remembered; the panel still works.
  }
}

interface VCState {
  cards: Card[]
  expr: string
  k: string
  q: string
  /** null = the solution's own picture; a style only overrides when the student chose one. */
  style: DrawStyle | null
  result: { sol: VS.Solution; label: string } | null
  showSteps: boolean
  showMore: boolean
}

const initialCards = loadCards()
let nextCard = Math.max(2, ...initialCards.map((c) => c.id)) + 1

const useVC = create<VCState>(() => ({
  cards: initialCards,
  expr: '\\vec{A}+\\vec{B}',
  k: '2',
  q: '1.6\\times10^{-19}',
  style: null,
  result: null,
  showSteps: false,
  showMore: false
}))

useVC.subscribe((s, prev) => {
  if (s.cards !== prev.cards) saveCards(s.cards)
})

/** Add a card that reads one of the scene's vectors (used by the right-click menu). */
export function addVectorFromScene(sceneId: string, name: string): void {
  const st = useVC.getState()
  if (st.cards.some((c) => c.entry === 'scene' && c.sceneId === sceneId)) return
  const safe = VS.safeCardName(name, `V${nextCard}`, st.cards.map((c) => c.name))
  useVC.setState({ cards: [...st.cards, { id: nextCard++, name: safe, entry: 'scene', latex: '', mag: '1', angle: '0', sceneId }] })
}

const UNIT_VECTORS = { i: [1, 0, 0], j: [0, 1, 0], k: [0, 0, 1] }

function evalNumber(latex: string): number {
  const v = math.evaluate(preprocess(latexToMath(latex)))
  const n = typeof v === 'number' ? v : Number((v as { toNumber?: () => number }).toNumber?.() ?? v)
  if (!Number.isFinite(n)) throw new Error('Not a number')
  return n
}

const friendly = (e: unknown): string => (e instanceof Error ? e.message.replace(/^Undefined symbol/, 'Unknown name') : 'Cannot read this vector')

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
    if (!card.latex.trim()) return 'Type the vector, e.g. 3i + 4j or 10∠30°'
    const scope: Record<string, unknown> = { ...UNIT_VECTORS }
    for (const other of cards) {
      if (other.id === card.id) break
      const v = cardValue(other, cards)
      if (typeof v !== 'string') scope[other.name] = v
    }
    return toV3(math.evaluate(preprocess(latexToMath(card.latex, { vectorOps: true })), scope))
  } catch (e) {
    return friendly(e)
  }
}

interface Op {
  id: string
  label: string
  tex: string
  /** How many cards the operation reads, in order from the top; 'all' reads every card. */
  need: number | 'all'
  help: string
  /** The scalar field this operation needs, shown beside its button and nowhere else. */
  field?: 'k' | 'q'
}

/** The six operations a student reaches for most, always visible. */
const COMMON_OPS: Op[] = [
  { id: 'sum', label: 'Add all', tex: '\\vec{A}+\\vec{B}+\\dots', need: 'all', help: 'Resultant by rectangular components' },
  { id: 'sub', label: 'Subtract', tex: '\\vec{A}-\\vec{B}', need: 2, help: 'A + (−B)' },
  { id: 'dot', label: 'Dot', tex: '\\vec{A}\\cdot\\vec{B}', need: 2, help: 'Scalar product and angle between' },
  { id: 'cross', label: 'Cross', tex: '\\vec{A}\\times\\vec{B}', need: 2, help: 'Vector product and parallelogram area' },
  { id: 'mag', label: 'Size & angle', tex: '|\\vec{A}|,\\ \\theta', need: 1, help: 'Magnitude and direction' },
  { id: 'resolve', label: 'Components', tex: 'A_x,\\ A_y', need: 1, help: 'Aₓ = A cos θ, A_y = A sin θ' }
]

/** The rest, behind "More". */
const MORE_OPS: Op[] = [
  { id: 'scale', label: 'Scalar ×', tex: 'k\\vec{A}', need: 1, help: 'Multiply by k', field: 'k' },
  { id: 'unit', label: 'Unit vector', tex: '\\hat{A}', need: 1, help: 'Direction with length 1' },
  { id: 'angle', label: 'Angle between', tex: '\\theta_{AB}', need: 2, help: 'cos θ = A·B / AB' },
  { id: 'proj', label: 'Projection', tex: '\\mathrm{proj}_{A}\\vec{B}', need: 2, help: 'Shadow of B on A' },
  { id: 'equil', label: 'Equilibrium', tex: '\\vec{E}=-\\sum\\vec{F}', need: 'all', help: 'Force that balances all' },
  { id: 'torque', label: 'Torque', tex: '\\vec{\\tau}=\\vec{r}\\times\\vec{F}', need: 2, help: 'First card = r, second = F' },
  { id: 'work', label: 'Work', tex: 'W=\\vec{F}\\cdot\\vec{d}', need: 2, help: 'First card = F, second = d' },
  { id: 'lorentz', label: 'Magnetic force', tex: 'q(\\vec{v}\\times\\vec{B})', need: 2, help: 'First card = v, second = B, charge q', field: 'q' },
  { id: 'relvel', label: 'Relative velocity', tex: '\\vec{v}_{AB}=\\vec{v}_A-\\vec{v}_B', need: 2, help: 'Velocity of A as seen from B' }
]

const OPS = [...COMMON_OPS, ...MORE_OPS]

const STYLES: [DrawStyle | null, string][] = [
  [null, 'Auto'],
  ['head-to-tail', 'Head-to-tail'],
  ['parallelogram', 'Parallelogram'],
  ['common-tail', 'From origin']
]

export function VectorCalc() {
  const st = useVC()
  const settings = useScene((s) => s.settings)
  const objects = useScene((s) => s.objects)
  const [error, setError] = useState('')
  const exprRef = useRef<MathInputHandle>(null)
  const set = useVC.setState

  const values = useMemo(() => st.cards.map((c) => cardValue(c, st.cards)), [st.cards, objects])
  const sceneVectors = Object.values(objects).filter((o) => o.type === 'vector')

  // A card that pointed at a drawing's vector goes stale when that drawing is cleared.
  useEffect(() => {
    const stale = st.cards.filter((c) => c.entry === 'scene' && c.sceneId && !objects[c.sceneId])
    if (stale.length) set({ cards: st.cards.map((c) => (stale.includes(c) ? { ...c, entry: 'comp', sceneId: '' } : c)) })
  }, [objects, st.cards, set])

  const updateCard = (id: number, patch: Partial<Card>) => set({ cards: st.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  /**
   * The cards an operation reads, by position. "First card = r, second = F" has to mean the
   * cards the student can see: skipping an unreadable card silently made the third card F.
   */
  const pick = (op: Op): VS.NamedVec[] | string => {
    const wanted = op.need === 'all' ? st.cards : st.cards.slice(0, op.need)
    if (op.need !== 'all' && wanted.length < op.need) return `${op.label} needs ${op.need} vectors. Add another card.`
    if (op.need === 'all' && wanted.length < 1) return 'Add a vector first.'
    for (let i = 0; i < wanted.length; i++) {
      const v = values[st.cards.indexOf(wanted[i])]
      if (typeof v === 'string') return `Card ${wanted[i].name} cannot be read: ${v}`
    }
    return wanted.map((c) => ({ name: c.name, v: values[st.cards.indexOf(c)] as V3 }))
  }

  const run = (opId: string) => {
    setError('')
    const op = OPS.find((o) => o.id === opId)!
    const vs = pick(op)
    if (typeof vs === 'string') {
      setError(vs)
      return
    }
    try {
      let sol: VS.Solution
      const [A, B] = vs
      switch (opId) {
        case 'sum':
          sol = VS.solveAddition(vs, 'R', settings)
          break
        case 'sub':
          sol = VS.solveSubtraction(A, B, 'R', settings)
          break
        case 'scale':
          sol = VS.solveScalarMultiply(evalNumber(st.k), A, 'R', settings)
          break
        case 'dot':
          sol = VS.solveDot(A, B, settings)
          break
        case 'angle':
          sol = VS.solveAngleBetween(A, B, settings)
          break
        case 'cross':
          sol = VS.solveCross(A, B, 'C', settings)
          break
        case 'mag':
          sol = VS.solveMagnitudeDirection(A, settings)
          break
        case 'unit':
          sol = VS.solveUnitVector(A, settings)
          break
        case 'proj':
          sol = VS.solveProjection(B, A, settings)
          break
        case 'resolve':
          sol = VS.solveResolve(A, settings)
          break
        case 'equil':
          sol = VS.solveEquilibrium(vs, settings)
          break
        case 'torque':
          sol = VS.solveTorque(A.v, B.v, settings)
          break
        case 'work':
          sol = VS.solveWork(A.v, B.v, settings)
          break
        case 'lorentz':
          sol = VS.solveMagneticForce(evalNumber(st.q), A.v, B.v, settings)
          break
        case 'relvel': {
          const s = VS.solveSubtraction({ name: `v_${A.name}`, v: A.v }, { name: `v_${B.name}`, v: B.v }, `v_{${A.name}${B.name}}`, settings)
          sol = { ...s, title: `Velocity of ${A.name} relative to ${B.name}` }
          break
        }
        default:
          return
      }
      set({ result: { sol, label: op.label } })
    } catch (e) {
      setError(friendly(e))
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
        const shown = formatMeasure(out, 'number', settings)
        set({ result: { label: 'Expression', sol: { title: 'Result', steps: [{ tex: `${st.expr} = ${shown}` }], answers: [{ label: 'value', tex: shown }] } } })
        return
      }
      const v = toV3(out)
      const inputs = st.cards.map((c, i) => ({ name: c.name, v: values[i] })).filter((x): x is { name: string; v: V3 } => typeof x.v !== 'string' && new RegExp(`\\b${x.name}\\b`).test(src))
      const md = VS.solveMagnitudeDirection({ name: 'R', v }, settings)
      const sol: VS.Solution = {
        title: 'Resultant of the expression',
        steps: [{ text: 'Evaluate component by component:', tex: `\\vec{R} = ${st.expr} = ${texIJK(v, settings.decimals)}` }, ...md.steps.slice(1)],
        answers: [{ label: 'R', tex: texIJK(v, settings.decimals) }, ...md.answers],
        visual: { vectors: [...inputs.map((x) => ({ name: x.name, v: x.v, role: 'input' as const })), { name: 'R', v, role: 'result' as const }], mode: 'common-tail' }
      }
      set({ result: { sol, label: 'Expression' } })
    } catch (e) {
      setError(friendly(e))
    }
  }

  const addCard = () => {
    const used = new Set(st.cards.map((c) => c.name))
    const name = 'ABCDEFGHLMNPQRSTUVW'.split('').find((l) => !used.has(l)) ?? `V${nextCard}`
    set({ cards: [...st.cards, { id: nextCard++, name, entry: 'comp', latex: '', mag: '1', angle: '0', sceneId: '' }] })
  }

  const opButton = (op: Op) => (
    <button key={op.id} className="btn h-auto flex-col items-start gap-0 py-1 text-left" title={op.help} onClick={() => run(op.id)}>
      <span className="text-[12px] text-[color:var(--text-strong)]">{op.label}</span>
      <span className="text-[11px] text-[color:var(--text-dim)]">
        <Tex tex={op.tex} />
      </span>
    </button>
  )

  return (
    <div className="panel pb-8">
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <Sigma size={16} className="text-[color:var(--accent)]" />
        <div className="font-semibold text-[color:var(--text-strong)]">Vector Calculator</div>
        <div className="flex-1" />
        <span className="text-[11px] text-[color:var(--text-faint)]">Type like a textbook: 3i + 4j, 10∠30°, ½A</span>
      </div>

      {st.cards.map((card, idx) => {
        const v = values[idx]
        const ok = typeof v !== 'string'
        // A typed vector is plain numbers; only one read off the drawing carries the drawing's unit.
        const sizeKind = card.entry === 'scene' ? 'length' : 'number'
        return (
          <div key={card.id} className={`card p-2 ${ok ? '' : 'border-[color:var(--bad)]'}`}>
            <div className="mb-1.5 flex items-center gap-2">
              <input
                className="field w-11 text-center text-[15px] font-semibold italic"
                style={{ fontFamily: 'Cambria, serif' }}
                value={card.name}
                title="Letters and digits, not i, j or k (those are the unit vectors)"
                onChange={(e) => updateCard(card.id, { name: VS.safeCardName(e.target.value, card.name, st.cards.filter((c) => c.id !== card.id).map((c) => c.name)) })}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="seg">
                {(
                  [
                    ['comp', 'î ĵ k̂'],
                    ['polar', 'size ∠ angle'],
                    ['scene', 'drawing']
                  ] as [Entry, string][]
                ).map(([k, l]) => (
                  <button key={k} className={card.entry === k ? 'on' : ''} onClick={() => updateCard(card.id, { entry: k })}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              {st.cards.length > 1 && (
                <button className="text-[color:var(--text-faint)] hover:text-[color:var(--bad)]" title="Remove" onClick={() => set({ cards: st.cards.filter((c) => c.id !== card.id) })}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            {card.entry === 'comp' && <MathInput value={card.latex} onChange={(l) => updateCard(card.id, { latex: l })} onEnter={() => run('sum')} placeholder="3i + 4j" />}
            {card.entry === 'polar' && (
              <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-1.5">
                <MathInput size="sm" value={card.mag} onChange={(l) => updateCard(card.id, { mag: l })} placeholder="size" />
                <span className="text-lg text-[color:var(--text-dim)]">∠</span>
                <MathInput size="sm" value={card.angle} onChange={(l) => updateCard(card.id, { angle: l })} placeholder="angle" />
                <span className="text-[color:var(--text-dim)]">°</span>
              </div>
            )}
            {card.entry === 'scene' && (
              <select
                className="field"
                value={card.sceneId}
                onChange={(e) => {
                  const picked = objects[e.target.value]
                  const others = st.cards.filter((c) => c.id !== card.id).map((c) => c.name)
                  updateCard(card.id, { sceneId: e.target.value, name: picked ? VS.safeCardName(picked.name, card.name, others) : card.name })
                }}
              >
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
                <span className="text-[color:var(--text)]">
                  <Tex tex={`\\vec{${card.name}} = ${texIJK(v as V3, settings.decimals)}`} />
                  <span className="ml-3 text-[color:var(--text-dim)]">
                    |{card.name}| = {formatMeasure(len(v as V3), sizeKind, settings)}
                    {Math.abs((v as V3)[2]) < 1e-12 && <> · θ = {formatMeasure(heading(v as V3), 'direction', settings)}</>}
                  </span>
                </span>
              ) : (
                <span className="text-[color:var(--bad)]">{v as string}</span>
              )}
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-2 px-2">
        <button className="btn ghost" onClick={addCard}>
          <Plus size={13} /> Add vector
        </button>
      </div>

      {error && <div className="mx-3 mt-2 rounded px-2 py-1 text-[color:var(--bad)]" style={{ background: 'color-mix(in srgb, var(--bad) 12%, transparent)' }}>{error}</div>}

      {st.result && (
        <div className="card mt-2 border-[color:var(--warn)]" style={{ background: 'color-mix(in srgb, var(--warn) 6%, transparent)' }}>
          <div className="flex items-center gap-2 border-b border-[color:var(--warn)] px-2 py-1.5">
            <span className="flex-1 font-semibold text-[color:var(--warn)]">{st.result.sol.title}</span>
          </div>
          <div className="px-3 py-2">
            {st.result.sol.answers.map((a) => (
              <div key={a.label} className="flex items-baseline gap-3 py-0.5">
                <span className="w-24 shrink-0 text-[color:var(--text-dim)]">{a.label}</span>
                <Tex tex={a.tex} className="text-[18px] text-[color:var(--text-strong)]" />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-[color:var(--warn)] px-2 py-1.5">
            {st.result.sol.visual && (
              <button className="btn primary" onClick={() => visualizeSolution(st.result!.sol, st.style ?? undefined)}>
                <Eye size={13} /> Draw on graph
              </button>
            )}
            <div className="flex-1" />
            <button className="btn ghost" onClick={() => set({ showSteps: !st.showSteps })}>
              {st.showSteps ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Steps
            </button>
            {st.result.sol.visual && (
              // Its own row: beside the button the layout names wrapped mid-word in a narrow panel.
              <div className="seg basis-full">
                {STYLES.map(([k, l]) => (
                  <button key={l} className={`whitespace-nowrap ${st.style === k ? 'on' : ''}`} title={k ? '' : "The solution's own picture"} onClick={() => set({ style: k })}>
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>
          {st.showSteps && (
            <ol className="steps space-y-1 px-2 pb-2">
              {st.result.sol.steps.map((s, i) => (
                <li key={i} className="rounded bg-[var(--bg-3)] px-2 py-1.5">
                  <span className="mr-2 text-[11px] text-[color:var(--text-faint)]">{i + 1}.</span>
                  {s.text && <span className="text-[color:var(--text)]">{s.text}</span>}
                  {s.tex && <Tex tex={s.tex} display />}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-3 gap-1 px-2">{COMMON_OPS.map(opButton)}</div>

      <button className="btn ghost mx-2 mt-1" onClick={() => set({ showMore: !st.showMore })}>
        {st.showMore ? <ChevronDown size={13} /> : <ChevronRight size={13} />} More {st.showMore ? '' : `(${MORE_OPS.length})`}
      </button>
      {st.showMore && (
        <div className="grid grid-cols-3 gap-1 px-2">
          {MORE_OPS.map((op) =>
            op.field ? (
              <div key={op.id} className="col-span-3 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                {opButton(op)}
                <span className="text-[color:var(--text-dim)]">{op.field} =</span>
                <MathInput size="sm" value={st[op.field]} onChange={(l) => (op.field === 'k' ? set({ k: l }) : set({ q: l }))} />
              </div>
            ) : (
              opButton(op)
            )
          )}
        </div>
      )}

      <div className="card mt-2 p-2">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-[color:var(--text-faint)]">Or type any vector expression</div>
        <div className="flex items-center gap-1.5">
          <div className="flex-1">
            <MathInput ref={exprRef} value={st.expr} onChange={(l) => set({ expr: l })} onEnter={runExpr} />
          </div>
          <button className="btn primary h-9" onClick={runExpr}>
            =
          </button>
        </div>
      </div>
    </div>
  )
}
