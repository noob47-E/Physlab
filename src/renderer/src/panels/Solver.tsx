import { useEffect, useState } from 'react'
import { Eye, Lightbulb, Plus, Sparkles, X } from 'lucide-react'
import { useScene } from '../core/store'
import { visualizeSolution } from '../core/visualize'
import { fromPolar, toRad, type V3 } from '../math/vec'
import * as VS from '../math/vectorSolver'
import { NumField } from '../ui/fields'
import { Tex } from '../ui/Tex'

type VecInput = { mode: 'comp' | 'polar' | 'scene'; comp: V3; mag: number; angle: number; sceneId: string; name: string }

const newVec = (name: string, comp: V3 = [3, 4, 0]): VecInput => ({ mode: 'comp', comp, mag: 10, angle: 30, sceneId: '', name })

const PROBLEMS = [
  { id: 'components', label: 'Resolve a vector into components (Ax = A cos θ)' },
  { id: 'magdir', label: 'Magnitude & direction from components' },
  { id: 'add', label: 'Add vectors (resultant)' },
  { id: 'subtract', label: 'Subtract A − B' },
  { id: 'scale', label: 'Multiply by a scalar k·A' },
  { id: 'unit', label: 'Unit vector' },
  { id: 'dot', label: 'Scalar (dot) product & angle between' },
  { id: 'cross', label: 'Vector (cross) product' },
  { id: 'projection', label: 'Projection of B on A' },
  { id: 'twoforces', label: 'Resultant of two forces at an angle (law of cosines)' },
  { id: 'equilibrium', label: 'Force needed for equilibrium' },
  { id: 'torque', label: 'Torque τ = r × F' },
  { id: 'work', label: 'Work done W = F · d' },
  { id: 'magforce', label: 'Magnetic force F = q(v × B)' }
] as const

type ProblemId = (typeof PROBLEMS)[number]['id']

function VecEditor({ value, onChange, onRemove }: { value: VecInput; onChange: (v: VecInput) => void; onRemove?: () => void }) {
  const objects = useScene((s) => s.objects)
  const ev = useScene((s) => s.ev)
  const vectors = Object.values(objects).filter((o) => o.type === 'vector')
  return (
    <div className="card p-2">
      <div className="mb-1.5 flex items-center gap-2">
        <input className="field w-12 text-center font-semibold italic" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
        <div className="seg">
          {(['comp', 'polar', 'scene'] as const).map((m) => (
            <button key={m} className={value.mode === m ? 'on' : ''} onClick={() => onChange({ ...value, mode: m })}>
              {m === 'comp' ? 'x, y, z' : m === 'polar' ? 'size ∠ angle' : 'from scene'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {onRemove && (
          <button className="text-[color:var(--text-faint)] hover:text-[color:var(--bad)]" onClick={onRemove}>
            <X size={14} />
          </button>
        )}
      </div>
      {value.mode === 'comp' && (
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="relative">
              <span className="pointer-events-none absolute left-1.5 top-1 text-fine text-[color:var(--text-faint)]">{'xyz'[i]}</span>
              <NumField value={value.comp[i]} onChange={(n) => onChange({ ...value, comp: value.comp.map((c, j) => (j === i ? n : c)) as V3 })} />
            </div>
          ))}
        </div>
      )}
      {value.mode === 'polar' && (
        <div className="grid grid-cols-2 gap-1">
          <div className="relative">
            <span className="pointer-events-none absolute left-1.5 top-1 text-fine text-[color:var(--text-faint)]">size</span>
            <NumField value={value.mag} onChange={(n) => onChange({ ...value, mag: n })} />
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-1.5 top-1 text-fine text-[color:var(--text-faint)]">θ°</span>
            <NumField value={value.angle} onChange={(n) => onChange({ ...value, angle: n })} />
          </div>
        </div>
      )}
      {value.mode === 'scene' && (
        <select
          className="field"
          value={value.sceneId}
          onChange={(e) => {
            const o = objects[e.target.value]
            onChange({ ...value, sceneId: e.target.value, name: o?.name ?? value.name })
          }}
        >
          <option value="">— pick a vector —</option>
          {vectors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      )}
      {value.mode === 'scene' && value.sceneId && !ev.values.has(value.sceneId) && <div className="text-[color:var(--bad)]">That vector no longer exists.</div>}
    </div>
  )
}

function resolveVec(v: VecInput): VS.NamedVec {
  if (v.mode === 'polar') return { name: v.name, v: fromPolar(v.mag, toRad(v.angle)) }
  if (v.mode === 'scene') {
    const c = useScene.getState().ev.values.get(v.sceneId)
    if (c?.type === 'vector') return { name: v.name, v: c.comp }
    throw new Error(`Pick a vector for ${v.name}`)
  }
  return { name: v.name, v: v.comp }
}

/** The worked solution. With `startHidden` the steps arrive one press at a time, like a tutor. */
export function SolutionView({ sol, startHidden = false }: { sol: VS.Solution; startHidden?: boolean }) {
  const [shown, setShown] = useState(startHidden ? 0 : sol.steps.length)
  useEffect(() => setShown(startHidden ? 0 : sol.steps.length), [sol, startHidden])
  const more = sol.steps.length - shown
  return (
    <div className="steps">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Sparkles size={15} className="text-[color:var(--warn)]" />
        <div className="flex-1 text-lead font-semibold text-[color:var(--text-strong)]">{sol.title}</div>
        {sol.visual && (
          <button className="btn" onClick={() => visualizeSolution(sol)}>
            <Eye size={13} /> Show in scene
          </button>
        )}
      </div>
      {shown === 0 && (
        <div className="px-3 pt-2 text-[color:var(--text-dim)]">Work it out yourself first. Press Hint when you are stuck — one step at a time.</div>
      )}
      <ol className="mt-2 space-y-1.5 px-3">
        {sol.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="rounded-md bg-[var(--bg-3)] px-3 py-2">
            <div className="flex gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sel-row)] text-fine text-[color:var(--text-strong)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {s.text && <div className="text-[color:var(--text)]">{s.text}</div>}
                {s.tex && <Tex tex={s.tex} display />}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {more > 0 && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <button className="btn" onClick={() => setShown((n) => n + 1)}>
            <Lightbulb size={13} /> {shown === 0 ? 'Hint' : 'Next step'}
          </button>
          <button className="btn ghost" onClick={() => setShown(sol.steps.length)}>
            Show all {sol.steps.length} steps
          </button>
          <span className="text-[color:var(--text-faint)]">{more} to go</span>
        </div>
      )}
      {more === 0 && (
        <div className="card mx-3 mt-3 border-[color:var(--warn)] p-3" style={{ background: 'color-mix(in srgb, var(--warn) 6%, transparent)' }}>
          <div className="mb-1 text-fine uppercase tracking-wide text-[color:var(--warn)]">Answer</div>
          {sol.answers.map((a) => (
            <div key={a.label} className="flex items-baseline gap-3 py-0.5">
              <span className="w-24 text-[color:var(--text-dim)]">{a.label}</span>
              <Tex tex={a.tex} className="text-lead text-[color:var(--text-strong)]" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function Solver() {
  const solution = useScene((s) => s.solution)
  const showSolution = useScene((s) => s.showSolution)
  const settings = useScene((s) => s.settings)
  const [problem, setProblem] = useState<ProblemId>('add')
  const [vecs, setVecs] = useState<VecInput[]>([newVec('A', [3, 4, 0]), newVec('B', [2, -1, 0])])
  const [nums, setNums] = useState({ F: 10, theta: 30, F1: 5, F2: 5, angle: 120, k: 2, q: 2 })
  const [error, setError] = useState('')
  const [method, setMethod] = useState<'components' | 'cosine' | 'graphical'>('components')
  const [hintFirst, setHintFirst] = useState(false)

  const needVecs: Record<ProblemId, number> = {
    components: 0, magdir: 1, add: -1, subtract: 2, scale: 1, unit: 1, dot: 2, cross: 2, projection: 2, twoforces: 0, equilibrium: -1, torque: 2, work: 2, magforce: 2
  }
  const vecNames: Partial<Record<ProblemId, string[]>> = { torque: ['r', 'F'], work: ['F', 'd'], magforce: ['v', 'B'] }

  const chooseProblem = (id: ProblemId) => {
    setProblem(id)
    setError('')
    const n = needVecs[id]
    const names = vecNames[id] ?? ['A', 'B', 'C']
    if (n === -1) setVecs((v) => (v.length >= 2 ? v : [newVec('A', [3, 4, 0]), newVec('B', [2, -1, 0])]))
    else if (n > 0) {
      setVecs(Array.from({ length: n }, (_, i) => vecs[i] ? { ...vecs[i], name: names[i] } : newVec(names[i], i === 0 ? [3, 4, 0] : [2, -1, 0])))
    }
    if (id === 'magforce') setVecs([newVec('v', [1, 0, 0]), newVec('B', [0, 0, 1])])
  }

  const solve = (hint = false) => {
    setError('')
    setHintFirst(hint)
    try {
      const vs = vecs.map(resolveVec)
      let sol: VS.Solution
      switch (problem) {
        case 'components':
          sol = VS.solveComponents('F', nums.F, nums.theta, '', settings)
          break
        case 'magdir':
          sol = VS.solveMagnitudeDirection(vs[0], settings)
          break
        case 'add':
          sol =
            method === 'cosine' && vs.length === 2
              ? VS.solveAdditionCosineLaw(vs[0], vs[1], 'R', settings)
              : method === 'graphical'
                ? VS.solveAdditionGraphical(vs, 'R', settings)
                : VS.solveAddition(vs, 'R', settings)
          break
        case 'subtract':
          sol = VS.solveSubtraction(vs[0], vs[1], 'R', settings)
          break
        case 'scale':
          sol = VS.solveScalarMultiply(nums.k, vs[0], 'R', settings)
          break
        case 'unit':
          sol = VS.solveUnitVector(vs[0], settings)
          break
        case 'dot':
          sol = VS.solveDot(vs[0], vs[1], settings)
          break
        case 'cross':
          sol = VS.solveCross(vs[0], vs[1], 'C', settings)
          break
        case 'projection':
          sol = VS.solveProjection(vs[1], vs[0], settings)
          break
        case 'twoforces':
          sol = VS.solveTwoForces(nums.F1, nums.F2, nums.angle, 'N', settings)
          break
        case 'equilibrium':
          sol = VS.solveEquilibrium(vs, settings)
          break
        case 'torque':
          sol = VS.solveTorque(vs[0].v, vs[1].v, settings)
          break
        case 'work':
          sol = VS.solveWork(vs[0].v, vs[1].v, settings)
          break
        case 'magforce':
          sol = VS.solveMagneticForce(nums.q, vs[0].v, vs[1].v, settings)
          break
      }
      showSolution(sol)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const n = needVecs[problem]
  const numField = (key: keyof typeof nums, label: string) => (
    <div className="prop-row">
      <label>{label}</label>
      <NumField value={nums[key]} onChange={(v) => setNums({ ...nums, [key]: v })} />
    </div>
  )

  return (
    <div className="panel pb-8">
      <div className="section-title">Vector problem solver</div>
      <div className="px-3">
        <select className="field" value={problem} onChange={(e) => chooseProblem(e.target.value as ProblemId)}>
          {PROBLEMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      {problem === 'add' && (
        <div className="mt-2 px-3">
          <div className="mb-1 text-fine uppercase tracking-wide text-[color:var(--text-faint)]">Solve by</div>
          <div className="seg">
            {(
              [
                ['components', 'Components'],
                ['cosine', 'Law of cosines'],
                ['graphical', 'Drawing (head-to-tail)']
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={`whitespace-nowrap ${method === k ? 'on' : ''}`} onClick={() => setMethod(k)} title="Every method gives the same answer">
                {l}
              </button>
            ))}
          </div>
          {method === 'cosine' && vecs.length !== 2 && <div className="mt-1 text-fine text-[color:var(--warn)]">The law of cosines works with exactly two vectors.</div>}
        </div>
      )}
      <div className="mt-2">
        {problem === 'components' && (
          <>
            {numField('F', 'Magnitude F')}
            {numField('theta', 'Angle θ (°)')}
          </>
        )}
        {problem === 'twoforces' && (
          <>
            {numField('F1', 'Force F₁')}
            {numField('F2', 'Force F₂')}
            {numField('angle', 'Angle between (°)')}
          </>
        )}
        {problem === 'scale' && numField('k', 'Scalar k')}
        {problem === 'magforce' && numField('q', 'Charge q (C)')}
        {n !== 0 &&
          vecs.map((v, i) => (
            <VecEditor
              key={i}
              value={v}
              onChange={(nv) => setVecs(vecs.map((x, j) => (j === i ? nv : x)))}
              onRemove={n === -1 && vecs.length > 2 ? () => setVecs(vecs.filter((_, j) => j !== i)) : undefined}
            />
          ))}
        {n === -1 && (
          <div className="px-2">
            <button className="btn ghost" onClick={() => setVecs([...vecs, newVec(String.fromCharCode(65 + vecs.length), [1, 1, 0])])}>
              <Plus size={13} /> Add another vector
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 pt-2">
        <button className="btn primary" onClick={() => solve(false)}>
          <Sparkles size={13} /> Solve step by step
        </button>
        <button className="btn" onClick={() => solve(true)} title="One step at a time, so you can carry on yourself">
          <Lightbulb size={13} /> Give me a hint
        </button>
        {error && <span className="text-[color:var(--bad)]">{error}</span>}
      </div>
      {solution && (
        <div className="mt-3 border-t border-[color:var(--line)]">
          <SolutionView sol={solution} startHidden={hintFirst} />
        </div>
      )}
    </div>
  )
}
