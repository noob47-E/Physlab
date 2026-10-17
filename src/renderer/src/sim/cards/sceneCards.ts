import type { CardSpec, SymbolSpec } from './types'

const g: SymbolSpec = { key: 'g', tex: 'g', unit: 'm/s²', q: null, from: { world: 'g' } }
const rho: SymbolSpec = { key: 'rho', tex: '\\rho', unit: 'kg/m³', q: null, from: { world: 'rho' } }

const bounceE: SymbolSpec = { key: 'e', tex: 'e', unit: '', q: null, from: { pair: ['Ball', 'Floor'], get: 'eUsed' } }
const bounceH0: SymbolSpec = { key: 'h0', tex: 'h_0', unit: 'm', q: 'pos', from: { start: 'Ball', get: 'bottom' } }
const bounceNextTop: CardSpec = {
  id: 'bounce-next-top',
  title: 'Next bounce height',
  formulaTex: '@{e}^2 * @{h0}',
  symbols: [bounceE, bounceH0],
  result: { tex: 'h_1', unit: 'm', q: 'pos' },
  compute: s => s.e ** 2 * s.h0
}

const bounceKeLost: CardSpec = {
  id: 'bounce-ke-lost',
  title: 'Energy lost in a bounce',
  formulaTex: '100 * (1 - @{e}^2)',
  symbols: [bounceE],
  result: { tex: '100 * (1 - e^2)', unit: '%', q: null },
  compute: s => 100 * (1 - s.e ** 2)
}

const fricU: SymbolSpec = { key: 'u', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'Crate', get: 'speed' } }
const fricMu: SymbolSpec = { key: 'mu', tex: '\\mu', unit: '', q: null, from: { pair: ['Crate', 'Floor'], get: 'muUsed' } }
const frictionStop: CardSpec = {
  id: 'friction-stop',
  title: 'Stopping distance',
  formulaTex: '\\frac{@{u}^2}{2 * @{mu} * @{g}}',
  symbols: [fricU, fricMu, g],
  result: { tex: 'd', unit: 'm', q: 'pos' },
  compute: s => s.u ** 2 / (2 * s.mu * s.g)
}

const fricM: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { start: 'Crate', get: 'mass' } }
const frictionHeat: CardSpec = {
  id: 'friction-heat',
  title: 'Heat made by friction',
  formulaTex: '\\tfrac{1}{2} * @{m} * @{u}^2',
  symbols: [fricM, fricU],
  result: { tex: 'Q', unit: 'J', q: 'heat' },
  compute: s => 0.5 * s.m * s.u ** 2
}

const atM1: SymbolSpec = { key: 'm1', tex: 'm_1', unit: 'kg', q: null, from: { body: 'm₁', get: 'mass' } }
const atM2: SymbolSpec = { key: 'm2', tex: 'm_2', unit: 'kg', q: null, from: { body: 'm₂', get: 'mass' } }
const atwoodA: CardSpec = {
  id: 'atwood-a',
  title: 'Acceleration of an Atwood machine',
  formulaTex: '\\frac{(@{m2} - @{m1}) * @{g}}{@{m1} + @{m2}}',
  symbols: [atM1, atM2, g],
  result: { tex: 'a', unit: 'm/s²', q: 'acc' },
  compute: s => ((s.m2 - s.m1) * s.g) / (s.m1 + s.m2)
}

const atwoodT: CardSpec = {
  id: 'atwood-T',
  title: 'Rope tension',
  formulaTex: '\\frac{2 * @{m1} * @{m2} * @{g}}{@{m1} + @{m2}}',
  symbols: [atM1, atM2, g],
  result: { tex: 'T', unit: 'N', q: 'tension' },
  compute: s => (2 * s.m1 * s.m2 * s.g) / (s.m1 + s.m2)
}

const liftMw: SymbolSpec = { key: 'mW', tex: 'm_W', unit: 'kg', q: null, from: { body: 'Weight', get: 'mass' } }
const liftMc: SymbolSpec = { key: 'mC', tex: 'm_C', unit: 'kg', q: null, from: { body: 'Crate', get: 'mass' } }
const liftA: CardSpec = {
  id: 'lift-a',
  title: 'Acceleration',
  formulaTex: '\\frac{(@{mW} - @{mC}) * @{g}}{@{mW} + @{mC}}',
  symbols: [liftMw, liftMc, g],
  result: { tex: 'a', unit: 'm/s²', q: 'acc' },
  compute: s => ((s.mW - s.mC) * s.g) / (s.mW + s.mC)
}

const liftAc: SymbolSpec = { key: 'a', tex: 'a', unit: 'm/s²', q: 'acc', from: { body: 'Crate', get: 'ay' } }
const liftT: CardSpec = {
  id: 'lift-T',
  title: 'Rope tension',
  formulaTex: '@{mC} * (@{g} + @{a})',
  symbols: [liftMc, g, liftAc],
  result: { tex: 'T', unit: 'N', q: 'tension' },
  compute: s => s.mC * (s.g + s.a)
}

const craneMc: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'Crate', get: 'mass' } }
const craneT: CardSpec = {
  id: 'crane-T',
  title: 'Rope tension at rest',
  formulaTex: '@{m} * @{g}',
  symbols: [craneMc, g],
  result: { tex: 'T', unit: 'N', q: 'tension' },
  compute: s => s.m * s.g
}

const collMA: SymbolSpec = { key: 'mA', tex: 'm_A', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } }
const collMB: SymbolSpec = { key: 'mB', tex: 'm_B', unit: 'kg', q: null, from: { body: 'B', get: 'mass' } }
const collUA: SymbolSpec = { key: 'uA', tex: 'u_A', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'vx' } }
const collUB: SymbolSpec = { key: 'uB', tex: 'u_B', unit: 'm/s', q: 'vel', from: { start: 'B', get: 'vx' } }
const collE: SymbolSpec = { key: 'e', tex: 'e', unit: '', q: null, from: { pair: ['A', 'B'], get: 'eUsed' } }
const collisionAfterA: CardSpec = {
  id: 'collision-after-A',
  title: 'Speeds after a head-on hit',
  formulaTex: '\\frac{(@{mA} - @{e} * @{mB}) * @{uA} + (1 + @{e}) * @{mB} * @{uB}}{@{mA} + @{mB}}',
  symbols: [collMA, collMB, collUA, collUB, collE],
  result: { tex: 'v_A', unit: 'm/s', q: 'vel' },
  compute: s => ((s.mA - s.e * s.mB) * s.uA + (1 + s.e) * s.mB * s.uB) / (s.mA + s.mB)
}
const collisionAfterB: CardSpec = {
  id: 'collision-after-B',
  title: 'Speeds after a head-on hit',
  formulaTex: '\\frac{(@{mB} - @{e} * @{mA}) * @{uB} + (1 + @{e}) * @{mA} * @{uA}}{@{mA} + @{mB}}',
  symbols: [collMA, collMB, collUA, collUB, collE],
  result: { tex: 'v_B', unit: 'm/s', q: 'vel' },
  compute: s => ((s.mB - s.e * s.mA) * s.uB + (1 + s.e) * s.mA * s.uA) / (s.mA + s.mB)
}

const stickyV: CardSpec = {
  id: 'sticky-v',
  title: 'Speed after sticking',
  formulaTex: '\\frac{@{mA} * @{uA} + @{mB} * @{uB}}{@{mA} + @{mB}}',
  symbols: [collMA, collMB, collUA, collUB],
  result: { tex: 'v', unit: 'm/s', q: 'vel' },
  compute: s => (s.mA * s.uA + s.mB * s.uB) / (s.mA + s.mB)
}

const recoilMG: SymbolSpec = { key: 'mG', tex: 'm_G', unit: 'kg', q: null, from: { body: 'Gun', get: 'mass' } }
const recoilVG: SymbolSpec = { key: 'vG', tex: 'v_G', unit: 'm/s', q: 'vel', from: { body: 'Gun', get: 'vx' } }
const recoilMB: SymbolSpec = { key: 'mB', tex: 'm_B', unit: 'kg', q: null, from: { body: 'Bullet', get: 'mass' } }
const recoilVB: SymbolSpec = { key: 'vB', tex: 'v_B', unit: 'm/s', q: 'vel', from: { body: 'Bullet', get: 'vx' } }
const recoilP: CardSpec = {
  id: 'recoil-p',
  title: 'Momentum of the pair',
  formulaTex: '@{mG} * @{vG} + @{mB} * @{vB}',
  symbols: [recoilMG, recoilVG, recoilMB, recoilVB],
  result: { tex: 'p', unit: 'kg m/s', q: 'mom' },
  compute: s => s.mG * s.vG + s.mB * s.vB
}

const pendL: SymbolSpec = { key: 'L', tex: 'L', unit: 'm', q: 'pos', from: { link: 'S', get: 'length' } }
const pendTh0: SymbolSpec = { key: 'th0', tex: '\\theta_0', unit: '°', q: null, from: { startLink: 'S', get: 'angle' } }
const pendulumTLarge: CardSpec = {
  id: 'pendulum-T-large',
  title: 'Period of a large swing',
  formulaTex: '2\\pi * \\sqrt{\\frac{@{L}}{@{g}}} * (1 + \\frac{(@{th0} * \\frac{\\pi}{180})^2}{16})',
  symbols: [pendL, g, pendTh0],
  result: { tex: 'T', unit: 's', q: null },
  compute: s => 2 * Math.PI * Math.sqrt(s.L / s.g) * (1 + (s.th0 * Math.PI / 180) ** 2 / 16)
}

const termM: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'Foam', get: 'mass' } }
const termCd: SymbolSpec = { key: 'Cd', tex: 'C_d', unit: '', q: null, from: { body: 'Foam', get: 'cd' } }
const termA: SymbolSpec = { key: 'A', tex: 'A', unit: 'm²', q: null, from: { body: 'Foam', get: 'area' } }
const terminalV: CardSpec = {
  id: 'terminal-v',
  title: 'Terminal speed',
  formulaTex: '\\sqrt{\\frac{2 * @{m} * @{g}}{@{rho} * @{Cd} * @{A}}}',
  symbols: [termM, g, rho, termCd, termA],
  result: { tex: 'v_t', unit: 'm/s', q: 'vel' },
  compute: s => Math.sqrt((2 * s.m * s.g) / (s.rho * s.Cd * s.A))
}

const rampH: SymbolSpec = { key: 'h', tex: 'h', unit: 'm', q: 'pos', from: { start: 'A', get: 'bottom' } }
const rampRoll: CardSpec = {
  id: 'ramp-roll',
  title: 'Speed of a rolling ball at the bottom',
  formulaTex: '\\sqrt{\\frac{10 * @{g} * @{h}}{7}}',
  symbols: [g, rampH],
  result: { tex: 'v', unit: 'm/s', q: 'vel' },
  compute: s => Math.sqrt((10 * s.g * s.h) / 7)
}

const slopeM: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } }
const slopeTh: SymbolSpec = { key: 'th', tex: '\\theta', unit: '°', q: null, from: { body: 'A', get: 'slopeAngle' } }
const slopeN: CardSpec = {
  id: 'slope-N',
  title: 'Normal force on a slope',
  formulaTex: '@{m} * @{g} * \\cos(@{th} * \\frac{\\pi}{180})',
  symbols: [slopeM, g, slopeTh],
  result: { tex: 'N', unit: 'N', q: 'normal' },
  compute: s => s.m * s.g * Math.cos(s.th * Math.PI / 180)
}
const slopeF: CardSpec = {
  id: 'slope-f',
  title: 'Friction holding it',
  formulaTex: '@{m} * @{g} * \\sin(@{th} * \\frac{\\pi}{180})',
  symbols: [slopeM, g, slopeTh],
  result: { tex: 'f', unit: 'N', q: 'friction' },
  compute: s => s.m * s.g * Math.sin(s.th * Math.PI / 180)
}

const circM: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } }
const circV: SymbolSpec = { key: 'v', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'speed' } }
const circR: SymbolSpec = { key: 'r', tex: 'r', unit: 'm', q: 'pos', from: { link: 'S', get: 'length' } }
const circleF: CardSpec = {
  id: 'circle-F',
  title: 'Force towards the centre',
  formulaTex: '\\frac{@{m} * @{v}^2}{@{r}}',
  symbols: [circM, circV, circR],
  result: { tex: 'F', unit: 'N', q: 'force' },
  compute: s => (s.m * s.v ** 2) / s.r
}

const coupK: SymbolSpec = { key: 'k', tex: 'k', unit: 'N/m', q: null, from: { link: 'S', get: 'k' } }
const coupM: SymbolSpec = { key: 'm', tex: 'm', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } }
const coupledW1: CardSpec = {
  id: 'coupled-w1',
  title: 'The two ways to swing (two masses between walls)',
  formulaTex: '\\sqrt{\\frac{@{k}}{@{m}}}',
  symbols: [coupK, coupM],
  result: { tex: '\\omega_1', unit: 'rad/s', q: null },
  compute: s => Math.sqrt(s.k / s.m)
}
const coupledW2: CardSpec = {
  id: 'coupled-w2',
  title: 'The two ways to swing (two masses between walls)',
  formulaTex: '\\sqrt{\\frac{3 * @{k}}{@{m}}}',
  symbols: [coupK, coupM],
  result: { tex: '\\omega_2', unit: 'rad/s', q: null },
  compute: s => Math.sqrt(3 * s.k / s.m)
}

const rollingABall: CardSpec = {
  id: 'rolling-a-ball',
  title: 'Acceleration rolling down',
  formulaTex: '\\frac{@{g} * \\sin(@{th} * \\frac{\\pi}{180})}{1 + 2/5}',
  symbols: [g, slopeTh],
  result: { tex: 'a', unit: 'm/s²', q: 'acc' },
  compute: s => (s.g * Math.sin(s.th * Math.PI / 180)) / (1 + 2/5)
}
const rollingACylinder: CardSpec = {
  id: 'rolling-a-cylinder',
  title: 'Acceleration rolling down',
  formulaTex: '\\frac{@{g} * \\sin(@{th} * \\frac{\\pi}{180})}{1 + 1/2}',
  symbols: [g, slopeTh],
  result: { tex: 'a', unit: 'm/s²', q: 'acc' },
  compute: s => (s.g * Math.sin(s.th * Math.PI / 180)) / (1 + 1/2)
}

const leverM1: SymbolSpec = { key: 'm1', tex: 'm_1', unit: 'kg', q: null, from: { body: 'Left hanger', get: 'mass' } }
const leverM2: SymbolSpec = { key: 'm2', tex: 'm_2', unit: 'kg', q: null, from: { body: 'Right hanger', get: 'mass' } }
const leverD1: SymbolSpec = { key: 'd1', tex: 'd_1', unit: 'm', q: 'pos', from: { body: 'Left hanger', get: 'arm' } }
const leverD2: SymbolSpec = { key: 'd2', tex: 'd_2', unit: 'm', q: 'pos', from: { body: 'Right hanger', get: 'arm' } }

const leverLeftMoment: CardSpec = {
  id: 'lever-left-moment',
  title: 'Anticlockwise turning effect (left moment)',
  formulaTex: '@{m1} * @{g} * @{d1}',
  symbols: [leverM1, g, leverD1],
  result: { tex: '\\tau_1', unit: 'N m', q: 'force' },
  compute: (s) => s.m1 * s.g * s.d1
}

const leverRightMoment: CardSpec = {
  id: 'lever-right-moment',
  title: 'Clockwise turning effect (right moment)',
  formulaTex: '@{m2} * @{g} * @{d2}',
  symbols: [leverM2, g, leverD2],
  result: { tex: '\\tau_2', unit: 'N m', q: 'force' },
  compute: (s) => s.m2 * s.g * s.d2
}

const leverBalance: CardSpec = {
  id: 'lever-balance',
  title: 'Principle of moments (balance)',
  formulaTex: '@{m1} * @{g} * @{d1} - @{m2} * @{g} * @{d2}',
  symbols: [leverM1, g, leverD1, leverM2, leverD2],
  result: { tex: '\\Delta\\tau', unit: 'N m', q: 'force' },
  compute: (s) => {
    const diff = s.m1 * s.g * s.d1 - s.m2 * s.g * s.d2
    return Math.abs(diff) < 1e-4 ? 0 : diff
  }
}

export const SCENE_CARDS: CardSpec[] = [
  bounceNextTop, bounceKeLost,
  frictionStop, frictionHeat,
  atwoodA, atwoodT,
  liftA, liftT,
  craneT,
  collisionAfterA, collisionAfterB,
  stickyV,
  recoilP,
  pendulumTLarge,
  terminalV,
  rampRoll,
  slopeN, slopeF,
  circleF,
  coupledW1, coupledW2,
  rollingABall, rollingACylinder,
  leverLeftMoment, leverRightMoment, leverBalance
]
