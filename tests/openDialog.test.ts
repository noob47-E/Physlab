// The desktop Open dialog: a project opens on .phys as it always did, and a question file gets a
// dialog that can see .pqjson and .exam — it used to share the .phys one, and a teacher in the
// packaged app could not see a single question file to pick.

import { describe, expect, it } from 'vitest'
import { openDialogOptions, PROJECT_FILTERS } from '../src/main/openDialog'
import { readSource } from './helpers/repo'

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

  it('is what the question file picker and the bridge actually use', () => {
    const files = readSource('src/renderer/src/app/files.ts')
    expect(files).toMatch(/extensions: \['pqjson', 'exam'\]/)
    expect(files).toMatch(/bridge\.openFile\(QUESTION_FILE_FILTERS/)
    // Open project still asks for nothing, so it keeps the .phys dialog.
    expect(files).toMatch(/const r = await bridge\.openFile\(\)/)
    expect(readSource('src/preload/index.ts')).toMatch(/ipcRenderer\.invoke\('file:open', filters, title\)/)
    expect(readSource('src/main/index.ts')).toMatch(/openDialogOptions\(filters, title\)/)
  })
})
