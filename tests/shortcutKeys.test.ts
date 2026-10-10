// P-CW8c: the window's keyboard shortcuts, pinned as they behave today. Delete and Backspace act on
// the selection (and Backspace on a drawing's last pick first), Escape cancels a drawing and then
// goes back to Move, Ctrl+A selects what is visible, a letter key picks a tool only on the open
// mode's shelf, and the Sandbox keeps its own Backspace. The handler is driven directly, with the
// real scene and tool stores, as the window listener would drive it. No DOM: the key's target is a
// plain element that is neither a text field nor a button.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Builder } from '../src/renderer/src/core/factory'
import { scene } from '../src/renderer/src/core/store'
import type { ObjId } from '../src/renderer/src/core/types'
import { advanceTool, resetTool, useTool } from '../src/renderer/src/render/tools'
import { useApp } from '../src/renderer/src/app/modes'
import { useSandbox } from '../src/renderer/src/sim/store'
import type { V3 } from '../src/renderer/src/math/vec'

// app/shortcuts.ts pulls in files.ts, which reads the desktop bridge off `window` as it loads. A
// node test has no window, so the import gets globalThis as one, and only for the import itself.
let shortcutKeyDown: (e: KeyboardEvent) => void

beforeAll(async () => {
  vi.stubGlobal('window', globalThis)
  try {
    const keys = await import('../src/renderer/src/app/shortcuts')
    shortcutKeyDown = keys.shortcutKeyDown
  } finally {
    vi.unstubAllGlobals()
  }
})

/** A plain element: not a text field, not a button, so no key is handed to it. */
const PLAIN_TARGET = { tagName: 'DIV' }

/** A key press as the window listener sees it. */
function press(key: string, o: { ctrl?: boolean; shift?: boolean } = {}): void {
  shortcutKeyDown({
    key,
    ctrlKey: !!o.ctrl,
    metaKey: false,
    shiftKey: !!o.shift,
    target: PLAIN_TARGET,
    defaultPrevented: false,
    preventDefault() {}
  } as unknown as KeyboardEvent)
}

/** A point placed before the drawing began (its own undo step, as the Point tool makes it), not selected. */
function placeEarlier(p: V3): ObjId {
  const b = new Builder()
  const pt = b.point(p)
  b.commit(false)
  return pt.id
}

/** A click on empty space with a drawing tool: the point is made, remembered as the tool's own, and picked. */
function clickEmpty(p: V3): ObjId {
  const b = new Builder()
  const pt = b.point(p)
  b.commit(false)
  useTool.setState((t) => ({ created: [...t.created, pt.id] }))
  const next = [...useTool.getState().picks, pt.id]
  useTool.setState({ picks: next })
  advanceTool(scene().tool, next)
  return pt.id
}

const has = (id: ObjId) => !!scene().objects[id]

beforeEach(() => {
  scene().newScene()
  resetTool()
  scene().setTool('select')
  scene().select([])
  useApp.setState({ mode: 'vectors' })
  useSandbox.getState().select(null)
})

describe('Delete and Backspace with a selection and no drawing', () => {
  it('(a) Delete removes the selected objects and nothing else', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    const C = placeEarlier([2, 0, 0])
    scene().select([A, B])
    press('Delete')
    expect(has(A)).toBe(false)
    expect(has(B)).toBe(false)
    expect(has(C)).toBe(true)
  })

  it('Backspace with no drawing in progress also removes the selection', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    scene().select([A])
    press('Backspace')
    expect(has(A)).toBe(false)
    expect(has(B)).toBe(true)
  })
})

describe('(b) Backspace while a drawing has picks steps back one pick', () => {
  it('removes only the last pick, and an earlier unrelated selection survives that press', () => {
    scene().setTool('triangle')
    const C = placeEarlier([9, 9, 0])
    scene().select([C])
    const P = clickEmpty([0, 0, 0])
    const Q = clickEmpty([1, 0, 0])
    press('Backspace')
    expect(has(Q)).toBe(false)
    expect(has(P)).toBe(true)
    expect(useTool.getState().picks).toEqual([P])
    expect(scene().selection).toEqual([C])
    expect(has(C)).toBe(true)
  })

  it('a one-pick drawing: the first Backspace ends it, removes the pick it made, and keeps the selection', () => {
    scene().setTool('line')
    const A = placeEarlier([0, 0, 0])
    scene().select([A])
    const P = clickEmpty([3, 0, 0])
    press('Backspace')
    expect(useTool.getState().picks).toEqual([])
    expect(has(P)).toBe(false)
    expect(scene().selection).toEqual([A])
    expect(has(A)).toBe(true)
  })
})

describe('(c) Escape cancels a drawing, then goes back to Move', () => {
  it('the first Escape cancels the drawing; the second sets the tool to select and empties the selection', () => {
    scene().setTool('triangle')
    const C = placeEarlier([9, 9, 0])
    scene().select([C])
    const P = clickEmpty([0, 0, 0])
    const Q = clickEmpty([1, 0, 0])
    press('Escape')
    expect(useTool.getState().picks).toEqual([])
    expect(has(P)).toBe(false)
    expect(has(Q)).toBe(false)
    expect(scene().tool).toBe('triangle')
    expect(scene().selection).toEqual([C])
    press('Escape')
    expect(scene().tool).toBe('select')
    expect(scene().selection).toEqual([])
    expect(has(C)).toBe(true)
  })
})

describe('(d) Ctrl+A selects the visible objects', () => {
  it('selects every object of the drawing that is visible', () => {
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    const C = placeEarlier([2, 0, 0])
    press('a', { ctrl: true })
    expect(new Set(scene().selection)).toEqual(new Set([A, B, C]))
  })
})

describe('(e) a tool letter key picks a tool only when the open mode shows it', () => {
  it('W picks Vector in the Vectors mode; L is ignored there and picks Line in the Geometry mode', () => {
    press('w')
    expect(scene().tool).toBe('vector')
    press('l')
    expect(scene().tool).toBe('vector')
    useApp.setState({ mode: 'shapes' })
    press('l')
    expect(scene().tool).toBe('line')
  })
})

describe('(f) the Sandbox keeps its own Backspace', () => {
  it('Backspace with no sandbox selection leaves the scene objects alone', () => {
    useApp.setState({ mode: 'sandbox' })
    const A = placeEarlier([0, 0, 0])
    const B = placeEarlier([1, 0, 0])
    scene().select([A])
    expect(useSandbox.getState().selection).toBeNull()
    press('Backspace')
    expect(has(A)).toBe(true)
    expect(has(B)).toBe(true)
  })
})

describe('CW8c-1: Backspace after a drawing has ended', () => {
  it('setup: the first Backspace ends a one-pick Line drawing and keeps the earlier selection', () => {
    scene().setTool('line')
    const A = placeEarlier([0, 0, 0])
    scene().select([A])
    const P = clickEmpty([3, 0, 0])
    press('Backspace')
    expect(useTool.getState().picks).toEqual([])
    expect(has(P)).toBe(false)
    expect(scene().selection).toEqual([A])
    expect(has(A)).toBe(true)
  })

  // CW8c-1 [answer may change]: proved, NOT fixed — waits for the owner (09\polish\pro-account\OWNER-APPROVALS.md).
  it.fails('CW8c-1: a second Backspace after a drawing has ended must not delete the earlier selection', () => {
    scene().setTool('line')
    const A = placeEarlier([0, 0, 0])
    scene().select([A])
    clickEmpty([3, 0, 0])
    press('Backspace')
    press('Backspace')
    expect(has(A)).toBe(true)
  })
})
