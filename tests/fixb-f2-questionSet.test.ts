// F2 diagnostic (runs red on today's code, green after the fix in the findings note).
//
// The bug: opening an old .phys file that still holds a top-level "questions" array must say
// "This file also holds a question set written in Question Author … the question set was left out."
// It never appears. loadProjectText calls loadScene(parseSceneFile(content)); parseSceneFile's
// migrate deletes "questions" (core/migrate.ts), so loadScene's test on raw.questions (core/store.ts)
// is always false on the real open path.
//
// Run with: npx vitest run --config _findings/vitest.findings.config.ts _findings/tests/f2-questionSet.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUESTION_SET_LEFT_OUT, scene, useScene } from '../src/renderer/src/core/store'

// app/files.ts reads the desktop bridge off `window` as it loads; a node test has none.
async function importFiles(): Promise<typeof import('../src/renderer/src/app/files')> {
  vi.stubGlobal('window', globalThis)
  try {
    return await import('../src/renderer/src/app/files')
  } finally {
    vi.unstubAllGlobals()
  }
}

const point = { id: 'mP', name: 'P', visible: true, locked: false, color: '#000', showLabel: true, type: 'point', def: { kind: 'free', p: [1, 2, 0] } }

beforeEach(() => {
  useScene.getState().newScene()
})

describe('F2: a project file with a Question Author set says the set was left out', () => {
  it('loadProjectText says it once, and the rest of the file opens', async () => {
    const files = await importFiles()
    scene().clearLog()
    const text = JSON.stringify({
      app: 'PhysLab',
      version: 5,
      objects: [point],
      settings: {},
      questions: [{ id: 'q1', title: 'Plain', statement: 'x', variables: [], parts: [], license: { id: 'CC BY 4.0', holder: 'PhysLab' } }]
    })
    files.loadProjectText(text, 'old.phys')
    expect(scene().order).toEqual(['mP'])
    expect(scene().log.map((l) => l.text)).toEqual([QUESTION_SET_LEFT_OUT, 'Opened old.phys'])
    // The set is not part of the scene, so it is never saved back.
    expect('questions' in scene().serialize()).toBe(false)
  })

  it('a file without a set still says nothing', async () => {
    const files = await importFiles()
    scene().clearLog()
    const text = JSON.stringify({ app: 'PhysLab', version: 5, objects: [point], settings: {} })
    files.loadProjectText(text, 'plain.phys')
    expect(scene().order).toEqual(['mP'])
    expect(scene().log.map((l) => l.text)).toEqual(['Opened plain.phys'])
  })
})
