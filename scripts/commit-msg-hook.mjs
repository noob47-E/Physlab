#!/usr/bin/env node
// Runs from .githooks/commit-msg, once core.hooksPath points at .githooks (npm run
// hooks:install). Runs the gate on every commit — the quick level on a working branch, the
// thorough level (which also builds both targets) on main — with vitest capped at 3 workers
// unless GATE_MAX_WORKERS says otherwise, since several agents share this PC. Skips a WIP step
// (many are committed mid sub-item, per every track's PROGRESS.md) and a commit explicitly
// marked PHYSLAB_SKIP_GATE=1. See docs/ACCURACY.md for the flaky-test rule this run follows.

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hookEnv, hookLevel, isSkippableCommitMessage, shouldSkipGate } from './gate-core.mjs'

const messageFile = process.argv[2]
if (!messageFile) {
  console.error('commit-msg-hook: git did not pass a commit-message file')
  process.exit(1)
}

if (shouldSkipGate(process.env)) {
  console.log('gate: skipped (PHYSLAB_SKIP_GATE=1)')
  process.exit(0)
}

const message = readFileSync(messageFile, 'utf8')
if (isSkippableCommitMessage(message)) {
  console.log('gate: skipped (WIP commit)')
  process.exit(0)
}

const here = dirname(fileURLToPath(import.meta.url))
// git.exe is a real executable, so no shell is needed; a detached HEAD reads "HEAD" → quick.
const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' })
const level = hookLevel(branch.status === 0 ? branch.stdout : '')
const result = spawnSync(process.execPath, [join(here, 'gate.mjs'), level], {
  stdio: 'inherit',
  env: hookEnv(process.env)
})
process.exit(result.status ?? 1)
