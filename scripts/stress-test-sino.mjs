import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args) => spawnSync([cmd, ...args].join(' '), { cwd: root, encoding: 'utf8', shell: true, timeout: 300_000, env: process.env })

const userData = mkdtempSync(join(tmpdir(), 'physlab-stress-'))
process.env.PHYSLAB_SMOKE_USERDATA = userData

console.log('Running Nervous Presenter Stress Test...')
let r
try {
  r = run('npx', ['electron', 'scripts/stress-test-sino-main.mjs'])
} finally {
  rmSync(userData, { recursive: true, force: true })
}

if (r.stdout) console.log(r.stdout)
if (r.stderr) console.error(r.stderr)
if (r.status !== 0) {
  console.error(`Stress test exited with code ${r.status}`)
  process.exit(r.status ?? 1)
}
console.log('Nervous Presenter Stress Test PASSED with zero crashes!')
