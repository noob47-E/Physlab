// 3D-2: the black 3-D canvas. A GPU object freed in an effect's cleanup is freed a little later, and StrictMode's second
// mount of the same object calls that off, so nothing on screen is ever disposed (render/releaseLater.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keep, releasePending, releaseSoon } from '../src/renderer/src/render/releaseLater'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('freeing a GPU object later, unless it is mounted again', () => {
  it('a real unmount frees it, once, after the wait', () => {
    const geo = { dispose: vi.fn() }
    releaseSoon(geo, (g) => g.dispose())
    releaseSoon(geo, (g) => g.dispose())
    expect(releasePending(geo)).toBe(true)
    expect(geo.dispose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60)
    expect(geo.dispose).toHaveBeenCalledTimes(1)
    expect(releasePending(geo)).toBe(false)
  })
  it("StrictMode's mount, cleanup, mount keeps it: the second mount calls the release off", () => {
    const geo = { dispose: vi.fn() }
    keep(geo)
    releaseSoon(geo, (g) => g.dispose())
    keep(geo)
    vi.advanceTimersByTime(1000)
    expect(geo.dispose).not.toHaveBeenCalled()
    expect(releasePending(geo)).toBe(false)
  })
  it('new inputs give a new object: the old one is freed, the new one kept', () => {
    const old = { dispose: vi.fn() }
    const now = { dispose: vi.fn() }
    keep(old)
    releaseSoon(old, (g) => g.dispose())
    keep(now)
    vi.advanceTimersByTime(60)
    expect(old.dispose).toHaveBeenCalledTimes(1)
    expect(now.dispose).not.toHaveBeenCalled()
  })
})
