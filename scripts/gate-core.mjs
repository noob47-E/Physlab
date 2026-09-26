// Pure logic for the gate (Idea 12 slice 1): level resolution, the step list, and report
// formatting. Nothing here touches the filesystem, a child process or the clock, so
// tests/gate.test.ts can cover it directly. scripts/gate.mjs is the thin runner that actually
// spawns each step and writes the report.

/** Idea 12 FIG. 1's own names for the four levels, cumulative left to right. */
export const LEVEL_ORDER = ['quick', 'thorough', 'full', 'deep']

/**
 * Idea 12 §5.1's prose suggests calling the levels "quick, merge, release or monthly" on the
 * command line, but FIG. 1 (and this track's own brief) name them quick/thorough/full/deep. The
 * source disagrees with itself, so both spellings are accepted; every report is written under the
 * FIG. 1 name regardless of which spelling was typed.
 */
export const LEVEL_ALIASES = { merge: 'thorough', release: 'full', monthly: 'deep' }

/** Resolves a CLI argument to a canonical level name, or null if it names no level at all. */
export function resolveLevel(input) {
  const name = String(input ?? '').trim().toLowerCase()
  if (!name) return 'quick' // no argument at all — `npm run gate` alone means quick
  if (LEVEL_ORDER.includes(name)) return name
  if (name in LEVEL_ALIASES) return LEVEL_ALIASES[name]
  return null
}

/**
 * The gate's checklist. `level` is the level a step is INTRODUCED at (thorough's own steps do
 * not repeat under full or deep — stepsForLevel folds them in). `kind: 'pending'` is a hook for
 * a check Idea 12 designs but this slice does not build yet (§5.2–§5.9, mostly Wave 8 per
 * PROGRAM-0.9.md §4); it always reports amber, never red, so it can never block a release by
 * itself, and a later track only has to add a runner for its id in scripts/gate.mjs.
 */
export const STEP_DEFS = [
  { id: 'typecheck', level: 'quick', label: 'typecheck', area: 'quick' },
  { id: 'lint', level: 'quick', label: 'lint', area: 'quick' },
  { id: 'tests', level: 'quick', label: 'tests', area: 'quick' },
  {
    id: 'build:web',
    level: 'thorough',
    label: 'build (web target)',
    area: 'thorough',
    note: 'Fix 5 — a stale styles.css report; the gate now builds this target itself so a break is never silent.'
  },
  {
    id: 'build:electron',
    level: 'thorough',
    label: 'build (electron target)',
    area: 'thorough',
    note: 'Fix 5 — the electron target is said to share the web target’s failure; the gate builds both.'
  },
  {
    id: 'property-tests',
    level: 'thorough',
    label: 'property tests',
    area: 'thorough',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.2, Wave 2) — fast-check is not a dependency yet'
  },
  {
    id: 'golden-step-texts',
    level: 'thorough',
    label: 'golden step texts',
    area: 'thorough',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.4, Wave 2)'
  },
  {
    id: 'physics-table',
    level: 'thorough',
    label: 'physics against formulas, two step sizes',
    area: 'thorough',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.6, Wave 2) — tests/sim.test.ts has not moved into one table yet'
  },
  {
    id: 'fuzzing-short',
    level: 'thorough',
    label: 'fuzzing (short)',
    area: 'thorough',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.7, Wave 8)'
  },
  {
    id: 'oracle-tests',
    level: 'full',
    label: 'SymPy / mpmath reference answers',
    area: 'full',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.3, Wave 8)'
  },
  {
    id: 'screenshots-4-themes',
    level: 'full',
    label: 'screenshots, 4 themes',
    area: 'full',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.5, Wave 8)'
  },
  {
    id: 'speed-budgets',
    level: 'full',
    label: 'speed budgets',
    area: 'full',
    kind: 'pending',
    note: "not set up yet (Idea 12 §5.9) — waits for Idea 3's speed pass"
  },
  {
    id: 'packaged-build-check',
    level: 'full',
    label: 'packaged build, PHYSLAB_LOG=1',
    area: 'full',
    kind: 'pending',
    note: 'not set up yet (release checklist item 4, Idea 12 §5.12)'
  },
  {
    id: 'mutation-testing',
    level: 'deep',
    label: 'mutation testing (StrykerJS)',
    area: 'deep',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.8, Wave 8)'
  },
  {
    id: 'fuzzing-long',
    level: 'deep',
    label: 'fuzzing (long, unattended)',
    area: 'deep',
    kind: 'pending',
    note: 'not set up yet (Idea 12 §5.7, Wave 8)'
  }
]

/** Every step introduced at `level` or an earlier level, in STEP_DEFS's own order. */
export function stepsForLevel(level) {
  const idx = LEVEL_ORDER.indexOf(level)
  if (idx === -1) return []
  const included = new Set(LEVEL_ORDER.slice(0, idx + 1))
  return STEP_DEFS.filter((step) => included.has(step.level))
}

/**
 * Rolls a list of step results into pass/fail/pending/flaky counts. `ok` follows AGENTS.md's rule
 * that a red run is never waved through: a `pending` hook can never fail the gate, and neither can
 * a `flaky` step (a known flaky test file that failed under load and then passed alone — see
 * docs/ACCURACY.md); only an actual `fail` can. A flaky step is counted on its own so the report
 * shows it amber, never quietly green.
 */
export function summarize(results) {
  const counts = { pass: 0, fail: 0, pending: 0, flaky: 0 }
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1
  return { ok: counts.fail === 0, counts }
}

const STATUS_MARK = { pass: '✓', fail: '✗', pending: '–', flaky: '!' }

/**
 * docs/ACCURACY.md's flaky-test list: files known to fail only under load and pass alone. Only
 * these are ever retried — a failure in any other file stays red, so a new failure can never be
 * waved through as "flaky" by accident. A file comes off this list once its cause is fixed.
 */
export const KNOWN_FLAKY_FILES = ['tests/contracts.test.ts', 'tests/grid.test.ts']

/**
 * The test files vitest reported as failing, from its " FAIL  tests/x.test.ts > …" lines, each
 * once, with forward slashes.
 */
export function parseFailingFiles(output) {
  const plain = stripAnsi(output).replace(/\r\n/g, '\n')
  const files = new Set()
  const re = /^[ \t]*FAIL[ \t]+(?:\|[^|\n]+\|[ \t]+)?(\S+?\.(?:test|spec)\.[cm]?[jt]sx?)(?=\s|$)/gm
  for (const m of plain.matchAll(re)) files.add(m[1].replace(/\\/g, '/'))
  return [...files]
}

/**
 * Which files to re-run alone after a red test run, or null when the run must simply stay red:
 * every failing file has to be on the known-flaky list, and there has to be at least one (a run
 * that failed without naming a file — a crash, an unhandled error — is never retried).
 */
export function flakyRetryFiles(failingFiles, known = KNOWN_FLAKY_FILES) {
  if (!failingFiles || failingFiles.length === 0) return null
  return failingFiles.every((f) => known.includes(f)) ? [...failingFiles] : null
}

/**
 * Whether a vitest run reported an error that belongs to no test file — its "Unhandled Errors"
 * section, "Vitest caught N unhandled errors", an unhandled rejection, or the "Errors  N error"
 * summary line. Such a run is never retried, even when its failing files are all known-flaky:
 * re-running those files alone could pass and hide the crash behind an amber line.
 */
export function hasUnhandledErrors(output) {
  const plain = stripAnsi(output ?? '').replace(/\r\n/g, '\n')
  return /unhandled (?:errors?|rejections?)/i.test(plain) || /^[ \t]*Errors[ \t]+\d+[ \t]+errors?\b/m.test(plain)
}

/**
 * The whole retry decision from a red run's raw output: the files to re-run alone, or null when
 * the run must stay red (a failure outside the known-flaky list, no named file, or any unhandled
 * error alongside the failures).
 */
export function flakyRetryPlan(output, known = KNOWN_FLAKY_FILES) {
  if (hasUnhandledErrors(output)) return null
  return flakyRetryFiles(parseFailingFiles(output ?? ''), known)
}

function formatDuration(ms) {
  if (ms == null) return ''
  return ms >= 1000 ? ` (${(ms / 1000).toFixed(1)}s)` : ` (${ms}ms)`
}

/**
 * Builds the report's JSON body and its short text summary (Idea 12 FIG. 1b) from a finished
 * run. Pure: given the same inputs it always returns the same report, so this is what
 * tests/gate.test.ts checks rather than re-running real commands.
 */
export function formatReport({ level, branch, head, generatedAt, results }) {
  const { ok, counts } = summarize(results)
  const lines = []
  lines.push(`Gate report · ${generatedAt}`)
  lines.push(`${branch} ${head} · level: ${level}`)
  lines.push('')
  for (const r of results) {
    const mark = STATUS_MARK[r.status] ?? '?'
    lines.push(`${mark} ${r.label}: ${r.status === 'pending' ? r.detail : (r.summary ?? r.status)}${formatDuration(r.durationMs)}`)
    if (r.status === 'fail' && r.detail) {
      for (const line of String(r.detail).trim().split('\n')) lines.push(`  ${line}`)
    }
    if (r.status === 'flaky' && r.flakyFiles?.length) {
      lines.push(`  failed under load, passed alone (flaky — docs/ACCURACY.md): ${r.flakyFiles.join(', ')}`)
    }
  }
  lines.push('')
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  lines.push(
    !ok
      ? `Not ready to package: ${plural(counts.fail, 'red line')}.`
      : counts.flaky
        ? `Ready to package, with ${plural(counts.flaky, 'amber line')} (a flaky test to fix within the next version).`
        : 'Ready to package.'
  )
  const text = lines.join('\n') + '\n'

  const json = {
    version: 1,
    generatedAt,
    branch,
    head,
    level,
    ok,
    counts,
    steps: results
  }
  return { text, json }
}

/**
 * The commit-msg hook skips a WIP step (many are committed mid sub-item, per PROGRESS.md).
 * Only the subject line counts, matching how git itself treats the first line as the subject —
 * a message with a blank first line is not "a WIP commit" just because WIP( appears later.
 */
export function isSkippableCommitMessage(message) {
  const subject = String(message).split('\n')[0].trim()
  return /^WIP\(/.test(subject)
}

/** Removes terminal colour codes (FORCE_COLOR, or a TTY) so the parsers below see plain text. */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Reads vitest's own "Tests" summary line. Vitest lists the parts it has in a fixed order —
 * failed | passed | expected fail | skipped | todo, then the total in brackets (getStateString in
 * vitest's reporter) — and leaves out any that are zero, so each part is read on its own rather
 * than by position. Returns null when there is no such line (vitest crashed before its summary).
 */
export function parseVitestSummary(output) {
  const plain = stripAnsi(output).replace(/\r\n/g, '\n')
  const line = plain.match(/^[ \t]*Tests[ \t]+(.+?)[ \t]*\((\d+)\)[ \t]*$/m)
  if (!line) return null
  const counts = { failed: 0, passed: 0, expectedFail: 0, skipped: 0, todo: 0, total: Number(line[2]) }
  const keys = { failed: 'failed', passed: 'passed', 'expected fail': 'expectedFail', skipped: 'skipped', todo: 'todo' }
  for (const part of line[1].split('|')) {
    const m = part.trim().match(/^(\d+)\s+(failed|passed|expected fail|skipped|todo)$/)
    if (m) counts[keys[m[2]]] = Number(m[1])
  }
  return counts
}

/** The report's one-line test summary, e.g. "1631 passed, 1 failed of 1632". */
export function formatTestsSummary(parsed, ok) {
  if (!parsed) return ok ? 'passed' : 'failed (no vitest summary line)'
  const parts = [`${parsed.passed} passed`]
  if (parsed.failed) parts.push(`${parsed.failed} failed`)
  if (parsed.skipped) parts.push(`${parsed.skipped} skipped`)
  if (parsed.todo) parts.push(`${parsed.todo} todo`)
  return `${parts.join(', ')} of ${parsed.total}`
}

/**
 * The level the commit-msg hook runs on a branch. A commit on main (a release merge — rare) runs
 * `thorough`, so a change that breaks either build is stopped before it reaches main (Fix 6's
 * Expected line; Idea 12 FIG. 1 puts building "before merging into main"); every other branch
 * runs `quick`.
 */
export function hookLevel(branch) {
  return String(branch ?? '').trim() === 'main' ? 'thorough' : 'quick'
}

/**
 * The environment the commit-msg hook gives the gate: the caller's own, with vitest capped at 3
 * workers unless GATE_MAX_WORKERS already says otherwise (PROGRAM-0.9.md §3 — this PC is shared
 * by several agents, and several commit hooks can start a full run at once).
 */
export function hookEnv(env) {
  return { ...env, GATE_MAX_WORKERS: env?.GATE_MAX_WORKERS ?? '3' }
}

/** The commit-msg hook also skips a commit explicitly marked PHYSLAB_SKIP_GATE=1. */
export function shouldSkipGate(env) {
  return env?.PHYSLAB_SKIP_GATE === '1'
}
