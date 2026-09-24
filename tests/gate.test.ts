// Covers the gate's pure logic (scripts/gate-core.mjs): level resolution, the cumulative step
// list, and report formatting. scripts/gate.mjs itself is a thin runner (spawns real processes,
// writes files outside the repo) and is exercised by hand — see PROGRESS.md / the 0.9-GATE
// commit for its own real run.
import { describe, expect, it } from 'vitest'
import {
  LEVEL_ORDER,
  resolveLevel,
  stepsForLevel,
  summarize,
  formatReport,
  isSkippableCommitMessage,
  shouldSkipGate,
  stripAnsi,
  parseVitestSummary,
  formatTestsSummary,
  parseFailingFiles,
  flakyRetryFiles,
  flakyRetryPlan,
  hasUnhandledErrors,
  KNOWN_FLAKY_FILES,
  hookLevel,
  hookEnv,
  STEP_DEFS
} from '../scripts/gate-core.mjs'

describe('resolveLevel', () => {
  it('accepts the FIG. 1 names case-insensitively', () => {
    expect(resolveLevel('quick')).toBe('quick')
    expect(resolveLevel('THOROUGH')).toBe('thorough')
    expect(resolveLevel(' full ')).toBe('full')
    expect(resolveLevel('deep')).toBe('deep')
  })

  it('also accepts §5.1’s command-line names, since the source disagrees with itself', () => {
    expect(resolveLevel('merge')).toBe('thorough')
    expect(resolveLevel('release')).toBe('full')
    expect(resolveLevel('monthly')).toBe('deep')
  })

  it('defaults to quick with no argument, and refuses anything else', () => {
    expect(resolveLevel(undefined)).toBe('quick')
    expect(resolveLevel('')).toBe('quick')
    expect(resolveLevel('nightly')).toBeNull()
  })
})

describe('stepsForLevel', () => {
  it('quick has only its own three checks', () => {
    expect(stepsForLevel('quick').map((s) => s.id)).toEqual(['typecheck', 'lint', 'tests'])
  })

  it('each level folds in everything the levels below it introduced (FIG. 1: "includes the ones above it")', () => {
    const quick = stepsForLevel('quick').map((s) => s.id)
    const thorough = stepsForLevel('thorough').map((s) => s.id)
    const full = stepsForLevel('full').map((s) => s.id)
    const deep = stepsForLevel('deep').map((s) => s.id)
    for (const id of quick) expect(thorough).toContain(id)
    for (const id of thorough) expect(full).toContain(id)
    for (const id of full) expect(deep).toContain(id)
    // and deep is strictly the biggest, not a re-shuffling of the same set
    expect(deep.length).toBeGreaterThan(full.length)
    expect(full.length).toBeGreaterThan(thorough.length)
    expect(thorough.length).toBeGreaterThan(quick.length)
  })

  it('every step belongs to a real level and STEP_DEFS has no duplicate ids', () => {
    const ids = new Set()
    for (const step of STEP_DEFS) {
      expect(LEVEL_ORDER).toContain(step.level)
      expect(ids.has(step.id), `duplicate step id "${step.id}"`).toBe(false)
      ids.add(step.id)
    }
  })

  it('deep carries both of FIG. 1’s monthly hooks: mutation testing and long fuzzing', () => {
    const deepOnly = STEP_DEFS.filter((s) => s.level === 'deep').map((s) => s.id)
    expect(deepOnly).toEqual(['mutation-testing', 'fuzzing-long'])
    expect(stepsForLevel('full').map((s) => s.id)).not.toContain('fuzzing-long')
  })

  it('an unknown level gets an empty list, not a crash', () => {
    expect(stepsForLevel('nightly')).toEqual([])
  })
})

describe('summarize', () => {
  it('is green only when nothing failed — a pending hook never fails the gate', () => {
    const allPendingOrPass = [
      { status: 'pass' },
      { status: 'pending' },
      { status: 'pending' }
    ] as const
    expect(summarize(allPendingOrPass)).toEqual({ ok: true, counts: { pass: 1, fail: 0, pending: 2, flaky: 0 } })
  })

  it('one failure is enough to turn the gate red (AGENTS.md: a red run is never waved through)', () => {
    const oneFailure = [{ status: 'pass' }, { status: 'fail' }, { status: 'pending' }] as const
    expect(summarize(oneFailure)).toEqual({ ok: false, counts: { pass: 1, fail: 1, pending: 1, flaky: 0 } })
  })

  it('an empty run counts as green (vacuously — resolveLevel already refused an unknown level)', () => {
    expect(summarize([])).toEqual({ ok: true, counts: { pass: 0, fail: 0, pending: 0, flaky: 0 } })
  })
})

describe('formatReport', () => {
  const base = { level: 'quick', branch: 'phase-09-GATE', head: 'abc1234', generatedAt: '2026-09-24T00:00:00.000Z' }

  it('marks a passing step with a tick and a failing one with a cross, matching FIG. 1b', () => {
    const { text, json } = formatReport({
      ...base,
      results: [
        { id: 'typecheck', label: 'typecheck', status: 'pass', durationMs: 11000, summary: '0 errors' },
        { id: 'lint', label: 'lint', status: 'pass', durationMs: 33600, summary: '0 errors, 29 warnings' },
        {
          id: 'tests',
          label: 'tests',
          status: 'fail',
          durationMs: 36000,
          summary: '1199 passed, 1 failed of 1200',
          detail: 'grid.test.ts: one test hit the 5s limit'
        }
      ]
    })
    expect(text).toContain('✓ typecheck: 0 errors (11.0s)')
    expect(text).toContain('✓ lint: 0 errors, 29 warnings (33.6s)')
    expect(text).toContain('✗ tests: 1199 passed, 1 failed of 1200 (36.0s)')
    expect(text).toContain('grid.test.ts: one test hit the 5s limit')
    expect(text).toContain('Not ready to package: 1 red line.')
    expect(json.ok).toBe(false)
    expect(json.counts).toEqual({ pass: 2, fail: 1, pending: 0, flaky: 0 })
    expect(json.level).toBe('quick')
    expect(json.head).toBe('abc1234')
  })

  it('a pending hook prints its note with a dash, never a tick or a cross', () => {
    const { text, json } = formatReport({
      ...base,
      level: 'thorough',
      results: [{ id: 'property-tests', label: 'property tests', status: 'pending', durationMs: 0, detail: 'not set up yet (Wave 2)' }]
    })
    expect(text).toContain('– property tests: not set up yet (Wave 2)')
    expect(json.ok).toBe(true)
  })

  it('an all-green run says the gate is ready to package', () => {
    const { text } = formatReport({
      ...base,
      results: [{ id: 'typecheck', label: 'typecheck', status: 'pass', durationMs: 500, summary: '0 errors' }]
    })
    expect(text).toContain('Ready to package.')
  })

  it('pluralises the red-line count correctly at exactly one', () => {
    const { text } = formatReport({
      ...base,
      results: [{ id: 'lint', label: 'lint', status: 'fail', durationMs: 100, summary: 'errors found' }]
    })
    expect(text).toContain('Not ready to package: 1 red line.')
    expect(text).not.toContain('1 red lines')
  })
})

describe('isSkippableCommitMessage', () => {
  it('skips a WIP( commit, whatever track it names', () => {
    expect(isSkippableCommitMessage('WIP(GATE): progress on the gate script\n')).toBe(true)
    expect(isSkippableCommitMessage('WIP(LEGO): break apart a triangle')).toBe(true)
  })

  it('does not skip a real commit, even one that mentions WIP mid-sentence', () => {
    expect(isSkippableCommitMessage('Phase 0.9-GATE: the release gate\n')).toBe(false)
    expect(isSkippableCommitMessage('fix: clean up a WIP(GATE) leftover file')).toBe(false)
  })

  it('is not fooled by leading blank lines or spacing', () => {
    expect(isSkippableCommitMessage('  WIP(GATE): indented\n')).toBe(true)
    expect(isSkippableCommitMessage('\nWIP(GATE): after a blank line')).toBe(false)
  })
})

describe('parseVitestSummary', () => {
  it('reads a green run', () => {
    const out = ' Test Files  201 passed (201)\n      Tests  1632 passed (1632)\n   Start at  08:00:00\n'
    expect(parseVitestSummary(out)).toEqual({ failed: 0, passed: 1632, expectedFail: 0, skipped: 0, todo: 0, total: 1632 })
    expect(formatTestsSummary(parseVitestSummary(out), true)).toBe('1632 passed of 1632')
  })

  it('reads a red run, where vitest prints "failed" before "passed"', () => {
    const out = ' Test Files  1 failed | 200 passed (201)\r\n      Tests  1 failed | 1631 passed (1632)\r\n'
    const parsed = parseVitestSummary(out)
    expect(parsed).toMatchObject({ failed: 1, passed: 1631, total: 1632 })
    expect(formatTestsSummary(parsed, false)).toBe('1631 passed, 1 failed of 1632')
  })

  it('reads skipped and todo parts, and ignores the "Test Files" line', () => {
    const out = ' Test Files  3 passed | 1 skipped (4)\n      Tests  40 passed | 2 skipped | 1 todo (43)\n'
    const parsed = parseVitestSummary(out)
    expect(parsed).toMatchObject({ failed: 0, passed: 40, skipped: 2, todo: 1, total: 43 })
    expect(formatTestsSummary(parsed, true)).toBe('40 passed, 2 skipped, 1 todo of 43')
  })

  it('sees through colour codes (FORCE_COLOR)', () => {
    const out =
      '\x1b[2m      Tests \x1b[22m \x1b[1m\x1b[31m1 failed\x1b[39m\x1b[22m\x1b[2m | \x1b[22m\x1b[1m\x1b[32m9 passed\x1b[39m\x1b[22m\x1b[90m (10)\x1b[39m\n'
    expect(stripAnsi(out)).not.toContain('\x1b')
    expect(parseVitestSummary(out)).toMatchObject({ failed: 1, passed: 9, total: 10 })
  })

  it('returns null when vitest never printed its summary, and the report says so', () => {
    expect(parseVitestSummary('Error: Cannot find module x\n')).toBeNull()
    expect(formatTestsSummary(null, false)).toBe('failed (no vitest summary line)')
    expect(formatTestsSummary(null, true)).toBe('passed')
  })
})

describe('the flaky-test rule (docs/ACCURACY.md)', () => {
  const redRun = [
    ' FAIL  tests/grid.test.ts > grid > the axes switch round-trips through setSettings and starts on',
    'Error: Test timed out in 5000ms.',
    ' FAIL  tests/grid.test.ts > grid > another slow one',
    ' FAIL  tests/contracts.test.ts > contracts > a huge discriminant',
    '      Tests  3 failed | 1629 passed (1632)'
  ].join('\r\n')

  it('reads each failing file once, through colour codes and Windows line endings', () => {
    expect(parseFailingFiles(redRun)).toEqual(['tests/grid.test.ts', 'tests/contracts.test.ts'])
    expect(parseFailingFiles('\x1b[31m FAIL \x1b[39m tests/sim.test.ts > drops\n')).toEqual(['tests/sim.test.ts'])
    expect(parseFailingFiles(' FAIL  tests\\win.test.ts > x\n')).toEqual(['tests/win.test.ts'])
    expect(parseFailingFiles('Tests  12 passed (12)\n')).toEqual([])
  })

  it('retries only when every failing file is on the known-flaky list', () => {
    expect(KNOWN_FLAKY_FILES).toEqual(expect.arrayContaining(['tests/contracts.test.ts', 'tests/grid.test.ts']))
    expect(flakyRetryFiles(['tests/grid.test.ts'])).toEqual(['tests/grid.test.ts'])
    // one real failure anywhere else keeps the whole run red — never waved through
    expect(flakyRetryFiles(['tests/grid.test.ts', 'tests/sim.test.ts'])).toBeNull()
    // a crash that names no file is never retried either
    expect(flakyRetryFiles([])).toBeNull()
    expect(flakyRetryFiles(['tests/x.test.ts'], ['tests/x.test.ts'])).toEqual(['tests/x.test.ts'])
  })

  it('never retries a run that also has an unhandled error, even when every failing file is known-flaky', () => {
    // the plain known-flaky red run is still retried
    expect(flakyRetryPlan(redRun)).toEqual(['tests/grid.test.ts', 'tests/contracts.test.ts'])
    const mixed = [
      ' FAIL  tests/grid.test.ts > grid > a slow one',
      '\x1b[31m⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯\x1b[39m',
      'Vitest caught 1 unhandled error during the test run.',
      'TypeError: Cannot read properties of undefined',
      '      Tests  1 failed | 1631 passed (1632)',
      '     Errors  1 error'
    ].join('\r\n')
    expect(hasUnhandledErrors(mixed)).toBe(true)
    expect(flakyRetryPlan(mixed)).toBeNull()
    // each marker on its own is enough
    expect(hasUnhandledErrors(' FAIL  tests/grid.test.ts > x\n⎯⎯ Unhandled Rejection ⎯⎯\n')).toBe(true)
    expect(hasUnhandledErrors(' FAIL  tests/grid.test.ts > x\n     Errors  2 errors\n')).toBe(true)
    expect(hasUnhandledErrors(redRun)).toBe(false)
    // a crash with no named file stays red too
    expect(flakyRetryPlan('Error: something blew up\n')).toBeNull()
  })

  it('a flaky step is amber: counted on its own, never a failure, never plain green', () => {
    expect(summarize([{ status: 'pass' }, { status: 'flaky' }])).toEqual({
      ok: true,
      counts: { pass: 1, fail: 0, pending: 0, flaky: 1 }
    })
    const { text, json } = formatReport({
      level: 'quick',
      branch: 'main',
      head: 'abc1234',
      generatedAt: '2026-09-24T00:00:00.000Z',
      results: [
        {
          id: 'tests',
          label: 'tests',
          status: 'flaky',
          durationMs: 40000,
          summary: '1631 passed, 1 failed of 1632',
          flakyFiles: ['tests/grid.test.ts']
        }
      ]
    })
    expect(text).toContain('! tests: 1631 passed, 1 failed of 1632 (40.0s)')
    expect(text).toContain('passed alone (flaky — docs/ACCURACY.md): tests/grid.test.ts')
    expect(text).toContain('Ready to package, with 1 amber line')
    expect(json.ok).toBe(true)
    expect(json.counts.flaky).toBe(1)
  })

  it('a flaky step never hides a real failure beside it', () => {
    const { text, json } = formatReport({
      level: 'quick',
      branch: 'main',
      head: 'abc1234',
      generatedAt: '2026-09-24T00:00:00.000Z',
      results: [
        { id: 'tests', label: 'tests', status: 'flaky', durationMs: 1, flakyFiles: ['tests/grid.test.ts'] },
        { id: 'lint', label: 'lint', status: 'fail', durationMs: 1, summary: 'errors found' }
      ]
    })
    expect(json.ok).toBe(false)
    expect(text).toContain('Not ready to package: 1 red line.')
  })
})

describe('the commit-msg hook’s level and environment', () => {
  it('builds before a change reaches main: thorough on main, quick everywhere else', () => {
    expect(hookLevel('main')).toBe('thorough')
    expect(hookLevel('main\n')).toBe('thorough')
    expect(hookLevel('phase-09-GATE')).toBe('quick')
    expect(hookLevel('phase-0.9')).toBe('quick')
    expect(hookLevel('HEAD')).toBe('quick') // detached
    expect(hookLevel('')).toBe('quick')
    expect(stepsForLevel(hookLevel('main')).map((s) => s.id)).toEqual(
      expect.arrayContaining(['build:web', 'build:electron'])
    )
  })

  it('caps vitest at 3 workers unless GATE_MAX_WORKERS is already set, keeping the rest', () => {
    expect(hookEnv({ PATH: 'x' })).toEqual({ PATH: 'x', GATE_MAX_WORKERS: '3' })
    expect(hookEnv({ GATE_MAX_WORKERS: '1' }).GATE_MAX_WORKERS).toBe('1')
    expect(hookEnv(undefined).GATE_MAX_WORKERS).toBe('3')
  })
})

describe('shouldSkipGate', () => {
  it('skips only on the exact value "1"', () => {
    expect(shouldSkipGate({ PHYSLAB_SKIP_GATE: '1' })).toBe(true)
    expect(shouldSkipGate({ PHYSLAB_SKIP_GATE: 'true' })).toBe(false)
    expect(shouldSkipGate({ PHYSLAB_SKIP_GATE: '0' })).toBe(false)
    expect(shouldSkipGate({})).toBe(false)
  })
})
