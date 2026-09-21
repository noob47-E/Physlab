// The sandbox control panel: what is in the world, and how the world behaves.

import { Beaker, Box, ChevronDown, ChevronRight, Circle, CircleDot, Cone, Cylinder, Eraser, Link2, Minus, Pause, Pill, Play, Plus, RectangleHorizontal, Redo2, Rocket, RotateCcw, SkipForward, Square, TableProperties, Trash2, Triangle, Undo2, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useScene } from '../core/store'
import { dragCoefficient, materialById, MATERIALS } from '../sim/materials'
import { energyOf, groundTopOf, momentumSize, systemEnergy } from '../sim/energy'
import { engine, massOf, useSandbox } from '../sim/store'
import { DEFAULT_WORLD, GRAVITY_PRESETS, LINK_LABELS, type BodyDef, type BodyState, type LinkKind, type ShapeKind } from '../sim/types'
import { groupedPresets, launchVelocity, presetBadges, startPreset, type Preset } from '../sim/presets'
import { LINK_KINDS } from '../sim/links'
import { joinPrompt, LINK_CARDS, linkCard, noWheelNote, wheelsAbove } from '../sim/join'
import { ALWAYS_SHOWN, BODY_FOLDS, connectionsProminent, controlsIn, FOLD_TITLES, joinCandidates, readFold, writeFold, type ControlKey, type FoldId, type FoldStore } from '../sim/inspector'
import { QUANTITIES, quantity, tableFrom, type QuantityKey } from '../sim/recording'
import { useLab } from '../lab/labStore'
import type { SceneSettings } from '../core/types'
import { LabChart } from './LabChart'
import { enterMode } from '../app/layout'
import { useJoltState } from '../sim/jolt'
import { NumField } from '../ui/fields'
import { formatMeasure } from '../math/format'
import { useToolCard } from '../ui/useToolCard'

/** Shapes that roll, so only they are offered a rolling-resistance figure. */
const ROLLING_SHAPES = new Set<ShapeKind>(['sphere', 'cylinder', 'capsule'])

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
  { shape: 'wall', label: 'Wall', icon: <RectangleHorizontal size={13} className="rotate-90" /> },
  { shape: 'pulley', label: 'Pulley', icon: <CircleDot size={13} /> }
]

type V = [number, number, number]

/** Every number on this panel goes through the student's precision setting (rule 4). */
const useNum = () => {
  const settings = useScene((s) => s.settings)
  return (v: number, unit = '') => `${formatMeasure(v, 'number', settings)}${unit ? ` ${unit}` : ''}`
}

function Vec3Row({ label, value, unit, live, onChange }: { label: string; value: V; unit?: string; live?: V | null; onChange: (v: V) => void }) {
  const num = useNum()
  return (
    <div className="prop-row">
      <label>
        {label} {unit && <span className="text-[color:var(--text-faint)]">{unit}</span>}
      </label>
      {live ? (
        // While the run plays these are what the engine says, not what was typed: the typed
        // values are the start of the run and come back with Reset.
        <div className="flex gap-1 tabular-nums text-[color:var(--text)]" title="Live value; pause to edit the starting value">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <span key={axis} className="min-w-0 flex-1 truncate">
              <span className="text-fine italic text-[color:var(--text-faint)]">{axis} </span>
              {num(live[i])}
            </span>
          ))}
        </div>
      ) : (
        <div className="flex gap-1">
          {(['x', 'y', 'z'] as const).map((axis, i) => (
            <label key={axis} className="flex min-w-0 flex-1 items-center gap-1">
              <span className="text-fine italic text-[color:var(--text-faint)]">{axis}</span>
              <NumField
                value={value[i]}
                onChange={(n) => {
                  const next: V = [...value]
                  next[i] = n
                  onChange(next)
                }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Only the dimensions the shape actually uses: a ball has a radius, not a width, a height and a depth. */
function SizeRow({ sel, onChange }: { sel: BodyDef; onChange: (size: V) => void }) {
  const [a, b, c] = sel.size
  const fields: { label: string; value: number; set: (v: number) => V }[] =
    sel.shape === 'sphere'
      ? [{ label: 'radius', value: a, set: (r) => [r, r, r] }]
      : sel.shape === 'cylinder' || sel.shape === 'capsule'
        ? [
            { label: 'radius', value: a, set: (r) => [r, b, r] },
            { label: 'height', value: b, set: (h) => [a, h, a] }
          ]
        : [
            { label: 'width', value: a, set: (w) => [w, b, c] },
            { label: 'height', value: b, set: (h) => [a, h, c] },
            { label: 'depth', value: c, set: (d) => [a, b, d] }
          ]
  return (
    <div className="prop-row">
      <label>
        Size <span className="text-[color:var(--text-faint)]">m</span>
      </label>
      <div className="flex gap-1">
        {fields.map((f) => (
          <label key={f.label} className="flex min-w-0 flex-1 items-center gap-1" title={f.label}>
            <span className="text-fine text-[color:var(--text-faint)]">{f.label[0]}</span>
            <NumField value={f.value} onChange={(v) => onChange(f.set(Math.max(0.01, v)))} />
          </label>
        ))}
      </div>
    </div>
  )
}

function Slider({ label, title, value, min, max, step, onChange, digits = 2 }: { label: string; title?: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; digits?: number }) {
  const settings = useScene((s) => s.settings)
  const shown = formatMeasure(value, 'number', { ...settings, decimals: Math.max(settings.decimals, digits), precisionMode: 'dp' } as SceneSettings)
  return (
    <div className="prop-row">
      <label title={title}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="w-12 text-right tabular-nums text-[color:var(--text-dim)]">{shown}</span>
      </div>
    </div>
  )
}

const foldStore = (): FoldStore | null => (typeof localStorage === 'undefined' ? null : localStorage)

/**
 * A section a student can fold away. Whether it is open is remembered between sessions, so a
 * student who always wants the launcher never has to open it twice. `force` holds it open and
 * lit, for the moment it is the thing they need (Connections, once two objects are chosen).
 */
function Fold({ id, title, open: fallback = false, force = false, children }: { id: FoldId; title?: string; open?: boolean; force?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => readFold(id, fallback, foldStore()))
  const shown = force || open
  return (
    <>
      <button
        className={`section-title mt-1 w-full text-left ${force ? 'text-[color:var(--accent)]' : ''}`}
        onClick={() => {
          // While it is held open a click changes nothing on screen, so it must not change what
          // is remembered either: the section would otherwise reappear folded, or unfolded,
          // against what the student last chose.
          if (force) return
          setOpen(!open)
          writeFold(id, !open, foldStore())
        }}
      >
        {shown ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {title ?? FOLD_TITLES[id]}
      </button>
      {shown && children}
    </>
  )
}

export function Sandbox() {
  const bodies = useSandbox((s) => s.bodies)
  const selection = useSandbox((s) => s.selection)
  const partner = useSandbox((s) => s.partner)
  const live = useSandbox((s) => s.live)
  const add = useSandbox((s) => s.addBody)
  const update = useSandbox((s) => s.updateBody)
  const remove = useSandbox((s) => s.removeBody)
  const select = useSandbox((s) => s.select)
  const setPartner = useSandbox((s) => s.setPartner)
  const joinMode = useSandbox((s) => s.joinMode)
  const startJoin = useSandbox((s) => s.startJoin)
  const joinPick = useSandbox((s) => s.joinPick)
  const playing = useScene((s) => s.playing)
  const num = useNum()
  const sel = bodies.find((b) => b.id === selection)
  const loading = useJoltState() !== 'ready'
  const hasFloor = bodies.some((b) => b.shape === 'ground')

  return (
    <div className="panel pb-6">
      <Transport />
      {loading && <div className="px-3 pt-3 text-[color:var(--text-dim)]">Starting the physics engine…</div>}

      <div className="section-title">Objects</div>
      <Presets />

      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
        {ADD.map((a) => (
          <AddButton key={a.shape} shape={a.shape} label={a.label} icon={a.icon} onClick={() => add(a.shape)} />
        ))}
        {/* Deleting the floor used to be final. */}
        {!hasFloor && (
          <button className="btn h-7" onClick={() => add('ground')} title="Put a floor back">
            <Plus size={11} />
            <Square size={13} /> Floor
          </button>
        )}
        {/* The guided way to a rope, a spring or a pulley. Joining used to need a selection, a
            Shift+click and a fold nobody had opened: "there are no ropes" was the report. */}
        {!joinMode && (
          <button className="btn h-7" data-tour="connect" onClick={startJoin} title="Click one object, then another, then pick a string, rod, spring, rope, pulley, hinge or weld">
            <Link2 size={13} /> Connect two objects
          </button>
        )}
      </div>
      {joinMode && <JoinGuide />}

      {bodies.map((b) => {
        const chosen = b.id === selection
        const paired = b.id === partner
        const asleep = playing && live[b.id]?.asleep && b.motion === 'dynamic'
        return (
          <div
            key={b.id}
            className={`group flex h-7 cursor-pointer items-center gap-2 px-3 ${chosen ? 'bg-[var(--sel-row)]' : 'hover:bg-[var(--bg-3)]'}`}
            title={joinMode ? 'Click to choose it' : selection && !chosen ? 'Click to select; Shift+click to join it to the selected object' : undefined}
            onClick={(e) => {
              // While connecting, a click is a pick — here or in the drawing, the same.
              if (joinMode) joinPick(b.id)
              // Shift-click chooses the second object of a pair, the same as in the viewport.
              else if (e.shiftKey && selection && !chosen) setPartner(paired ? null : b.id)
              else select(chosen ? null : b.id)
            }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} />
            <span className="w-14 shrink-0 truncate font-semibold text-[color:var(--text-strong)]">{b.name}</span>
            <span className="min-w-0 flex-1 truncate text-small text-[color:var(--text-dim)]">
              {/* A bolted-down floor reporting "9408 kg" only invites the question "why does the
                  ground weigh nine tonnes?" — for a static body the mass means nothing. */}
              {b.shape} {b.motion === 'static' ? '· fixed' : `· ${num(massOf(b), 'kg')}`}
              {asleep && <span title="At rest: the engine has let it settle. Drag it or press Reset to wake it."> · asleep</span>}
              {paired && <span className="text-[color:var(--accent)]"> · joining</span>}
            </span>
            <button
              className="hidden text-[color:var(--text-dim)] hover:text-[color:var(--bad)] group-hover:block"
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

      {sel && <Selected sel={sel} live={playing ? (live[sel.id] ?? null) : null} update={update} />}

      <Connections selected={selection} partner={partner} />
      <EnergyReadout />
      <Recording />
      <Collisions />
      <WorldSection />
    </div>
  )
}

/** Play, Reset, undo and the clock, pinned to the top so they are never below three screens of settings. */
function Transport() {
  const engineTime = useSandbox((s) => s.engineTime)
  const past = useSandbox((s) => s.past)
  const future = useSandbox((s) => s.future)
  const undo = useSandbox((s) => s.undo)
  const redo = useSandbox((s) => s.redo)
  const resetRun = useSandbox((s) => s.resetRun)
  const clearTrails = useSandbox((s) => s.clearTrails)
  const anyTrail = useSandbox((s) => s.bodies.some((b) => b.trace))
  const playing = useScene((s) => s.playing)
  const setPlaying = useScene((s) => s.setPlaying)
  const num = useNum()
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-[color:var(--line)] bg-[var(--bg-1)] px-3 py-2">
      <button className="btn primary" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
        {playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}
      </button>
      <button
        className="btn"
        onClick={() => {
          setPlaying(false)
          resetRun()
        }}
        title="Every object back to its starting position, t = 0"
      >
        <RotateCcw size={13} /> Reset
      </button>
      <button
        className="icon-btn"
        onClick={() => {
          setPlaying(false)
          engine.world?.step(1 / 60)
          useSandbox.setState({ engineTime: engine.world?.time ?? 0 })
        }}
        title="Step one frame (1/60 s)"
      >
        <SkipForward size={13} />
      </button>
      <button className="icon-btn" disabled={past.length === 0} onClick={undo} title="Undo the last change to the objects (Ctrl+Z)">
        <Undo2 size={13} />
      </button>
      <button className="icon-btn" disabled={future.length === 0} onClick={redo} title="Redo (Ctrl+Y)">
        <Redo2 size={13} />
      </button>
      <button className="icon-btn" disabled={!anyTrail} onClick={clearTrails} title="Clear every trail">
        <Eraser size={13} />
      </button>
      {/* The clock is the number every kinematics question needs; it used to be the hardest
          thing on the panel to read. */}
      <span className="ml-auto tabular-nums text-[color:var(--text-strong)]">t = {num(engineTime, 's')}</span>
    </div>
  )
}

function Selected({ sel, live, update }: { sel: BodyDef; live: BodyState | null; update: (id: string, patch: Partial<BodyDef>) => void }) {
  const num = useNum()
  const moves = sel.motion === 'dynamic'
  // One row per control, placed by the table in sim/inspector.ts rather than by hand here: the
  // five in ALWAYS_SHOWN come first, and each fold below draws the rows the table files under it.
  // A row that means nothing for this body (the mass of a fixed wall) renders nothing.
  const rows: Record<ControlKey, () => React.ReactNode> = {
    name: () => (
      <div className="prop-row">
        <label>Name</label>
        <input className="field" value={sel.name} onChange={(e) => update(sel.id, { name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </div>
    ),
    material: () => (
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
    ),
    mass: () =>
      moves && (
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
            {sel.massMode === 'mass' ? <NumField value={sel.mass} onChange={(mass) => update(sel.id, { mass: Math.max(0.001, mass) })} /> : <span className="tabular-nums text-[color:var(--text)]">{num(massOf(sel), 'kg')}</span>}
          </div>
        </div>
      ),
    position: () => <Vec3Row label="Position" unit="m" value={sel.position} live={live?.position ?? null} onChange={(position) => update(sel.id, { position })} />,
    velocity: () => moves && <Vec3Row label="Velocity" unit="m/s" value={sel.velocity} live={live?.velocity ?? null} onChange={(velocity) => update(sel.id, { velocity })} />,
    color: () => (
      <div className="prop-row">
        <label>Colour</label>
        <div className="flex items-center gap-2">
          <input type="color" className="h-6 w-10 cursor-pointer rounded border border-[color:var(--line-2)] bg-transparent" value={sel.color} onChange={(e) => update(sel.id, { color: e.target.value })} title="Its own colour; choosing a material sets it back" />
          <span className="text-small text-[color:var(--text-faint)]">{materialById(sel.material).color === sel.color ? `the colour of ${materialById(sel.material).label.toLowerCase()}` : 'custom'}</span>
        </div>
      </div>
    ),
    show: () => (
      <div className="prop-row">
        <label>Show</label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={!!sel.showArrows} onChange={(e) => update(sel.id, { showArrows: e.target.checked })} /> velocity arrow
          </label>
          <label className="flex items-center gap-1.5" title="Draw the path it takes, so a projectile leaves its parabola behind">
            <input type="checkbox" checked={!!sel.trace} onChange={(e) => update(sel.id, { trace: e.target.checked })} /> trail
          </label>
        </div>
      </div>
    ),
    size: () => <SizeRow sel={sel} onChange={(size) => update(sel.id, { size })} />,
    rotation: () => <Vec3Row label="Rotation" unit="°" value={sel.rotation} onChange={(rotation) => update(sel.id, { rotation })} />,
    motion: () => (
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
    ),
    restitution: () => <Slider label="Bounciness e" value={sel.restitution} min={0} max={1} step={0.01} onChange={(restitution) => update(sel.id, { restitution })} />,
    friction: () => <Slider label="Friction μ" value={sel.friction} min={0} max={1.5} step={0.01} onChange={(friction) => update(sel.id, { friction })} />,
    angularVelocity: () => moves && <Vec3Row label="Spin" unit="rad/s" value={sel.angularVelocity} live={live?.angularVelocity ?? null} onChange={(angularVelocity) => update(sel.id, { angularVelocity })} />,
    lock: () =>
      moves && (
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
      ),
    // The engine has applied drag since the first version, using a default for the shape. A
    // student matching a textbook figure needs to be able to set it.
    dragCd: () => <Slider label="Air drag Cd" value={sel.dragCd ?? dragCoefficient(sel.shape)} min={0} max={1.5} step={0.01} onChange={(dragCd) => update(sel.id, { dragCd })} />,
    linearDamping: () => <Slider label="Slows down" title="Damping: how quickly it loses speed to everything not modelled" value={sel.linearDamping} min={0} max={1} step={0.01} onChange={(linearDamping) => update(sel.id, { linearDamping })} />,
    rolling: () =>
      ROLLING_SHAPES.has(sel.shape) && (
        <Slider label="Rolls against" title="Rolling resistance: why a ball stops on concrete and runs on ice" value={sel.rolling ?? materialById(sel.material).rolling} min={0} max={0.1} step={0.001} digits={3} onChange={(rolling) => update(sel.id, { rolling })} />
      )
  }
  const draw = (keys: readonly ControlKey[]) => keys.map((k) => <Fragment key={k}>{rows[k]()}</Fragment>)
  return (
    <>
      <div className="section-title mt-2 flex items-center">
        <span className="flex-1">{sel.name}</span>
        <button
          className="btn h-6"
          title="Put it back where its definition says, at rest"
          onClick={() => {
            engine.world?.placeBody(sel.id, sel.position)
          }}
        >
          Put back
        </button>
      </div>
      {/* Five rows at first sight — the ones every mechanics question is about. The rest of the
          twenty-odd controls sit under folds below, where the student who wants them finds them
          and the one who does not never has to read past them. */}
      {draw(ALWAYS_SHOWN)}

      {moves && (
        <Fold id="launcher">
          <Launcher id={sel.id} />
        </Fold>
      )}

      {BODY_FOLDS.map((fold) => (
        <Fold key={fold} id={fold}>
          {draw(controlsIn(fold))}
        </Fold>
      ))}
    </>
  )
}

/** Gravity, air and the view; the exact-accuracy and sleeping controls fold away. */
function WorldSection() {
  const world = useSandbox((s) => s.world)
  const setWorld = useSandbox((s) => s.setWorld)
  const sideView = useSandbox((s) => s.sideView)
  const setSideView = useSandbox((s) => s.setSideView)
  return (
    <>
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
          {world.airDensity > 0 && <span className="tabular-nums text-[color:var(--text-dim)]">{world.airDensity} kg/m³</span>}
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
        <label>Slow motion</label>
        <div className="seg">
          {[1, 0.5, 0.25, 0.1].map((t) => (
            <button key={t} className={world.timeScale === t ? 'on' : ''} onClick={() => setWorld({ timeScale: t })}>
              {t === 1 ? 'normal' : `×${t}`}
            </button>
          ))}
        </div>
      </div>
      <Fold id="world-more">
        <div className="prop-row">
          <label>2D mode</label>
          <input type="checkbox" checked={world.twoD} title="Hold everything in one flat plane, the way textbook problems are drawn" onChange={(e) => setWorld({ twoD: e.target.checked })} />
        </div>
        <div className="prop-row">
          <label title="A body that has stopped is allowed to fall asleep and costs nothing until something touches it">Can settle</label>
          <input type="checkbox" checked={world.allowSleeping} onChange={(e) => setWorld({ allowSleeping: e.target.checked })} />
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
      </Fold>
    </>
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
  const num = useNum()
  const datum = groundTopOf(bodies)

  const moving = bodies.filter((b) => b.motion === 'dynamic')
  const parts = moving.map((b) => ({ def: b, state: live[b.id], energy: live[b.id] ? energyOf(b, live[b.id], gravity, datum) : null }))
  const known = parts.filter((p) => p.energy)
  if (!known.length) return null
  const total = systemEnergy(known.map((p) => p.energy!))
  // The split between movement and height, as a bar: watching it tip over as something falls is
  // the whole lesson.
  const pe = Math.max(0, total.potential)
  const share = total.kinetic + pe > 1e-9 ? total.kinetic / (total.kinetic + pe) : 0

  return (
    <>
      <div className="section-title mt-2">Energy</div>
      <div className="px-3 pb-2">
        <div className="flex h-2 overflow-hidden rounded-full border border-[color:var(--line-2)]">
          <div className="bg-[var(--accent)]" style={{ width: `${share * 100}%` }} title="Kinetic" />
          <div className="flex-1 bg-[var(--warn)]" title="Potential" />
        </div>
        <div className="mt-1 flex justify-between text-small">
          <span className="text-[color:var(--accent)]">KE {num(total.kinetic, 'J')}</span>
          <span className="text-[color:var(--warn)]">PE {num(total.potential, 'J')}</span>
          <span className="font-semibold text-[color:var(--text-strong)]">total {num(total.total, 'J')}</span>
        </div>
      </div>
      {known.map(({ def, state, energy }) => (
        <div key={def.id} className="flex items-center gap-2 px-3 text-small text-[color:var(--text-dim)]">
          <span className="w-14 shrink-0 truncate text-[color:var(--text)]">{def.name}</span>
          <span className="w-20 tabular-nums">KE {num(energy!.kinetic)}</span>
          <span className="w-20 tabular-nums">PE {num(energy!.potential)}</span>
          <span className="tabular-nums" title="Momentum, mass × velocity">
            p {num(momentumSize(state!), 'kg m/s')}
          </span>
        </div>
      ))}
      <div className="px-3 pt-1 text-fine text-[color:var(--text-faint)]">Heights are measured from the top of the floor.</div>
    </>
  )
}

/** The last few collisions: recorded from the first version, shown for the first time. */
function Collisions() {
  const contacts = useSandbox((s) => s.contacts)
  const bodies = useSandbox((s) => s.bodies)
  const num = useNum()
  const name = (id: string) => bodies.find((b) => b.id === id)?.name ?? '?'
  const shown = contacts.filter((c) => c.approachSpeed > 0.05).slice(0, 6)
  if (!shown.length) return null
  return (
    <Fold id="collisions" title={`Collisions · ${contacts.length}`}>
      {shown.map((c, i) => (
        <div key={i} className="flex items-center gap-2 px-3 text-small text-[color:var(--text-dim)]">
          <span className="w-16 tabular-nums">t = {num(c.t)} s</span>
          <span className="text-[color:var(--text)]">
            {name(c.a)} – {name(c.b)}
          </span>
          <span className="ml-auto tabular-nums" title="How fast they were closing">
            {num(c.approachSpeed, 'm/s')}
          </span>
        </div>
      ))}
    </Fold>
  )
}

/**
 * Experiments to start from. A blank floor with a ball on it is not a starting point for someone
 * who has never opened a physics simulator; every one of these is a question with an answer.
 */
function Presets() {
  const setScene = useSandbox((s) => s.setScene)
  const setPlaying = useScene((s) => s.setPlaying)
  const [open, setOpen] = useState(false)
  // One group per topic, and each row says what it joins things with, so a student looking for
  // a rope or a pulley can see where they are without opening twenty-nine experiments.
  const groups = useMemo(() => groupedPresets().map((g) => ({ ...g, rows: g.presets.map((p) => ({ p, badges: presetBadges(p) })) })), [])
  const load = (p: Preset) => {
    const built = p.build()
    setPlaying(false)
    setScene(built.bodies, { ...DEFAULT_WORLD, ...(built.world ?? {}) }, built.links ?? [])
    setOpen(false)
  }
  return (
    <div className="px-2 pb-1">
      {/* One ball, one floor, one Play button: the first thing to press, before any list. */}
      <button className="btn primary h-7 w-full justify-start" onClick={() => load(startPreset())} title={startPreset().about}>
        <Play size={13} /> Start here: {startPreset().label.toLowerCase()}
      </button>
      <button className="btn mt-1 h-7 w-full justify-start" onClick={() => setOpen((v) => !v)} title="Ready-made experiments">
        <Beaker size={13} /> Start from an experiment
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1">
          {groups.map((g) => (
            <Fragment key={g.topic}>
              <div className="section-title px-1 pb-0">{g.topic}</div>
              {g.rows.map(({ p, badges }) => (
                <button key={p.id} className="rounded-md border border-[color:var(--line-2)] px-2 py-1.5 text-left hover:bg-[var(--bg-3)]" onClick={() => load(p)} title={p.about}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-[color:var(--text-strong)]">{p.label}</span>
                    {badges.map((b) => (
                      <span key={b} className="badge text-fine text-[color:var(--text-dim)]">
                        {b === 'pulley' ? 'rope over a pulley' : b}
                      </span>
                    ))}
                  </div>
                  {/* Two lines here; the whole sentence is the tooltip and the panel once loaded. */}
                  <div className="line-clamp-2 text-small leading-snug text-[color:var(--text-dim)]">{p.about}</div>
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The three steps of Connect: which object, which other object, and what joins them — each kind
 * on a card that says in one line what it does. The picks come from the drawing or the list;
 * the rules (no floor, not the same object twice, a wheel above both for a pulley) live in
 * sim/join.ts and the store, so a refused click always comes with the reason.
 */
function JoinGuide() {
  const joinMode = useSandbox((s) => s.joinMode)
  const joinNote = useSandbox((s) => s.joinNote)
  const bodies = useSandbox((s) => s.bodies)
  const finishJoin = useSandbox((s) => s.finishJoin)
  const cancelJoin = useSandbox((s) => s.cancelJoin)
  // Esc stops connecting, from anywhere in the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelJoin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelJoin])
  if (!joinMode) return null
  const paired = joinMode.a && joinMode.b ? { a: joinMode.a, b: joinMode.b } : null
  const wheels = paired ? wheelsAbove(bodies, paired.a, paired.b) : []
  return (
    <div className="mx-2 mb-2 rounded-md border border-[color:var(--accent)] px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Link2 size={13} className="shrink-0 text-[color:var(--accent)]" />
        <span className="flex-1 font-semibold text-[color:var(--text-strong)]">{joinPrompt(joinMode, bodies)}</span>
        <button className="icon-btn" title="Stop connecting (Esc)" onClick={cancelJoin}>
          <X size={13} />
        </button>
      </div>
      {joinMode.step !== 'kind' && <div className="text-small text-[color:var(--text-faint)]">Click it in the drawing or in the list below. Esc stops.</div>}
      {joinNote && <div className="pt-0.5 text-small text-[color:var(--warn)]">{joinNote}</div>}
      {joinMode.step === 'kind' && paired && (
        <div className="mt-1 flex flex-col gap-1">
          {LINK_CARDS.map((c) =>
            c.kind === 'pulley' ? (
              <KindCard key={c.kind} kind={c.kind}>
                {wheels.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {wheels.map((w) => (
                      <button key={w.id} className="btn" onClick={() => finishJoin('pulley', w.id)} title={`Run the rope over ${w.name}`}>
                        over {w.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="pt-0.5 text-small text-[color:var(--text-faint)]">{noWheelNote(bodies, paired.a, paired.b)}</div>
                )}
              </KindCard>
            ) : (
              <KindCard key={c.kind} kind={c.kind} onPick={() => finishJoin(c.kind)} />
            )
          )}
        </div>
      )}
    </div>
  )
}

/**
 * One ADD button. Resting on it opens its card (ui/ToolCard.tsx) — a looping picture of the shape
 * and one sentence — the same way a tool on the shelf does; the card replaces the title tooltip.
 */
function AddButton({ shape, label, icon, onClick }: { shape: ShapeKind; label: string; icon: React.ReactNode; onClick: () => void }) {
  const card = useToolCard(`add:${shape}`)
  return (
    <button className="btn h-7" onClick={onClick} {...card}>
      <Plus size={11} />
      {icon} {label}
    </button>
  )
}

/**
 * One way of joining, in the Connect flow. With `onPick` it is the button that finishes the join;
 * without, it is the pulley's card, whose choice is one of the wheel buttons in `children`.
 * Resting on either opens the link's card with its picture, beside the one-line rule already shown.
 */
function KindCard({ kind, onPick, children }: { kind: LinkKind; onPick?: () => void; children?: React.ReactNode }) {
  const card = useToolCard(`link:${kind}`)
  const c = linkCard(kind)
  const text = (
    <>
      <div className="font-semibold text-[color:var(--text-strong)]">{c.title}</div>
      <div className="text-small leading-snug text-[color:var(--text-dim)]">{c.line}</div>
    </>
  )
  if (onPick)
    return (
      <button className="rounded-md border border-[color:var(--line-2)] px-2 py-1 text-left hover:bg-[var(--bg-3)]" onClick={onPick} {...card}>
        {text}
      </button>
    )
  return (
    <div className="rounded-md border border-[color:var(--line-2)] px-2 py-1" {...card}>
      {text}
      {children}
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
  const num = useNum()
  const [speed, setSpeed] = useState(12)
  const [angle, setAngle] = useState(45)
  const v = launchVelocity(speed, angle)
  return (
    <div className="prop-row">
      <label title="Set the velocity from a speed and an angle">Launch</label>
      <div className="flex flex-wrap items-center gap-1">
        <NumField value={speed} onChange={setSpeed} />
        <span className="text-[color:var(--text-faint)]">m/s at</span>
        <NumField value={angle} onChange={setAngle} />
        <span className="text-[color:var(--text-faint)]">°</span>
        <button className="btn" onClick={() => update(id, { velocity: v })}>
          <Rocket size={12} /> Set
        </button>
        <div className="w-full pt-0.5 text-small tabular-nums text-[color:var(--text-faint)]">
          vₓ = {num(v[0], 'm/s')} · v_y = {num(v[1], 'm/s')}
        </div>
      </div>
    </div>
  )
}

/**
 * Joining two objects. A pendulum and a spring-mass system are half of school mechanics and
 * neither was possible before: there was no way to connect anything to anything.
 */
function Connections({ selected, partner }: { selected: string | null; partner: string | null }) {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const addLink = useSandbox((s) => s.addLink)
  const updateLink = useSandbox((s) => s.updateLink)
  const removeLink = useSandbox((s) => s.removeLink)
  const setPartner = useSandbox((s) => s.setPartner)
  const joinMode = useSandbox((s) => s.joinMode)
  const [kind, setKind] = useState<LinkKind>('string')
  const [over, setOver] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const name = (id: string) => bodies.find((b) => b.id === id)?.name ?? '?'
  const others = joinCandidates(bodies, selected)
  // The partner is the store's, so a shift-click in the viewport and this dropdown agree.
  const target = others.some((b) => b.id === partner) ? (partner ?? '') : ''
  const wheels = bodies.filter((b) => b.shape === 'pulley')
  const wheel = wheels.some((b) => b.id === over) ? over : (wheels[0]?.id ?? '')
  // The guide above has its own cards while it is up; the fold stays where it was.
  const prominent = connectionsProminent(selected, partner) && !joinMode

  return (
    <Fold id="connections" open force={prominent}>
      {selected ? (
        <div className={`prop-row ${prominent ? 'mx-1 rounded-md border border-[color:var(--accent)]' : ''}`}>
          <label>Join {name(selected)} to</label>
          <div className="flex flex-wrap items-center gap-1">
            <select className="field w-auto" value={target} onChange={(e) => setPartner(e.target.value || null)}>
              <option value="">choose…</option>
              {others.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value as LinkKind)}>
              {LINK_KINDS.map((k) => (
                <option key={k} value={k} title={LINK_LABELS[k]}>
                  {LINK_LABELS[k].split(' — ')[0]}
                </option>
              ))}
            </select>
            {kind === 'pulley' && (
              <select className="field w-auto" value={wheel} onChange={(e) => setOver(e.target.value)} title="Which pulley the rope runs over">
                {wheels.length === 0 && <option value="">add a Pulley first</option>}
                {wheels.map((b) => (
                  <option key={b.id} value={b.id}>
                    over {b.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className={`btn ${prominent ? 'primary' : ''}`}
              disabled={!target || (kind === 'pulley' && !wheel)}
              onClick={() => {
                if (!target) return
                const made = addLink(selected, target, kind, kind === 'pulley' ? wheel : undefined)
                setNote(made.ok ? null : made.why)
                if (made.ok) setPartner(null)
              }}
              title={LINK_LABELS[kind]}
            >
              <Link2 size={12} /> Join
            </button>
            {!target && <div className="w-full pt-0.5 text-fine text-[color:var(--text-faint)]">Or Shift+click the second object.</div>}
            {note && <div className="w-full pt-0.5 text-small text-[color:var(--warn)]">{note}</div>}
          </div>
        </div>
      ) : (
        <div className="px-3 pb-1 text-small text-[color:var(--text-faint)]">Pick an object, then Shift+click another to join them.</div>
      )}

      {links.map((l) => (
        <div key={l.id} className="prop-row">
          <label>
            {name(l.a)} – {name(l.b)} <span className="text-[color:var(--text-faint)]">{l.kind}</span>
          </label>
          <div className="flex items-center gap-1">
            {l.kind !== 'hinge' && l.kind !== 'weld' && (
              <>
                <span className="text-fine text-[color:var(--text-faint)]">L</span>
                <NumField value={l.length} onChange={(length) => updateLink(l.id, { length: Math.max(0.05, length) })} />
              </>
            )}
            {l.kind === 'spring' && (
              <>
                <span className="text-fine text-[color:var(--text-faint)]" title="Spring constant in newtons per metre">
                  k
                </span>
                <NumField value={l.stiffness} onChange={(stiffness) => updateLink(l.id, { stiffness: Math.max(0.01, stiffness) })} />
              </>
            )}
            <button className="icon-btn" title="Remove this connection" onClick={() => removeLink(l.id)}>
              <X size={13} />
            </button>
          </div>
        </div>
      ))}
    </Fold>
  )
}

/**
 * The run, as a graph and then as readings.
 *
 * This is where the Sandbox stops being a demonstration. Everything the simulation knows is
 * sampled ten times a second; the graph shows it while it happens, and "Send to Lab Data" hands
 * the same numbers to the table that already knows how to fit a line and read a gradient. Drop a
 * ball, send it over, plot y against t², and g falls out — without a single reading typed in.
 */
function Recording() {
  const bodies = useSandbox((s) => s.bodies)
  const recording = useSandbox((s) => s.recording)
  const selection = useSandbox((s) => s.selection)
  const clearRecording = useSandbox((s) => s.clearRecording)
  const [key, setKey] = useState<QuantityKey>('y')

  const moving = bodies.filter((b) => b.motion === 'dynamic')
  const watched = moving.find((b) => b.id === selection) ?? moving[0]
  const samples = watched ? (recording[watched.id] ?? []) : []
  const q = quantity(key)
  const xs = samples.map((s) => s.t)
  const ys = samples.map((s) => s[key])

  if (!watched) return null
  return (
    <>
      <div className="section-title mt-2 flex items-center">
        <span className="flex-1">Recording · {watched.name}</span>
        <span className="normal-case tracking-normal text-[color:var(--text-faint)]">{samples.length} readings</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3">
        <select className="field w-auto" value={key} onChange={(e) => setKey(e.target.value as QuantityKey)}>
          {QUANTITIES.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="text-[color:var(--text-faint)]">against time</span>
      </div>
      {samples.length > 1 ? (
        <div className="mt-1 px-1">
          <LabChart xs={xs} ys={ys} fit={null} xLabel="t / s" yLabel={`${q.label} / ${q.unit}`} height={150} />
        </div>
      ) : (
        <div className="px-3 pt-1 text-small text-[color:var(--text-faint)]">Press Play and the readings start arriving.</div>
      )}
      <div className="mt-1 flex flex-wrap gap-2 px-3">
        <button
          className="btn"
          disabled={samples.length < 2}
          title="Put these readings in a new Lab Data table, ready to plot and fit"
          onClick={() => {
            // appendTable, not setTables: setTables replaces the file's tables, points at the
            // first one and forgets the undo history, so the send used to land its table at the
            // end of a list Lab Data had no way to reach — it looked like it did nothing.
            useLab.getState().appendTable(tableFrom(watched.name, samples))
            enterMode('lab')
          }}
        >
          <TableProperties size={13} /> Send to Lab Data
        </button>
        <button className="btn" disabled={!samples.length} onClick={clearRecording}>
          Clear readings
        </button>
      </div>
    </>
  )
}
