// P-FIX-APPPROTO: the packaged app's app:// handler. A malformed percent-escape (/%E0%A4%A) made decodeURIComponent
// throw inside the handler, so the request failed with an exception instead of an answer (G0's review). Every request
// must get an answer: the file inside the served root, 400 for an unreadable path, 403 for anything outside the root.
// The escape probes are the ones scripts/giac-smoke.mjs sends to the packaged app.

import { isAbsolute, join, normalize, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAppPath } from '../src/main/appPath'
import { readSource } from './helpers/repo'

const root = normalize(join(sep, 'srv', 'physlab', 'renderer'))
const inRoot = (...parts: string[]) => normalize(join(root, ...parts))

describe('resolveAppPath', () => {
  it('serves the page itself and its files', () => {
    expect(resolveAppPath(root, 'app://physlab/')).toEqual({ file: inRoot('index.html') })
    expect(resolveAppPath(root, 'app://physlab/index.html')).toEqual({ file: inRoot('index.html') })
    expect(resolveAppPath(root, 'app://physlab/assets/index-abc.js')).toEqual({ file: inRoot('assets', 'index-abc.js') })
    expect(resolveAppPath(root, 'app://physlab/giac/giac%20wasm.js')).toEqual({ file: inRoot('giac', 'giac wasm.js') })
  })
  it('a malformed percent-escape is 400, never a throw', () => {
    for (const url of ['app://physlab/%E0%A4%A', 'app://physlab/%', 'app://physlab/%zz', 'app://physlab/a%E0b', 'app://physlab/%C0%AF']) {
      expect(() => resolveAppPath(root, url), url).not.toThrow()
      expect(resolveAppPath(root, url), url).toEqual({ status: 400 })
    }
  })
  it('a path out of the root is 403 (the smoke script’s escape probes)', () => {
    for (const url of ['app://physlab/..%2f..%2fpackage.json', 'app://physlab/..%5c..%5cpackage.json']) {
      expect(resolveAppPath(root, url), url).toEqual({ status: 403 })
    }
    // Dot segments the URL parser resolves itself (even escaped ones) stop at the root, so they stay inside it.
    expect(resolveAppPath(root, 'app://physlab/%2e%2e/%2e%2e/package.json')).toEqual({ file: inRoot('package.json') })
  })
  it('a URL that cannot be read at all is 400, and so is a NUL byte', () => {
    expect(resolveAppPath(root, 'not a url')).toEqual({ status: 400 })
    expect(resolveAppPath(root, 'app://physlab/%00')).toEqual({ status: 400 })
    expect(resolveAppPath(root, 'app://physlab/index.html%00.js')).toEqual({ status: 400 })
  })
  it('drive letters, UNC paths, double encoding and upper-case escapes never leave the root (review probes)', () => {
    for (const url of [
      'app://physlab/%2fC:/Windows/win.ini',
      'app://physlab/C:%5cWindows%5cwin.ini',
      'app://physlab/%5c%5cserver%5cshare%5cfile',
      'app://physlab//server/share/file',
      'app://physlab/%252e%252e/%252e%252e/package.json',
      'app://physlab/%2E%2E/%2E%2E/package.json',
      'app://physlab/..%2F..%2Fpackage.json'
    ]) {
      const r = resolveAppPath(root, url)
      if ('file' in r) {
        const rel = relative(root, r.file)
        expect(rel.startsWith('..') || isAbsolute(rel), `${url} → ${r.file}`).toBe(false)
      }
    }
  })
})

describe('the handler in src/main/index.ts', () => {
  const src = readSource('src/main/index.ts')
  it('decides through resolveAppPath, and decodes nothing itself', () => {
    expect(src).toMatch(/resolveAppPath\(/)
    expect(src).not.toMatch(/decodeURIComponent/)
  })
  it('answers even when reading the file fails', () => {
    expect(src).toMatch(/catch[\s\S]{0,200}status: 500/)
  })
})
