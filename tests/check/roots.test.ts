// G2: polyRootsCheck and linearSystemCheck — complete answers 'equal', anything missing, extra or wrong never 'equal'.

import { describe, expect, it } from 'vitest'
import { linearSystemCheck, polyRootsCheck, type ClaimedRoot } from '../../src/renderer/src/math/check/checkers'
import { int, mul, seeded, show, type Coeffs } from './gen'

const R = (...vs: (string | number | [string | number, number])[]): ClaimedRoot[] =>
  vs.map((v) => (Array.isArray(v) ? { value: String(v[0]), multiplicity: v[1] } : { value: String(v), multiplicity: 1 }))

describe('polyRootsCheck', () => {
  const equal: [string, ClaimedRoot[], 'real' | 'complex'][] = [
    ['x^2-1', R(1, -1), 'real'],
    ['x^2-2x+1', R([1, 2]), 'real'],
    ['(x-2)^2 = 0', R([2, 2]), 'real'],
    ['x^2 = x', R(0, 1), 'real'],
    ['x^2-2', R('sqrt(2)', '-sqrt(2)'), 'real'],
    ['x^2-2x-1', R('1+sqrt(2)', '1-sqrt(2)'), 'real'],
    ['x^2+1', R(), 'real'],
    ['x^2+1', R('i', '-i'), 'complex'],
    ['x^2+x+1', R('(-1+i*sqrt(3))/2', '(-1-i*sqrt(3))/2'), 'complex'],
    ['x^3-1', R(1), 'real'],
    ['x^3-1', R(1, '(-1+i*sqrt(3))/2', '(-1-i*sqrt(3))/2'), 'complex'],
    ['x^3+8', R('cbrt(-8)'), 'real'],
    ['2x^2-3x+1', R('1/2', 1), 'real'],
    ['x^4-5x^2+6', R('sqrt(2)', '-sqrt(2)', 'sqrt(3)', '-sqrt(3)'), 'real'],
    ['1e-19x^2 - 1e-19', R(1, -1), 'real'],
    ['6e24x - 6e24', R(1), 'real'],
    ['x^2-8', R('2sqrt(2)', '-2*sqrt(2)'), 'real'],
    ['x^2-8', R('sqrt(8)', '-sqrt(8)'), 'real'],
    ['x^5-x', R(0, 1, -1), 'real'],
    ['x^5-x', R(0, 1, -1, 'i', '-i'), 'complex'],
    ['x^2-2x+1', R(1, 1), 'real'],
    ['(x-1)^3(x+2)', R([1, 3], -2), 'real'],
    ['x^2 - 3/4', R('sqrt(3)/2', '-sqrt(3)/2'), 'real'],
    ['x^2+4', R('2i', '-2i'), 'complex'],
    ['x^2-2x+5', R('1+2i', '1-2i'), 'complex'],
    ['x = 3', R('x = 3'), 'real'],
    ['x^4+1', R(), 'real'],
    ['(x^2-2)^2', R(['sqrt(2)', 2], ['-sqrt(2)', 2]), 'real']
  ]
  it.each(equal)('%s: %j (%s)', (p, roots, domain) => expect(polyRootsCheck(p, roots, domain)).toBe('equal'))

  const different: [string, ClaimedRoot[], 'real' | 'complex'][] = [
    ['x^2-2x+1', R([1, 1]), 'real'],
    ['x^2-1', R(1, -1, 2), 'real'],
    ['x^2-1', R(1), 'real'],
    ['x^2+1', R('i', '-i'), 'real'],
    ['x^2+1', R(), 'complex'],
    ['x^2-2', R('sqrt(2)'), 'real'],
    ['x^2-2', R('1.41421356237', '-1.41421356237'), 'real'],
    ['x^2-x-2', R(2, 1), 'real'],
    ['x^3-1', R(1), 'complex'],
    ['x^2 = x', R(1), 'real'],
    ['x^2-2x-1', R('1+sqrt(2)', '1+sqrt(2)'), 'real'],
    ['x^3-2', R('1.26'), 'real'],
    ['x^3-2', R('cbrt(3)'), 'real'],
    ['(x-2)^2 = 0', R(2), 'real'],
    ['x^2-1', R([1, 0], -1), 'real'],
    ['x^2+x+1', R('(-1+i*sqrt(3))/2'), 'complex'],
    ['1e-19x^2 - 1e-19', R(1, -1.0000001), 'real'],
    ['x^4-5x^2+6', R('sqrt(2)', '-sqrt(2)', 'sqrt(3)', 'sqrt(3)'), 'real'],
    ['x = sqrt(x + 2)', R(2, -1), 'real'],
    // 1 − √3 is not a root at all, whatever the other root, written as a nested root, turns out to be.
    ['x^2-2x-1', R('sqrt(3+2*sqrt(2))', '1-sqrt(3)'), 'real']
  ]
  it.each(different)('%s: %j (%s)', (p, roots, domain) => expect(polyRootsCheck(p, roots, domain)).toBe('different'))

  const unknown: [string, ClaimedRoot[]][] = [
    ['x^3-2', R('cbrt(2)')],
    ['x = sqrt(x + 2)', R(2)],
    ['x^5-x-1', R('1.1673039782614187')],
    // Right answers whose conjugate is written in a form that is not exact here: never 'different'.
    ['x^2-2x-1', R('sqrt(3+2*sqrt(2))', '1-sqrt(2)')],
    ['x^2-6', R('sqrt(2)*sqrt(3)', '-sqrt(6)')],
    ['x^2-2', R('sqrt(2)', '-sqrt(2)+sqrt(3)-sqrt(3)')]
  ]
  it.each(unknown)('%s: %j cannot be proved', (p, roots) => expect(polyRootsCheck(p, roots)).toBe('unknown'))

  it('seeded: all roots right is equal; one root moved, or one dropped, is different (40 cases)', () => {
    const rand = seeded(17)
    for (let k = 0; k < 40; k++) {
      const rs = Array.from({ length: int(rand, 1, 4) }, () => int(rand, -6, 6))
      const p = rs.reduce<Coeffs>((acc, r) => mul(acc, [BigInt(-r), 1n]), [BigInt(int(rand, 1, 5))])
      const text = show(p)
      expect(polyRootsCheck(text, R(...rs)), `${text}: ${rs}`).toBe('equal')
      const moved = [...rs]
      moved[0] += int(rand, 1, 2)
      // One value changed changes the multiset, and every value is a whole number: exactly wrong, so 'different'.
      expect(polyRootsCheck(text, R(...moved)), `${text}: ${moved}`).toBe('different')
      expect(polyRootsCheck(text, R(...rs.slice(1))), `${text}: ${rs.slice(1)}`).toBe('different')
    }
  })
})

describe('linearSystemCheck', () => {
  const two = ['x + y = 3', 'x - y = 1']
  const line = ['x + y = 1', '2x + 2y = 2']
  const clash = ['x + y = 1', 'x + y = 2']
  const three = ['x + y + z = 6', 'x - y = 0', 'y - z = 0']
  const cases: [string[], Parameters<typeof linearSystemCheck>[1], 'equal' | 'different' | 'unknown'][] = [
    [two, { kind: 'unique', values: { x: '2', y: '1' } }, 'equal'],
    [two, { kind: 'unique', values: { x: '1', y: '2' } }, 'different'],
    [two, { kind: 'none' }, 'different'],
    [two, { kind: 'infinite', values: { x: '3 - y' } }, 'different'],
    [two, { kind: 'unique', values: { x: '2' } }, 'different'],
    [line, { kind: 'infinite', values: { x: '1 - y' } }, 'equal'],
    [line, { kind: 'infinite', values: { x: '1 - t', y: 't' } }, 'equal'],
    [line, { kind: 'infinite', values: { y: '1 - x' } }, 'equal'],
    [line, { kind: 'unique', values: { x: '0', y: '1' } }, 'different'],
    [line, { kind: 'infinite', values: { x: '2 - y' } }, 'different'],
    [line, { kind: 'infinite', values: { x: '1 - 2t', y: 't' } }, 'different'],
    [line, { kind: 'infinite', values: { x: '0', y: '1' } }, 'different'],
    [line, { kind: 'none' }, 'different'],
    [clash, { kind: 'none' }, 'equal'],
    [clash, { kind: 'unique', values: { x: '0', y: '1' } }, 'different'],
    [clash, { kind: 'infinite', values: { x: '1 - y' } }, 'different'],
    [three, { kind: 'unique', values: { x: '2', y: '2', z: '2' } }, 'equal'],
    [three, { kind: 'unique', values: { x: '2', y: '2', z: '3' } }, 'different'],
    [['x + y + z = 1'], { kind: 'infinite', values: { x: '1 - y - z' } }, 'equal'],
    [['x + y + z = 1'], { kind: 'infinite', values: { x: '1 - s - t', y: 's', z: 't' } }, 'equal'],
    [['x + y + z = 1'], { kind: 'infinite', values: { x: '1 - t', y: 't', z: '0' } }, 'different'],
    [['x/2 + y/3 = 1', 'x - y = 2'], { kind: 'unique', values: { x: '2', y: '0' } }, 'equal'],
    [['x/2 + y/3 = 1', 'x - y = 2'], { kind: 'unique', values: { x: '2.0', y: '0/7' } }, 'equal'],
    [['x/2 + y/3 = 1', 'x - y = 2'], { kind: 'unique', values: { x: '2', y: '0.01' } }, 'different'],
    [['1e-19 x + y = 1', 'x - y = 0'], { kind: 'unique', values: { x: '1/(1 + 1e-19)', y: '1/(1 + 1e-19)' } }, 'equal'],
    [['1e-19 x + y = 1', 'x - y = 0'], { kind: 'unique', values: { x: '1', y: '1' } }, 'different'],
    [['6e24 x = 6e24'], { kind: 'unique', values: { x: '1' } }, 'equal'],
    [['x y = 1'], { kind: 'unique', values: { x: '1', y: '1' } }, 'unknown'],
    [['x^2 + y = 1', 'x = 0'], { kind: 'unique', values: { x: '0', y: '1' } }, 'unknown'],
    [['2x + 4y = 6', 'x + 2y = 3', '3x + 6y = 9'], { kind: 'infinite', values: { x: '3 - 2y' } }, 'equal'],
    [['2x + 4y = 6', 'x + 2y = 3', '3x + 6y = 9'], { kind: 'unique', values: { x: '1', y: '1' } }, 'different'],
    [['x = 1', 'y = 2', 'x + y = 3'], { kind: 'unique', values: { x: '1', y: '2' } }, 'equal'],
    [['x = 1', 'y = 2', 'x + y = 4'], { kind: 'none' }, 'equal'],
    [['x = 1', 'y = 2', 'x + y = 4'], { kind: 'unique', values: { x: '1', y: '2' } }, 'different'],
    [['a + b = 0'], { kind: 'infinite', values: { a: '-b' } }, 'equal'],
    [['a + b = 0'], { kind: 'infinite', values: { a: 'b' } }, 'different'],
    [['0*x = 0'], { kind: 'none' }, 'different'],
    [['x - 2y + z = 0', '2x - 4y + 2z = 0'], { kind: 'infinite', values: { x: '2y - z' } }, 'equal'],
    [['x - 2y + z = 0', '2x - 4y + 2z = 0'], { kind: 'infinite', values: { x: '2t', y: 't', z: '0' } }, 'different'],
    [['x + y = sqrt(2)', 'x - y = 0'], { kind: 'unique', values: { x: 'sqrt(2)/2', y: 'sqrt(2)/2' } }, 'unknown']
  ]
  it.each(cases)('%j → %j is %s', (eqs, answer, expected) => expect(linearSystemCheck(eqs, answer)).toBe(expected))

  it('seeded: 2×2 systems with a known solution; one value off is different (40 cases)', () => {
    const rand = seeded(19)
    for (let k = 0; k < 40; k++) {
      const [x, y] = [int(rand, -9, 9), int(rand, -9, 9)]
      let a = int(rand, -5, 5)
      const b = int(rand, -5, 5)
      const c = int(rand, -5, 5)
      const d = int(rand, -5, 5)
      if (a * d - b * c === 0) a += 7
      const eqs = [`${a}*x + ${b}*y = ${a * x + b * y}`, `${c}*x + ${d}*y = ${c * x + d * y}`]
      expect(linearSystemCheck(eqs, { kind: 'unique', values: { x: String(x), y: String(y) } }), eqs.join('; ')).toBe('equal')
      expect(linearSystemCheck(eqs, { kind: 'unique', values: { x: String(x), y: String(y + 1) } }), eqs.join('; ')).toBe('different')
    }
  })
})
