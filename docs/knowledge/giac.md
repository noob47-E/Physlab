# Giac algebra engine runtime — code knowledge

Giac is an offline computer algebra system (factorisation, polynomial roots, calculus, equation
solving). PhysLab vendors its WebAssembly build so the engine can run inside a Web Worker with no
network. This part (G0) only proves that the runtime loads and answers in the two builds. Nothing
in `src/renderer/src/math/` calls it yet; that wiring is G1.

Status on 2026-10-12: vendored, provenance checked, load proof passing on both targets
(`node scripts/giac-smoke.mjs`). Open items are listed at the end.

## What is vendored

One file: `src/renderer/public/giac/giacwasm.js`

- 18,996,539 bytes
- SHA-256 `5de9cd24998290b3c4768413d2c198edea75d7bead98deab504f6309e789479a`
- Copied unchanged into the packaged renderer (out/renderer/giac) and the offline web build
  (dist/web/giac). The smoke test checks all three copies have this hash.

## Provenance

- Official download: `https://www-fourier.univ-grenoble-alpes.fr/~parisse/giac/xcashtml.zip`
  (fetched 2026-10-11 by the wave head; see section 1b of the SOURCES file in the physlab-engines
  folder, outside this repo).
- The zip's SHA-256 is `a244755d91653520cd1682171a7f81eb3e55bdef9e279a5c0a74116b47183545`, which
  matches that SOURCES file.
- The zip entry for the WebAssembly build (xcasoffline folder, giacwasm) was extracted on 2026-10-12
  to a scratch folder outside every repo, and hashed. Its SHA-256 is the same `5de9cd24…479a` as
  the vendored file. Nothing in the zip was run.
- The zip holds no licence file. The GPL-3 licence line comes from the SOURCES file. See Open items.
- Source mirror named in the SOURCES file: `https://github.com/geogebra/giac`. Upstream web version:
  `https://xcas.univ-grenoble-alpes.fr/xcasjs/`.

## What the runtime needs (answers to G0 step 2)

Evidence is from reading the vendored file (it is one line; the WebAssembly is decoded from it).

1. **Sidecar files: none.** The WebAssembly module is embedded as base64 in the script:
   `var wasmBinaryFile="data:application/octet-stream;base64,AGFzbQ…"`. Decoded, it is 14,002,128
   bytes and starts with the `\0asm` magic. The runtime calls `fetch()` on that data URI, which
   makes no network request. No `.wasm`, `.data` or other file is loaded. The smoke test runs the
   engine on both targets from this one file.
2. **Threads: single-threaded.** The file contains no SharedArrayBuffer and no `Atomics`
   references. The `pthread` strings are Emscripten stubs. For example `_pthread_cond_wait` is
   defined as `return 0`. No worker is spawned by Giac itself.
   Consequence: cross-origin isolation is not needed for Giac. The app sends COOP/COEP headers on
   every `app://` response anyway (`src/main/index.ts`), and that is harmless.
3. **Initialisation:** Emscripten `Module` object. Define `self.Module` before `importScripts`,
   then wait for `Module.onRuntimeInitialized`. Then:
   ```js
   const caseval = Module.cwrap('caseval', 'string', ['string'])
   caseval('factor(x^2-1)')   // "(x-1)*(x+1)"
   ```
   `_caseval` is the exported C entry point. `Module.onAbort` is also set, so a runtime abort
   reports `ok: false` rather than hanging.
4. **Worker type:** a classic worker (`importScripts`). The runtime detects this with
   `typeof importScripts === "function"`. A module worker is not needed.
5. **Version:** `caseval('version()')` returns `giac 1.9.0-xx, (c) B. Parisse and R. De Graeve,
   Institut Fourier, Universite Grenoble Alpes. Optimization, signalprocessing, graph theory (c) Luka
   Marohnić`. The binary also contains the text `Powered by Giac 1.9`.

## How it is served, and why

### Packaged Electron build: `app://physlab/giac/giacwasm.js` (chosen, proved)

- `src/main/index.ts` registers `app` as a standard, secure, fetch-capable scheme, and serves
  `out/renderer` through `protocol.handle` with COOP/COEP headers. The window loads
  `app://physlab/index.html`.
- A worker created from that page has the page's origin, `app://physlab`. It runs
  `importScripts('app://physlab/giac/giacwasm.js')`, which is same-origin, so no CORS is needed.
- The smoke test starts the real main bundle (built to out/main) and so runs the app's own protocol
  code, not a copy of it.

Rejected alternatives:
- **`file://`:** the comment above `protocol.registerSchemesAsPrivileged` in `src/main/index.ts`
  says the custom scheme gives "fetch/WASM/worker support and cross-origin isolation headers
  (file:// cannot provide either)". Chromium also gives `file://` pages an opaque origin. This route
  was not run in G0.
- **Reading the file in the main process and sending an ArrayBuffer over IPC:** would need a new
  IPC channel and a preload change, and it copies 19 MB through the bridge. The `app://` route
  already serves every other renderer asset. It was not run in G0.

### Offline web build: `http://127.0.0.1:<port>/giac/giacwasm.js`

- The offline web build (dist/web, built by `vite.web.config.ts`) is served by the smoke test's
  in-process server on `127.0.0.1`. **The repository has no shipped offline-web launcher.** `npm run
  web` is the Vite dev server, not a production server, and nothing in `src/main` or `scripts`
  serves dist/web. So the offline-web proof checks the static files in dist/web over HTTP through a
  test-only server, not a launcher the owner would ship. A launcher added later needs its own proof.
  The worker imports the absolute URL, and the origin is `http://127.0.0.1:<port>`.

## The load proof: `scripts/giac-smoke.mjs`

Run `node scripts/giac-smoke.mjs` (builds both targets first) or `--no-build` (tests the existing
`out/` and `dist/web`). It starts Electron with the runner mode and checks:

1. **Packaged target:** the real main bundle is loaded. The window must be on
   `app://physlab/index.html`, and the app must have mounted children into `#root`. Then a worker
   in that page runs `factor(x^2-1)` and `version()`. The result must be `(x-1)*(x+1)`, and the
   version must start `giac <digit>`.
2. **Offline web target:** the same, on `http://127.0.0.1/index.html`.
3. **Escape probes:** on both targets, requests that use an encoded slash or an encoded backslash
   to climb two folders above the root, to a package file, must not return 200. That file exists
   one level above each root, so a server that escaped its root would answer 200. A malformed
   percent-escape must not crash the server. A control request for `giac/giacwasm.js` must return
   200, to show the probe can see a success.
4. **Link probe:** the offline server is run on a fresh temp root holding a junction to a folder
   outside it. `/up/secret.txt` must not return 200, and a plain file in the same root must. The
   junction points at a folder inside the same temp folder, so cleaning up cannot reach the
   repository. Both the lexical path and the path after following links are checked.
5. **Hashes:** the vendored, packaged and web copies of `giacwasm.js` all have the expected SHA-256.

What the proof does **not** cover: the app's own UI, beyond the mount check. The worker in step 1
is created by the test page, so a bug in the app's worker code after mount is not seen. The web
target uses the test server, not a launcher (see above). The `file://` route is not tested.

Output of the last full run (2026-10-12, 01:55; the escape-probe line is shortened here, the full
line is printed by the script):
```
giac-smoke: [packaged-app] factor(x^2-1) = (x-1)*(x+1) | cold-start: 390 ms | eval: 22 ms | renderer memory: 183 MB before, 213 MB after | giac 1.9.0-xx, …
giac-smoke: [offline-web]  factor(x^2-1) = (x-1)*(x+1) | cold-start: 434 ms | eval: 20 ms | renderer memory: 221 MB before, 221 MB after | giac 1.9.0-xx, …
giac-smoke: escape probes (expected: not 200) packaged {403, 403, error} web {403, 403, 400}; control packaged 200, web 200
giac-smoke: link probe (expected: not 200) 403; control 200; app mounted: packaged 1 children, web 1 children
giac-smoke: SHA-256 of vendored, packaged and web copies all 5de9cd24998290b3c4768413d2c198edea75d7bead98deab504f6309e789479a
giac-smoke: SUCCESS — both targets loaded Giac in a Web Worker and verified factor(x^2-1) == (x-1)*(x+1)
```

The packaged malformed-escape probe gives "Failed to fetch" rather than a status. The most likely
cause is `decodeURIComponent` throwing inside the protocol handler in `src/main/index.ts`, which G0
does not change. The probe still counts as "not 200", and the app keeps running. The offline web
server, which G0 owns, answers 400.

## Size

- Uncompressed: 18,996,539 bytes, in both the packaged renderer's giac folder and dist/web/giac.
- Compressed with `gzip -9`: 6,645,960 bytes. With `xz -9`: 4,346,696 bytes.
- The NSIS installer size was **not measured** (no `npm run dist` in G0). The xz figure is the
  closest proxy here.

## Measurements

Measured on the owner's PC (Windows 10 Enterprise 10.0.19045, x64), Electron 44.3.0, 2026-10-12.
Five full runs of the smoke test: the first two before the memory settle delay was added, the last
three after it.

- **Cold start** (worker start to `onRuntimeInitialized`): packaged 390–884 ms, web 434–707 ms
  across the five runs. The spread varies from run to run, and five runs are not enough to call
  it a trend.
- **Evaluation** of `factor(x^2-1)`: 20–37 ms on both targets.
- **Renderer memory** (private bytes of the window's renderer process, read 3 s after the page
  loads and 2 s after the worker stops). The page's own start-up work is most of the figure. In the
  three settled runs the change across the worker was 0 to +43 MB, which is noisy. The first two
  runs, read before the settle delay, showed 482–484 MB (packaged) and 101–102 MB (web). Those
  figures were dominated by start-up and are not used.

## Bundled components inside the runtime

The binary holds more than Giac itself. These were found by reading its strings (decoded from the
embedded WebAssembly on 2026-10-12). They are **not** from a build manifest, so treat the list as
evidence to confirm, not as complete. Each is also listed in NOTICE.

| Component | Evidence in the binary | Licence (to confirm against the upstream source) |
|---|---|---|
| GNU MP 6.0.0 | 11 path strings under /home/parisse/emgiac/gmp-6.0.0 | LGPL v3 or later, or GPL v2 or later |
| GNU MPFR | strings such as "MPFR print binary error" and "(mpfr_uprec_t)" | LGPL v3 or later; version not stated |
| GLPK (GNU Linear Programming Kit) | glp_simplex, GLP_OPT, the _glp_zlib functions, a zlib/zio.c path | GPL v3 or later |
| QuickJS | notice text, "Copyright (c) 2017-2020 Fabrice Bellard" | MIT |
| Emscripten runtime (the JavaScript glue in the file) | `Module`, `ENVIRONMENT_IS_WORKER` | MIT |
| musl libc (probable) | the string MUSL_LOCPATH | MIT |

Note that PhysLab itself is GPL-3.0 (the LICENSE file, and the README's licence section), so
bundling a GPL-3 runtime is compatible with how PhysLab is licensed.

## Open items (for the owner)

1. **Corresponding source for GPL-3.** The distributed binary is the author's build, and the source
   version it was built from is not in this repository. NOTICE now carries a written offer of the
   Giac source (GPL-3 section 6, three years) so that the file can ship. The owner must approve that
   offer, and name the exact upstream source version before the next release.
2. **"Or later".** The licence line says GPL version 3. Whether Giac is "or later" is not stated in
   the zip, so it needs checking against the upstream COPYING.
3. **Component list.** Confirm the table above against the Giac build configuration. Add the musl
   notice text if musl is confirmed.
4. **Installer size.** Measure it when the next `npm run dist` is run.
