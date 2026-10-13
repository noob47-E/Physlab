// One switch for every arrow on the Sandbox scene (the owner, 13 Oct 2026: "there should be a way to hide the vector arrows").
// A view choice only: it never changes the physics, and each object's own arrow setting still applies when arrows are shown.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { useSandbox } from '../src/renderer/src/sim/store'

const source = (p: string): string => readFileSync(new URL(`../src/renderer/src/${p}`, import.meta.url), 'utf8')

describe('the Arrows switch', () => {
  it('starts on Show, and Hide turns every arrow off, then Show brings them back', () => {
    expect(useSandbox.getState().arrowsShown).toBe(true)
    useSandbox.getState().setArrowsShown(false)
    expect(useSandbox.getState().arrowsShown).toBe(false)
    useSandbox.getState().setArrowsShown(true)
    expect(useSandbox.getState().arrowsShown).toBe(true)
  })

  it('hiding arrows leaves every body and the world exactly as they were (a view choice, not physics)', () => {
    const before = JSON.stringify({ bodies: useSandbox.getState().bodies, world: useSandbox.getState().world })
    useSandbox.getState().setArrowsShown(false)
    expect(JSON.stringify({ bodies: useSandbox.getState().bodies, world: useSandbox.getState().world })).toBe(before)
    useSandbox.getState().setArrowsShown(true)
  })

  it('the scene draws no arrow at all when the switch says Hide, and the World section has the switch', () => {
    expect(source('render/sandbox/Arrows.tsx')).toMatch(/const shown = useSandbox\(\(s\) => s\.arrowsShown\)\s*\n\s*if \(!shown\) return null/)
    const world = source('panels/sandbox/WorldSection.tsx')
    expect(world).toMatch(/<label>Arrows<\/label>/)
    expect(world).toMatch(/setArrowsShown\(true\)[\s\S]*Show[\s\S]*setArrowsShown\(false\)[\s\S]*Hide/)
  })
})
