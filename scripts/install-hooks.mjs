#!/usr/bin/env node
// `npm run hooks:install` — points this repository at .githooks/ instead of the default
// .git/hooks/, so the commit-msg hook (Fix 6, Idea 12 slice 1) actually runs.
//
// NOT run automatically by anything in this track: PROGRAM-0.9.md and this track's brief both
// say the orchestrator enables the hooks once, after Wave 1, so several agents committing to
// separate worktrees during Wave 1 are never surprised by a hook none of them installed.

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: repoRoot, encoding: 'utf8' })

if (result.status !== 0) {
  console.error('hooks:install failed:', result.stderr || result.error)
  process.exitCode = 1
} else {
  console.log('git config core.hooksPath set to .githooks — the commit-msg gate is now active.')
}
