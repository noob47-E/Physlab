// SB2: the Sandbox panel is split into one file per section, and the viewport gets one HUD layer with slots. A move:
// nothing a student sees changes. These read the sources as text (as tests/sandbox.test.ts does) and pin the shape.

import { describe, expect, it } from 'vitest'
import { readSource } from './helpers/repo'

const SECTIONS = ['Transport', 'Presets', 'AddRow', 'JoinGuide', 'BodyList', 'Pushes', 'Selected', 'Connections', 'EnergyReadout', 'Recording', 'WorldSection', 'Collisions']

describe('panels/Sandbox.tsx mounts one file per section, in today’s order', () => {
  const panel = readSource('src/renderer/src/panels/Sandbox.tsx')
  it('keeps export function Sandbox (App.tsx imports it)', () => {
    expect(panel).toMatch(/export function Sandbox\(\)/)
  })
  it('mounts the sections in order', () => {
    const at = SECTIONS.map((name) => panel.search(new RegExp(`<${name}[\\s/>]`)))
    expect(at.every((i) => i >= 0), SECTIONS.filter((_, k) => at[k] < 0).join(', ')).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
  })
  it.each(SECTIONS)('%s lives in panels/sandbox/%s.tsx and is exported there', (name) => {
    expect(readSource(`src/renderer/src/panels/sandbox/${name}.tsx`)).toMatch(new RegExp(`export function ${name}\\(`))
    expect(panel).not.toMatch(new RegExp(`^function ${name}\\(`, 'm'))
  })
  it('the shared pieces are in panels/sandbox/common.tsx', () => {
    const common = readSource('src/renderer/src/panels/sandbox/common.tsx')
    for (const name of ['useNum', 'Vec3Row', 'SizeRow', 'Slider', 'Fold']) expect(common, name).toMatch(new RegExp(`export (function|const) ${name}\\b`))
    // foldStore is only Fold's: it lives here, unexported (an export nothing imports fails the dead-code check).
    expect(common).toMatch(/const foldStore = /)
  })
  it('data-tour="play" moved with Transport', () => {
    expect(readSource('src/renderer/src/panels/sandbox/Transport.tsx')).toContain('data-tour="play"')
  })
})

describe('render/Viewport.tsx has one sandbox HUD', () => {
  const viewport = readSource('src/renderer/src/render/Viewport.tsx')
  it('one mount, and no SandboxStrip left', () => {
    expect(viewport.match(/mode === 'sandbox' && <SandboxHud \/>/g)?.length).toBe(1)
    expect(viewport).not.toMatch(/SandboxStrip/)
    expect(viewport).not.toMatch(/Drag an object to place it/)
  })
  it('SandboxHud mounts HudTop, Rail, CardsDock, GraphDock, TapeStrip and Hint, over the canvas without catching its drags', () => {
    const hud = readSource('src/renderer/src/render/sandbox/SandboxHud.tsx')
    for (const slot of ['HudTop', 'Rail', 'CardsDock', 'GraphDock', 'TapeStrip', 'Hint']) expect(hud, slot).toMatch(new RegExp(`<${slot} />`))
    expect(hud).toMatch(/pointer-events-none/)
  })
  it.each(['Rail', 'CardsDock', 'GraphDock', 'TapeStrip'])('%s is a stub that shows nothing yet', (slot) => {
    expect(readSource(`src/renderer/src/render/sandbox/${slot}.tsx`)).toMatch(new RegExp(`export function ${slot}\\([^)]*\\)[^{]*\\{\\s*return null\\s*\\}`))
  })
  it('HudTop and Hint hold today’s clock badge, Home and hint, moved', () => {
    expect(readSource('src/renderer/src/render/sandbox/HudTop.tsx')).toMatch(/Find the objects \(Home\)/)
    expect(readSource('src/renderer/src/render/sandbox/Hint.tsx')).toMatch(/Drag an object to place it/)
  })
})
