// Precision on open: what a .phys file's saved precision does once it is loaded. The top bar's
// Precision box refuses 0 significant figures (app/topBarInputs.ts clampPrecision), but a file
// written before that check can still say `precisionMode: 'sf', decimals: 0`, and the open path
// does not range-check settings. The one failing test below proves that (CW8c-2) and is NOT fixed
// here; the other tests pin the facts that must stay true.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { FILE_VERSION } from '../src/renderer/src/core/migrate'
import { DEFAULT_SETTINGS, useScene } from '../src/renderer/src/core/store'
import { clampPrecision } from '../src/renderer/src/app/topBarInputs'
import { fmtPrecise } from '../src/renderer/src/math/format'
import { resetGlobals } from './helpers/globals'

const scene = () => useScene.getState()

type Files = typeof import('../src/renderer/src/app/files')
let files: Files

/** app/files.ts reads the desktop bridge off `window` as it loads; a node test has none, so it gets an empty one. */
beforeAll(async () => {
  vi.stubGlobal('window', globalThis)
  try {
    files = await import('../src/renderer/src/app/files')
  } finally {
    vi.unstubAllGlobals()
  }
})

afterAll(() => {
  vi.unstubAllGlobals()
})

/** The smallest valid project file, with the given precision saved in its settings. */
function projectText(precisionMode: 'dp' | 'sf', decimals: number): string {
  return JSON.stringify({
    app: 'PhysLab',
    version: FILE_VERSION,
    objects: [],
    settings: { ...DEFAULT_SETTINGS, precisionMode, decimals }
  })
}

beforeEach(() => {
  resetGlobals()
  scene().newScene()
})

describe('precision on open: facts that must stay true', () => {
  it('clampPrecision keeps 1 as the least significant figures and 0 as the least decimal places', () => {
    expect(clampPrecision(0, 'sf')).toBe(1)
    expect(clampPrecision(0, 'dp')).toBe(0)
  })

  it('a file saved with 0 decimal places in dp mode opens with decimals 0 in dp mode', () => {
    files.loadProjectText(projectText('dp', 0), 'dp0.phys')
    expect(scene().settings.precisionMode).toBe('dp')
    expect(scene().settings.decimals).toBe(0)
  })

  it('with a 0 s.f. file loaded, the number is written at 1 s.f. while decimals still reads 0', () => {
    files.loadProjectText(projectText('sf', 0), 'sf0.phys')
    // The file itself opened: no error line, and the saved mode came through.
    expect(scene().log.at(-1)?.kind).toBe('info')
    expect(scene().settings.precisionMode).toBe('sf')
    expect(scene().settings.decimals).toBe(0)
    expect(fmtPrecise(1234.5, scene().settings)).toBe('1000')
  })
})

describe('precision on open: known defect', () => {
  // CW8c-2 [answer may change]: proved, NOT fixed — waits for the owner (09\polish\pro-account\OWNER-APPROVALS.md). The fix belongs to CW5's settings check at the door (core/migrate.ts / core/store.ts loadScene).
  it.fails('CW8c-2: a project file saved with 0 s.f. opens with at least 1 s.f.', () => {
    files.loadProjectText(projectText('sf', 0), 'sf0.phys')
    // Nothing before this line may fail: the file must have opened in sf mode with no error.
    expect(scene().log.at(-1)?.kind).toBe('info')
    expect(scene().settings.precisionMode).toBe('sf')
    expect(scene().settings.decimals).toBeGreaterThanOrEqual(1)
  })
})
