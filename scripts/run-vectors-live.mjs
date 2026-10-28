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
    timeout: 600_000, // 10 min timeout
    env: { ...process.env, PHYSLAB_REHEARSE: '1' }
  })

const userData = mkdtempSync(join(tmpdir(), 'physlab-vectors-live-'))
process.env.PHYSLAB_SMOKE_USERDATA = userData
process.env.PHYSLAB_REHEARSE = '1'

console.log(`Running Vectors Live Checks (4 prompts, userData=${userData})...`)
let r
try {
  r = run('npx', ['electron', 'scripts/run-vectors-live-main.mjs'])
} finally {
  try {
    rmSync(userData, { recursive: true, force: true })
  } catch {}
}

if (r.stdout) console.log(r.stdout)
if (r.stderr) console.error(r.stderr)
if (r.status !== 0) {
  console.error(`Vector live checks exited with code ${r.status}`)
  process.exit(r.status ?? 1)
}
console.log('Vector Live Checks complete!')
