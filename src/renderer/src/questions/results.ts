// Result files (.pqresult, opt-in) and item statistics: what a class's saved results say about a
// question, worked out entirely on the teacher's own computer. Nothing here reaches a network — a
// result file only exists because a student pressed "Save my results for my teacher" and handed
// the file on themselves (email, a USB stick, a shared folder); PhysLab never sends one anywhere.
//
// The statistics are the classical ones a teacher already knows from a mark scheme:
//   facility  — the share of students who got a part right on their very first Check (never a
//               later correction: a part re-checked after a fix is still "wrong first time").
//   rpb       — the corrected item–total point-biserial correlation: does a student who does well
//               on the rest of the set also do well on this part? The part's own marks are taken
//               back out of each student's total before correlating ("item removed"), so a part
//               worth a lot of marks can never inflate its own correlation with itself.
//   d27       — Kelley's (1939) upper–lower 27 % index: the difference in facility between the
//               strongest and weakest 27 % of the class, ranked by that same corrected total.
// All three are null where there is nothing to say — one file, or every student the same way.

export const RESULT_FORMAT = 'pqresult'
export const RESULT_VERSION = 1

/** One counted part of one played question, as a result file remembers it. */
export interface PQResultPart {
  /** The part's place in the author's own list (`PlayedPart.index`), not its position among only the parts this student was shown. */
  index: number
  /**
   * The student gave this part a real answer — a Check with something readable in its box — or
   * gave up on it by opening the full solution. A part left blank, or never Checked at all (Next
   * is always there), was not attempted: item statistics leave it out, though its 0 marks still
   * count in the student's total.
   */
  answered: boolean
  /** Right at this part's own first real Check, before any full solution was shown — what facility counts, never a later correction. */
  firstTry: boolean
  /** Right in the end, by the mark scheme (after error carried forward, if the part carries it). */
  right: boolean
  marks: number
  outOf: number
  /** This mark used the student's own earlier answer (error carried forward): not a plain right/wrong on the part alone. */
  ecf?: boolean
}

/** One played question of the set, in the order the student reached it. */
export interface PQResultItem {
  questionId: string
  seed: number
  parts: PQResultPart[]
  hints: number
  seconds: number
}

export interface PQResultFile {
  app: 'PhysLab'
  format: typeof RESULT_FORMAT
  version: typeof RESULT_VERSION
  /** Left out when the student typed no name. */
  student?: string
  setId: string
  setTitle: string
  /** ISO 8601, from `new Date().toISOString()`. */
  when: string
  items: PQResultItem[]
}

export function serializeResultFile(file: PQResultFile): string {
  return JSON.stringify(file, null, 1)
}

/** Builds a fresh `.pqresult` file from one finished set, ready for `serializeResultFile`. */
export function buildResultFile(args: { setId: string; setTitle: string; student?: string; items: PQResultItem[] }): PQResultFile {
  const file: PQResultFile = {
    app: 'PhysLab',
    format: RESULT_FORMAT,
    version: RESULT_VERSION,
    setId: args.setId,
    setTitle: args.setTitle,
    when: new Date().toISOString(),
    items: args.items
  }
  if (args.student && args.student.trim() !== '') file.student = args.student.trim()
  return file
}

// ---------------------------------------------------------------------------
// From a played question to its result parts
// ---------------------------------------------------------------------------

/** What a box's mark has to say for a result file — Practice's `RowCheck` is one. */
export interface ResultCheck {
  verdict: 'right' | 'close' | 'wrong' | 'empty' | 'unreadable'
  marks?: number
  outOf?: number
  ecfNote?: string
}

/** A Check that was a real try at the part: something typed, and something PhysLab could read. */
const isTry = (c: ResultCheck): boolean => c.verdict !== 'empty' && c.verdict !== 'unreadable'

/**
 * Each part's own first real Check, kept across every press of Check on one question. Enter in
 * part (a)'s box checks the whole question while (b) and (c) are still blank, so "the question's
 * first Check" would call a blank (b) wrong first time: a part is recorded only at the first
 * Check that has something readable in its box, and never replaced afterwards. A part first
 * Checked after the full solution was shown is recorded as not right first time — its answer was
 * read off the solution, not worked out.
 */
export function recordFirstTries(
  prev: Readonly<Record<string, boolean>> | null,
  checks: Readonly<Record<string, ResultCheck>>,
  revealed: boolean
): Record<string, boolean> {
  const out: Record<string, boolean> = { ...(prev ?? {}) }
  for (const [key, c] of Object.entries(checks)) {
    if (key in out || !isTry(c)) continue
    out[key] = !revealed && c.verdict === 'right'
  }
  return out
}

/**
 * A played question's counted parts as a result file writes them. `firstTries` is what
 * `recordFirstTries` built up; `revealed` is whether the full solution was opened, and
 * `checksAtReveal` the marks on screen at the moment it was. Opening the solution is giving up on
 * every part not yet tried (answered, not right first time, no marks); a part already tried
 * before it keeps what it had earned then — a Check after the reveal, with the answer in view,
 * can neither add to it nor take it away. A part never tried and never revealed was not
 * answered, and carries no mark.
 */
export function resultParts(
  parts: readonly { key: string; index: number; marks: number }[],
  checks: Readonly<Record<string, ResultCheck | undefined>>,
  firstTries: Readonly<Record<string, boolean>> | null,
  revealed: boolean,
  checksAtReveal: Readonly<Record<string, ResultCheck | undefined>> | null = null
): PQResultPart[] {
  return parts.map((p) => {
    const first = firstTries?.[p.key]
    const answered = first !== undefined || revealed
    // The mark that stands: the last Check before the reveal for a part tried by then, the last
    // Check of all when the solution was never opened, and none for a part given up on.
    const before = checksAtReveal?.[p.key]
    const c = revealed ? (first !== undefined && before && isTry(before) ? before : undefined) : answered ? checks[p.key] : undefined
    const part: PQResultPart = {
      index: p.index,
      answered,
      firstTry: first === true,
      right: c?.verdict === 'right',
      marks: c?.marks ?? 0,
      outOf: c?.outOf ?? checks[p.key]?.outOf ?? p.marks
    }
    if (c?.ecfNote) part.ecf = true
    return part
  })
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isWhole = (v: unknown): v is number => isNum(v) && Number.isInteger(v)

const NOT_A_FILE = 'That is not a PhysLab result file.'

function parsePart(p: unknown, i: number, j: number): PQResultPart {
  const who = `Item ${i + 1}, part ${j + 1} of this result file`
  if (!isObj(p)) throw new Error(`${who} is not one PhysLab can read.`)
  if (!isWhole(p.index) || p.index < 0) throw new Error(`${who} does not say which part it is.`)
  if (!isBool(p.answered)) throw new Error(`${who} does not say whether it was answered.`)
  if (!isBool(p.firstTry) || !isBool(p.right)) throw new Error(`${who} does not say right or wrong.`)
  if (!isNum(p.marks) || !isNum(p.outOf)) throw new Error(`${who} has no marks.`)
  if (p.outOf <= 0 || p.marks < 0 || p.marks > p.outOf) throw new Error(`${who} has marks that are not possible.`)
  if (!p.answered && (p.firstTry || p.right || p.marks > 0)) throw new Error(`${who} was never answered but has a mark.`)
  if (p.ecf !== undefined && !isBool(p.ecf)) throw new Error(`${who} has a carried-forward mark that is not yes or no.`)
  const out: PQResultPart = { index: p.index, answered: p.answered, firstTry: p.firstTry, right: p.right, marks: p.marks, outOf: p.outOf }
  if (p.ecf) out.ecf = true
  return out
}

function parseItem(it: unknown, i: number): PQResultItem {
  const who = `Item ${i + 1} of this result file`
  if (!isObj(it)) throw new Error(`${who} is not one PhysLab can read.`)
  if (!isStr(it.questionId) || it.questionId === '') throw new Error(`${who} has no question id.`)
  if (!isNum(it.seed)) throw new Error(`${who} has no seed.`)
  if (!isWhole(it.hints) || it.hints < 0 || !isNum(it.seconds) || it.seconds < 0) throw new Error(`${who} has no hints or time on it.`)
  if (!Array.isArray(it.parts)) throw new Error(`${who} has no parts.`)
  return { questionId: it.questionId, seed: it.seed, parts: it.parts.map((p, j) => parsePart(p, i, j)), hints: it.hints, seconds: it.seconds }
}

/**
 * Reads a `.pqresult` file back, refusing in one plain sentence anything that is not one — text
 * that is not JSON, a file of the wrong kind, or a future format. With `forSetId` given (the set
 * open on this computer right now), a result file saved from a *different* set is refused too, so
 * a teacher can never mix two sets' statistics by opening the wrong file.
 */
export function parseResultFile(text: string, forSetId?: string): PQResultFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(NOT_A_FILE)
  }
  if (!isObj(raw) || raw.app !== 'PhysLab' || raw.format !== RESULT_FORMAT) throw new Error(NOT_A_FILE)
  if (isWhole(raw.version) && raw.version > RESULT_VERSION) {
    throw new Error('This result file was saved by a newer PhysLab — update PhysLab to open it.')
  }
  if (raw.version !== RESULT_VERSION) throw new Error(NOT_A_FILE)
  if (!isStr(raw.setId) || raw.setId === '') throw new Error(NOT_A_FILE)
  if (!isStr(raw.setTitle) || !isStr(raw.when) || !Array.isArray(raw.items)) throw new Error(NOT_A_FILE)
  if (raw.student !== undefined && !isStr(raw.student)) throw new Error(NOT_A_FILE)
  if (forSetId !== undefined && raw.setId !== forSetId) {
    throw new Error(`"${raw.setTitle}" is a result file for a different question set — open it while that set is picked.`)
  }
  const file: PQResultFile = {
    app: 'PhysLab',
    format: RESULT_FORMAT,
    version: RESULT_VERSION,
    setId: raw.setId,
    setTitle: raw.setTitle,
    when: raw.when,
    items: raw.items.map((it, i) => parseItem(it, i))
  }
  if (isStr(raw.student)) file.student = raw.student
  return file
}

// ---------------------------------------------------------------------------
// Item statistics
// ---------------------------------------------------------------------------

export interface ItemStat {
  questionId: string
  partIndex: number
  /** Students who answered the part (`PQResultPart.answered`); one left blank or skipped is not counted. */
  attempted: number
  /** The share who got it right on their very first Check (decision 8, PROGRAM §5). */
  facility: number
  /** Corrected item–total point-biserial r. Null with fewer than 2 attempts, or where every
   *  attempt (or none) was right first time — there is no spread on the item to correlate. */
  rpb: number | null
  /** Kelley's upper–lower 27 % index, a tie at either cut shared out evenly. Null with too few
   *  attempts to make two non-overlapping 27 % groups, or every corrected total the same. */
  d27: number | null
  /** A plain sentence when a number here is worth a teacher's attention; never both at once. */
  flag?: string
}

/** One student's (one file's) total marks across every part of every item they answered. */
function fileTotal(file: PQResultFile): number {
  let total = 0
  for (const item of file.items) for (const part of item.parts) total += part.marks
  return total
}

function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Population variance (÷n, not n−1): the class sitting this set IS the population being
 *  described, not a sample drawn from some larger one the teacher wants to generalise to. */
function variance(xs: readonly number[]): number {
  const m = mean(xs)
  return mean(xs.map((x) => (x - m) ** 2))
}

/**
 * The point-biserial correlation between a right/wrong item (`right`) and a continuous total
 * (`totals`), same length and order. `((mean of the totals where right) − (mean where wrong)) /
 * population SD of the totals, times √(p·q)` — the textbook two-group form of Pearson's r when one
 * variable is 0/1. Null where the item has no spread (everyone, or no one, got it right) or the
 * totals have none (every student scored the same).
 */
export function pointBiserial(right: readonly boolean[], totals: readonly number[]): number | null {
  const n = right.length
  if (n < 2 || totals.length !== n) return null
  const p = right.filter(Boolean).length / n
  if (p === 0 || p === 1) return null
  const v = variance(totals)
  if (v === 0) return null
  const sd = Math.sqrt(v)
  const rightTotals = totals.filter((_, i) => right[i])
  const wrongTotals = totals.filter((_, i) => !right[i])
  return ((mean(rightTotals) - mean(wrongTotals)) / sd) * Math.sqrt(p * (1 - p))
}

/**
 * Kelley's (1939) upper–lower 27 % discrimination index: rank the class by `totals`, take the top
 * and bottom `k = round(n · 0.27)` students, and subtract the lower group's facility on the item
 * from the upper group's. Null when the class is too small for two groups of k that do not
 * overlap, or when every total is the same (there is no strong or weak end to compare).
 *
 * Totals are whole marks from a short range, so students often tie right at a cut. Taking some of
 * a tied group and not others would make D depend on nothing but the order the files were opened
 * in; instead every student in the tie straddling a cut belongs to that group in equal part —
 * weight (places left in the group ÷ number tied) — and the group's rate is its weighted share
 * right. With no tie at a cut this is exactly the plain count.
 */
export function d27(right: readonly boolean[], totals: readonly number[]): number | null {
  const n = right.length
  if (totals.length !== n) return null
  const k = Math.round(n * 0.27)
  if (k < 1 || n - k <= k) return null
  if (totals.every((t) => t === totals[0])) return null
  const sorted = [...totals].sort((a, b) => b - a)
  /** The share right among the k students at one end: every total past `cut` in full, the tie at `cut` in equal part. */
  const rate = (cut: number, past: (t: number) => boolean): number => {
    let inPast = 0
    let pastRight = 0
    let tied = 0
    let tiedRight = 0
    totals.forEach((t, i) => {
      if (past(t)) {
        inPast++
        if (right[i]) pastRight++
      } else if (t === cut) {
        tied++
        if (right[i]) tiedRight++
      }
    })
    return (pastRight + ((k - inPast) / tied) * tiedRight) / k
  }
  const upperCut = sorted[k - 1]
  const lowerCut = sorted[n - k]
  return rate(upperCut, (t) => t > upperCut) - rate(lowerCut, (t) => t < lowerCut)
}

/** A plain sentence for a teacher's attention, or none — never both a "too easy" and a "does not separate" flag at once. */
function flagFor(facility: number, disc: number | null, rpb: number | null): string | undefined {
  if (facility <= 0.2) return 'Most got it wrong first time.'
  if (facility >= 0.98) return 'Nearly everyone got it right first time — too easy to tell strong and weak students apart.'
  // D where there is one; where the class is too small (or too alike) for it, r_pb says the same.
  const sep = disc ?? rpb
  if (sep !== null && sep < 0.2) return 'Does not separate strong and weak answers.'
  return undefined
}

/**
 * Facility and discrimination for every part any of the given result files answered, worked out
 * entirely from the files themselves. A part two files disagree on which question it belongs to
 * (same `questionId`, but a different part `index`) is two different items, as it should be — a
 * result file always names the part by the author's own numbering, never by position on screen.
 */
export function itemStats(files: readonly PQResultFile[]): ItemStat[] {
  const totals = files.map(fileTotal)
  interface Group {
    questionId: string
    partIndex: number
    fileIdx: number[]
    firstTry: boolean[]
    marks: number[]
  }
  const byKey = new Map<string, Group>()
  files.forEach((file, fi) => {
    // A single file can legitimately hold the same (questionId, part index) twice — "Go deeper" can
    // reach a question already played earlier in the same set. One student is still one data point:
    // her very first Check anywhere in the file decides `firstTry`, and every mark she earned on the
    // part (across every time she met it) comes back out of her total together, or "item removed"
    // would still be self-correlating with the part it removed.
    const perFile = new Map<string, { questionId: string; partIndex: number; firstTry: boolean; marks: number }>()
    for (const item of file.items) {
      for (const part of item.parts) {
        // A part never answered (left blank, or skipped with Next) was not attempted: it is no
        // data point for the item, though its 0 marks still count in the student's total.
        if (!part.answered) continue
        const key =`${item.questionId}\u0000${part.index}`
        const seen = perFile.get(key)
        if (!seen) perFile.set(key, { questionId: item.questionId, partIndex: part.index, firstTry: part.firstTry, marks: part.marks })
        else seen.marks += part.marks
      }
    }
    for (const p of perFile.values()) {
      const key = `${p.questionId}\u0000${p.partIndex}`
      let g = byKey.get(key)
      if (!g) {
        g = { questionId: p.questionId, partIndex: p.partIndex, fileIdx: [], firstTry: [], marks: [] }
        byKey.set(key, g)
      }
      g.fileIdx.push(fi)
      g.firstTry.push(p.firstTry)
      g.marks.push(p.marks)
    }
  })
  const out: ItemStat[] = []
  for (const g of byKey.values()) {
    const attempted = g.fileIdx.length
    const facility = g.firstTry.filter(Boolean).length / attempted
    // "Item removed": each student's own marks on this part come back out of their total before
    // correlating, so a part worth a lot of marks cannot inflate its own correlation with itself.
    const corrected = g.fileIdx.map((fi, k) => totals[fi] - g.marks[k])
    const rpb = pointBiserial(g.firstTry, corrected)
    const disc = d27(g.firstTry, corrected)
    out.push({ questionId: g.questionId, partIndex: g.partIndex, attempted, facility, rpb, d27: disc, flag: flagFor(facility, disc, rpb) })
  }
  return out
}
