// The core formula cards (SB4): the laws of school mechanics that any scene can show. Each card is
// one data row: the formula in LaTeX with `@{key}` for each symbol and `*` for each multiplication,
// each symbol bound to exactly one quantity of the run, and the formula once more as `compute`,
// which the units check (units.ts) and the shown-sum check (digits.ts) hold to the written one.
// Scene-specific cards live in sceneCards.ts. Roles: 'A' the body, 'B' a second body, 'S' the link
// the body hangs on or is held by (reading.ts: a link role names a body on it).
//
// A title says where its formula holds, because the card shows the formula's value whatever the scene:
// ½mv² leaves out a rolling ball's spin, the spring card's E leaves out a hanging spring's height
// energy, the projectile cards land at the launch height, the drop formulas hold only while nothing
// but gravity acts, and 2π√(L/g) is for small swings. A scene
// whose case is not covered gets a scene card instead (sceneCards.ts), or the 'energy' and spring cards
// side by side.
//
// Colours (I-10, SB40's rule): heights and distances 'pos', speeds 'vel', momentum 'mom', springs
// 'spring', weight 'weight'; pure numbers, masses, angles, g and t carry none. KE uses --q-vel (it is
// v's energy), PE --q-pos (h's), a spring's energy --q-spring.

import type { CardSpec, SymbolSpec } from './types'

const RAD = Math.PI / 180

const m: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } }
const v: SymbolSpec = { key: 'v', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'speed' } }
const g: SymbolSpec = { key: 'g', tex: 'g', unit: 'm/s²', q: null, from: { world: 'g' } }
const h: SymbolSpec = { key: 'h', tex: 'h', unit: 'm', q: 'pos', from: { body: 'A', get: 'height' } }
const t: SymbolSpec = { key: 't', tex: 't', unit: 's', q: null, from: { world: 't' } }
const k: SymbolSpec = { key: 'k', tex: 'k', unit: 'N/m', q: null, from: { link: 'S', get: 'k' } }
const x: SymbolSpec = { key: 'x', tex: 'x', unit: 'm', q: 'spring', from: { link: 'S', get: 'stretch' } }
/** The start's vertical velocity read downwards: the drop formulas take down as positive. */
const u: SymbolSpec = { key: 'u', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'vy' }, sign: -1 }
const v0: SymbolSpec = { key: 'v0', tex: 'v_0', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'speed' } }
const th: SymbolSpec = { key: 'th', tex: '\\theta', unit: '°', q: null, from: { start: 'A', get: 'vAngle' } }

export const CORE_CARDS: CardSpec[] = [
  {
    id: 'ke',
    title: 'Kinetic energy (moving along, not spinning)',
    formulaTex: '\\tfrac{1}{2}*@{m}*@{v}^2',
    symbols: [m, v],
    result: { tex: '\\mathrm{KE}', unit: 'J', q: 'vel' },
    compute: (s) => 0.5 * s.m * s.v ** 2
  },
  {
    id: 'pe',
    title: 'Potential energy',
    formulaTex: '@{m}*@{g}*@{h}',
    symbols: [m, g, h],
    result: { tex: '\\mathrm{PE}', unit: 'J', q: 'pos' },
    compute: (s) => s.m * s.g * s.h
  },
  {
    id: 'energy',
    title: 'Energy of one body (not counting spin)',
    formulaTex: '\\tfrac{1}{2}*@{m}*@{v}^2 + @{m}*@{g}*@{h}',
    symbols: [m, v, g, h],
    result: { tex: 'E', unit: 'J', q: null },
    compute: (s) => 0.5 * s.m * s.v ** 2 + s.m * s.g * s.h
  },
  {
    id: 'spring-pe',
    title: 'Energy stored in a spring',
    formulaTex: '\\tfrac{1}{2}*@{k}*@{x}^2',
    symbols: [k, x],
    result: { tex: 'E_{\\mathrm{s}}', unit: 'J', q: 'spring' },
    compute: (s) => 0.5 * s.k * s.x ** 2
  },
  {
    id: 'spring-energy',
    title: 'Energy of a body on a level spring',
    formulaTex: '\\tfrac{1}{2}*@{k}*@{x}^2 + \\tfrac{1}{2}*@{m}*@{v}^2',
    symbols: [k, x, m, v],
    result: { tex: 'E', unit: 'J', q: null },
    compute: (s) => 0.5 * s.k * s.x ** 2 + 0.5 * s.m * s.v ** 2
  },
  {
    id: 'momentum',
    title: 'Momentum',
    formulaTex: '@{m}*@{v}',
    symbols: [m, v],
    result: { tex: 'p', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.m * s.v
  },
  {
    id: 'momentum-total',
    title: 'Total momentum (along x)',
    formulaTex: '@{mA}*@{vA} + @{mB}*@{vB}',
    symbols: [
      { key: 'mA', tex: 'm_A', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } },
      { key: 'vA', tex: 'v_A', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'vx' } },
      { key: 'mB', tex: 'm_B', unit: 'kg', q: null, from: { body: 'B', get: 'mass' } },
      { key: 'vB', tex: 'v_B', unit: 'm/s', q: 'vel', from: { body: 'B', get: 'vx' } }
    ],
    result: { tex: 'p', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.vA + s.mB * s.vB
  },
  {
    id: 'weight',
    title: 'Weight',
    formulaTex: '@{m}*@{g}',
    symbols: [m, g],
    result: { tex: 'W', unit: 'N', q: 'weight' },
    compute: (s) => s.m * s.g
  },
  {
    id: 'suvat-v',
    title: 'Velocity after falling freely for a time t (down is positive)',
    formulaTex: '@{u} + @{g}*@{t}',
    symbols: [u, g, t],
    result: { tex: 'v', unit: 'm/s', q: 'vel' },
    compute: (s) => s.u + s.g * s.t
  },
  {
    id: 'suvat-s',
    title: 'Distance fallen freely (down is positive)',
    formulaTex: '@{u}*@{t} + \\tfrac{1}{2}*@{g}*@{t}^2',
    symbols: [u, t, g],
    result: { tex: 'h_0 - h', unit: 'm', q: 'pos' },
    compute: (s) => s.u * s.t + 0.5 * s.g * s.t ** 2
  },
  {
    id: 'projectile-range',
    title: 'Range of a projectile (landing at its launch height)',
    formulaTex: '\\frac{@{v0}^2*\\sin(2*@{th})}{@{g}}',
    symbols: [v0, th, g],
    result: { tex: 'R', unit: 'm', q: 'pos' },
    compute: (s) => (s.v0 ** 2 * Math.sin(2 * s.th * RAD)) / s.g
  },
  {
    id: 'projectile-top',
    title: 'Greatest height of a projectile, above its launch point',
    formulaTex: '\\frac{(@{v0}*\\sin @{th})^2}{2*@{g}}',
    symbols: [v0, th, g],
    result: { tex: 'H', unit: 'm', q: 'pos' },
    compute: (s) => (s.v0 * Math.sin(s.th * RAD)) ** 2 / (2 * s.g)
  },
  {
    id: 'flight-time',
    title: 'Time of flight (back to its launch height)',
    formulaTex: '\\frac{2*@{v0}*\\sin @{th}}{@{g}}',
    symbols: [v0, th, g],
    result: { tex: 'T', unit: 's', q: null },
    compute: (s) => (2 * s.v0 * Math.sin(s.th * RAD)) / s.g
  },
  {
    id: 'pendulum-T',
    title: 'Period of a pendulum (small swings)',
    formulaTex: '2\\pi*\\sqrt{\\frac{@{L}}{@{g}}}',
    symbols: [{ key: 'L', tex: 'L', unit: 'm', q: 'pos', from: { link: 'S', get: 'L0' } }, g],
    result: { tex: 'T', unit: 's', q: null },
    compute: (s) => 2 * Math.PI * Math.sqrt(s.L / s.g)
  },
  {
    id: 'spring-T',
    title: 'Period of a mass on a spring',
    formulaTex: '2\\pi*\\sqrt{\\frac{@{m}}{@{k}}}',
    symbols: [m, k],
    result: { tex: 'T', unit: 's', q: null },
    compute: (s) => 2 * Math.PI * Math.sqrt(s.m / s.k)
  }
]
