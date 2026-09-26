#!/usr/bin/env node
// The one-command local test gate (Idea 12 slice 1). The owner's PC is the CI (PROGRAM-0.9.md
// §5, Idea 12 decision 5.1) — nothing here goes online.
//
//   npm run gate -- quick       every commit off main, ~1.5 min (typecheck + lint + tests)
//   npm run gate -- thorough    before merging: + both build targets, + hooks for property
//                                tests / golden step texts / the physics table / short fuzzing
//   npm run gate -- full        before a release: + hooks for the SymPy/mpmath oracles, the
//                                four-theme screenshots, speed budgets, the packaged-build check
//   npm run gate -- deep        once a month: + hooks for mutation testing and long fuzzing
//
// A `pending` hook (an Idea 12 check this slice does not build yet — see gate-core.mjs) always
// reports amber, never red: only an actual failure blocks a release (see the predist script,
// which runs `full` and is what makes `npm run dist` refuse a red gate).
//
// Report: written outside the repo (`C:\my_projects\PhysLab-backups\gate\`, next to the other
// backups) as dated JSON plus a short text summary, and the text is also printed to stdout.

import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LEVEL_ORDER,
  resolveLevel,
  stepsForLevel,
  formatReport,
  summarize,
  parseVitestSummary,
  formatTestsSummary,
  flakyRetryPlan
} from './gate-core.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const REPORT_DIR = process.env.PHYSLAB_GATE_REPORT_DIR || 'C:\\my_projects\\PhysLab-backups\\gate'

function sh(cmd, args) {
  const startedAt = Date.now()
  // Every argument here is a fixed literal this file writes itself (a flag, a config path, a
  // temp dir this same run just built with Date.now()) — never anything a user typed — so
  // joining into one string for `shell: true` (which Node otherwise warns about passing an
  // array to, since it does not escape the pieces) is safe; a piece with a space (a temp path)
  // is quoted so the shell still treats it as one argument.
  const quoted = [cmd, ...args].map((piece) => (/\s/.test(piece) ? `"${piece}"` : piece)).join(' ')
  const result = spawnSync(quoted, { cwd: repoRoot, shell: true, encoding: 'utf8' })
  return {
    ok: result.status === 0,
    durationMs: Date.now() - startedAt,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  }
}

function tail(text, n) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').trim().split('\n')
  return lines.slice(-n).join('\n')
}

function vitestArgs() {
  const args = ['vitest', 'run']
  if (process.env.GATE_MAX_WORKERS) args.push(`--maxWorkers=${process.env.GATE_MAX_WORKERS}`)
  return args
}

// One runner per non-pending STEP_DEFS id. Each returns { ok, durationMs, summary, detail }, and
// may set `status` itself (the tests runner's 'flaky') instead of letting `ok` decide pass/fail.
const RUNNERS = {
  typecheck: () => {
    const r = sh('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'])
    return { ...r, summary: r.ok ? '0 errors' : 'errors found', detail: r.ok ? undefined : tail(r.output, 40) }
  },
  lint: () => {
    const r = sh('npx', ['eslint', '.'])
    return { ...r, summary: r.ok ? '0 errors' : 'errors found', detail: r.ok ? undefined : tail(r.output, 40) }
  },
  tests: () => {
    const r = sh('npx', vitestArgs())
    const summary = formatTestsSummary(parseVitestSummary(r.output), r.ok)
    if (r.ok) return { ...r, summary }
    // docs/ACCURACY.md's flaky-test rule: when every failing file is on the known-flaky list,
    // re-run just those files alone (no other load from this run). Passing alone makes the step
    // amber ('flaky'), not green and not red; anything else stays red — including any run with an
    // unhandled error, even when its failing files are all known-flaky.
    const retry = flakyRetryPlan(r.output)
    if (retry) {
      const again = sh('npx', ['vitest', 'run', ...retry])
      if (again.ok) {
        return {
          ok: true,
          status: 'flaky',
          durationMs: r.durationMs + again.durationMs,
          summary,
          flakyFiles: retry,
          detail: tail(r.output, 30)
        }
      }
    }
    return { ...r, summary, detail: tail(r.output, 60) }
  },
  'build:web': () => {
    const outDir = join(tmpdir(), `physlab-gate-web-${process.pid}-${Date.now()}`)
    const r = sh('npx', ['vite', 'build', '--config', 'vite.web.config.ts', '--outDir', outDir, '--emptyOutDir'])
    rmSync(outDir, { recursive: true, force: true })
    return { ...r, summary: r.ok ? 'built' : 'build failed', detail: r.ok ? undefined : tail(r.output, 40) }
  },
  'build:electron': () => {
    const r = sh('npx', ['electron-vite', 'build'])
    return { ...r, summary: r.ok ? 'built' : 'build failed', detail: r.ok ? undefined : tail(r.output, 40) }
  }
}

function gitOutput(args, fallback) {
  // git.exe is a real executable (unlike npm/npx's .cmd shims), so no shell is needed here —
  // and skipping it means these plain argv entries need no quoting at all.
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : fallback
}

export function runGate(levelArg) {
  const level = resolveLevel(levelArg)
  if (!level) {
    console.error(`Unknown gate level "${levelArg}". Use one of: ${LEVEL_ORDER.join(', ')} (or merge/release/monthly).`)
    process.exitCode = 2
    return null
  }

  const results = []
  for (const step of stepsForLevel(level)) {
    if (step.kind === 'pending') {
      results.push({ id: step.id, label: step.label, status: 'pending', durationMs: 0, detail: step.note })
      continue
    }
    const run = RUNNERS[step.id]
    if (!run) {
      results.push({ id: step.id, label: step.label, status: 'fail', durationMs: 0, detail: `no runner registered for "${step.id}"` })
      continue
    }
    const { ok, status, durationMs, summary, detail, flakyFiles } = run()
    results.push({
      id: step.id,
      label: step.label,
      status: status ?? (ok ? 'pass' : 'fail'),
      durationMs,
      summary,
      detail,
      ...(flakyFiles ? { flakyFiles } : {})
    })
  }

  const branch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], 'HEAD')
  const head = gitOutput(['rev-parse', '--short', 'HEAD'], '0000000')
  const generatedAt = new Date().toISOString()
  const { text, json } = formatReport({ level, branch, head, generatedAt, results })

  mkdirSync(REPORT_DIR, { recursive: true })
  const stamp = generatedAt.replace(/[:.]/g, '-')
  const base = join(REPORT_DIR, `gate-${level}-${stamp}`)
  writeFileSync(`${base}.json`, JSON.stringify(json, null, 2))
  writeFileSync(`${base}.txt`, text)

  process.stdout.write(text)
  const { ok } = summarize(results)
  process.exitCode = ok ? 0 : 1
  return { ok, json, reportPath: `${base}.json` }
}

// Only run when invoked directly (`node scripts/gate.mjs quick`), not when imported for testing.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runGate(process.argv[2])
}
