// The runtime smoke test (CLEANUP-PLAN.md CW14): every dead-code batch is proved by the suite,
// every golden sweep and this — the app built, started in a hidden window, every ready mode opened
// as a student opens it, one action in each, and not one console error or crash.
//
//   node scripts/smoke.mjs              build, then run
//   node scripts/smoke.mjs --no-build   run the last build (out/)
//
// The app's user data is a fresh temporary folder (scripts/smoke-main.mjs), so nothing of a
// student's is read or changed. Exit code 0 only when every mode opened, did its action and logged
// no error.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Fixed literals only, joined for the shell as scripts/gate.mjs does.
const run = (cmd, args) => spawnSync([cmd, ...args].join(' '), { cwd: root, encoding: 'utf8', shell: true, timeout: 300_000 })

if (!process.argv.includes('--no-build')) {
  const b = run('npx', ['electron-vite', 'build'])
  if (b.status !== 0) {
    console.log(`smoke: the build failed\n${(b.stdout + b.stderr).slice(-2000)}`)
    process.exit(1)
  }
}

// --self-test: the page logs one error on purpose, and this run must then fail on it.
const selfTest = process.argv.includes('--self-test')
if (selfTest) process.env.PHYSLAB_SMOKE_SELF_TEST = '1'
// The app's user data for this run only: made here and removed here (the app leaves through
// app.exit, which skips its own quit handlers).
const userData = mkdtempSync(join(tmpdir(), 'physlab-smoke-'))
process.env.PHYSLAB_SMOKE_USERDATA = userData
let r
try {
  r = run('npx', ['electron', 'scripts/smoke-main.mjs'])
} finally {
  rmSync(userData, { recursive: true, force: true })
}
const lines = (r.stdout ?? '')
  .split(/\r?\n/)
  .filter((l) => l.startsWith('SMOKE '))
  .map((l) => JSON.parse(l.slice(6)))

/** What each mode's action must report (GPU Lab has none: a hidden window only shows it starts cleanly). */
const EXPECT = { Calculator: 'worked it out', Vectors: 'ran the line', Geometry: 'ran the line', Graphing: 'ran the line', Sandbox: 'clicked', 'GPU Lab': 'none', 'Lab Data': 'clicked', 'Problem Sets': 'clicked' }
const faults = []
// Every mode the bar offers must be one this run opens: a new ready mode is not skipped without a word.
const offered = lines.find((l) => l.step === 'start')?.offered
if (offered) for (const label of [...offered.tabs, ...offered.rows]) if (!(label in EXPECT) && !/^More modes/.test(label)) faults.push(`${label}: the bar offers this mode, but the smoke test does not open it (add it to scripts/smoke-main.mjs)`)
for (const l of lines) {
  for (const e of l.errors ?? []) faults.push(`${l.mode ?? l.step}: console error: ${e}`)
  if (l.mode) {
    if (l.active !== l.mode) faults.push(`${l.mode}: did not open (the bar shows ${l.active}; ${l.opened})`)
    if (l.acted !== EXPECT[l.mode]) faults.push(`${l.mode}: its action gave "${l.acted}", not "${EXPECT[l.mode]}"`)
  }
}
const seen = new Set(lines.map((l) => l.mode).filter(Boolean))
for (const m of Object.keys(EXPECT)) if (!seen.has(m)) faults.push(`${m}: never reached (the run stopped early or crashed)`)
const engineLine = lines.find((l) => l.step === 'engine')
if (!engineLine) faults.push('the algebra engine was never asked (the run stopped early)')
else if (engineLine.engine !== 'ready') faults.push(`the algebra engine: ${engineLine.engine} (asked to factor x^2 - 4)`)
if (!lines.some((l) => l.step === 'start')) faults.push(`the app never finished loading${r.error ? `: ${r.error.message}` : ''}`)

for (const l of lines) if (l.mode) console.log(`smoke: ${l.mode.padEnd(13)} ${l.active === l.mode ? 'opened' : 'NOT OPENED'}, ${l.acted}, ${l.errors.length} errors`)
if (selfTest) {
  const caught = faults.length === 1 && faults[0].includes('smoke self-test')
  console.log(caught ? 'smoke: self-test passed (the one error on purpose failed the run, nothing else did)' : `smoke: self-test FAILED\n  ${faults.join('\n  ') || 'the error on purpose was not caught'}`)
  process.exit(caught ? 0 : 1)
}
if (faults.length) {
  console.log(`smoke: FAILED\n  ${faults.join('\n  ')}`)
  process.exit(1)
}
console.log(`smoke: every mode opened, acted and logged no error (${seen.size} modes); the algebra engine loaded and took a question`)
