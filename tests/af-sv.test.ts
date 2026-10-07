import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { blankSceneFile, scene, useScene } from '../src/renderer/src/core/store'
import { describeWork, discardRecovery, hasWork, restoreRecovery, startAutosave, useRecovery } from '../src/renderer/src/app/autosave'
import { emptyTable } from '../src/renderer/src/lab/labStore'
import type { SceneFile, SceneObject } from '../src/renderer/src/core/types'

const KEY = 'physlab.autosave'

const point = (id: string, name: string, p: [number, number, number]): SceneObject =>
  ({ id, name, type: 'point', def: { kind: 'free', p }, visible: true, locked: false, color: '#000', showLabel: true }) as SceneObject

let storage: Map<string, string>
let windowObj: { addEventListener: Mock; removeEventListener: Mock; physlab?: object }
let stopAutosave: (() => void) | null = null

const flushPromises = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

beforeEach(() => {
  stopAutosave = null
  vi.useFakeTimers()
  storage = new Map<string, string>()

  const listeners = new Map<string, (() => void)[]>()
  windowObj = {
    addEventListener: vi.fn((event: string, fn: () => void) => {
      const arr = listeners.get(event) ?? []
      arr.push(fn)
      listeners.set(event, arr)
    }),
    removeEventListener: vi.fn((event: string, fn: () => void) => {
      const arr = listeners.get(event) ?? []
      const i = arr.indexOf(fn)
      if (i >= 0) arr.splice(i, 1)
    })
  }

  vi.stubGlobal('window', windowObj)
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void storage.set(key, value)),
    removeItem: vi.fn((key: string) => void storage.delete(key))
  })

  useRecovery.setState({ found: null, waiting: [] })
  scene().newScene()
})

afterEach(() => {
  stopAutosave?.()
  stopAutosave = null
  useRecovery.setState({ found: null, waiting: [] })
  scene().newScene()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('S1: a pending recovery copy is never overwritten (localStorage path)', () => {
  it('keeps the found copy while the new session autosaves', async () => {
    const blank = blankSceneFile()
    const foundFile: SceneFile = { ...blank, objects: [point('old', 'Old', [0, 0, 0])] }
    storage.set(KEY, JSON.stringify({ savedAt: 1000, path: null, file: foundFile }))

    stopAutosave = startAutosave()
    await flushPromises()
    expect(useRecovery.getState().found?.file.objects.map((o) => o.name)).toEqual(['Old'])

    scene().addObjects([point('new', 'New', [1, 2, 0])])
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()

    const raw = storage.get(KEY)
    expect(raw).toBeTruthy()
    const store = JSON.parse(raw!) as { found?: { file: { objects: { name: string }[] } }; latest?: unknown }
    expect(store.found?.file.objects.map((o) => o.name)).toEqual(['Old'])
    expect(hasWork(store.found!.file as SceneFile)).toBe(true)
  })
})

describe('S1: a pending recovery copy is never overwritten (desktop bridge path)', () => {
  it('keeps the found copy while the new session autosaves', async () => {
    const bridgeStore = new Map<string, string>()
    windowObj.physlab = {
      autosaveWrite: vi.fn(async (content: string) => {
        bridgeStore.set('autosave', content)
        return true
      }),
      autosaveRead: vi.fn(async () => bridgeStore.get('autosave') ?? null),
      autosaveClear: vi.fn(async () => {
        bridgeStore.delete('autosave')
        return true
      }),
      setDirty: vi.fn()
    }

    const blank = blankSceneFile()
    const foundFile: SceneFile = { ...blank, objects: [point('old', 'Old', [0, 0, 0])] }
    bridgeStore.set('autosave', JSON.stringify({ savedAt: 5678, path: 'old.phys', file: foundFile }))

    stopAutosave = startAutosave()
    await flushPromises()
    expect(useRecovery.getState().found?.file.objects.map((o) => o.name)).toEqual(['Old'])

    scene().addObjects([point('new', 'New', [2, 3, 0])])
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()

    const raw = bridgeStore.get('autosave')
    expect(raw).toBeTruthy()
    const store = JSON.parse(raw!) as { found?: { file: { objects: { name: string }[] } }; latest?: unknown }
    expect(store.found?.file.objects.map((o) => o.name)).toEqual(['Old'])
    expect(hasWork(store.found!.file as SceneFile)).toBe(true)
  })
})

describe('describeWork: empty lab tables', () => {
  it('names an added empty lab table instead of leaving the description empty', () => {
    const blank = blankSceneFile()
    const extra = emptyTable('Added table')
    const file: SceneFile = { ...blank, lab: [...blank.lab!, extra] }
    expect(hasWork(file)).toBe(true)
    expect(describeWork(file)).toBe('1 empty table')
  })

})

const names = (s: { file: SceneFile } | null | undefined): string[] => (s?.file.objects ?? []).map((o) => o.name)
const stored = (): { found: { file: SceneFile } | null; waiting?: { file: SceneFile }[]; latest: { file: SceneFile } | null } =>
  JSON.parse(storage.get(KEY)!)

describe('R1: Restore never throws away work done since start-up', () => {
  it('restoring while there is new work brings the old copy back and keeps the new work as the next copy', async () => {
    storage.set(KEY, JSON.stringify({ savedAt: 1000, path: null, file: { ...blankSceneFile(), objects: [point('old', 'Old', [0, 0, 0])] } }))
    stopAutosave = startAutosave()
    await flushPromises()
    scene().addObjects([point('new', 'New', [1, 2, 0])])

    restoreRecovery()
    expect(scene().serialize().objects.map((o) => o.name)).toEqual(['Old'])
    expect(scene().dirty).toBe(true)
    expect(names(useRecovery.getState().found)).toEqual(['New'])
    expect(useRecovery.getState().found?.setAside).toBe(true)
    await flushPromises()
    expect(names(stored().found)).toEqual(['New'])

    // Going back to the set-aside work sets the restored copy aside in its turn.
    restoreRecovery()
    expect(scene().serialize().objects.map((o) => o.name)).toEqual(['New'])
    expect(names(useRecovery.getState().found)).toEqual(['Old'])
  })

  it('restoring with no new work leaves nothing on the strip; discarding brings the next copy forward', async () => {
    const at = (t: number, n: string) => ({ savedAt: t, path: null, file: { ...blankSceneFile(), objects: [point(n, n, [0, 0, 0])] } })
    storage.set(KEY, JSON.stringify({ found: at(1000, 'A'), waiting: [at(500, 'B')], latest: null }))
    stopAutosave = startAutosave()
    await flushPromises()
    expect(names(useRecovery.getState().found)).toEqual(['A'])

    discardRecovery()
    expect(names(useRecovery.getState().found)).toEqual(['B'])
    await flushPromises()
    expect(names(stored().found)).toEqual(['B'])

    restoreRecovery()
    expect(scene().serialize().objects.map((o) => o.name)).toEqual(['B'])
    expect(useRecovery.getState().found).toBeNull()
  })
})

describe('S1: ignoring the strip and closing again keeps BOTH copies', () => {
  it('the crashed copy and the next session\'s unsaved work are both offered at the following start, newest first', async () => {
    storage.set(KEY, JSON.stringify({ savedAt: 1000, path: null, file: { ...blankSceneFile(), objects: [point('old', 'Old', [0, 0, 0])] } }))
    stopAutosave = startAutosave()
    await flushPromises()
    scene().addObjects([point('new', 'New', [1, 2, 0])])
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    stopAutosave()
    stopAutosave = null

    // The app closes with the strip still ignored; the next start reads what was left.
    useRecovery.setState({ found: null, waiting: [] })
    scene().newScene()
    stopAutosave = startAutosave()
    await flushPromises()
    expect(names(useRecovery.getState().found)).toEqual(['New'])
    expect(useRecovery.getState().waiting.map(names)).toEqual([['Old']])

    // And this session's autosave keeps both.
    scene().addObjects([point('third', 'Third', [0, 1, 0])])
    await vi.advanceTimersByTimeAsync(60_000)
    await flushPromises()
    expect(names(stored().found)).toEqual(['New'])
    expect(stored().waiting?.map(names)).toEqual([['Old']])
    expect(names(stored().latest)).toEqual(['Third'])
  })

  it('nothing is written over the crash copy before start-up has read it (slow desktop read)', async () => {
    const bridgeStore = new Map<string, string>()
    bridgeStore.set('autosave', JSON.stringify({ savedAt: 1000, path: null, file: { ...blankSceneFile(), objects: [point('old', 'Old', [0, 0, 0])] } }))
    let release: () => void = () => {}
    const writes: string[] = []
    windowObj.physlab = {
      autosaveWrite: vi.fn(async (content: string) => void writes.push(content)),
      autosaveWriteSync: vi.fn((content: string) => void writes.push(content)),
      autosaveRead: vi.fn(() => new Promise<string | null>((r) => (release = () => r(bridgeStore.get('autosave') ?? null)))),
      autosaveClear: vi.fn(async () => void writes.push('CLEAR')),
      setDirty: vi.fn()
    }
    stopAutosave = startAutosave()
    scene().addObjects([point('new', 'New', [1, 2, 0])])
    await vi.advanceTimersByTimeAsync(60_000)
    for (const [event, fn] of windowObj.addEventListener.mock.calls) if (event === 'beforeunload') fn()
    useScene.setState({ dirty: false })
    expect(writes).toEqual([])

    release()
    await flushPromises()
    expect(names(useRecovery.getState().found)).toEqual(['Old'])
  })

  it('saving the project for real while a copy waits keeps the copy', async () => {
    storage.set(KEY, JSON.stringify({ savedAt: 1000, path: null, file: { ...blankSceneFile(), objects: [point('old', 'Old', [0, 0, 0])] } }))
    stopAutosave = startAutosave()
    await flushPromises()
    scene().addObjects([point('new', 'New', [1, 2, 0])])
    useScene.setState({ dirty: false })
    await flushPromises()
    expect(names(stored().found)).toEqual(['Old'])
  })
})

describe('saveTextFile revokes the object URL after the download starts', () => {
  it('appends the link, clicks it, and delays revocation by a tick', async () => {
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    const body = { appendChild: vi.fn() }
    vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body })
    vi.stubGlobal('window', {})

    // Import before stubbing URL: dynamic import itself must keep the real URL constructor.
    const files = await import('../src/renderer/src/app/files')

    let revoked: string | null = null
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:physlab-test'),
      revokeObjectURL: vi.fn((url: string) => {
        revoked = url
      })
    })

    const result = await files.saveTextFile('a,b\n1,2', 'readings.csv')

    expect(result).toBe('download')
    expect(anchor.click).toHaveBeenCalled()
    expect(body.appendChild).toHaveBeenCalledWith(anchor)
    expect(anchor.remove).toHaveBeenCalled()
    expect(revoked).toBeNull()

    await vi.runAllTimersAsync()
    expect(revoked).toBe('blob:physlab-test')
  })
})
