// Whole numbers: prime factorisation, HCF and LCM, shown the way they are taught.
//
// The working is the division ladder and the prime-factor table from the textbook, not a printout
// of an algorithm, because the point is that the student recognises what they are looking at.

import { bgcd, blcm } from './rat'

/** The primes multiplied back together — the check behind every tick in this file. */
const product = (factors: [bigint, number][]): bigint => factors.reduce((a, [p, k]) => a * p ** BigInt(k), 1n)
import { Steps, failed, type Working } from './work'

import { MAX_TRIAL } from './limits'

export interface Factorisation {
  n: bigint
  /** Prime → how many times it divides in, smallest prime first. */
  factors: [bigint, number][]
  /** Set when the number was too large to split completely. */
  tooBig?: boolean
}

export function primeFactorise(input: bigint): Factorisation {
  let n = input < 0n ? -input : input
  const factors: [bigint, number][] = []
  if (n <= 1n) return { n: input, factors }
  const push = (p: bigint): void => {
    const last = factors[factors.length - 1]
    if (last && last[0] === p) last[1]++
    else factors.push([p, 1])
  }
  while (n % 2n === 0n) {
    push(2n)
    n /= 2n
  }
  let d = 3n
  let steps = 0
  while (d * d <= n) {
    if (steps++ > MAX_TRIAL) return { n: input, factors: [...factors, [n, 1]], tooBig: true }
    while (n % d === 0n) {
      push(d)
      n /= d
    }
    d += 2n
  }
  if (n > 1n) push(n)
  return { n: input, factors }
}

/** 2^{3} \times 3^{2} \times 5 */
export function factorTex(f: Factorisation): string {
  if (f.factors.length === 0) return String(f.n)
  const body = f.factors.map(([p, k]) => (k === 1 ? String(p) : `${p}^{${k}}`)).join(' \\times ')
  return f.n < 0n ? `-\\,${body}` : body
}

/**
 * One number broken into primes, as a sentence and its maths. A prime is said to be prime, not
 * written "7 = 7" — a line that changes nothing (Fix 4).
 */
function breakMove(n: bigint, f: Factorisation): [string, string] {
  if (f.factors.length === 0) return [`${n} has no prime factors.`, `${n}\\text{ has no prime factors}`]
  if (f.factors.length === 1 && f.factors[0][1] === 1) return [`${n} is already a prime.`, `${n}\\text{ is prime}`]
  return [`Break ${n} into primes.`, `${n} = ${factorTex(f)}`]
}

/** The division ladder, as a textbook lays it out. */
function ladderTex(f: Factorisation): string {
  let running = f.n < 0n ? -f.n : f.n
  const rows: string[] = []
  for (const [p, k] of f.factors) {
    for (let i = 0; i < k; i++) {
      rows.push(`${p} & ${running}`)
      running /= p
    }
  }
  rows.push(`& ${running}`)
  return `\\begin{array}{r|r}\n${rows.join(' \\\\\n')}\n\\end{array}`
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

export function factoriseNumberWorking(input: bigint): Working {
  const title = `Factorise ${input} into primes`
  const tex = String(input)
  if (input === 0n) return failed(title, tex, 'Zero has no prime factorisation — every prime divides it.')
  const abs = input < 0n ? -input : input
  if (abs === 1n) return failed(title, tex, '1 has no prime factors. It is neither prime nor composite.')

  const f = primeFactorise(input)
  if (f.tooBig) {
    return failed(title, tex, `${input} is too large for me to split all the way down. Try a number below about 10¹⁴.`)
  }

  const s = new Steps()
  if (input < 0n) {
    s.goal('Deal with the minus sign').add('The number is negative, so factorise its size and keep the minus sign outside.', `${input} = -\\left(${abs}\\right)`)
  }

  if (f.factors.length === 1 && f.factors[0][1] === 1) {
    s.goal('Check whether it is prime').add(`${abs} has no factors except 1 and itself, so it is already prime.`, `${abs}\\text{ is prime}`, '\\text{a prime has exactly two factors}')
    return { title, input: tex, moves: s.moves, answers: [{ label: `${input}`, tex: factorTex(f) }], check: `${abs} is prime.`, checked: f.factors[0][0] === abs ? 'ok' : 'failed' }
  }

  s.goal('Split into primes').add(
    'Divide by the smallest prime that goes in, over and over, until 1 is left.',
    ladderTex(f),
    '\\text{try } 2,\\,3,\\,5,\\,7,\\,11 \\ldots'
  )
  s.goal('Count each prime').add(
    `Collect the ${plural(f.factors.length, 'prime down the left', 'primes down the left')}, counting how many times each one appeared.`,
    `${abs} = ${factorTex({ ...f, n: abs })}`,
    '\\text{index} = \\text{how many times it divided in}'
  )
  const total = f.factors.reduce((a, [, k]) => a + k, 0)
  const divisors = f.factors.reduce((a, [, k]) => a * (k + 1), 1)
  s.goal('Count the divisors').add(
    `That is ${total} prime ${plural(total, 'factor', 'factors')} altogether. Add 1 to each index and multiply: ${abs} has ${divisors} ${plural(divisors, 'divisor', 'divisors')} in all.`,
    f.factors.map(([, k]) => `(${k}+1)`).join(' \\times ') + ` = ${divisors}`,
    '\\text{divisors} = \\prod (\\text{index} + 1)'
  )

  const ok = product(f.factors) === abs
  return {
    title,
    input: tex,
    moves: s.moves,
    answers: [{ label: `${input} =`, tex: factorTex(f) }],
    check: ok ? `${f.factors.map(([p, k]) => (k === 1 ? `${p}` : `${p}^${k}`)).join(' × ')} = ${abs}` : `Careful: those primes do not multiply back to ${abs}. Treat this answer with suspicion.`,
    checked: ok ? 'ok' : 'failed'
  }
}

// ---------------------------------------------------------------- HCF and LCM

interface Pairing {
  primes: bigint[]
  rows: { n: bigint; powers: number[] }[]
}

function lineUp(ns: bigint[]): Pairing {
  const all = new Set<string>()
  const each = ns.map((n) => primeFactorise(n))
  for (const f of each) for (const [p] of f.factors) all.add(String(p))
  const primes = [...all].map((s) => BigInt(s)).sort((a, b) => (a < b ? -1 : 1))
  const rows = each.map((f, i) => ({
    n: ns[i],
    powers: primes.map((p) => f.factors.find(([q]) => q === p)?.[1] ?? 0)
  }))
  return { primes, rows }
}

/** A table of each number's prime powers, with a row per number. */
function tableTex(pair: Pairing): string {
  const cols = `r|${pair.primes.map(() => 'c').join('')}`
  const head = `& ${pair.primes.join(' & ')} \\\\ \\hline`
  const body = pair.rows.map((r) => `${r.n} & ${r.powers.join(' & ')}`).join(' \\\\\n')
  return `\\begin{array}{${cols}}\n\\text{number} & ${pair.primes.map(() => '').join(' & ')} \\\\[-1.2em]\n${head}\n${body}\n\\end{array}`
}

const powerTex = (p: bigint, k: number): string => (k === 1 ? String(p) : `${p}^{${k}}`)

export function hcfWorking(ns: bigint[]): Working {
  const title = `Find the HCF of ${ns.join(', ')}`
  const tex = `\\text{HCF}(${ns.join(',\\,')})`
  if (ns.length < 2) return failed(title, tex, 'Give me at least two numbers.')
  if (ns.some((n) => n === 0n)) return failed(title, tex, 'Leave zero out — every number divides it, so the HCF is just the other number.')
  const pos = ns.map((n) => (n < 0n ? -n : n))
  const pair = lineUp(pos)
  const s = new Steps()

  s.goal('Break each number into primes').add('Write each number as a product of primes.', tableTex(pair), '\\text{HCF} = \\text{common primes, lowest index}')
  for (const r of pair.rows) {
    const f = primeFactorise(r.n)
    s.add(...breakMove(r.n, f))
  }

  const commonPowers = pair.primes.map((p, i) => Math.min(...pair.rows.map((r) => r.powers[i])))
  const kept = pair.primes.map((p, i) => [p, commonPowers[i]] as [bigint, number]).filter(([, k]) => k > 0)

  if (kept.length === 0) {
    s.goal('Look for a shared prime').add('No prime appears in every number, so they share nothing but 1.', '\\text{HCF} = 1', '\\text{numbers with HCF } 1 \\text{ are coprime}')
    // Euclid's route is independent of the prime table, so agreeing with it is a real check.
    const coprime = ns.reduce((a, b) => bgcd(a, b), 0n) === 1n
    return { title, input: tex, moves: s.moves, answers: [{ label: 'HCF =', tex: '1' }], check: coprime ? `${pos.join(' and ')} are coprime.` : 'Careful: Euclid finds a common factor the table missed. Treat this answer with suspicion.', checked: coprime ? 'ok' : 'failed' }
  }

  s.goal('Keep the shared primes').add(
    'Keep only the primes that appear in every number, each at its lowest index.',
    kept.map(([p, k]) => powerTex(p, k)).join(' \\times '),
    '\\min(\\text{indices})'
  )
  const hcf = ns.reduce((a, b) => bgcd(a, b), 0n)
  s.add(...productMove('HCF', kept, hcf))

  // The primes kept from the table have to multiply to Euclid's answer, and that has to divide in.
  const ok = product(kept) === hcf && pos.every((n) => n % hcf === 0n)
  return {
    title,
    input: tex,
    moves: s.moves,
    answers: [{ label: 'HCF =', tex: String(hcf) }],
    check: ok ? `${pos.map((n) => `${n} ÷ ${hcf} = ${n / hcf}`).join(',  ')} — all whole, so ${hcf} divides every one.` : `Careful: ${hcf} does not divide every number. Treat this answer with suspicion.`,
    checked: ok ? 'ok' : 'failed'
  }
}

/**
 * "HCF = 2² × 3 = 12", or just "HCF = 3" when the one prime kept is the answer: "HCF = 3 = 3" was
 * a step that changes nothing, and "multiply those primes together" promised a product that was
 * not there.
 */
function productMove(what: 'HCF' | 'LCM', kept: [bigint, number][], value: bigint): [string, string] {
  const product = kept.map(([p, k]) => powerTex(p, k)).join(' \\times ')
  if (!product) return [`No prime is left over, so the ${what} is 1.`, `\\text{${what}} = ${value}`]
  if (product === String(value)) return [`That one prime is the ${what}.`, `\\text{${what}} = ${value}`]
  return [`Multiply those primes together to get the ${what}.`, `\\text{${what}} = ${product} = ${value}`]
}

export function lcmWorking(ns: bigint[]): Working {
  const title = `Find the LCM of ${ns.join(', ')}`
  const tex = `\\text{LCM}(${ns.join(',\\,')})`
  if (ns.length < 2) return failed(title, tex, 'Give me at least two numbers.')
  if (ns.some((n) => n === 0n)) return failed(title, tex, 'Zero has no multiples to share, so leave it out.')
  const pos = ns.map((n) => (n < 0n ? -n : n))
  const pair = lineUp(pos)
  const s = new Steps()

  s.goal('Break each number into primes').add('Write each number as a product of primes.', tableTex(pair), '\\text{LCM} = \\text{every prime, highest index}')
  for (const r of pair.rows) {
    const f = primeFactorise(r.n)
    s.add(...breakMove(r.n, f))
  }

  const topPowers = pair.primes.map((p, i) => Math.max(...pair.rows.map((r) => r.powers[i])))
  const kept = pair.primes.map((p, i) => [p, topPowers[i]] as [bigint, number]).filter(([, k]) => k > 0)
  s.goal('Take every prime you see').add(
    'Take every prime that appears anywhere, each at its highest index.',
    kept.map(([p, k]) => powerTex(p, k)).join(' \\times '),
    '\\max(\\text{indices})'
  )
  const lcm = ns.reduce((a, b) => blcm(a, b), 1n)
  s.add(...productMove('LCM', kept, lcm))

  const moves = s.moves
  if (ns.length === 2) {
    const hcf = bgcd(pos[0], pos[1])
    moves.push({
      head: 'Check it against the product of the two numbers.',
      rule: '\\text{HCF} \\times \\text{LCM} = a \\times b',
      tex: `${hcf} \\times ${lcm} = ${hcf * lcm} = ${pos[0]} \\times ${pos[1]}`
    })
  }

  const ok = product(kept) === lcm && pos.every((n) => lcm % n === 0n)
  return {
    title,
    input: tex,
    moves,
    answers: [{ label: 'LCM =', tex: String(lcm) }],
    check: ok ? `${pos.map((n) => `${lcm} ÷ ${n} = ${lcm / n}`).join(',  ')} — all whole, so every one divides ${lcm}.` : `Careful: not every number divides ${lcm}. Treat this answer with suspicion.`,
    checked: ok ? 'ok' : 'failed'
  }
}
