// A formula card is DATA (Idea #39 §4.4, SANDBOX-WAVE.md I-7): a formula, the quantity each of its
// symbols stands for, and how to show it. The engine (evaluate.ts) puts a run's values into it; a
// card never computes anything a test cannot see. These are the frozen I-7 shapes. Three optional
// fields go beyond I-7, each because a card could not be written honestly without it: `sign` on a
// symbol (a "down is positive" formula reads vy the other way), the `startLink` source (a
// pendulum's start angle θ₀ must not follow the swing), and `ends` / `startEnds` on a link entry
// (a link's angle cannot be worked out from its stretch alone). Nothing built against I-7 breaks.

import type { V3 } from '../../math/vec'
import type { BodyDef, BodyState, Link } from '../types'

/** The quantities a card's symbols are coloured by: one colour token each, shared by arrows, graphs and cards. */
export type QKey = 'pos' | 'vel' | 'acc' | 'force' | 'weight' | 'normal' | 'friction' | 'tension' | 'spring' | 'mom' | 'heat' | 'work'

/** The colour token (I-10) every view uses for a quantity. */
export const Q_TOKEN: Record<QKey, string> = {
  pos: '--q-pos',
  vel: '--q-vel',
  acc: '--q-acc',
  force: '--q-force',
  weight: '--q-weight',
  normal: '--q-normal',
  friction: '--q-friction',
  tension: '--q-tension',
  spring: '--q-spring',
  mom: '--q-mom',
  heat: '--q-heat',
  work: '--q-work'
}

/**
 * The energy ledger's reading at one moment (I-9; SB10 builds it in sim/ledger.ts). It is declared
 * here because a Reading may carry one before the ledger exists; the shapes must stay the same.
 */
export interface LedgerReading {
  kinetic: number
  height: number
  spring: number
  pushedIn: number
  hand: number
  drag: number
  rolling: number
  damper: number
  heat: number
  drift: number | null
  sources: string[]
  deltaT: Record<string, number>
}

/** One body at one moment: what it is, how it is moving, how it started, and its acceleration when the tape knows it. */
export interface BodyReading {
  def: BodyDef
  state: BodyState
  start: BodyState
  /** From the tape when known. Absent: a card line that needs it shows "—", never a made-up number. */
  acc?: V3
}

/**
 * One link at one moment. `ends` and `startEnds` go beyond I-7 (a link's angle needs them): the
 * centre of the end it hangs from — the fixed end when only one end is fixed, else end a — then
 * the centre of the other end, now and at the start.
 */
export interface LinkReading {
  link: Link
  /** Centre to centre, past the natural length; negative when squeezed (springStretch). */
  stretch: number
  ends?: [V3, V3]
  startEnds?: [V3, V3]
}

/** Everything a card may read at one moment, keyed by ROLE ('A', 'B', 'S' …), never by id. */
export interface Reading {
  t: number
  g: number
  /** The height every height is measured from: the top of the floor (groundTopOf). */
  datum: number
  stepRate: number
  bodies: Record<string, BodyReading>
  links: Record<string, LinkReading>
  ledger?: LedgerReading
  /** Beyond I-7: the air's density, kg/m³, for a drag card. Absent: such a card shows "—". */
  rho?: number
}

/** One line of a card: `tex` wraps every symbol as \htmlData{q=<QKey>}{…}; `plain` is the same line in ordinary characters. */
export interface CardLine {
  tex: string
  plain: string
}

export interface CardView {
  id: string
  title: string
  /** The formula, the values put into it, and the result. */
  lines: CardLine[]
  /** The result at full precision (NaN when a value it needs is not known). */
  value: number
  unit: string
  /** The result in one line, as shown: "KE = 9.81 J". */
  text: string
  /** The values shown, put back into the formula, give the result shown, in its last digit. */
  sumChecks: boolean
  /** Scaling kg, m, s by any factors scales the result by its own unit's factor. */
  unitsCheck: boolean
  quantities: QKey[]
}

export type BodyGet =
  | 'mass'
  | 'speed'
  | 'vx'
  | 'vy'
  | 'x'
  | 'arm' /* distance from lever pivot or origin */
  | 'height'
  | 'bottom' /* the underside above the floor */
  | 'KE'
  | 'PE'
  | 'p'
  | 'a'
  | 'ax'
  | 'ay'
  | 'radius'
  | 'cd'
  | 'area' /* frontal, as the drag uses */
  | 'slopeAngle' /* a ramp's angle, degrees */
  | 'vAngle' /* the velocity's angle above the horizontal, degrees */

/** What a link can give: angle is from straight down, in degrees. */
export type LinkGet = 'k' | 'L0' | 'length' | 'stretch' | 'angle'

/** Where a symbol's value comes from. Roles are the Reading's keys. */
export type Source =
  | { body: string; get: BodyGet }
  | { start: string; get: BodyGet }
  | { link: string; get: LinkGet }
  /** Beyond I-7: the link as it was at the start (a pendulum's θ₀). */
  | { startLink: string; get: LinkGet }
  /** max(e₁, e₂) and √(μ₁μ₂), as the engine combines them. */
  | { pair: [string, string]; get: 'eUsed' | 'muUsed' }
  | { world: 'g' | 't' | 'rho' }
  | { value: number }

export interface SymbolSpec {
  /** The name `compute` reads it by, and `@{key}` in the formula. */
  key: string
  tex: string
  /** As a student writes it: 'kg', 'm/s²', 'N/m', '°', '' for a pure number (units.ts lists them). */
  unit: string
  q: QKey | null
  from: Source
  /** Beyond I-7: −1 reads the quantity the other way round (vy, up positive, as a speed down). */
  sign?: -1
}

export interface CardSpec {
  id: string
  title: string
  /**
   * The right-hand side, in LaTeX, with each symbol written `@{key}` and each multiplication `*`
   * (nothing in the formula, × once numbers are put in). A symbol before ^ is bracketed with its
   * unit when its value goes in: `\tfrac{1}{2}*@{m}*@{v}^2`.
   */
  formulaTex: string
  symbols: SymbolSpec[]
  result: { tex: string; unit: string; q: QKey | null }
  compute: (v: Record<string, number>) => number
}
