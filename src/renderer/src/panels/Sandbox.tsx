// The sandbox control panel: what is in the world, and how the world behaves.

import { Beaker, Box, ChevronDown, Circle, Cone, Cylinder, Minus, Pill, Plus, RectangleHorizontal, Rocket, RotateCcw, Trash2, Triangle, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { useScene } from '../core/store'
import { dragCoefficient, MATERIALS } from '../sim/materials'
import { energyOf, groundTopOf, momentumSize, systemEnergy } from '../sim/energy'
import { massOf, useSandbox } from '../sim/store'
import { DEFAULT_WORLD, GRAVITY_PRESETS, type ShapeKind } from '../sim/types'
import { launchVelocity, PRESETS } from '../sim/presets'
import { useJoltState } from '../sim/jolt'
import { NumField } from '../ui/fields'

// Crate, plank and wall all used the same square icon, so the row read as three identical
// buttons. Every shape the engine can build is offered — capsule and cone were only ever missing
// from this list, not from the physics.
const ADD: { shape: ShapeKind; label: string; icon: React.ReactNode }[] = [
  { shape: 'sphere', label: 'Ball', icon: <Circle size={13} /> },
  { shape: 'box', label: 'Crate', icon: <Box size={13} /> },
  { shape: 'cylinder', label: 'Cylinder', icon: <Cylinder size={13} /> },
  { shape: 'capsule', label: 'Capsule', icon: <Pill size={13} /> },
  { shape: 'cone', label: 'Cone', icon: <Cone size={13} /> },
  { shape: 'ramp', label: 'Ramp', icon: <Triangle size={13} /> },
  { shape: 'plank', label: 'Plank', icon: <Minus size={13} /> },
  { shape: 'wall', label: 'Wall', icon: <RectangleHorizontal size={13} className="rotate-90" /> }
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
          // The axis letter was used as the React key and never shown, so these were three
          // anonymous boxes and you had to guess which one was which.
          <label key={axis} className="flex min-w-0 flex-1 items-center gap-1">
            <span className="text-[10px] italic text-zinc-500">{axis}</span>
            <NumField
              value={value[i]}
              onChange={(n) => {
                const next: [number, number, number] = [...value]
                next[i] = n
                onChange(next)
              }}
            />
          </label>
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
  const sideView = useSandbox((s) => s.sideView)
  const setSideView = useSandbox((s) => s.setSideView)
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const sel = bodies.find((b) => b.id === selection)
  const loading = useJoltState() !== 'ready'

  return (
    <div className="panel pb-6">
      {loading && <div className="px-3 pt-3 text-zinc-400">Starting the physics engine…</div>}

      <div className="section-title flex items-center">
        <span className="flex-1">Objects</span>
        {/* The clock is the number every kinematics question needs; it used to be the hardest
            thing on the panel to read. */}
        <span className="normal-case tracking-normal tabular-nums text-zinc-300">t = {engineTime.toFixed(2)} s</span>
      </div>

      <Presets />

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
              {/* A bolted-down floor reporting "9408 kg" only invites the question "why does the
                  ground weigh nine tonnes?" — for a static body the mass means nothing. */}
              {b.shape} {b.motion === 'static' ? '· fixed' : `· ${massOf(b).toFixed(2)} kg`}
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
                <button className={sel.massMode === 'density' ? 'on' : ''} onClick={() => update(sel.id, { massMode: 'density' })} title="Work the mass out from the material and the size">
                  from density
                </button>
                {/* "set it" left you asking "set what?" */}
                <button className={sel.massMode === 'mass' ? 'on' : ''} onClick={() => update(sel.id, { massMode: 'mass' })} title="Type the mass yourself">
                  type it
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
          {/* The engine has always spun bodies; there was simply no way to ask it to. */}
          <Vec3Row label="Spin" unit="rad/s" value={sel.angularVelocity} onChange={(angularVelocity) => update(sel.id, { angularVelocity })} />
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
            <label>Air drag Cd</label>
            <div className="flex items-center gap-2">
              {/* The engine has applied drag since the first version, using a default for the
                  shape. A student matching a textbook figure needs to be able to set it. */}
              <input
                type="range"
                className="w-full"
                min={0}
                max={1.5}
                step={0.01}
                value={sel.dragCd ?? dragCoefficient(sel.shape)}
                onChange={(e) => update(sel.id, { dragCd: Number(e.target.value) })}
              />
              <span className="w-10 text-right tabular-nums text-zinc-400">{(sel.dragCd ?? dragCoefficient(sel.shape)).toFixed(2)}</span>
            </div>
          </div>
          <div className="prop-row">
            <label>Slows down</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-full"
                min={0}
                max={1}
                step={0.01}
                value={sel.linearDamping}
                title="Damping: how quickly it loses speed to everything not modelled"
                onChange={(e) => update(sel.id, { linearDamping: Number(e.target.value) })}
              />
              <span className="w-10 text-right tabular-nums text-zinc-400">{sel.linearDamping.toFixed(2)}</span>
            </div>
          </div>
          <div className="prop-row">
            <label>Motion</label>
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
          <div className="prop-row">
            <label title="Draw the path it takes, so a projectile leaves its parabola behind">Leave a trail</label>
            <input type="checkbox" checked={!!sel.trace} onChange={(e) => update(sel.id, { trace: e.target.checked })} />
          </div>
          {sel.motion === 'dynamic' && (
            <div className="prop-row">
              <label title="Hold it to one direction, the way a trolley is held to a track">Moves along</label>
              <div className="seg">
                {(
                  [
                    ['free', 'Any way'],
                    ['x', 'x only'],
                    ['y', 'y only']
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} className={(sel.lock ?? 'free') === k ? 'on' : ''} onClick={() => update(sel.id, { lock: k })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          {sel.motion === 'dynamic' && <Launcher id={sel.id} />}
        </>
      )}

      <EnergyReadout />

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
      {/* Wind has been in the drag calculation from the start, with nothing to set it. */}
      {world.airDensity > 0 && <Vec3Row label="Wind" unit="m/s" value={world.wind} onChange={(wind) => setWorld({ wind })} />}
      <div className="prop-row">
        <label>View</label>
        <div className="seg">
          <button className={sideView ? 'on' : ''} onClick={() => setSideView(true)} title="Straight-on view, like a diagram in a book">
            Side view
          </button>
          <button className={!sideView ? 'on' : ''} onClick={() => setSideView(false)} title="Look around in 3D">
            3D view
          </button>
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
            // A fresh array makes the viewport's effect rebuild the world from these definitions,
            // which is what puts every object back where it started.
            useSandbox.setState({ bodies: [...useSandbox.getState().bodies], contacts: [], engineTime: 0 })
          }}
        >
          <RotateCcw size={13} /> Reset
        </button>
        <UndoButton />
      </div>
    </div>
  )
}

/**
 * Where the energy is, right now. This is the thing the Sandbox was missing: you could watch a
 * ball fall and learn nothing from it, because nothing on screen said whether energy was
 * conserved — the one question every mechanics practical is really asking.
 */
function EnergyReadout() {
  const bodies = useSandbox((s) => s.bodies)
  const live = useSandbox((s) => s.live)
  const gravity = useSandbox((s) => s.world.gravity)
  const datum = groundTopOf(bodies)

  const moving = bodies.filter((b) => b.motion === 'dynamic')
  const parts = moving.map((b) => ({ def: b, state: live[b.id], energy: live[b.id] ? energyOf(b, live[b.id], gravity, datum) : null }))
  const known = parts.filter((p) => p.energy)
  if (!known.length) return null
  const total = systemEnergy(known.map((p) => p.energy!))
  const j = (v: number) => `${v.toFixed(2)} J`
  // The split between movement and height, as a bar: watching it tip over as something falls is
  // the whole lesson.
  const share = total.total > 1e-9 ? Math.max(0, Math.min(1, total.kinetic / (total.kinetic + Math.max(0, total.potential)))) : 0

  return (
    <>
      <div className="section-title mt-2">Energy</div>
      <div className="px-3 pb-2">
        <div className="flex h-2 overflow-hidden rounded-full border border-[var(--line-2)]">
          <div className="bg-[var(--accent)]" style={{ width: `${share * 100}%` }} title="Kinetic" />
          <div className="flex-1 bg-[var(--warn)]" title="Potential" />
        </div>
        <div className="mt-1 flex justify-between text-[11.5px]">
          <span className="text-[var(--accent)]">KE {j(total.kinetic)}</span>
          <span className="text-[var(--warn)]">PE {j(total.potential)}</span>
          <span className="font-semibold text-zinc-200">total {j(total.total)}</span>
        </div>
      </div>
      {known.map(({ def, state, energy }) => (
        <div key={def.id} className="flex items-center gap-2 px-3 text-[11.5px] text-zinc-400">
          <span className="w-14 shrink-0 truncate text-zinc-300">{def.name}</span>
          <span className="w-20 tabular-nums">KE {energy!.kinetic.toFixed(2)}</span>
          <span className="w-20 tabular-nums">PE {energy!.potential.toFixed(2)}</span>
          <span className="tabular-nums" title="Momentum, mass × velocity">
            p {momentumSize(state!).toFixed(2)} kg m/s
          </span>
        </div>
      ))}
      <div className="px-3 pt-1 text-[11px] text-zinc-500">Heights are measured from the top of the floor.</div>
    </>
  )
}

/**
 * Experiments to start from. A blank floor with a ball on it is not a starting point for someone
 * who has never opened a physics simulator; every one of these is a question with an answer.
 */
function Presets() {
  const setScene = useSandbox((s) => s.setScene)
  const [open, setOpen] = useState(false)
  return (
    <div className="px-2 pb-1">
      <button className="btn h-7 w-full justify-start" onClick={() => setOpen((v) => !v)} title="Ready-made experiments">
        <Beaker size={13} /> Start from an experiment
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="rounded-md border border-[var(--line-2)] px-2 py-1.5 text-left hover:bg-[#26282d]"
              onClick={() => {
                const built = p.build()
                setScene(built.bodies, { ...DEFAULT_WORLD, ...(built.world ?? {}) })
                setOpen(false)
              }}
            >
              <div className="font-semibold text-zinc-100">{p.label}</div>
              <div className="text-[11.5px] leading-snug text-zinc-400">{p.about}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Launch at an angle. Working out vₓ = v cos θ and v_y = v sin θ by hand before you can even
 * start the simulation is exactly the arithmetic the simulator is supposed to do for you — and
 * the components are shown, so it is still a lesson rather than a black box.
 */
function Launcher({ id }: { id: string }) {
  const update = useSandbox((s) => s.updateBody)
  const [speed, setSpeed] = useState(12)
  const [angle, setAngle] = useState(45)
  const v = launchVelocity(speed, angle)
  return (
    <div className="prop-row">
      <label title="Set the velocity from a speed and an angle">Launch</label>
      <div className="flex flex-wrap items-center gap-1">
        <NumField value={speed} onChange={setSpeed} />
        <span className="text-zinc-500">m/s at</span>
        <NumField value={angle} onChange={setAngle} />
        <span className="text-zinc-500">°</span>
        <button className="btn" onClick={() => update(id, { velocity: v })}>
          <Rocket size={12} /> Set
        </button>
        <div className="w-full pt-0.5 text-[11.5px] tabular-nums text-zinc-500">
          vₓ = {v[0].toFixed(2)} m/s · v_y = {v[1].toFixed(2)} m/s
        </div>
      </div>
    </div>
  )
}

/** Taking back the last change. Deleting the wrong object used to mean building it again. */
function UndoButton() {
  const past = useSandbox((s) => s.past)
  const undo = useSandbox((s) => s.undo)
  return (
    <button className="btn" disabled={past.length === 0} onClick={undo} title="Undo the last change to the objects (Ctrl+Z)">
      <Undo2 size={13} /> Undo
    </button>
  )
}
