// The selection box: dragged with the Move tool over empty space, it takes what it holds whole.
// The rule is pure so that it can be tested without a canvas.

import { describe, expect, it } from 'vitest'
import { insideRect, MARQUEE_MIN_PX, marqueeStarted, normalizeRect, objectInRect, type Rect } from '../src/renderer/src/render/selectMath'
import { isSpaceHeld, markSpaceUsed, pressSpace, releaseSpace, resetSpace } from '../src/renderer/src/render/panKey'

const rect: Rect = { left: 100, top: 100, right: 300, bottom: 250 }

describe('normalizeRect', () => {
  it('is the same box whichever corner the drag started from', () => {
    const down = normalizeRect({ x0: 100, y0: 100, x1: 300, y1: 250 })
    const up = normalizeRect({ x0: 300, y0: 250, x1: 100, y1: 100 })
    const across = normalizeRect({ x0: 300, y0: 100, x1: 100, y1: 250 })
    expect(down).toEqual(rect)
    expect(up).toEqual(rect)
    expect(across).toEqual(rect)
  })
})

describe('insideRect', () => {
  it('includes the edges', () => {
    expect(insideRect({ x: 100, y: 100 }, rect)).toBe(true)
    expect(insideRect({ x: 300, y: 250 }, rect)).toBe(true)
    expect(insideRect({ x: 99, y: 150 }, rect)).toBe(false)
    expect(insideRect({ x: 150, y: 251 }, rect)).toBe(false)
  })
})

describe('objectInRect', () => {
  const inside = { x: 150, y: 150 }
  const alsoInside = { x: 250, y: 200 }
  const outside = { x: 400, y: 150 }

  it('takes a point that is inside', () => {
    expect(objectInRect('point', [inside], rect)).toBe(true)
    expect(objectInRect('point', [outside], rect)).toBe(false)
  })

  it('takes a segment or vector only when both ends are inside', () => {
    expect(objectInRect('segment', [inside, alsoInside], rect)).toBe(true)
    expect(objectInRect('segment', [inside, outside], rect)).toBe(false)
    expect(objectInRect('vector', [inside, alsoInside], rect)).toBe(true)
    expect(objectInRect('vector', [outside, inside], rect)).toBe(false)
  })

  it('takes a circle by its centre and a polygon by every corner', () => {
    expect(objectInRect('circle', [inside], rect)).toBe(true)
    expect(objectInRect('circle', [outside], rect)).toBe(false)
    expect(objectInRect('polygon', [inside, alsoInside, { x: 120, y: 240 }], rect)).toBe(true)
    // A big triangle the box only crosses stays out: the student wanted the points inside it.
    expect(objectInRect('polygon', [inside, alsoInside, outside], rect)).toBe(false)
  })

  it('takes a graph or text by its anchor, and never a number', () => {
    expect(objectInRect('graph', [inside], rect)).toBe(true)
    expect(objectInRect('text', [outside], rect)).toBe(false)
    expect(objectInRect('number', [inside], rect)).toBe(false)
    // Nothing on screen (a graph with no anchor yet) is nothing to select.
    expect(objectInRect('graph', [], rect)).toBe(false)
  })
})

describe('marqueeStarted', () => {
  it('needs a real drag, not the wobble of a click', () => {
    expect(marqueeStarted({ x0: 10, y0: 10, x1: 12, y1: 11 })).toBe(false)
    expect(marqueeStarted({ x0: 10, y0: 10, x1: 10 + MARQUEE_MIN_PX, y1: 10 })).toBe(true)
    expect(marqueeStarted({ x0: 10, y0: 10, x1: 0, y1: 0 })).toBe(true)
  })
})

describe('Space: pan while held, play/pause when tapped', () => {
  it('a tap toggles play', () => {
    pressSpace()
    expect(isSpaceHeld()).toBe(true)
    expect(releaseSpace()).toBe(true)
    expect(isSpaceHeld()).toBe(false)
  })

  it('a press used for a pan does not', () => {
    pressSpace()
    markSpaceUsed()
    expect(releaseSpace()).toBe(false)
  })

  it('a release with no press (the window lost focus) does nothing', () => {
    pressSpace()
    resetSpace()
    expect(isSpaceHeld()).toBe(false)
    expect(releaseSpace()).toBe(false)
    // And a pan marked while Space was not down does not poison the next tap.
    markSpaceUsed()
    pressSpace()
    expect(releaseSpace()).toBe(true)
  })
})
