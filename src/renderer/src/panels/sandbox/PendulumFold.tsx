// The Angle fold (SB62, an owner item): the rotation of any moving body on 3 axes, and for
// hanging bodies, the swing angle around the pivot. The arithmetic is sim/angles.ts and sim/pendulum.ts;
// this is the picture of it. The readout follows the run and, in a replay, the tape's playhead; the
// controls are an edit, so a recording on screen locks them (the fold leaves the readout live).

import { useState } from 'react'
import { engine, useSandbox } from '../../sim/store'
import { replayRefusal, stepAtOrBefore, tapes } from '../../sim/recorder'
import { shownTape, useTape } from '../../sim/tapeStore'
import { NumField } from '../../ui/fields'
import {
  MAX_ANGLE,
  PLANE_LABELS,
  anglesOf,
  isSlack,
  meaningLines,
  pivotOf,
  planPullBack,
  planesFor,
  protractorOf,
  rowsFor,
  slackSentence,
  whereFor,
  type Num,
  type Plane,
  type Row,
  type Where
} from '../../sim/pendulum'
import { angleDifference, angularSpeedDegrees, largestAngleSoFar, turnAt } from '../../sim/angles'
import { eulerToQuat } from '../../sim/rotate'
import type { BodyDef, BodyId } from '../../sim/types'
import type { V3 } from '../../math/vec'
import { Fold, useNum } from './common'
import { ReplayLock } from './ReplayLock'

/** The size of one nudge beside the angle box. */
const NUDGE = 5

/** What each row of the readout is called and what it means, under the student’s eye. */
const ROW_TEXT: Record<Row, { label: string; hint: string }> = {
  theta: { label: "Swing θ", hint: "from the vertical, the whole swing" },
  side: { label: "Side (x-y)", hint: "seen from the front, + toward +x" },
  depth: { label: "Depth (z-y)", hint: "seen from the side, + toward +z" },
  lean: { label: "Leans toward (φ)", hint: "in the floor’s plane, from +x" }
}

/** The 3-axis angle row labels and hints. */
const AXIS_TEXT = {
  x: { label: "About x (side to side)", hint: "rotation around the horizontal left-right axis" },
  y: { label: "About y (up)", hint: "rotation around the vertical axis" },
  z: { label: "About z (front to back)", hint: "rotation around the horizontal front-back axis" }
}

/**
 * Set: pulls the bob back to an angle and says what happened in a sentence. Before the run the bob's start moves with it;
 * paused part-way it is only put there. Part-way through a run the panel reads the engine's published values, and the
 * canvas only draws when something asks it to: a paused body that was only placed would otherwise look unmoved, so the
 * placed body is published and the body list is handed over again (the viewport redraws when it changes).
 */
export function pullBack(bobId: BodyId, angle: number, plane: Plane, num: Num): string {
  const s = useSandbox.getState()
  // The engine's reading when there is one, else the definitions: the same positions the plan was drawn from.
  const now: Where = (id) => engine.world?.state(id)?.position as V3 | undefined
  const plan = planPullBack({ bobId, bodies: s.bodies, links: s.links, where: now, twoD: s.world.twoD, engineTime: s.engineTime, refusal: replayRefusal(), num }, angle, plane)
  if (!plan.ok) return plan.sentence
  if (plan.setsStart) s.updateBody(bobId, { position: plan.position, velocity: [0, 0, 0], angularVelocity: [0, 0, 0] })
  engine.world?.placeBody(bobId, plan.position)
  const placed = engine.world?.state(bobId)
  useSandbox.setState((st) => ({ bodies: [...st.bodies], ...(st.engineTime > 0 && placed ? { live: { ...st.live, [bobId]: placed } } : {}) }))
  return `Pulled back to ${num(angle, '°')} in the ${PLANE_LABELS[plane]} plane, at rest.`
}

/** The fold. Shown for every moving body: the 3-axis rotation angles for all, and swing rows only for hanging bodies. */
export function PendulumFold({ sel }: { sel: BodyDef }) {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const live = useSandbox((s) => s.live)
  const world = useSandbox((s) => s.world)
  const num = useNum()
  // A recording on screen: the readout follows the shown step, not the engine. The step is the panels' moment (the
  // recorded step their clock reads, published about ten times a second while it plays, at once on a pause, scrub or
  // step), as every other panel shows it; following the playhead itself re-drew the fold every frame (0j2).
  const mode = useTape((s) => s.mode)
  const engineTime = useSandbox((s) => s.engineTime)
  const backwards = useTape((s) => s.mode !== 'live' && s.playing && s.direction === -1)
  useTape((s) => (s.mode === 'live' ? 0 : s.revision))
  const [angle, setAngle] = useState(30)
  const [plane, setPlane] = useState<Plane>('side')
  const [note, setNote] = useState<string | null>(null)

  const replaying = mode !== 'live'
  const tape = replaying ? shownTape() : null
  const playhead = replaying && tape ? stepAtOrBefore(tape, engineTime) : 0
  // Where each body is: the shown step of a recording; else the engine's reading while a run has
  // published one; else where its definition puts it.
  const where = whereFor({ replaying, tape, playhead, live })
  const pivot = pivotOf(sel.id, links, bodies, where)

  // Get the 3-axis angle readings: follow the tape in replay (its turn and spin at the step), else use live
  const recorded = replaying && tape ? turnAt(tape, playhead, sel.id, backwards) : null
  const rotState: readonly [number, number, number, number] = recorded?.rotation ?? live[sel.id]?.rotation ?? (eulerToQuat(sel.rotation) as readonly [number, number, number, number])
  const axisAngles = angleDifference(rotState, sel.rotation)
  const axisSpeeds = angularSpeedDegrees(recorded?.angularVelocity ?? (replaying ? [0, 0, 0] : (live[sel.id]?.angularVelocity ?? [0, 0, 0])))

  // In replay, calculate the largest angle per axis from the start to the playhead
  const largestAngles = replaying && tape
    ? largestAngleSoFar(tape, playhead, sel.id, sel.rotation, tapes.parent)
    : null

  const twoD = world.twoD
  const planes = planesFor(twoD)
  const shownPlane: Plane = planes.includes(plane) ? plane : 'side'

  const signed = (v: number) => `${v > 0 ? '+' : ''}${num(v, '°')}`

  // If there's a pivot, also calculate swing angles
  let swingData: { ang: ReturnType<typeof anglesOf> | null; slack: boolean; here: V3 } | null = null
  if (pivot) {
    const here = where(sel.id) ?? sel.position
    const ang = anglesOf(here, pivot.point)
    const slack = ang ? isSlack(pivot.kind, ang.distance, pivot.length) : false
    swingData = { ang, slack, here }
  }

  const set = () => setNote(pullBack(sel.id, angle, shownPlane, num))
  const nudge = (by: number) => setAngle(Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle + by)))

  const dial = swingData && swingData.ang && !swingData.slack ? protractorOf(swingData.ang.theta, swingData.ang.side < 0 ? -1 : 1) : null
  const g = world.gravity

  return (
    <Fold id="pendulum" open lock={false}>
      {/* The 3-axis angle readout for all bodies. */}
      <div className="px-3 pt-1 pb-1">
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-small">
          {/* About x, y, z rows */}
          {(['x', 'y', 'z'] as const).map((axis, idx) => (
            <div key={axis} className="contents">
              <span className="text-[color:var(--text-dim)]">{AXIS_TEXT[axis].label}</span>
              <span>
                <span className="tabular-nums text-[color:var(--text)]">{signed(axisAngles[idx])} {num(axisSpeeds[idx], '°/s')}</span>{' '}
                <span className="text-fine text-[color:var(--text-faint)]">{AXIS_TEXT[axis].hint}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Largest so far per axis (replay only) */}
      {largestAngles && (
        <div className="px-3 pt-1 pb-1">
          <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-small">
            {(['x', 'y', 'z'] as const).map((axis, idx) => (
              <div key={`largest-${axis}`} className="contents">
                <span className="text-[color:var(--text-dim)]">Largest {axis}</span>
                <span>
                  <span className="tabular-nums text-[color:var(--text)]">{num(largestAngles[idx], '°')}</span>{' '}
                  <span className="text-fine text-[color:var(--text-faint)]">the largest angle so far</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Swing rows only if the body hangs from a pivot. */}
      {swingData && (
        <>
          <div className="px-3 pt-1 pb-1">
            <h3 className="text-small font-semibold text-[color:var(--text-dim)]">Swing round its pivot</h3>
            <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 text-small">
              {rowsFor(twoD).map((row) => (
                <div key={row} className="contents">
                  <span className="text-[color:var(--text-dim)]">{twoD ? 'Angle (x–y)' : ROW_TEXT[row].label}</span>
                  <span>
                    <span className="tabular-nums text-[color:var(--text)]">
                      {dial
                        ? swingData.ang
                          ? row === 'theta'
                            ? num(swingData.ang.theta, '°')
                            : row === 'side'
                              ? signed(swingData.ang.side)
                              : row === 'depth'
                                ? signed(swingData.ang.depth)
                                : swingData.ang.lean === null
                                  ? swingData.ang.theta > 90
                                    ? 'straight up'
                                    : 'straight down'
                                  : num(swingData.ang.lean, '°')
                          : '—'
                        : '—'}
                    </span>{' '}
                    <span className="text-fine text-[color:var(--text-faint)]">{twoD ? 'from the vertical, + toward +x' : ROW_TEXT[row].hint}</span>
                  </span>
                </div>
              ))}
            </div>
            {/* The dial or the sentence that stands for it, in a box of the dial's height: a rope that goes slack mid-run must not
                pull everything below the fold up and down (Fix 22). */}
            <div className="mt-1 flex min-h-[124px] items-center justify-center">
              {dial && swingData.ang ? (
                <svg width={dial.box.width} height={dial.box.height} viewBox={`0 0 ${dial.box.width} ${dial.box.height}`} role="img" aria-label={`Protractor: the arm is ${num(swingData.ang.theta, '°')} from the vertical`}>
                  <circle cx={dial.pivot[0]} cy={dial.pivot[1]} r={dial.radius + 2} fill="none" stroke="var(--line-2)" strokeWidth="1" />
                  {dial.ticks.map((t, i) => (
                    <line key={i} x1={t[0]} y1={t[1]} x2={t[2]} y2={t[3]} stroke="var(--line-2)" strokeWidth="1" />
                  ))}
                  <line x1={dial.pivot[0]} y1={dial.pivot[1]} x2={dial.vertical[0]} y2={dial.vertical[1]} stroke="var(--text-faint)" strokeWidth="1" strokeDasharray="3 3" />
                  {dial.arc && <path d={dial.arc} fill="none" stroke="var(--warn)" strokeWidth="2" />}
                  <line x1={dial.pivot[0]} y1={dial.pivot[1]} x2={dial.arm[0]} y2={dial.arm[1]} stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
                  <circle cx={dial.arm[0]} cy={dial.arm[1]} r="5" fill="var(--accent)" />
                  <circle cx={dial.pivot[0]} cy={dial.pivot[1]} r="3" fill="var(--text-dim)" />
                </svg>
              ) : (
                <p role="status" className="text-small text-[color:var(--text-dim)]">
                  {swingData.ang ? slackSentence(pivot?.kind ?? 'string') : 'The bob is on its pivot, so there is no angle yet. Pull it back to one below.'}
                </p>
              )}
            </div>
          </div>

          <ReplayLock>
            <div className="prop-row">
              <label title="Move the bob round its pivot to this angle, keeping the length, and leave it at rest">Pull back</label>
              <div className="flex flex-wrap items-center gap-1">
                <button className="btn pointer-coarse:min-h-[44px]" title={`${num(NUDGE, '°')} less`} aria-label={`${num(NUDGE)} degrees less`} onClick={() => nudge(-NUDGE)}>
                  −{num(NUDGE, '°')}
                </button>
                <span className="w-16">
                  <NumField value={angle} onChange={setAngle} className="pointer-coarse:min-h-[44px]" />
                </span>
                <span className="text-[color:var(--text-faint)]">°</span>
                <button className="btn pointer-coarse:min-h-[44px]" title={`${num(NUDGE, '°')} more`} aria-label={`${num(NUDGE)} degrees more`} onClick={() => nudge(NUDGE)}>
                  +{num(NUDGE, '°')}
                </button>
                <span className="text-[color:var(--text-faint)]">in the</span>
                <select className="field w-auto pointer-coarse:min-h-[44px]" value={shownPlane} onChange={(e) => setPlane(e.target.value as Plane)} title="Which plane the swing is in">
                  {planes.map((p) => (
                    <option key={p} value={p}>
                      {PLANE_LABELS[p]}
                    </option>
                  ))}
                </select>
                <span className="text-[color:var(--text-faint)]">plane</span>
                <button className="btn pointer-coarse:min-h-[44px]" onClick={set} title="Put the bob at this angle, at rest">
                  Set
                </button>
              </div>
            </div>
          </ReplayLock>
          {note && (
            <p role="status" className="px-3 pt-0.5 text-small text-[color:var(--text-dim)]">
              {note}
            </p>
          )}

          {/* What the angle means, one line each: the height it lifts the bob and the two periods. A box of four lines, whatever is in it. */}
          <div className="min-h-[4.5rem] px-3 pt-1 pb-1 text-small tabular-nums text-[color:var(--text-faint)]">
            {swingData.ang &&
              !swingData.slack &&
              pivot &&
              meaningLines({ L: pivot.length, g, theta: swingData.ang.theta, kind: pivot.kind }, num).map((line) => (
                <p key={line}>{line}</p>
              ))}
          </div>
        </>
      )}
    </Fold>
  )
}
