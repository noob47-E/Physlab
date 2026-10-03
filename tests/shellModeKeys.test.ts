// P-FIX-SHELL SB: a new mode starts every tool afresh (H1), a tool letter key picks only a tool the
// open mode's shelf shows (H3), and "Move tail to the origin" is offered only where it can act (H4).

import { describe, expect, it } from 'vitest'
import { scene } from '../src/renderer/src/core/store'
import { Builder } from '../src/renderer/src/core/factory'
import { useTool } from '../src/renderer/src/render/tools'
import { enterMode } from '../src/renderer/src/app/layout'
import { menuForObject } from '../src/renderer/src/app/contextActions'
import { toolForKey } from '../src/renderer/src/app/toolKeys'
import { modeById } from '../src/renderer/src/app/modes'

describe('H1: entering a mode clears the tools', () => {
  it('drops a half-made drawing even when the new mode has the same tool', () => {
    enterMode('shapes')
    scene().setTool('segment')
    useTool.setState({ picks: ['A'], firstTail: [1, 2, 0] })
    enterMode('vectors')
    expect(useTool.getState().picks).toEqual([])
    expect(useTool.getState().firstTail).toBeNull()
  })
})

describe('H3: letter keys follow the mode shelf', () => {
  it('picks a tool the shelf shows and ignores one it does not', () => {
    expect(toolForKey('p', modeById('gpu').tools)).toBeNull()
    expect(toolForKey('p', modeById('lab').tools)).toBeNull()
    expect(toolForKey('p', modeById('shapes').tools)).toBe('point')
    expect(toolForKey('P', modeById('shapes').tools)).toBe('point')
  })
})

describe('H4: Move tail to the origin', () => {
  it('is offered for a free vector and hidden for a calculated one', () => {
    enterMode('vectors')
    const b = new Builder()
    const a = b.vector({ kind: 'free', tail: [1, 1, 0], comp: [2, 0, 0] }, { name: 'A' })
    const r = b.vector({ kind: 'expr', expr: 'A + A' }, { name: 'R' })
    b.commit()
    const has = (id: string) => menuForObject(id).flatMap((g) => g.items).some((i) => i.label === 'Move tail to the origin')
    expect(has(a.id)).toBe(true)
    expect(has(r.id)).toBe(false)
  })
})
