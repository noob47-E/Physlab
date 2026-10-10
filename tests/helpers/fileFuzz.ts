// Damaged copies of real files for the file doors (CW5): a seeded generator, the damage, and the
// rule for what a door may throw.

/** A small seeded generator, so a failure names a copy that can be made again. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
const JUNK: Json[] = [null, 0, -1, 1e308, '', 'x', true, [], {}, [1, 2], { a: 1 }]

/** Every place in a JSON value that can be damaged: an object key or an array index, with its parent. */
function places(v: Json, out: { parent: Json[] | { [k: string]: Json }; key: string | number }[] = []) {
  if (Array.isArray(v)) {
    v.forEach((c, i) => {
      out.push({ parent: v, key: i })
      places(c, out)
    })
  } else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      out.push({ parent: v, key: k })
      places(v[k], out)
    }
  }
  return out
}

/** One damaged copy: one to three places each deleted or replaced with something of the wrong kind. */
function damage(seedText: string, r: () => number): string {
  const v = JSON.parse(seedText) as Json
  const n = 1 + Math.floor(r() * 3)
  for (let i = 0; i < n; i++) {
    const all = places(v)
    if (all.length === 0) break
    const { parent, key } = all[Math.floor(r() * all.length)]
    if (r() < 0.3) {
      if (Array.isArray(parent)) parent.splice(key as number, 1)
      else delete parent[key as string]
    } else {
      const junk = JUNK[Math.floor(r() * JUNK.length)]
      ;(parent as Record<string | number, Json>)[key] = JSON.parse(JSON.stringify(junk)) as Json
    }
  }
  return JSON.stringify(v)
}

/**
 * What a door threw, if it broke the rule. A crash is anything but a written refusal (a TypeError
 * and the like); `words` is a refusal that shows the machinery ("undefined", "[object Object]").
 */
function brokeRule(e: unknown): { kind: 'crash' | 'words'; why: string } | null {
  if (!(e instanceof Error)) return { kind: 'crash', why: `threw a ${typeof e}` }
  if (e instanceof TypeError || e instanceof RangeError || e instanceof ReferenceError) return { kind: 'crash', why: `${e.name}: ${e.message}` }
  if (/undefined|null|NaN|\[object|is not a function|Cannot read/.test(e.message)) return { kind: 'words', why: e.message }
  return null
}

/** Runs `open` on 500 damaged copies of the seeds; lists every copy that broke the rule, by kind. */
export function fuzz(seeds: string[], open: (text: string) => void, seed = 1): { crash: string[]; words: string[] } {
  const r = rng(seed)
  const out = { crash: [] as string[], words: [] as string[] }
  for (let i = 0; i < 500; i++) {
    const text = damage(seeds[i % seeds.length], r)
    try {
      open(text)
    } catch (e) {
      const broke = brokeRule(e)
      if (broke) out[broke.kind].push(`copy ${i}: ${broke.why} — ${text.slice(0, 160)}`)
    }
  }
  return out
}
