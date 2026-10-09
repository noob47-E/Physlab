// The golden sweeps' shared harness (clean-up wave CW0, CLEANUP-PLAN.md §2).
//
// A sweep runs a fixed list of inputs through a real route and writes one line per input: the
// input, then exactly what the student sees. The committed file tests/golden/out/<name>.txt is
// the "before"; a refactor must leave every line byte-identical. A part whose item is marked
// [answer may change] updates a golden file only in a commit of its own that names the item:
//
//   PHYSLAB_GOLDEN_UPDATE=1 npx vitest run tests/golden/<name>.golden.test.ts
//
// Order is kept, never sorted: the order of wrong answers, roots and steps is something a student
// sees. A sweep marked full (the slow ones: questions, presets, all 60 algebra-engine jobs) runs
// only when PHYSLAB_GOLDEN_FULL=1, which `npm run gate -- full` sets.

import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { vi } from 'vitest'
import { REPO_ROOT } from '../helpers/repo'

/**
 * Stops the clock for a sweep whose route reads it: the identity prover keeps "the chain found so
 * far" at its 1.5 s deadline and the graph checks give up on a slow formula, so on a busy machine
 * a line could come out shorter. With the clock stopped only their node and value caps end a
 * search, which are the same on every machine. Call it in the sweep's beforeAll.
 */
export function freezeClock(): void {
  vi.spyOn(performance, 'now').mockReturnValue(0)
}

export const GOLDEN_FULL = process.env.PHYSLAB_GOLDEN_FULL === '1'
const UPDATE = process.env.PHYSLAB_GOLDEN_UPDATE === '1'

/** Where a sweep's committed output lives. */
export const goldenPath = (name: string): string => join(REPO_ROOT, 'tests', 'golden', 'out', `${name}.txt`)

/** One input and what the student sees for it, on one line (a newline inside an answer is shown as ⏎). */
export const goldenLine = (input: string, seen: string): string => `${input.replace(/\r?\n/g, ' ⏎ ')}  =>  ${seen.replace(/\r?\n/g, ' ⏎ ')}`

/** What went wrong in a run, in words, so a failing sweep never just says "error". */
export function seenOf(run: () => string): string {
  try {
    return run()
  } catch (e) {
    return `THROWS ${e instanceof Error ? e.message : String(e)}`
  }
}

/**
 * The lines that differ from the committed file, as "-old / +new" pairs with their line number;
 * empty when the sweep is unchanged. With PHYSLAB_GOLDEN_UPDATE=1 the file is (re)written instead.
 */
export function goldenDiff(name: string, lines: readonly string[]): string[] {
  const file = goldenPath(name)
  const text = lines.join('\n') + '\n'
  if (UPDATE || !fs.existsSync(file)) {
    if (!UPDATE) throw new Error(`No golden file for "${name}" yet: run the sweep once with PHYSLAB_GOLDEN_UPDATE=1 and commit ${file}.`)
    fs.mkdirSync(dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    return []
  }
  const old = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')
  if (old.at(-1) === '') old.pop()
  const out: string[] = []
  const n = Math.max(old.length, lines.length)
  for (let i = 0; i < n; i++) {
    if (old[i] === lines[i]) continue
    out.push(`line ${i + 1}:`, `  - ${old[i] ?? '(none)'}`, `  + ${lines[i] ?? '(none)'}`)
  }
  return out
}

/** Fails, listing the first changed lines, when the sweep's output is not byte-identical to its golden file. */
export function expectGolden(name: string, lines: readonly string[]): void {
  const diff = goldenDiff(name, lines)
  if (diff.length) {
    const changed = diff.filter((l) => l.startsWith('line ')).length
    throw new Error(`The "${name}" sweep changed on ${changed} line(s):\n${diff.slice(0, 60).join('\n')}${diff.length > 60 ? '\n…' : ''}`)
  }
}
