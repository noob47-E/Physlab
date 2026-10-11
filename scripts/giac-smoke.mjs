#!/usr/bin/env node
// Giac runtime smoke test (G0 / ENGINE-STAGE-PLAN.md §0 and §2).
// Proves the Giac WebAssembly runtime loads and evaluates inside a Web Worker in:
//   (a) the electron-vite packaged build: the app's real main bundle (out/main/index.js) serves
//       app://physlab/ from out/renderer, and a worker imports app://physlab/giac/giacwasm.js
//   (b) the offline web build (dist/web), served by an in-process HTTP server on 127.0.0.1
// It also checks that the vendored, packaged and web copies of giacwasm.js are the same file, and
// that neither server hands out a file from outside its own root.
//
// Usage:
//   node scripts/giac-smoke.mjs              build targets, then test both
//   node scripts/giac-smoke.mjs --no-build   test existing builds (out/ and dist/web)

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, extname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

// The SHA-256 of the vendored runtime (NOTICE and docs/knowledge/giac.md record the same value).
const GIAC_SHA256 = '5de9cd24998290b3c4768413d2c198edea75d7bead98deab504f6309e789479a'
const EXPECTED_RESULT = '(x-1)*(x+1)'

if (!process.versions.electron) {
  // ---- Node Driver Mode ----------------------------------------------------
  const noBuild = process.argv.includes('--no-build')

  if (!noBuild) {
    console.log('giac-smoke: building packaged renderer (electron-vite build)...')
    const b1 = spawnSync('npx electron-vite build', {
      cwd: repoRoot,
      shell: true,
      encoding: 'utf8',
      timeout: 300_000
    })
    if (b1.status !== 0) {
      console.error(`giac-smoke: electron-vite build failed:\n${(b1.stdout + b1.stderr).slice(-2000)}`)
      process.exit(1)
    }

    console.log('giac-smoke: building offline web target (vite build)...')
    const webOutDir = join(repoRoot, 'dist/web')
    const b2 = spawnSync(`npx vite build --config vite.web.config.ts --outDir "${webOutDir}"`, {
      cwd: repoRoot,
      shell: true,
      encoding: 'utf8',
      timeout: 300_000
    })
    if (b2.status !== 0) {
      console.error(`giac-smoke: vite web build failed:\n${(b2.stdout + b2.stderr).slice(-2000)}`)
      process.exit(1)
    }
  }

  const packagedMain = join(repoRoot, 'out/main/index.js')
  if (!existsSync(packagedMain)) {
    console.error(`giac-smoke: missing packaged main bundle at ${packagedMain}. Run without --no-build first.`)
    process.exit(1)
  }

  const vendoredGiac = join(repoRoot, 'src/renderer/public/giac/giacwasm.js')
  const packagedGiac = join(repoRoot, 'out/renderer/giac/giacwasm.js')
  const webGiac = join(repoRoot, 'dist/web/giac/giacwasm.js')
  for (const [label, path] of [
    ['vendored', vendoredGiac],
    ['packaged', packagedGiac],
    ['offline web', webGiac]
  ]) {
    if (!existsSync(path)) {
      console.error(`giac-smoke: missing ${label} runtime at ${path}. Run without --no-build first.`)
      process.exit(1)
    }
  }
  const webDir = join(repoRoot, 'dist/web')

  // The three copies must be the vendored file byte for byte; a stale or edited copy fails here.
  const hashFaults = []
  for (const [label, path] of [
    ['vendored', vendoredGiac],
    ['packaged', packagedGiac],
    ['offline web', webGiac]
  ]) {
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
    if (hash !== GIAC_SHA256) hashFaults.push(`${label} copy has SHA-256 ${hash}, expected ${GIAC_SHA256}`)
  }
  if (hashFaults.length) {
    console.error(`giac-smoke: FAILED\n  ${hashFaults.join('\n  ')}`)
    process.exit(1)
  }

  const userData = mkdtempSync(join(tmpdir(), 'physlab-giac-smoke-'))
  let runner
  try {
    console.log('giac-smoke: running Electron Web Worker smoke test...')
    runner = spawnSync('npx electron scripts/giac-smoke.mjs --electron-runner', {
      cwd: repoRoot,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, PHYSLAB_GIAC_WEB_DIR: webDir, PHYSLAB_GIAC_USERDATA: userData },
      timeout: 120_000
    })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }

  const stdout = runner.stdout ?? ''
  const smokeLine = stdout
    .split(/\r?\n/)
    .find((l) => l.startsWith('GIAC_SMOKE '))

  if (!smokeLine || runner.status !== 0) {
    console.error('giac-smoke: test failed')
    if (stdout) console.error(stdout)
    if (runner.stderr) console.error(runner.stderr)
    process.exit(1)
  }

  const data = JSON.parse(smokeLine.slice('GIAC_SMOKE '.length))
  const { packaged, web } = data

  // Giac returns the version as a quoted string; the quotes are not part of it.
  const versionText = (text) => String(text ?? '').replace(/^"|"$/g, '').split(/\r?\n/)[0]

  const faults = []
  if (!packaged.ok || packaged.result !== EXPECTED_RESULT) {
    faults.push(`packaged build failed: expected ${EXPECTED_RESULT}, got "${packaged.result}" (error: ${packaged.error})`)
  }
  if (!web.ok || web.result !== EXPECTED_RESULT) {
    faults.push(`offline web build failed: expected ${EXPECTED_RESULT}, got "${web.result}" (error: ${web.error})`)
  }
  if (!/^giac \d/.test(versionText(packaged.version)) || !/^giac \d/.test(versionText(web.version))) {
    faults.push(`Giac did not report its version (packaged: "${packaged.version}", web: "${web.version}")`)
  }
  // The page that hosts the worker must be the app's own start page, served by the target's server.
  if (!String(packaged.pageUrl).startsWith('app://physlab/index.html')) {
    faults.push(`packaged worker page is "${packaged.pageUrl}", expected app://physlab/index.html`)
  }
  if (!/^http:\/\/127\.0\.0\.1:\d+\/index\.html$/.test(String(web.pageUrl))) {
    faults.push(`offline web worker page is "${web.pageUrl}", expected http://127.0.0.1:<port>/index.html`)
  }
  // The app itself must have mounted on its start page (a renderer that crashed before the app
  // mounted would leave #root empty), so the proof cannot pass on a dead app.
  if (!(packaged.appMounted > 0)) faults.push('packaged app did not mount into #root')
  if (!(web.appMounted > 0)) faults.push('offline web app did not mount into #root')
  // The link probe: a link out of the served root must not be followed; a plain file must be served.
  if (data.linkEscape.link === 200) faults.push('a server followed a directory link out of its root')
  if (data.linkEscape.control !== 200) faults.push(`link-escape control returned ${data.linkEscape.control}, expected 200`)
  // The probes: a control request must succeed, and every request for a file outside the root must not.
  for (const [label, target] of [
    ['packaged', packaged],
    ['offline web', web]
  ]) {
    if (target.probes.control !== 200) faults.push(`${label} control request returned ${target.probes.control}, expected 200`)
    for (const [name, status] of Object.entries(target.probes.escapes)) {
      if (status === 200) faults.push(`${label} server served a file outside its root for ${name}`)
    }
  }

  console.log(`giac-smoke: [packaged-app] factor(x^2-1) = ${packaged.result} | cold-start: ${packaged.coldStartMs} ms | eval: ${packaged.evalMs} ms | renderer memory: ${packaged.memBeforeMb} MB before, ${packaged.memMb} MB after | ${versionText(packaged.version)}`)
  console.log(`giac-smoke: [offline-web]  factor(x^2-1) = ${web.result} | cold-start: ${web.coldStartMs} ms | eval: ${web.evalMs} ms | renderer memory: ${web.memBeforeMb} MB before, ${web.memMb} MB after | ${versionText(web.version)}`)
  console.log(`giac-smoke: escape probes (expected: not 200) packaged ${JSON.stringify(packaged.probes.escapes)} web ${JSON.stringify(web.probes.escapes)}; control packaged ${packaged.probes.control}, web ${web.probes.control}`)
  console.log(`giac-smoke: link probe (expected: not 200) ${data.linkEscape.link}; control ${data.linkEscape.control}; app mounted: packaged ${packaged.appMounted} children, web ${web.appMounted} children`)
  console.log(`giac-smoke: SHA-256 of vendored, packaged and web copies all ${GIAC_SHA256}`)

  if (faults.length) {
    console.error(`giac-smoke: FAILED\n  ${faults.join('\n  ')}`)
    process.exit(1)
  }

  console.log('giac-smoke: SUCCESS — both targets loaded Giac in a Web Worker and verified factor(x^2-1) == (x-1)*(x+1)')
  process.exit(0)
} else {
  // ---- Electron Runner Mode ------------------------------------------------
  const { app } = await import('electron')

  const customUserData = process.env.PHYSLAB_GIAC_USERDATA
  if (customUserData) {
    app.setPath('userData', customUserData)
  }

  const MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.wasm': 'application/wasm'
  }

  const ISOLATION_HEADERS = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp'
  }

  // True when child is strictly inside base (not base itself, not a sibling, not another drive).
  const isInside = (base, child) => {
    const r = relative(base, child)
    return r !== '' && r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r)
  }

  // The offline web server: refuses any path that resolves outside rootDir, both as written and
  // after symlinks and junctions are followed, and a malformed percent-escape gets a 400 instead
  // of throwing inside the request handler.
  function startHttpServer(rootDir) {
    const rootReal = realpathSync(rootDir)
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => {
        let pathname
        try {
          const url = new URL(req.url, 'http://127.0.0.1')
          pathname = decodeURIComponent(url.pathname)
        } catch {
          res.writeHead(400)
          res.end('Bad Request')
          return
        }
        if (pathname === '/' || pathname === '') pathname = '/index.html'
        const filePath = normalize(join(rootDir, pathname))
        if (!isInside(rootDir, filePath)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        if (!existsSync(filePath)) {
          res.writeHead(404)
          res.end('Not Found')
          return
        }
        const realPath = realpathSync(filePath)
        if (!isInside(rootReal, realPath)) {
          res.writeHead(403)
          res.end('Forbidden')
          return
        }
        if (!statSync(realPath).isFile()) {
          res.writeHead(404)
          res.end('Not Found')
        } else {
          const data = readFileSync(realPath)
          res.writeHead(200, {
            'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
            ...ISOLATION_HEADERS
          })
          res.end(data)
        }
      })
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port
        resolve({ server, port })
      })
    })
  }

  // Everything below that runs in the page is written as a self-contained function and sent as
  // text (fn.toString()), so no string of JavaScript is hand-escaped.

  // Page code: one Web Worker that imports Giac the way the app will, evaluates factor(x^2-1)
  // and asks for the version. Resolves with a plain object; a worker that cannot load resolves
  // with ok: false (importScripts failure is an error event, so it rejects).
  async function evalGiacInWorker(scriptUrl) {
    const workerSource = `
      const t0 = performance.now();
      self.Module = {
        onAbort(msg) {
          self.postMessage({ ok: false, error: 'Module abort: ' + msg });
        },
        onRuntimeInitialized() {
          const tReady = performance.now();
          try {
            const caseval = self.Module.cwrap('caseval', 'string', ['string']);
            const result = caseval('factor(x^2-1)');
            const tEval = performance.now();
            let version = null;
            try { version = caseval('version()'); } catch (e) { version = 'version() failed: ' + e; }
            self.postMessage({
              ok: true,
              result,
              version,
              coldStartMs: Math.round(tReady - t0),
              evalMs: Math.round(tEval - tReady)
            });
          } catch (err) {
            self.postMessage({ ok: false, error: String((err && (err.message || err.stack)) || err) });
          }
        }
      };
      importScripts(${JSON.stringify(scriptUrl)});
    `
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout waiting for Giac worker')), 60000)
      const blobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
      const worker = new Worker(blobUrl)
      const cleanup = () => {
        clearTimeout(timeout)
        worker.terminate()
        URL.revokeObjectURL(blobUrl)
      }
      worker.onmessage = (e) => {
        cleanup()
        resolve(e.data)
      }
      worker.onerror = (e) => {
        cleanup()
        reject(new Error(e.message || (e.filename ? `${e.message} (${e.filename}:${e.lineno})` : 'Worker execution error')))
      }
    })
  }

  // Page code: the status of each URL requested with fetch from the page's own origin.
  async function fetchStatuses(urls) {
    const statuses = {}
    for (const url of urls) {
      try {
        const res = await fetch(url)
        statuses[url] = res.status
        await res.body?.cancel()
      } catch (err) {
        statuses[url] = 'error: ' + (err && err.message)
      }
    }
    return statuses
  }

  // Memory is read after the page has settled, so the start-up work of the app page is not counted as Giac.
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  function getRendererMemoryMb(wc) {
    const pid = wc.getOSProcessId()
    const metric = app.getAppMetrics().find((m) => m.pid === pid)
    if (metric && metric.memory) {
      const kb = metric.memory.privateBytes || metric.memory.workingSetSize || 0
      return Math.round(kb / 1024)
    }
    return 0
  }

  // Node side: the statuses of raw paths sent to the offline web server.
  function httpStatuses(port, paths) {
    return Promise.all(
      paths.map(
        (path) =>
          new Promise((resolve) => {
            http
              .get({ host: '127.0.0.1', port, path }, (res) => {
                res.resume()
                resolve([path, res.statusCode])
              })
              .on('error', (err) => resolve([path, 'error: ' + err.message]))
          })
      )
    ).then((pairs) => Object.fromEntries(pairs))
  }

  // The traversal requests. The "%2f" and "%5c" forms survive the URL parser (which only folds
  // literal dot segments), so they reach the server's own path check. The target file exists one
  // level above each root, so a server that escaped its root would answer 200.
  const ESCAPE_PATHS = ['/..%2f..%2fpackage.json', '/..%5c..%5cpackage.json', '/%E0%A4%A']
  const APP_ESCAPE_PATHS = ['app://physlab/..%2f..%2fpackage.json', 'app://physlab/..%5c..%5cpackage.json', 'app://physlab/%E0%A4%A']
  // Page expression: how many elements the app mounted into #root (0 when it did not mount).
  const MOUNTED_CHILDREN = "(document.getElementById('root') ? document.getElementById('root').childElementCount : 0)"
  const APP_CONTROL = 'app://physlab/giac/giacwasm.js'
  const WEB_CONTROL = '/giac/giacwasm.js'

  // A served root that holds a link (a junction on Windows, which needs no special rights) to a
  // directory outside it. The server must refuse the link's contents, while a plain file in the
  // same root still answers 200. Everything lives in a fresh temp folder, and the link points at
  // another folder in that same temp folder, so cleaning up can never reach the repository.
  async function linkEscapeStatuses() {
    const base = mkdtempSync(join(tmpdir(), 'giac-escape-'))
    try {
      const outside = join(base, 'outside')
      const root = join(base, 'root')
      mkdirSync(outside)
      mkdirSync(root)
      writeFileSync(join(outside, 'secret.txt'), 'outside the served root\n')
      writeFileSync(join(root, 'ok.txt'), 'inside the served root\n')
      symlinkSync(outside, join(root, 'up'), 'junction')
      const info = await startHttpServer(root)
      try {
        const statuses = await httpStatuses(info.port, ['/up/secret.txt', '/ok.txt'])
        return { link: statuses['/up/secret.txt'], control: statuses['/ok.txt'] }
      } finally {
        info.server.close()
      }
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  }

  // Hook window creation from the app's real main process (out/main/index.js)
  app.on('browser-window-created', (_e, win) => {
    win.hide()
    win.on('show', () => win.hide())
    const wc = win.webContents
    wc.setBackgroundThrottling(false)

    wc.once('did-finish-load', async () => {
      let server
      try {
        // Target (a): packaged app:// build served by the real out/main/index.js registerAppProtocol.
        // The page must really be the app's own start page, so a failed page load cannot pass.
        const packagedPageUrl = await wc.executeJavaScript('location.href')
        await settle(3000)
        const packagedMounted = await wc.executeJavaScript(MOUNTED_CHILDREN)
        const packagedMemBefore = getRendererMemoryMb(wc)
        const packagedResult = await wc.executeJavaScript(`(${evalGiacInWorker.toString()})(${JSON.stringify('app://physlab/giac/giacwasm.js')})`)
        await settle(2000)
        const packagedMemMb = getRendererMemoryMb(wc)
        const packagedStatuses = await wc.executeJavaScript(`(${fetchStatuses.toString()})(${JSON.stringify(APP_ESCAPE_PATHS.concat(APP_CONTROL))})`)
        const packagedProbes = {
          escapes: Object.fromEntries(APP_ESCAPE_PATHS.map((u) => [u.slice('app://physlab'.length), packagedStatuses[u]])),
          control: packagedStatuses[APP_CONTROL]
        }

        // Target (b): offline web build served by the in-process HTTP server
        const webDir = process.env.PHYSLAB_GIAC_WEB_DIR || join(repoRoot, 'dist/web')
        const httpInfo = await startHttpServer(webDir)
        server = httpInfo.server
        await win.loadURL(`http://127.0.0.1:${httpInfo.port}/index.html`)
        const webPageUrl = await wc.executeJavaScript('location.href')
        await settle(3000)
        const webMounted = await wc.executeJavaScript(MOUNTED_CHILDREN)
        const webMemBefore = getRendererMemoryMb(wc)
        const webResult = await wc.executeJavaScript(`(${evalGiacInWorker.toString()})(${JSON.stringify(`http://127.0.0.1:${httpInfo.port}/giac/giacwasm.js`)})`)
        await settle(2000)
        const webMemMb = getRendererMemoryMb(wc)
        const webEscapes = await httpStatuses(httpInfo.port, ESCAPE_PATHS.concat(WEB_CONTROL))
        const linkEscape = await linkEscapeStatuses()

        const out = {
          packaged: {
            ...packagedResult,
            pageUrl: packagedPageUrl,
            appMounted: packagedMounted,
            memBeforeMb: packagedMemBefore,
            memMb: packagedMemMb,
            probes: packagedProbes
          },
          web: {
            ...webResult,
            pageUrl: webPageUrl,
            appMounted: webMounted,
            memBeforeMb: webMemBefore,
            memMb: webMemMb,
            probes: {
              escapes: Object.fromEntries(ESCAPE_PATHS.map((p) => [p, webEscapes[p]])),
              control: webEscapes[WEB_CONTROL]
            }
          },
          linkEscape
        }
        process.stdout.write(`GIAC_SMOKE ${JSON.stringify(out)}\n`)
      } catch (err) {
        process.stderr.write(`Error during giac-smoke: ${err?.stack || err}\n`)
      } finally {
        if (server) server.close()
        win.destroy()
        app.exit(0)
      }
    })
  })

  // Start the app's real main process (CommonJS bundle built by electron-vite)
  createRequire(import.meta.url)('../out/main/index.js')
}
