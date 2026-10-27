import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd, args) =>
  spawnSync([cmd, ...args].join(' '), {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    timeout: 1_200_000, // 20 min timeout for all runs
    env: { ...process.env, PHYSLAB_REHEARSE: '1' }
  })

const userData = mkdtempSync(join(tmpdir(), 'physlab-azure-checks-'))
process.env.PHYSLAB_SMOKE_USERDATA = userData
process.env.PHYSLAB_REHEARSE = '1'

console.log(`Running Azure Live Checks Runner (userData=${userData})...`)
let r
try {
  r = run('npx', ['electron', 'scripts/live-azure-checks-main.mjs'])
} finally {
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {}
}

if (r.stdout) console.log(r.stdout)
if (r.stderr) console.error(r.stderr)
if (r.status !== 0) {
  console.error(`Azure live checks exited with code ${r.status}`)
  process.exit(r.status ?? 1)
}
console.log('Azure Live Checks complete!')
