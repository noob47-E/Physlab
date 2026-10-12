// G2: the differential test. Seeded right and planted-wrong answers go through every checker; the wrong ones are near
// misses (a coefficient off by 10⁻¹², 1/3 as 0.333333333333, a conjugate dropped, a multiplicity moved, a sign turned).
// Any 'equal' on a planted wrong answer FAILS — the owner's rule is that a wrong answer never reaches the screen. The
// right answers must not be 'different' either (an 'unknown' there is allowed, and counted), and every wrong one must be
// shown 'different': each is wrong by a margin exact arithmetic or 40-digit numbers can see.

import { describe, expect, it } from 'vitest'
import {
  derivativeCheck,
  expressionEqual,
  factorCheck,
  integralCheck,
  linearSystemCheck,
  partialFractionsCheck,
  polyEqual,
  polyRootsCheck,
  rationalEqual,
  type Verdict
} from '../../src/renderer/src/math/check/checkers'
import { bracket, int, mul, seeded, show, type Coeffs } from './gen'

const ROUNDS = 150

interface Planted {
  name: string
  right: () => Verdict
  wrong: () => Verdict
}

function plants(rand: () => number): Planted[] {
  const r1 = int(rand, -6, 6)
  const r2 = int(rand, -6, 6)
  const r3 = int(rand, -6, 6)
  const k = int(rand, 1, 7)
  const p: Coeffs = [r1, r2, r3].reduce<Coeffs>((acc, r) => mul(acc, [BigInt(-r), 1n]), [BigInt(k)])
  const text = show(p)
  const product = `${k}*${bracket(r1)}*${bracket(r2)}*${bracket(r3)}`
  const tiny = `${text} + 1e-12`
  const d = int(rand, 2, 30)
  const isSquare = Number.isInteger(Math.sqrt(d))
  const a = int(rand, -5, 5)
  const b = int(rand, 1, 4)
  // (x − a)² − b²d has roots a ± b√d
  const surdPoly = `(x - ${a})^2 - ${b * b * d}`
  const plus = `${a} + ${b}*sqrt(${d})`
  const minus = `${a} - ${b}*sqrt(${d})`
  const A = int(rand, 1, 9)
  const B = int(rand, 1, 9)
  const s = r1 === r2 ? r2 + 1 : r2
  const x0 = int(rand, -9, 9)
  const y0 = int(rand, -9, 9)
  return [
    { name: `polyEqual ${product}`, right: () => polyEqual(product, text), wrong: () => polyEqual(product, tiny) },
    {
      name: `polyEqual thirds ${product}`,
      right: () => polyEqual(`(${product})/3`, `(${text})/3`),
      wrong: () => polyEqual(`(${product})/3`, `0.333333333333*(${text})`)
    },
    {
      name: `rationalEqual ${product}/${bracket(r1)}`,
      right: () => rationalEqual(`(${text})/${bracket(r1)}`, `${k}*${bracket(r2)}*${bracket(r3)}`).verdict,
      wrong: () => rationalEqual(`(${text})/${bracket(r1)}`, `${k}*${bracket(r2)}*${bracket(r3 + 1)}`).verdict
    },
    {
      name: `factorCheck ${product}`,
      right: () => factorCheck(text, product).verdict,
      wrong: () => factorCheck(text, `${k}*${bracket(r1)}*${bracket(r2)}*${bracket(r3 + 1)}`).verdict
    },
    {
      name: `polyRootsCheck ${product}`,
      right: () => polyRootsCheck(text, mergeRoots([r1, r2, r3])),
      wrong: () => polyRootsCheck(text, mergeRoots([r1, r2]))
    },
    {
      name: `polyRootsCheck multiplicity ${product}`,
      right: () => polyRootsCheck(`${bracket(r1)}^2*${bracket(r1 + 1)}`, [{ value: String(r1), multiplicity: 2 }, { value: String(r1 + 1), multiplicity: 1 }]),
      wrong: () => polyRootsCheck(`${bracket(r1)}^2*${bracket(r1 + 1)}`, [{ value: String(r1), multiplicity: 1 }, { value: String(r1 + 1), multiplicity: 2 }])
    },
    {
      name: `polyRootsCheck surds ${surdPoly}`,
      right: () => polyRootsCheck(surdPoly, isSquare ? mergeRoots([a + b * Math.sqrt(d), a - b * Math.sqrt(d)]) : [{ value: plus, multiplicity: 1 }, { value: minus, multiplicity: 1 }]),
      wrong: () => polyRootsCheck(surdPoly, [{ value: plus, multiplicity: 1 }, { value: `${a} - ${b}*sqrt(${d + 1})`, multiplicity: 1 }])
    },
    {
      name: `polyRootsCheck conjugate ${surdPoly}`,
      right: () => (isSquare ? 'equal' : polyRootsCheck(surdPoly, [{ value: minus, multiplicity: 1 }, { value: plus, multiplicity: 1 }])),
      wrong: () => polyRootsCheck(surdPoly, [{ value: plus, multiplicity: 2 }])
    },
    {
      name: `polyRootsCheck complex (x − ${a})² + ${b * b}`,
      right: () => polyRootsCheck(`(x - ${a})^2 + ${b * b}`, [{ value: `${a} + ${b}i`, multiplicity: 1 }, { value: `${a} - ${b}i`, multiplicity: 1 }], 'complex'),
      wrong: () => polyRootsCheck(`(x - ${a})^2 + ${b * b}`, [{ value: `${a} + ${b}i`, multiplicity: 1 }, { value: `${a} - ${b}i`, multiplicity: 1 }], 'real')
    },
    {
      name: `linearSystemCheck (${x0}, ${y0})`,
      right: () => linearSystemCheck([`${A}*x + ${B}*y = ${A * x0 + B * y0}`, `x - y = ${x0 - y0}`], { kind: 'unique', values: { x: String(x0), y: String(y0) } }),
      wrong: () => linearSystemCheck([`${A}*x + ${B}*y = ${A * x0 + B * y0}`, `x - y = ${x0 - y0}`], { kind: 'unique', values: { x: `${x0} + 1e-12`, y: String(y0) } })
    },
    {
      name: `linearSystemCheck dependent`,
      right: () => linearSystemCheck([`${A}*x + ${B}*y = ${A}`, `${2 * A}*x + ${2 * B}*y = ${2 * A}`], { kind: 'infinite', values: { x: `1 - ${B}*t/${A}`, y: 't' } }),
      wrong: () => linearSystemCheck([`${A}*x + ${B}*y = ${A}`, `${2 * A}*x + ${2 * B}*y = ${2 * A}`], { kind: 'unique', values: { x: '1', y: '0' } })
    },
    {
      name: `derivativeCheck ${text}`,
      right: () => derivativeCheck(text, 'x', `${k}*(${bracket(r2)}*${bracket(r3)} + ${bracket(r1)}*${bracket(r3)} + ${bracket(r1)}*${bracket(r2)})`),
      wrong: () => derivativeCheck(text, 'x', `${k}*(${bracket(r2)}*${bracket(r3)} + ${bracket(r1)}*${bracket(r3)} + ${bracket(r1)}*${bracket(r2)}) + 1e-12*x`)
    },
    {
      name: `derivativeCheck sin(${k}x)`,
      right: () => derivativeCheck(`sin(${k}*x)`, 'x', `${k}*cos(${k}*x)`),
      wrong: () => derivativeCheck(`sin(${k}*x)`, 'x', `${k}*cos(${k}*x + 1e-12)`)
    },
    {
      name: `integralCheck ${text}`,
      right: () => integralCheck(`${k}*x^${r1 + 6}`, 'x', `${k}*x^${r1 + 7}/${r1 + 7} + ${r2}`),
      wrong: () => integralCheck(`${k}*x^${r1 + 6}`, 'x', `${k}*x^${r1 + 7}/${r1 + 7.000000001}`)
    },
    {
      name: `partialFractionsCheck ${A}/(x − ${r1}) + ${B}/(x − ${s})`,
      right: () => partialFractionsCheck(`(${A}*${bracket(s)} + ${B}*${bracket(r1)})/(${bracket(r1)}*${bracket(s)})`, `${A}/${bracket(r1)} + ${B}/${bracket(s)}`),
      wrong: () => partialFractionsCheck(`(${A}*${bracket(s)} + ${B}*${bracket(r1)})/(${bracket(r1)}*${bracket(s)})`, `${A}/${bracket(r1)} - ${B}/${bracket(s)}`)
    },
    {
      name: `expressionEqual |x − ${r1}|`,
      right: () => expressionEqual(`sqrt((x - ${r1})^2)`, `|${r1} - x|`),
      wrong: () => expressionEqual(`sqrt((x - ${r1})^2)`, `x - ${r1}`)
    },
    {
      name: `expressionEqual ln(x^${2 * b})`,
      right: () => expressionEqual(`ln(x^${2 * b}) + ln(1)`, `ln(x^${2 * b})`),
      wrong: () => expressionEqual(`ln(x^${2 * b})`, `${2 * b}*ln(x)`)
    }
  ]
}

/** Equal whole roots merged into multiplicities; any other value written as a decimal. */
function mergeRoots(rs: number[]): { value: string; multiplicity: number }[] {
  const out: { value: string; multiplicity: number }[] = []
  for (const r of rs) {
    const v = String(r)
    const same = out.find((o) => o.value === v)
    if (same) same.multiplicity++
    else out.push({ value: v, multiplicity: 1 })
  }
  return out
}

describe('differential: planted wrong answers through every checker', () => {
  it(`${ROUNDS} seeded rounds: a wrong answer is always 'different', a right one never 'different'`, () => {
    const rand = seeded(20261012)
    const falseEqual: string[] = []
    const falseDifferent: string[] = []
    const wrongNotShown: string[] = []
    let unknownRight = 0
    let total = 0
    for (let round = 0; round < ROUNDS; round++) {
      for (const plant of plants(rand)) {
        total++
        const wrong = plant.wrong()
        if (wrong === 'equal') falseEqual.push(plant.name)
        if (wrong === 'unknown') wrongNotShown.push(plant.name)
        const right = plant.right()
        if (right === 'different') falseDifferent.push(plant.name)
        if (right === 'unknown') unknownRight++
      }
    }
    expect(falseEqual, 'a planted wrong answer was called equal').toEqual([])
    // Every plant is wrong by a margin exact arithmetic, or 40-digit numbers, can see: an 'unknown' there means a
    // checker stopped deciding, which "never equal" alone would not notice.
    expect(wrongNotShown, 'a planted wrong answer was not shown to be wrong').toEqual([])
    expect(falseDifferent, 'a right answer was called different').toEqual([])
    // Only the transcendental plant (sin) is allowed to stay unknown: numbers never prove equal.
    expect(unknownRight).toBeLessThanOrEqual(ROUNDS * 2)
    expect(total).toBe(ROUNDS * 17)
    // 2550 checks: about 6 s beside the other check files, past vitest's 5 s default.
  }, 120_000)
})
