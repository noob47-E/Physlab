import type { CardSpec, SymbolSpec } from './types'

const m_A: SymbolSpec = { key: 'mA', tex: 'm_A', unit: 'kg', q: null, from: { body: 'A', get: 'mass' } }
const m_B: SymbolSpec = { key: 'mB', tex: 'm_B', unit: 'kg', q: null, from: { body: 'B', get: 'mass' } }

const u_A: SymbolSpec = { key: 'uA', tex: 'u_A', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'vx' } }
const u_B: SymbolSpec = { key: 'uB', tex: 'u_B', unit: 'm/s', q: 'vel', from: { start: 'B', get: 'vx' } }
const v_A: SymbolSpec = { key: 'vA', tex: 'v_A', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'vx' } }
const v_B: SymbolSpec = { key: 'vB', tex: 'v_B', unit: 'm/s', q: 'vel', from: { body: 'B', get: 'vx' } }

const su_A: SymbolSpec = { key: 'suA', tex: 'u_A', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'speed' } }
const su_B: SymbolSpec = { key: 'suB', tex: 'u_B', unit: 'm/s', q: 'vel', from: { start: 'B', get: 'speed' } }
const sv_A: SymbolSpec = { key: 'svA', tex: 'v_A', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'speed' } }
const sv_B: SymbolSpec = { key: 'svB', tex: 'v_B', unit: 'm/s', q: 'vel', from: { body: 'B', get: 'speed' } }

const e: SymbolSpec = { key: 'e', tex: 'e', unit: '', q: null, from: { pair: ['A', 'B'], get: 'eUsed' } }

const u_Ax: SymbolSpec = { key: 'uAx', tex: 'u_{Ax}', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'vx' } }
const u_Bx: SymbolSpec = { key: 'uBx', tex: 'u_{Bx}', unit: 'm/s', q: 'vel', from: { start: 'B', get: 'vx' } }
const v_Ax: SymbolSpec = { key: 'vAx', tex: 'v_{Ax}', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'vx' } }
const v_Bx: SymbolSpec = { key: 'vBx', tex: 'v_{Bx}', unit: 'm/s', q: 'vel', from: { body: 'B', get: 'vx' } }

const u_Ay: SymbolSpec = { key: 'uAy', tex: 'u_{Ay}', unit: 'm/s', q: 'vel', from: { start: 'A', get: 'vy' } }
const u_By: SymbolSpec = { key: 'uBy', tex: 'u_{By}', unit: 'm/s', q: 'vel', from: { start: 'B', get: 'vy' } }
const v_Ay: SymbolSpec = { key: 'vAy', tex: 'v_{Ay}', unit: 'm/s', q: 'vel', from: { body: 'A', get: 'vy' } }
const v_By: SymbolSpec = { key: 'vBy', tex: 'v_{By}', unit: 'm/s', q: 'vel', from: { body: 'B', get: 'vy' } }

const m_B1: SymbolSpec = { key: 'm1', tex: 'm', unit: 'kg', q: null, from: { body: 'B1', get: 'mass' } }
const m_B2: SymbolSpec = { key: 'm2', tex: 'm', unit: 'kg', q: null, from: { body: 'B2', get: 'mass' } }
const m_B3: SymbolSpec = { key: 'm3', tex: 'm', unit: 'kg', q: null, from: { body: 'B3', get: 'mass' } }
const m_B4: SymbolSpec = { key: 'm4', tex: 'm', unit: 'kg', q: null, from: { body: 'B4', get: 'mass' } }
const m_B5: SymbolSpec = { key: 'm5', tex: 'm', unit: 'kg', q: null, from: { body: 'B5', get: 'mass' } }

const u_B1: SymbolSpec = { key: 'u1', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B1', get: 'vx' } }
const u_B2: SymbolSpec = { key: 'u2', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B2', get: 'vx' } }
const u_B3: SymbolSpec = { key: 'u3', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B3', get: 'vx' } }
const u_B4: SymbolSpec = { key: 'u4', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B4', get: 'vx' } }
const u_B5: SymbolSpec = { key: 'u5', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B5', get: 'vx' } }

const v_B1: SymbolSpec = { key: 'v1', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B1', get: 'vx' } }
const v_B2: SymbolSpec = { key: 'v2', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B2', get: 'vx' } }
const v_B3: SymbolSpec = { key: 'v3', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B3', get: 'vx' } }
const v_B4: SymbolSpec = { key: 'v4', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B4', get: 'vx' } }
const v_B5: SymbolSpec = { key: 'v5', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B5', get: 'vx' } }

const su_B1: SymbolSpec = { key: 'su1', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B1', get: 'speed' } }
const su_B2: SymbolSpec = { key: 'su2', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B2', get: 'speed' } }
const su_B3: SymbolSpec = { key: 'su3', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B3', get: 'speed' } }
const su_B4: SymbolSpec = { key: 'su4', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B4', get: 'speed' } }
const su_B5: SymbolSpec = { key: 'su5', tex: 'u', unit: 'm/s', q: 'vel', from: { start: 'B5', get: 'speed' } }

const sv_B1: SymbolSpec = { key: 'sv1', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B1', get: 'speed' } }
const sv_B2: SymbolSpec = { key: 'sv2', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B2', get: 'speed' } }
const sv_B3: SymbolSpec = { key: 'sv3', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B3', get: 'speed' } }
const sv_B4: SymbolSpec = { key: 'sv4', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B4', get: 'speed' } }
const sv_B5: SymbolSpec = { key: 'sv5', tex: 'v', unit: 'm/s', q: 'vel', from: { body: 'B5', get: 'speed' } }

export const COLLISION_CARDS: CardSpec[] = [
  {
    id: 'lab-p0',
    title: 'Momentum before',
    formulaTex: '@{mA}*@{uA} + @{mB}*@{uB}',
    symbols: [m_A, u_A, m_B, u_B],
    result: { tex: 'p_0', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.uA + s.mB * s.uB
  },
  {
    id: 'lab-p',
    title: 'Momentum now',
    formulaTex: '@{mA}*@{vA} + @{mB}*@{vB}',
    symbols: [m_A, v_A, m_B, v_B],
    result: { tex: 'p', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.vA + s.mB * s.vB
  },
  {
    id: 'lab-ke0',
    title: 'Kinetic energy before',
    formulaTex: '\\tfrac{1}{2}*@{mA}*@{suA}^2 + \\tfrac{1}{2}*@{mB}*@{suB}^2',
    symbols: [m_A, su_A, m_B, su_B],
    result: { tex: '\\mathrm{KE}_0', unit: 'J', q: 'vel' },
    compute: (s) => 0.5 * s.mA * s.suA ** 2 + 0.5 * s.mB * s.suB ** 2
  },
  {
    id: 'lab-ke',
    title: 'Kinetic energy now',
    formulaTex: '\\tfrac{1}{2}*@{mA}*@{svA}^2 + \\tfrac{1}{2}*@{mB}*@{svB}^2',
    symbols: [m_A, sv_A, m_B, sv_B],
    result: { tex: '\\mathrm{KE}', unit: 'J', q: 'vel' },
    compute: (s) => 0.5 * s.mA * s.svA ** 2 + 0.5 * s.mB * s.svB ** 2
  },
  {
    id: 'lab-ke-lost',
    title: 'Energy lost',
    formulaTex: '(\\tfrac{1}{2}*@{mA}*@{suA}^2 + \\tfrac{1}{2}*@{mB}*@{suB}^2) - (\\tfrac{1}{2}*@{mA}*@{svA}^2 + \\tfrac{1}{2}*@{mB}*@{svB}^2)',
    symbols: [m_A, su_A, m_B, su_B, sv_A, sv_B],
    result: { tex: '\\Delta\\mathrm{KE}', unit: 'J', q: 'vel' },
    compute: (s) => (0.5 * s.mA * s.suA ** 2 + 0.5 * s.mB * s.suB ** 2) - (0.5 * s.mA * s.svA ** 2 + 0.5 * s.mB * s.svB ** 2)
  },
  {
    id: 'lab-ke-lost-theory',
    title: 'Energy lost, from the formula',
    formulaTex: '\\tfrac{1}{2}*\\frac{@{mA}*@{mB}}{@{mA} + @{mB}}*(1 - @{e}^2)*(@{uA} - @{uB})^2',
    symbols: [m_A, m_B, e, u_A, u_B],
    result: { tex: '\\Delta\\mathrm{KE}', unit: 'J', q: 'vel' },
    compute: (s) => 0.5 * (s.mA * s.mB / (s.mA + s.mB)) * (1 - s.e ** 2) * (s.uA - s.uB) ** 2
  },
  {
    id: 'lab-e-measured',
    title: 'Bounciness measured',
    formulaTex: '\\frac{@{vB} - @{vA}}{@{uA} - @{uB}}',
    symbols: [v_B, v_A, u_A, u_B],
    result: { tex: 'e', unit: '', q: null },
    compute: (s) => (s.vB - s.vA) / (s.uA - s.uB)
  },
  {
    id: 'lab2d-px0',
    title: 'Momentum before, across',
    formulaTex: '@{mA}*@{uAx} + @{mB}*@{uBx}',
    symbols: [m_A, u_Ax, m_B, u_Bx],
    result: { tex: 'p_{0x}', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.uAx + s.mB * s.uBx
  },
  {
    id: 'lab2d-py0',
    title: 'Momentum before, up',
    formulaTex: '@{mA}*@{uAy} + @{mB}*@{uBy}',
    symbols: [m_A, u_Ay, m_B, u_By],
    result: { tex: 'p_{0y}', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.uAy + s.mB * s.uBy
  },
  {
    id: 'lab2d-px',
    title: 'Momentum now, across',
    formulaTex: '@{mA}*@{vAx} + @{mB}*@{vBx}',
    symbols: [m_A, v_Ax, m_B, v_Bx],
    result: { tex: 'p_x', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.vAx + s.mB * s.vBx
  },
  {
    id: 'lab2d-py',
    title: 'Momentum now, up',
    formulaTex: '@{mA}*@{vAy} + @{mB}*@{vBy}',
    symbols: [m_A, v_Ay, m_B, v_By],
    result: { tex: 'p_y', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.mA * s.vAy + s.mB * s.vBy
  },
  {
    id: 'lab-cradle-p0',
    title: 'Cradle momentum before',
    formulaTex: '@{m1}*@{u1} + @{m2}*@{u2} + @{m3}*@{u3} + @{m4}*@{u4} + @{m5}*@{u5}',
    symbols: [m_B1, u_B1, m_B2, u_B2, m_B3, u_B3, m_B4, u_B4, m_B5, u_B5],
    result: { tex: 'p_0', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.m1 * s.u1 + s.m2 * s.u2 + s.m3 * s.u3 + s.m4 * s.u4 + s.m5 * s.u5
  },
  {
    id: 'lab-cradle-p',
    title: 'Cradle momentum now',
    formulaTex: '@{m1}*@{v1} + @{m2}*@{v2} + @{m3}*@{v3} + @{m4}*@{v4} + @{m5}*@{v5}',
    symbols: [m_B1, v_B1, m_B2, v_B2, m_B3, v_B3, m_B4, v_B4, m_B5, v_B5],
    result: { tex: 'p', unit: 'kg m/s', q: 'mom' },
    compute: (s) => s.m1 * s.v1 + s.m2 * s.v2 + s.m3 * s.v3 + s.m4 * s.v4 + s.m5 * s.v5
  },
  {
    id: 'lab-cradle-ke0',
    title: 'Cradle energy before',
    formulaTex: '\\tfrac{1}{2}*@{m1}*@{su1}^2 + \\tfrac{1}{2}*@{m2}*@{su2}^2 + \\tfrac{1}{2}*@{m3}*@{su3}^2 + \\tfrac{1}{2}*@{m4}*@{su4}^2 + \\tfrac{1}{2}*@{m5}*@{su5}^2',
    symbols: [m_B1, su_B1, m_B2, su_B2, m_B3, su_B3, m_B4, su_B4, m_B5, su_B5],
    result: { tex: '\\mathrm{KE}_0', unit: 'J', q: 'vel' },
    compute: (s) => 0.5 * s.m1 * s.su1 ** 2 + 0.5 * s.m2 * s.su2 ** 2 + 0.5 * s.m3 * s.su3 ** 2 + 0.5 * s.m4 * s.su4 ** 2 + 0.5 * s.m5 * s.su5 ** 2
  },
  {
    id: 'lab-cradle-ke',
    title: 'Cradle energy now',
    formulaTex: '\\tfrac{1}{2}*@{m1}*@{sv1}^2 + \\tfrac{1}{2}*@{m2}*@{sv2}^2 + \\tfrac{1}{2}*@{m3}*@{sv3}^2 + \\tfrac{1}{2}*@{m4}*@{sv4}^2 + \\tfrac{1}{2}*@{m5}*@{sv5}^2',
    symbols: [m_B1, sv_B1, m_B2, sv_B2, m_B3, sv_B3, m_B4, sv_B4, m_B5, sv_B5],
    result: { tex: '\\mathrm{KE}', unit: 'J', q: 'vel' },
    compute: (s) => 0.5 * s.m1 * s.sv1 ** 2 + 0.5 * s.m2 * s.sv2 ** 2 + 0.5 * s.m3 * s.sv3 ** 2 + 0.5 * s.m4 * s.sv4 ** 2 + 0.5 * s.m5 * s.sv5 ** 2
  }
]
