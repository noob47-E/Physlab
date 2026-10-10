// The browser build's download and file-picker helpers, run against stubbed globals. A node test
// has no document, so each test stubs the few pieces it reads and restores them afterwards.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadUrl, pickFile, saveBlob } from '../src/renderer/src/app/download'
import { useScene } from '../src/renderer/src/core/store'

const scene = () => useScene.getState()
type Files = typeof import('../src/renderer/src/app/files')

type FakeAnchor = { href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }

type FakeInput = {
  type: string
  accept: string
  files: ArrayLike<File> | null
  onchange: (() => void) | null
  listeners: Record<string, () => void>
  click: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
}

function fakeAnchor(log: string[]): FakeAnchor {
  return {
    href: '',
    download: '',
    click: vi.fn(() => log.push('click')),
    remove: vi.fn(() => log.push('remove'))
  }
}

function fakeInput(): FakeInput {
  const input: FakeInput = {
    type: '',
    accept: '',
    files: null,
    onchange: null,
    listeners: {},
    click: vi.fn(),
    addEventListener: vi.fn((type: string, fn: () => void) => {
      input.listeners[type] = fn
    })
  }
  return input
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('downloadUrl — one link, added, clicked and removed', () => {
  it('sets the href and name, adds the link before clicking it, and takes it out again', () => {
    const log: string[] = []
    const anchor = fakeAnchor(log)
    const appendChild = vi.fn(() => log.push('append'))
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } })

    downloadUrl('blob:physlab-test', 'readings.csv')

    expect(anchor.href).toBe('blob:physlab-test')
    expect(anchor.download).toBe('readings.csv')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(log).toEqual(['append', 'click', 'remove'])
  })
})

describe('saveBlob — the object URL outlives the click by one tick', () => {
  it('creates an object URL for the blob, clicks it, and revokes it only once the timers run', () => {
    vi.useFakeTimers()
    const anchor = fakeAnchor([])
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } })
    const createObjectURL = vi.fn(() => 'blob:physlab-test')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const blob = new Blob(['a,b\n1,2'])

    saveBlob(blob, 'readings.csv')

    expect(createObjectURL).toHaveBeenCalledWith(blob)
    expect(anchor.href).toBe('blob:physlab-test')
    expect(anchor.download).toBe('readings.csv')
    expect(anchor.click).toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:physlab-test')
  })
})

describe('pickFile — one file picker for the browser build', () => {
  it('makes a file input with the given accept list and opens it', () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })

    void pickFile('.csv,.txt,text/csv,text/plain')

    expect(input.type).toBe('file')
    expect(input.accept).toBe('.csv,.txt,text/csv,text/plain')
    expect(input.click).toHaveBeenCalled()
  })

  it('resolves the chosen File when the input changes', async () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })
    const file = new File(['a,b\n1,2'], 'readings.csv', { type: 'text/csv' })

    const picked = pickFile('.csv')
    input.files = [file]
    input.onchange?.()

    expect(await picked).toBe(file)
  })

  it('resolves null when the picker is cancelled', async () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })

    const picked = pickFile('.csv')
    input.listeners.cancel?.()

    expect(await picked).toBeNull()
  })

  it('resolves null when a change brings no file', async () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })

    const picked = pickFile('.csv')
    input.files = []
    input.onchange?.()

    expect(await picked).toBeNull()
  })
})

describe('app/files.ts browser branches (no window.physlab)', () => {
  let files: Files

  beforeAll(async () => {
    // app/files.ts reads window.physlab as it loads; a node test has no bridge, so these are the
    // browser branches.
    vi.stubGlobal('window', {})
    try {
      files = await import('../src/renderer/src/app/files')
    } finally {
      vi.unstubAllGlobals()
    }
  }, 120_000)

  beforeEach(() => {
    scene().newScene()
  })

  it('openQuestionFile offers a .pqjson, .exam or JSON file, and resolves its name and text', async () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })
    const file = new File(['{"app":"PhysLab","format":"pqjson"}'], 'sample.pqjson', { type: 'application/json' })

    const picked = files.openQuestionFile()
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.pqjson,.exam,application/json')
    expect(input.click).toHaveBeenCalled()
    input.files = [file]
    input.onchange?.()

    expect(await picked).toEqual({ name: 'sample.pqjson', content: '{"app":"PhysLab","format":"pqjson"}' })
  })

  it('openQuestionFile resolves null when the picker is cancelled', async () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })

    const picked = files.openQuestionFile()
    input.listeners.cancel?.()

    expect(await picked).toBeNull()
  })

  it('openProject offers a .phys file, and opens the chosen one into the scene with a log line', async () => {
    const input = fakeInput()
    vi.stubGlobal('document', { createElement: vi.fn(() => input) })
    const text = JSON.stringify(scene().serialize())
    const file = new File([text], 'lesson.phys', { type: 'application/json' })

    const opened = files.openProject()
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.phys,application/json')
    expect(input.click).toHaveBeenCalled()
    input.files = [file]
    input.onchange?.()
    await opened

    await vi.waitFor(() => expect(scene().log[scene().log.length - 1]).toMatchObject({ kind: 'info', text: 'Opened lesson.phys' }))
  })

  it('saveProject hands a Blob of the scene as JSON to a download named scene.phys, then marks the scene saved', async () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } })
    const blobs: Blob[] = []
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((b: Blob) => {
        blobs.push(b)
        return 'blob:physlab-test'
      }),
      revokeObjectURL: vi.fn()
    })
    useScene.setState({ dirty: true })
    const expected = JSON.stringify(scene().serialize(), null, 1)

    await files.saveProject()

    expect(anchor.download).toBe('scene.phys')
    expect(anchor.click).toHaveBeenCalled()
    expect(blobs).toHaveLength(1)
    expect(blobs[0].type).toBe('application/json')
    expect(await blobs[0].text()).toBe(expected)
    expect(scene().filePath).toBe('scene.phys')
    expect(scene().dirty).toBe(false)
  })

  it('saveProject adds its link to the page, clicks it and takes it out again', async () => {
    const log: string[] = []
    const anchor = { href: '', download: '', click: vi.fn(() => log.push('click')), remove: vi.fn(() => log.push('remove')) }
    const appendChild = vi.fn(() => log.push('append'))
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild } })
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:physlab-test'), revokeObjectURL: vi.fn() })

    await files.saveProject()

    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(log).toEqual(['append', 'click', 'remove'])
  })

  it('saveProject revokes its object URL only once the timers run, so the download can start first', async () => {
    vi.useFakeTimers()
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:physlab-test'), revokeObjectURL })

    await files.saveProject()
    expect(revokeObjectURL).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:physlab-test')
  })
})
