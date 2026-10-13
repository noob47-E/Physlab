// The Sandbox in colour (P28 L5). Every moving body of an experiment was a shade of grey — steel,
// aluminium, lead, concrete — in all four themes, so a scene of three balls was three grey discs.
// Moving bodies now take their colours from eight theme tokens, in order, and each theme gives
// those tokens its own values: deep inks on Light, brighter tones on the three dark themes.
//
// What is checked here is what a student sees: each colour stands out from the canvas it is drawn
// on and is readable as the text of the body's label chip, the first five stay apart for every
// kind of colour vision (no preset moves more than five bodies), all eight stay apart for normal
// eyes, and none of them is mistaken for the floor. Then that the presets and the Add buttons
// hand them out, and that the colour picker and the drawing can read them.

import { beforeEach, describe, expect, it } from 'vitest'
import { colourDistance, formatColour, parseColour, type Vision } from '../src/renderer/src/render/colourMix'
import { BLOCKS, THEME_CSS as css, contrast, themeBlock, tokenValue } from './helpers/theme'
import { colourNote, colourToken, drawnColour, nextPaletteColour, paintBodies, paletteColour, pickerColour, SIM_PALETTE } from '../src/renderer/src/sim/palette'
import { themeColor } from '../src/renderer/src/app/theme'
import { LINK_LOOK } from '../src/renderer/src/render/sandboxLooks'
import { materialById } from '../src/renderer/src/sim/materials'
import { PRESETS } from '../src/renderer/src/sim/presets'
import { makeBody, startingScene, useSandbox } from '../src/renderer/src/sim/store'
import type { BodyDef } from '../src/renderer/src/sim/types'

const THEMES = Object.keys(BLOCKS) as (keyof typeof BLOCKS)[]
const VISIONS: Vision[] = ['normal', 'protanopia', 'deuteranopia', 'tritanopia']
/** The Fix 2 record's scale (tests/contrast.test.ts): about 8 apart reads as two colours. */
const APART = 8
const LINK_TOKENS = [LINK_LOOK.spring.token, LINK_LOOK.rod.token, LINK_LOOK.string.token, LINK_LOOK.rope.token]

/** The label chip's background as it lands on the canvas: --label-bg is see-through. */
function chipBackground(block: string, canvas: string): string {
  const m = /--label-bg:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(block)
  if (!m) throw new Error('no --label-bg')
  const a = Number(m[4])
  const under = parseColour(canvas)!
  return formatColour([1, 2, 3].map((i, k) => (Number(m[i]) / 255) * a + under[k] * (1 - a)) as [number, number, number])
}

describe('the Sandbox palette in the stylesheet', () => {
  it('has eight colours, each declared in all four themes', () => {
    expect(SIM_PALETTE).toHaveLength(8)
    expect(new Set(SIM_PALETTE).size).toBe(8)
    for (const theme of THEMES) {
      const block = themeBlock(css, BLOCKS[theme])
      for (const t of [...SIM_PALETTE, ...LINK_TOKENS]) expect(tokenValue(block, t), `${theme} ${t}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('stands every colour out from the canvas (3:1) and makes it readable as a label (4.5:1)', () => {
    for (const theme of THEMES) {
      const block = themeBlock(css, BLOCKS[theme])
      const canvas = tokenValue(block, '--canvas-bg')!
      const chip = chipBackground(block, canvas)
      for (const t of SIM_PALETTE) {
        const c = tokenValue(block, t)!
        expect(contrast(c, canvas), `${theme} ${t} ${c} on the canvas ${canvas}`).toBeGreaterThanOrEqual(3)
        // A body's live label (speed, height, KE) is written in its own colour.
        expect(contrast(c, chip), `${theme} ${t} ${c} on a label ${chip}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('keeps the first five apart for every kind of colour vision, and all eight apart for normal eyes', () => {
    for (const theme of THEMES) {
      const block = themeBlock(css, BLOCKS[theme])
      const set = SIM_PALETTE.map((t) => [t, tokenValue(block, t)!] as const)
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
          const visions = i < 5 && j < 5 ? VISIONS : (['normal'] as Vision[])
          for (const v of visions) {
            const d = colourDistance(set[i][1], set[j][1], v)
            expect(d, `${theme} ${v}: ${set[i][0]} ${set[i][1]} and ${set[j][0]} ${set[j][1]}`).toBeGreaterThanOrEqual(APART)
          }
        }
      }
    }
  })

  it('never paints a body the colour of the floor it stands on', () => {
    const floors = ['concrete', 'ice'].map((m) => materialById(m).color)
    for (const theme of THEMES) {
      const block = themeBlock(css, BLOCKS[theme])
      for (const t of SIM_PALETTE) for (const f of floors) expect(colourDistance(tokenValue(block, t)!, f), `${theme} ${t} against ${f}`).toBeGreaterThanOrEqual(APART)
    }
  })

  it('draws the spring, the rod, the string and the rope in colours of their own that show on the canvas', () => {
    for (const theme of THEMES) {
      const block = themeBlock(css, BLOCKS[theme])
      const canvas = tokenValue(block, '--canvas-bg')!
      const values = LINK_TOKENS.map((t) => tokenValue(block, t)!)
      values.forEach((c, i) => expect(contrast(c, canvas), `${theme} ${LINK_TOKENS[i]} ${c}`).toBeGreaterThanOrEqual(3))
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(colourDistance(values[i], values[j]), `${theme} ${LINK_TOKENS[i]} and ${LINK_TOKENS[j]}`).toBeGreaterThanOrEqual(APART)
    }
  })
})

describe('reading a body colour', () => {
  const read = (t: string) => ({ '--sim-c3': '#7ccd8e', '--sim-c1': '#abc' })[t] ?? ''

  it('names a theme colour by its token, and only a well-formed one', () => {
    expect(paletteColour(0)).toBe('var(--sim-c1)')
    expect(paletteColour(7)).toBe('var(--sim-c8)')
    expect(paletteColour(8)).toBe('var(--sim-c1)')
    expect(colourToken('var(--sim-c3)')).toBe('--sim-c3')
    expect(colourToken('#adb5bd')).toBeUndefined()
    expect(colourToken('var(--sim-c3, red)')).toBeUndefined()
    expect(colourToken('var(sim-c3)')).toBeUndefined()
  })

  it('draws a theme colour as the theme gives it and any other colour as it is', () => {
    expect(drawnColour('var(--sim-c3)', read)).toBe('#7ccd8e')
    expect(drawnColour('#ff0000', read)).toBe('#ff0000')
    // A token the stylesheet does not have is drawn in a grey, never in black or an exception.
    expect(drawnColour('var(--sim-c9)', read)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('hands the colour picker the six-digit colour it insists on', () => {
    // <input type="color"> shows black for anything but #rrggbb: a theme colour, a short hex.
    expect(pickerColour('var(--sim-c3)', read)).toBe('#7ccd8e')
    expect(pickerColour('var(--sim-c1)', read)).toBe('#aabbcc')
    expect(pickerColour('#ABCDEF', read)).toBe('#abcdef')
    expect(pickerColour('not a colour', read)).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('says where a colour comes from: the theme, the material, or the student', () => {
    const ball = makeBody('sphere', 'A')
    expect(colourNote({ ...ball, color: 'var(--sim-c2)' })).toBe('follows the theme')
    expect(colourNote({ ...ball, color: materialById(ball.material).color })).toBe(`the colour of ${materialById(ball.material).label.toLowerCase()}`)
    expect(colourNote({ ...ball, color: '#123456' })).toBe('custom')
  })
})

describe('who gets which colour', () => {
  beforeEach(() => useSandbox.getState().loadSandbox())

  it('paints the moving bodies in palette order and leaves fixed ones in their material', () => {
    const bodies = [makeBody('ground', 'Floor'), makeBody('sphere', 'A'), makeBody('ramp', 'R'), makeBody('box', 'B'), makeBody('box', 'Post')]
    bodies[4] = { ...bodies[4], motion: 'static' }
    const painted = paintBodies(bodies)
    expect(painted.map((b) => b.color)).toEqual([bodies[0].color, 'var(--sim-c1)', bodies[2].color, 'var(--sim-c2)', bodies[4].color])
    // Only the colour changes: the physics of every body is exactly what it was.
    painted.forEach((b, i) => expect({ ...b, color: '' }).toEqual({ ...bodies[i], color: '' }))
  })

  it('gives every experiment distinct colours for the bodies that move, and the floor its material', () => {
    for (const p of PRESETS) {
      const { bodies } = p.build()
      const moving = bodies.filter((b) => b.motion === 'dynamic')
      expect(moving.map((b) => b.color), p.id).toEqual(moving.map((_, i) => paletteColour(i)))
      for (const b of bodies.filter((x) => x.motion !== 'dynamic')) expect(b.color, `${p.id} ${b.name}`).toBe(materialById(b.material).color)
      // No experiment moves more bodies than there are colours.
      expect(moving.length, p.id).toBeLessThanOrEqual(SIM_PALETTE.length)
    }
  })

  it('gives a new moving body the next colour nobody has, and a new fixed one its material', () => {
    const start = startingScene()
    expect(start.filter((b) => b.motion === 'dynamic').map((b) => b.color)).toEqual(['var(--sim-c1)', 'var(--sim-c2)'])
    expect(nextPaletteColour(start)).toBe('var(--sim-c3)')
    const ball = useSandbox.getState().addBody('sphere')
    expect(ball.color).toBe('var(--sim-c3)')
    const wall = useSandbox.getState().addBody('wall')
    expect(wall.color).toBe(materialById(wall.material).color)
    // Once all eight are taken, the colours go round again rather than running out.
    const crowd: BodyDef[] = SIM_PALETTE.map((_, i) => ({ ...makeBody('sphere', `S${i}`), color: paletteColour(i) }))
    expect(SIM_PALETTE.map((t) => `var(${t})`)).toContain(nextPaletteColour(crowd))
  })

  it('still lets a chosen material bring its own colour, as the colour row promises', () => {
    const ball = useSandbox.getState().addBody('sphere')
    useSandbox.getState().updateBody(ball.id, { material: 'rubber' })
    expect(useSandbox.getState().bodies.find((b) => b.id === ball.id)!.color).toBe(materialById('rubber').color)
  })
})

describe('the colour row on a page with no stylesheet', () => {
  // The Sandbox panel is also rendered on the server and in tests with no DOM (the replay lock's); the
  // colour row reads a theme token there, and must come back with the stand-in, not a ReferenceError.
  it('themeColor gives its fallback when there is no document to ask', () => {
    expect(typeof document).toBe('undefined')
    expect(themeColor('--sim-c1')).toBe('#888888')
    expect(themeColor('--sim-c1', '#123456')).toBe('#123456')
    expect(pickerColour('var(--sim-c1)', themeColor)).toBe('#888888')
  })
})
