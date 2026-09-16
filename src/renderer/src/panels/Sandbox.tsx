// The sandbox control panel: what is in the world, and how the world behaves.

import { Box, Circle, Cylinder, Plus, RotateCcw, Trash2, Triangle } from 'lucide-react'
import { useScene } from '../core/store'
import { MATERIALS } from '../sim/materials'
import { massOf, useSandbox } from '../sim/store'
import { GRAVITY_PRESETS, type ShapeKind } from '../sim/types'
import { useJoltState } from '../sim/jolt'
import { NumField } from '../ui/fields'

const ADD: { shape: ShapeKind; label: string; icon: React.ReactNode }[] = [
  { shape: 'sphere', label: 'Ball', icon: <Circle size={13} /> },
  { shape: 'box', label: 'Crate', icon: <Box size={13} /> },
  { shape: 'cylinder', label: 'Cylinder', icon: <Cylinder size={13} /> },
  { shape: 'ramp', label: 'Ramp', icon: <Triangle size={13} /> },
  { shape: 'plank', label: 'Plank', icon: <Box size={13} /> },
  { shape: 'wall', label: 'Wall', icon: <Box size={13} /> }
]

function Vec3Row({
  label,
  value,
  unit,
  onChange
}: {
  label: string
  value: [number, number, number]
  unit?: string
  onChange: (v: [number, number, number]) => void
}) {
  return (
    <div className="prop-row">
      <label>
        {label} {unit && <span className="text-zinc-600">{unit}</span>}
      </label>
      <div className="flex gap-1">
        {(['x', 'y', 'z'] as const).map((axis, i) => (
          <NumField
            key={axis}
            value={value[i]}
            onChange={(n) => {
              const next: [number, number, number] = [...value]
              next[i] = n
              onChange(next)
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function Sandbox() {
  const bodies = useSandbox((s) => s.bodies)
  const world = useSandbox((s) => s.world)
  const selection = useSandbox((s) => s.selection)
  const engineTime = useSandbox((s) => s.engineTime)
  const add = useSandbox((s) => s.addBody)
  const update = useSandbox((s) => s.updateBody)
  const remove = useSandbox((s) => s.removeBody)
  const select = useSandbox((s) => s.select)
  const setWorld = useSandbox((s) => s.setWorld)
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const sel = bodies.find((b) => b.id === selection)
  const loading = useJoltState() !== 'ready'

  return (
    <div className="panel pb-6">
      {loading && <div className="px-3 pt-3 text-zinc-400">Starting the physics engine…</div>}

      <div className="section-title flex items-center">
        <span className="flex-1">Objects</span>
        <span className="normal-case tracking-normal text-zinc-600">t = {engineTime.toFixed(2)} s</span>
      </div>

      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
        {ADD.map((a) => (
          <button key={a.shape} className="btn h-7" onClick={() => add(a.shape, [0, 2, 0])} title={`Add a ${a.label.toLowerCase()}`}>
            <Plus size={11} />
            {a.icon} {a.label}
          </button>
        ))}
      </div>

      {bodies.map((b) => {
        const chosen = b.id === selection
        return (
          <div
            key={b.id}
            className={`group flex h-7 cursor-pointer items-center gap-2 px-3 ${chosen ? 'bg-[#2f4a7a]' : 'hover:bg-[#26282d]'}`}
            onClick={() => select(chosen ? null : b.id)}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="w-14 shrink-0 truncate font-semibold text-zinc-100">{b.name}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-400">
              {b.shape} · {massOf(b).toFixed(2)} kg {b.motion === 'static' && '· fixed'}
            </span>
            <button
              className="hidden text-zinc-500 hover:text-red-400 group-hover:block"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation()
                remove(b.id)
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )
      })}

      {sel && (
        <>
          <div className="section-title mt-2">{sel.name}</div>
          <div className="prop-row">
            <label>Name</label>
            <input className="field" value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
          </div>
          <div className="prop-row">
            <label>Material</label>
            <select className="field" value={sel.material} onChange={(e) => update(sel.id, { material: e.target.value })}>
              {MATERIALS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.density} kg/m³
                </option>
              ))}
            </select>
          </div>
          <div className="prop-row">
            <label>Mass</label>
            <div className="flex items-center gap-2">
              <div className="seg">
                <button className={sel.massMode === 'density' ? 'on' : ''} onClick={() => update(sel.id, { massMode: 'density' })} title="From the material and the size">
                  from density
                </button>
                <button className={sel.massMode === 'mass' ? 'on' : ''} onClick={() => update(sel.id, { massMode: 'mass' })}>
                  set it
                </button>
              </div>
              {sel.massMode === 'mass' ? (
                <NumField value={sel.mass} onChange={(mass) => update(sel.id, { mass })} />
              ) : (
                <span className="tabular-nums text-zinc-300">{massOf(sel).toFixed(2)} kg</span>
              )}
            </div>
          </div>
          <Vec3Row label="Size" unit="m" value={sel.size} onChange={(size) => update(sel.id, { size })} />
          <Vec3Row label="Position" unit="m" value={sel.position} onChange={(position) => update(sel.id, { position })} />
          <Vec3Row label="Rotation" unit="°" value={sel.rotation} onChange={(rotation) => update(sel.id, { rotation })} />
          <Vec3Row label="Velocity" unit="m/s" value={sel.velocity} onChange={(velocity) => update(sel.id, { velocity })} />
          <div className="prop-row">
            <label>Bounciness e</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full"
                min={0}
                max={1}
                step={0.01}
                value={sel.restitution}
                onChange={(e) => update(sel.id, { restitution: Number(e.target.value) })}
              />
              <span className="w-10 text-right tabular-nums text-zinc-400">{sel.restitution.toFixed(2)}</span>
            </div>
          </div>
          <div className="prop-row">
            <label>Friction μ</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full"
                min={0}
                max={1.5}
                step={0.01}
                value={sel.friction}
                onChange={(e) => update(sel.id, { friction: Number(e.target.value) })}
              />
              <span className="w-10 text-right tabular-nums text-zinc-400">{sel.friction.toFixed(2)}</span>
            </div>
          </div>
          <div className="prop-row">
            <label>Moves?</label>
            <div className="seg">
              {(
                [
                  ['dynamic', 'Moves'],
                  ['static', 'Fixed']
                ] as const
              ).map(([k, l]) => (
                <button key={k} className={sel.motion === k ? 'on' : ''} onClick={() => update(sel.id, { motion: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="prop-row">
            <label>Velocity arrow</label>
            <input type="checkbox" checked={!!sel.showArrows} onChange={(e) => update(sel.id, { showArrows: e.target.checked })} />
          </div>
        </>
      )}

      <div className="section-title mt-2">World</div>
      <div className="prop-row">
        <label>Gravity</label>
        <div className="flex items-center gap-2">
          <select
            className="field"
            value={GRAVITY_PRESETS.find((g) => Math.abs(g.value - world.gravity) < 1e-6)?.label ?? 'Custom'}
            onChange={(e) => {
              const preset = GRAVITY_PRESETS.find((g) => g.label === e.target.value)
              if (preset) setWorld({ gravity: preset.value })
            }}
          >
            {GRAVITY_PRESETS.map((g) => (
              <option key={g.label}>{g.label}</option>
            ))}
            <option>Custom</option>
          </select>
          <NumField value={world.gravity} onChange={(gravity) => setWorld({ gravity })} />
        </div>
      </div>
      <div className="prop-row">
        <label>Air</label>
        <div className="flex items-center gap-2">
          <div className="seg">
            <button className={world.airDensity > 0 ? 'on' : ''} onClick={() => setWorld({ airDensity: 1.225 })} title="Sea level: 1.225 kg/m³">
              Air
            </button>
            <button className={world.airDensity === 0 ? 'on' : ''} onClick={() => setWorld({ airDensity: 0 })} title="No air resistance at all">
              Vacuum
            </button>
          </div>
          {world.airDensity > 0 && <span className="tabular-nums text-zinc-400">{world.airDensity} kg/m³</span>}
        </div>
      </div>
      <div className="prop-row">
        <label>2D mode</label>
        <input
          type="checkbox"
          checked={world.twoD}
          title="Hold everything in one flat plane, the way textbook problems are drawn"
          onChange={(e) => setWorld({ twoD: e.target.checked })}
        />
      </div>
      <div className="prop-row">
        <label>Slow motion</label>
        <div className="seg">
          {[1, 0.5, 0.25, 0.1].map((t) => (
            <button key={t} className={world.timeScale === t ? 'on' : ''} onClick={() => setWorld({ timeScale: t })}>
              {t === 1 ? 'normal' : `×${t}`}
            </button>
          ))}
        </div>
      </div>
      <div className="prop-row">
        <label>Accuracy</label>
        <div className="seg">
          {[
            [1, 'fast'],
            [2, 'normal'],
            [4, 'careful'],
            [8, 'exact']
          ].map(([v, l]) => (
            <button key={l as string} className={world.collisionSteps === v ? 'on' : ''} onClick={() => setWorld({ collisionSteps: v as number })}>
              {l as string}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 px-3 pt-2">
        <button className="btn primary" onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          className="btn"
          onClick={() => {
            setPlaying(false)
            // Rebuilding from the definitions puts everything back where it started.
            useSandbox.setState({ bodies: [...useSandbox.getState().bodies], contacts: [], engineTime: 0 })
          }}
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>
    </div>
  )
}
