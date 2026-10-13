// The Sandbox panel’s Selected section (moved word for word from panels/Sandbox.tsx, SB2).

import { Rocket } from 'lucide-react'
import { Fragment, useState } from 'react'
import { dragCoefficient, materialById, MATERIALS } from '../../sim/materials'
import { engine, massOf } from '../../sim/store'
import { type BodyDef, type BodyState, type ShapeKind } from '../../sim/types'
import { launchVelocity } from '../../sim/presets'
import { launch, launchNote } from '../../sim/launch'
import { ALWAYS_SHOWN, BODY_FOLDS, CONTACT_HINT, controlsIn, showsMotionAids, type ControlKey } from '../../sim/inspector'
import { NumField } from '../../ui/fields'
import { colourNote, pickerColour } from '../../sim/palette'
import { themeColor, useTheme } from '../../app/theme'
import { useNum, Vec3Row, SizeRow, Slider, Fold } from './common'
import { ReplayLock, useReplayLocked } from './ReplayLock'
import { PendulumFold } from './PendulumFold'
import { LeverFold } from './LeverFold'
import { NowBox } from './NowBox'

/** Shapes that roll, so only they are offered a rolling-resistance figure. */
const ROLLING_SHAPES = new Set<ShapeKind>(['sphere', 'cylinder', 'capsule'])

export function Selected({ sel, live, update }: { sel: BodyDef; live: BodyState | null; update: (id: string, patch: Partial<BodyDef>) => void }) {
  // A theme colour reads differently in each theme, so the colour row is drawn again on a switch.
  useTheme((t) => t.theme)
  const moves = sel.motion === 'dynamic'
  const locked = useReplayLocked()
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
    mass: () => <MassRow sel={sel} update={update} />,
    position: () => <Vec3Row label="Position" unit="m" value={sel.position} live={live?.position ?? null} onChange={(position) => update(sel.id, { position })} />,
    velocity: () => moves && <Vec3Row label="Velocity" unit="m/s" value={sel.velocity} live={live?.velocity ?? null} onChange={(velocity) => update(sel.id, { velocity })} />,
    color: () => (
      <div className="prop-row">
        <label>Colour</label>
        <div className="flex items-center gap-2">
          {/* The picker takes six hex digits and nothing else: handed a theme colour it showed black. */}
          <input type="color" className="h-6 w-10 cursor-pointer rounded border border-[color:var(--line-2)] bg-transparent" value={pickerColour(sel.color, themeColor)} onChange={(e) => update(sel.id, { color: e.target.value })} title="Its own colour; choosing a material sets it back" />
          <span className="text-small text-[color:var(--text-faint)]">{colourNote(sel)}</span>
        </div>
      </div>
    ),
    // A fixed object never moves: no arrow or trail to offer (H27).
    show: () => showsMotionAids(sel) && (
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
    friction: () => (
      <>
        <Slider label="Friction μ" value={sel.friction} min={0} max={1.5} step={0.01} onChange={(friction) => update(sel.id, { friction })} />
        <div className="px-3 pb-1 text-fine text-[color:var(--text-faint)]">{CONTACT_HINT}</div>
      </>
    ),
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
          disabled={locked}
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
      {/* The object's numbers, standing still and large: a speed written on a fast ball cannot be read (the owner, 13 Oct). */}
      {moves && <NowBox sel={sel} live={live} />}
      <ReplayLock>{draw(ALWAYS_SHOWN)}</ReplayLock>

      {moves && (
        <Fold id="launcher">
          <Launcher id={sel.id} />
        </Fold>
      )}

      {/* Only for a body that hangs from a pivot by a string, a rod or a rope; keyed so a note about one bob is not shown under another. */}
      {moves && <PendulumFold key={sel.id} sel={sel} />}

      {/* Lever moments and sliding hanger controls when a lever beam or hanger is selected */}
      <LeverFold key={`lever-${sel.id}`} sel={sel} />

      {BODY_FOLDS.map((fold) => (
        <Fold key={fold} id={fold}>
          {draw(controlsIn(fold))}
        </Fold>
      ))}
    </>
  )
}

/**
 * The mass row: worked out from the material and the size, or typed. Its own component (SB63) because the simple panel
 * shows this one row of the inspector too, and one control must not become two.
 */
export function MassRow({ sel, update }: { sel: BodyDef; update: (id: string, patch: Partial<BodyDef>) => void }) {
  const num = useNum()
  // A fixed wall's mass means nothing.
  if (sel.motion !== 'dynamic') return null
  return (
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
  )
}

/**
 * Launch at an angle. Working out vₓ = v cos θ and vᵧ = v sin θ by hand before you can even
 * start the simulation is exactly the arithmetic the simulator is supposed to do for you — and
 * the components are shown, so it is still a lesson rather than a black box.
 */
function Launcher({ id }: { id: string }) {
  const num = useNum()
  const [speed, setSpeed] = useState(12)
  const [angle, setAngle] = useState(45)
  const [note, setNote] = useState<string | null>(null)
  const v = launchVelocity(speed, angle)
  return (
    <div className="prop-row">
      <label title="Before Play this is the start; part-way through a run it throws the object now">Launch</label>
      <div className="flex flex-wrap items-center gap-1">
        <NumField value={speed} onChange={setSpeed} />
        <span className="text-[color:var(--text-faint)]">m/s at</span>
        <NumField value={angle} onChange={setAngle} />
        <span className="text-[color:var(--text-faint)]">°</span>
        <button className="btn" onClick={() => setNote(launchNote(launch(id, v)))}>
          <Rocket size={12} /> Set
        </button>
        {note && <div className="w-full pt-0.5 text-small text-[color:var(--text-dim)]">{note}</div>}
        <div className="w-full pt-0.5 text-small tabular-nums text-[color:var(--text-faint)]">
          vₓ = {num(v[0], 'm/s')} · vᵧ = {num(v[1], 'm/s')}
        </div>
      </div>
    </div>
  )
}
