// The desktop Open dialog: a project opens on .phys as it always did, and a question file gets a
// dialog that can see .pqjson and .exam — it used to share the .phys one, and a teacher in the
// packaged app could not see a single question file to pick.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDialogOptions, PROJECT_FILTERS } from '../src/main/openDialog'
import { readSource } from './helpers/repo'

/** app/files.ts reads window.physlab once, at load: give it a window with a spy, in a fresh module graph. */
async function loadFilesWithBridge(openFile: (...args: unknown[]) => Promise<null>) {
  vi.stubGlobal('window', { physlab: { isDesktop: true, openFile, saveFile: vi.fn() } })
  vi.resetModules()
  return import('../src/renderer/src/app/files')
}

describe('the Open dialog', () => {
  it('keeps the .phys project dialog when nothing is asked for', () => {
    expect(openDialogOptions()).toEqual({ title: 'Open PhysLab project', filters: PROJECT_FILTERS })
    expect(PROJECT_FILTERS).toEqual([{ name: 'PhysLab project', extensions: ['phys'] }])
  })

  it('shows the filters and title a caller passes', () => {
    const q = [{ name: 'Question file', extensions: ['pqjson', 'exam'] }]
    expect(openDialogOptions(q, 'Open a question file')).toEqual({ title: 'Open a question file', filters: q })
    expect(openDialogOptions(q).title).toBe('Open a file')
  })

  it('falls back to the project dialog on anything that is not a list of plain extensions', () => {
    for (const bad of [[], 'pqjson', [{ name: 'x' }], [{ name: 'x', extensions: [] }], [{ name: 'x', extensions: ['*.exe; rm'] }]]) {
      expect(openDialogOptions(bad).filters, JSON.stringify(bad)).toEqual(PROJECT_FILTERS)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the question picker asks for .pqjson and .exam, and Open project asks for nothing', async () => {
    const openFile = vi.fn(async () => null)
    const files = await loadFilesWithBridge(openFile)
    expect(await files.openQuestionFile()).toBeNull()
    expect(openFile).toHaveBeenLastCalledWith([{ name: 'Question file', extensions: ['pqjson', 'exam'] }], 'Open a question file')
    await files.openProject()
    expect(openFile).toHaveBeenCalledTimes(2)
    // Open project still asks for nothing, so it keeps the .phys dialog.
    expect(openFile.mock.calls[1]).toHaveLength(0)
    // The fresh module graph behind app/files.ts takes more than the default 5 s to load on a cold or busy machine.
  }, 60_000)

  it('the bridge and the main process pass the picker’s filters and title on', () => {
    expect(readSource('src/preload/index.ts')).toMatch(/ipcRenderer\.invoke\('file:open', filters, title\)/)
    expect(readSource('src/main/index.ts')).toMatch(/openDialogOptions\(filters, title\)/)
  })
})
