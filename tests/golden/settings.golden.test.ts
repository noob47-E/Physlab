import { describe, expect, it, beforeEach, vi } from 'vitest'
import { expectGolden, goldenLine, seenOf } from './harness'
import { resetGlobals } from '../helpers/globals'
import { savedMode } from '../../src/renderer/src/app/layout'
import { readTheme } from '../../src/renderer/src/app/theme'
import { SETTINGS_CORPUS, LABEL_PREFS_CORPUS } from './inputs/settings'

beforeEach(() => {
  resetGlobals()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn()
  })
})

/**
 * The label preferences a fresh start reads from storage: the store's own loadLabelPrefs runs once
 * when core/store.ts is loaded, so each saved text gets a fresh copy of the store. What is written
 * is every setting that differs from the defaults, so a damaged or unknown value that gets through
 * shows.
 */
async function prefsLines(): Promise<string[]> {
  const lines: string[] = []
  for (const s of LABEL_PREFS_CORPUS) {
    vi.resetModules()
    vi.mocked(localStorage.getItem).mockImplementation((key: string) => (key === 'physlab.labelPrefs' ? s.json : null))
    const store = await import('../../src/renderer/src/core/store')
    const now = store.useScene.getState().settings as unknown as Record<string, unknown>
    const base = store.DEFAULT_SETTINGS as unknown as Record<string, unknown>
    const changed = Object.fromEntries(Object.keys({ ...base, ...now }).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(base[k])).map((k) => [k, now[k]]))
    lines.push(goldenLine(`PREFS ${s.name}`, JSON.stringify(changed)))
  }
  return lines
}

function sweep(): string[] {
  const lines: string[] = []
  for (const s of SETTINGS_CORPUS) {
    lines.push(goldenLine(`LAYOUT ${s.name}`, seenOf(() => {
      vi.mocked(localStorage.getItem).mockReturnValue(s.json)
      const mode = savedMode()
      return `mode: ${mode}`
    })))
  }
  for (const t of [null, '', 'moonlight', 'moongold', 'dark', 'light', 'Light', 'blue', '"dark"', '123'])
    lines.push(goldenLine(`THEME ${JSON.stringify(t)}`, seenOf(() => readTheme(t))))
  return lines
}

describe('golden sweep: settings', () => {
  it('is stable: two runs in a row give the same lines', async () => {
    expect([...sweep(), ...(await prefsLines())]).toEqual([...sweep(), ...(await prefsLines())])
  }, 120_000)

  it('matches tests/golden/out/settings.txt', async () => {
    expectGolden('settings', [...sweep(), ...(await prefsLines())])
  }, 120_000)
})
