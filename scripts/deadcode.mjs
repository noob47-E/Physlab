#!/usr/bin/env node
// CW14 baseline script: unused files and unused exports over the import graph.
// Node built-ins only. Run from the repo root:  node scripts/deadcode.mjs
//
// `--check` (run by `npm run lint` and the gate's lint step, CLEANUP-PLAN.md CW1): no unused file,
// and no unused export that is not in scripts/deadcode-baseline.txt. A name that is used again, or
// removed, must leave the baseline too, so the list only shrinks (CW14 empties most of it).
// `--write-baseline` rewrites the list, in a commit that says why it changed.
//
// Counts as a use: static imports, `export ... from`, dynamic `import(...)` / `lazy(() => import(...))`,
// worker URLs (`new URL(..., import.meta.url)`, `?worker`), vi.mock paths, and test-string paths
// (`readSource('src/renderer/src/...')` and friends). Electron entry points and every test file are roots.
// tsconfig `paths` aliases are honoured if present (none today).

import { readdirSync, statSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve, relative, sep, normalize } from 'node:path'

const ROOT = process.cwd()
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']
const slash = (p) => p.split(sep).join('/')

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const isCode = (f) => EXTS.some((x) => f.endsWith(x))
const srcFiles = walk(join(ROOT, 'src')).filter((f) => !f.includes(`${sep}public${sep}`) && isCode(f))
const testFiles = walk(join(ROOT, 'tests')).filter((f) => isCode(f))
const allFiles = [...srcFiles, ...testFiles]
const relOf = (p) => slash(relative(ROOT, p))

// tsconfig paths aliases (none in this repo today; honoured if added).
let aliasPairs = []
try {
  const ts = JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8'))
  for (const [k, vs] of Object.entries(ts.compilerOptions?.paths ?? {})) {
    const star = k.endsWith('/*')
    for (const v of vs) aliasPairs.push({ k, prefix: star ? k.slice(0, -2) : k, v, star })
  }
} catch { /* no tsconfig */ }

const RESOLVE_CANDIDATES = (base) => [
  base,
  ...EXTS.map((x) => base + x),
  ...EXTS.map((x) => `${base}${sep}index${x}`)
]

function resolveImport(fromFile, spec) {
  if (spec.startsWith('?')) return null
  const s = spec.split('?')[0]
  if (s.startsWith('.')) {
    const base = resolve(dirname(fromFile), s)
    for (const c of RESOLVE_CANDIDATES(base)) if (existsSync(c) && statSync(c).isFile()) return c
    return null
  }
  for (const a of aliasPairs) {
    if (!a.star && s === a.k) {
      const c = join(ROOT, a.baseUrl ?? '', a.v)
      for (const cc of RESOLVE_CANDIDATES(c)) if (existsSync(cc)) return cc
    } else if (a.star && s.startsWith(a.prefix + '/')) {
      const c = join(ROOT, a.baseUrl ?? '', a.v.replace('/*', ''), s.slice(a.prefix.length + 1))
      for (const cc of RESOLVE_CANDIDATES(c)) if (existsSync(cc)) return cc
    }
  }
  return null // external package
}

const textOf = new Map()
for (const f of allFiles) textOf.set(f, readFileSync(f, 'utf8'))

const deps = new Map() // file -> { uses:Set<abs>, named:Map<abs,Set<name>> }
const exportsOf = new Map() // file -> Set<exported name>
for (const f of allFiles) {
  deps.set(f, { uses: new Set(), named: new Map() })
  exportsOf.set(f, new Set())
}
const addUse = (from, to, names = []) => {
  if (!to) return
  if (!deps.has(to)) { deps.set(to, { uses: new Set(), named: new Map() }); exportsOf.set(to, new Set()) } // json/glb/… assets and other non-code modules
  const d = deps.get(from)
  d.uses.add(to)
  if (names.length) {
    if (!d.named.has(to)) d.named.set(to, new Set())
    for (const n of names) d.named.get(to).add(n)
  }
}

const IMPORT_STAR = /\bimport\s+\*\s*as\s+[A-Za-z0-9_$]+\s+from\s*['"]([^'"]+)['"]/g
const IMPORT_DEFAULT = /\bimport\s+[A-Za-z0-9_$]+\s+from\s*['"]([^'"]+)['"]/g
const IMPORT_SIDE = /\bimport\s+['"]([^'"]+)['"]/g
const IMPORT_NAMED = /\bimport\s+type\s*,?\s*\{([^}]*)\}\s+from\s*['"]([^'"]+)['"]|\bimport\s+type\s*\{([^}]*)\}\s+from\s*['"]([^'"]+)['"]|\bimport\s*\{([^}]*)\}\s+from\s*['"]([^'"]+)['"]/g
const EXPORT_FROM = /\bexport\s+(?:type\s+)?\*\s*as\s+([A-Za-z0-9_$]+)\s+from\s*['"]([^'"]+)['"]|\bexport\s+(?:type\s+)?\*\s*from\s*['"]([^'"]+)['"]|\bexport\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]|\bexport\s+[A-Za-z0-9_$]+\s+from\s*['"]([^'"]+)['"]/g
const DYN_IMPORT = /\bimport\s*\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]\s*\)/g
const WORKER_URL = /\bnew\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g
const VI_MOCK = /\bvi\.mock\(\s*['"]([^'"]+)['"]/g
const TEST_STRING_PATH = /['"`]([^'"`]*(?:src|tests)\/[^'"`]*\.(?:tsx?|jsx?|mjs|css))['"`]/g

// exported names declared in the file
const EX_CONST = /^\s*export\s+(?:const|let|var|function|class|async\s+function|abstract\s+class)\s+([A-Za-z0-9_$]+)/gm
const EX_TYPE = /^\s*export\s+(?:type|interface|enum)\s+([A-Za-z0-9_$]+)/gm
const EX_BRACE = /^\s*export\s*\{([^}]*)\}\s*;?\s*$/gm
const EX_DEFAULT = /^\s*export\s+default\s+/m

for (const f of allFiles) {
  const t = textOf.get(f)
  for (const m of t.matchAll(IMPORT_NAMED)) {
    const clause = (m[1] ?? m[3] ?? m[5]) || ''
    const spec = m[2] ?? m[4] ?? m[6]
    const names = clause.split(',').map((x) => x.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean)
    addUse(f, resolveImport(f, spec), names)
  }
  for (const m of t.matchAll(IMPORT_STAR)) addUse(f, resolveImport(f, m[1]), ['*'])
  for (const m of t.matchAll(IMPORT_DEFAULT)) addUse(f, resolveImport(f, m[1]), ['default'])
  for (const m of t.matchAll(IMPORT_SIDE)) addUse(f, resolveImport(f, m[1]))
  for (const m of t.matchAll(EXPORT_FROM)) {
    if (m[1] !== undefined) { // export * as NAME from 'spec'
      addUse(f, resolveImport(f, m[2]), ['*'])
      exportsOf.get(f).add(m[1])
      continue
    }
    const spec = m[3] ?? m[5] ?? m[6]
    const clause = m[4]
    const names = m[3] ? ['*'] : clause ? clause.split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean) : ['default']
    addUse(f, resolveImport(f, spec), names)
  }
  for (const m of t.matchAll(DYN_IMPORT)) {
    const target = resolveImport(f, m[1])
    addUse(f, target)
    // lazy(() => import('./X').then((m) => ({ default: m.Named }))) — count the named export.
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 200)
    const then = /\.then\s*\(\s*(?:async\s*)?\(\s*([A-Za-z0-9_$]+)\s*\)\s*=>/g.exec(after)
    if (then) {
      const names = new Set()
      for (const g of after.matchAll(new RegExp(`\\b${then[1]}\\.([A-Za-z0-9_$]+)`, 'g'))) names.add(g[1])
      addUse(f, target, [...names])
    }
  }
  // const { a, b } = await import('...') — destructured dynamic imports from tests.
  for (const m of t.matchAll(/\b(?:const|let|var)?\s*\{([^}]*)\}\s*=\s*await\s+import\s*\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]\s*\)/g)) {
    const names = m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)
    addUse(f, resolveImport(f, m[2]), names)
  }
  // const mod = await import('...'); mod.Named(...) — namespace dynamic imports from tests.
  for (const m of t.matchAll(/\b(?:const|let|var)?\s*([A-Za-z0-9_$]+)\s*=\s*await\s+import\s*\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"]+)['"]\s*\)/g)) {
    const target = resolveImport(f, m[2])
    addUse(f, target)
    const names = new Set()
    for (const g of t.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z0-9_$]+)`, 'g'))) names.add(g[1])
    addUse(f, target, [...names])
  }
  for (const m of t.matchAll(WORKER_URL)) addUse(f, resolveImport(f, m[1]))
  for (const m of t.matchAll(VI_MOCK)) addUse(f, resolveImport(f, m[1]))
  if (relOf(f).startsWith('tests/')) {
    for (const m of t.matchAll(TEST_STRING_PATH)) {
      const p = normalize(join(ROOT, m[1]))
      if (existsSync(p) && statSync(p).isFile()) addUse(f, p)
    }
  }

  const ex = exportsOf.get(f)
  for (const m of t.matchAll(EX_CONST)) ex.add(m[1])
  for (const m of t.matchAll(EX_TYPE)) ex.add(m[1])
  for (const m of t.matchAll(EX_BRACE)) {
    for (const x of m[1].split(',')) {
      const bits = x.trim().split(/\s+as\s+/)
      const name = bits[bits.length - 1]
      if (/^[A-Za-z0-9_$]+$/.test(name)) ex.add(name)
    }
  }
  if (EX_DEFAULT.test(t)) ex.add('default')
}

// entries (roots): Electron main + preload, the renderer html's script, worker URLs are already uses,
// and every test file. index.html points at src/renderer/src/main.tsx.
const html = existsSync(join(ROOT, 'src/renderer/index.html'))
  ? readFileSync(join(ROOT, 'src/renderer/index.html'), 'utf8')
  : ''
const htmlEntry = /src=["']\/([^"']+\.tsx?)["']/.exec(html)?.[1] ?? 'src/main.tsx'
const entries = new Set([
  join(ROOT, 'src/main/index.ts'),
  join(ROOT, 'src/preload/index.ts'),
  join(ROOT, 'src/renderer', htmlEntry),
  ...testFiles
].filter((p) => existsSync(p)))

const used = new Set(entries)
const queue = [...entries]
while (queue.length) {
  const f = queue.shift()
  for (const u of deps.get(f).uses) if (!used.has(u)) { used.add(u); queue.push(u) }
}

// (a) src files nothing imports, not entries, not .d.ts
const unusedFiles = srcFiles.filter(
  (f) => !used.has(f) && !f.endsWith('.d.ts') && (f.endsWith('.ts') || f.endsWith('.tsx'))
)

// (b) exported names nothing outside their own file uses
const unusedExports = new Map()
for (const f of allFiles) {
  const ex = exportsOf.get(f)
  if (!ex.size) continue
  const unused = [...ex].filter((n) => {
    for (const [, d] of deps) {
      const got = d.named.get(f)
      if (got && (got.has(n) || got.has('*'))) return false
    }
    return true
  })
  if (unused.length) unusedExports.set(f, unused)
}

// -- check against the baseline ------------------------------------------
const BASELINE = join(ROOT, 'scripts', 'deadcode-baseline.txt')
const nowList = [
  ...unusedFiles.map((f) => `file ${relOf(f)}`),
  ...[...unusedExports.entries()].flatMap(([f, ns]) => ns.map((n) => `export ${relOf(f)} : ${n}`))
].sort()
if (process.argv.includes('--write-baseline')) {
  writeFileSync(BASELINE, nowList.join('\n') + '\n')
  console.log(`deadcode: wrote ${nowList.length} lines to scripts/deadcode-baseline.txt`)
  process.exit(0)
}
if (process.argv.includes('--check')) {
  const listed = new Set(existsSync(BASELINE) ? readFileSync(BASELINE, 'utf8').split(/\r?\n/).filter(Boolean) : [])
  const now = new Set(nowList)
  const added = nowList.filter((l) => !listed.has(l))
  const gone = [...listed].filter((l) => !now.has(l))
  for (const l of added) console.log(`new unused ${l} — use it, delete it, or drop its export keyword`)
  for (const l of gone) console.log(`no longer unused: ${l} — take it out of scripts/deadcode-baseline.txt`)
  console.log(`deadcode: ${added.length} new, ${gone.length} to take out of the baseline (${nowList.length} listed today)`)
  process.exit(added.length || gone.length ? 1 : 0)
}

// -- report ---------------------------------------------------------------
let dynSites = 0, workerUrls = 0
for (const f of allFiles) {
  const t = textOf.get(f)
  for (const _ of t.matchAll(DYN_IMPORT)) dynSites++
  for (const _ of t.matchAll(WORKER_URL)) workerUrls++
}

console.log('## counts')
console.log('files under src/ (code, vendored public/ excluded):', srcFiles.length)
console.log('files under tests/:', testFiles.length)
console.log('electron entry points (src/main/index.ts, src/preload/index.ts): 2')
console.log('renderer html entry:', relOf([...entries].find((e) => relOf(e).includes('main.tsx')) ?? ''))
console.log('worker URLs:', workerUrls)
console.log('dynamic import() sites (lazy() + bare import()):', dynSites)
console.log('(a) unused files under src/ (not entries):', unusedFiles.length)
console.log('(b) files with exports unused outside their own file:', unusedExports.size)
let expCount = 0
for (const [, ns] of unusedExports) expCount += ns.length
console.log('(b) total unused export names:', expCount)

console.log('\n## (a) unused files')
for (const f of unusedFiles.sort()) console.log('  ' + relOf(f))

console.log('\n## (b) unused exports, biggest first (file : names)')
const sorted = [...unusedExports.entries()].sort((a, b) => b[1].length - a[1].length)
for (const [f, ns] of sorted) console.log(`  ${relOf(f)} (${ns.length}) : ${ns.join(', ')}`)

console.log('\n## top-30 files by unused-export count (for the hand-check)')
for (const [f, ns] of sorted.slice(0, 30)) console.log(`  ${relOf(f)} (${ns.length}) : ${ns.join(', ')}`)
