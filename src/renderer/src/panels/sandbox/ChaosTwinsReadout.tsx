// SB60: the chaos twins' gap. How far apart the lower bobs of the first two twins are, live and in a replay, and what
// their starts differed by, so the student sees a 0.1° difference grow into everything.

import { useSandbox } from '../../sim/store'
import { shownTape, useTape } from '../../sim/tapeStore'
import { whereFor } from '../../sim/pendulum'
import { angleApart, armAngle, chaosPairs } from '../../sim/chaosTwins'
import { useNum } from './common'

/** Below this an arm's starts are the same (a rounding in the definitions, not a difference anyone made). */
const SAME_DEG = 1e-6

export function ChaosTwinsReadout() {
  const bodies = useSandbox((s) => s.bodies)
  const links = useSandbox((s) => s.links)
  const live = useSandbox((s) => s.live)
  const num = useNum()
  const mode = useTape((s) => s.mode)
  const playhead = useTape((s) => (s.mode === 'live' ? 0 : s.playhead))
  useTape((s) => (s.mode === 'live' ? 0 : s.revision))

  const pairs = chaosPairs(bodies, links)
  if (pairs.length < 2) return null
  const [one, two] = pairs

  const replaying = mode !== 'live'
  const tape = replaying ? shownTape() : null
  const where = whereFor({ replaying, tape, playhead, live })
  const pa = where(one.lower.id) ?? one.lower.position
  const pb = where(two.lower.id) ?? two.lower.position
  // In 3D too: a twin moved off the plane is that much further away.
  const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])

  // How the starts differed: in a replay, the recorded run's own first step (an edit since does not rewrite it).
  const first = tape ? whereFor({ replaying: true, tape, playhead: tape.first, live }) : null
  const at = (id: string, fallback: readonly number[]) => (first ? first(id) : undefined) ?? fallback
  const p0 = at(one.pivot.id, one.pivot.position)
  const u1 = at(one.upper.id, one.upper.position)
  const u2 = at(two.upper.id, two.upper.position)
  const upper = angleApart(armAngle(p0, u1), armAngle(p0, u2))
  const lower = angleApart(armAngle(u1, at(one.lower.id, one.lower.position)), armAngle(u2, at(two.lower.id, two.lower.position)))
  const started =
    upper > SAME_DEG && lower > SAME_DEG
      ? `They started ${num(upper)}° apart in the upper arm and ${num(lower)}° in the lower.`
      : upper > SAME_DEG
        ? `They started ${num(upper)}° apart.`
        : lower > SAME_DEG
          ? `They started ${num(lower)}° apart in the lower arm.`
          : 'They started together.'

  return (
    <div className="px-3 pb-2 text-small" data-testid="chaos-gap">
      <div className="tabular-nums text-[color:var(--text)]">
        {/* In centimetres under a metre: at 2 dp the first seconds' millimetres all read 0 m. */}
        Gap between twin {one.k} and twin {two.k}: {gap < 1 ? num(gap * 100, 'cm') : num(gap, 'm')}
      </div>
      <div className="text-[color:var(--text-dim)]">{started}</div>
    </div>
  )
}
