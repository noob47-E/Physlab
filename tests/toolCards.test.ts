// Every tool has a card, every card reads plainly, and every animation follows the one pattern.
//
// The registry is joined to the lists that drive the buttons — TOOLS in render/tools.ts, the ADD
// list in panels/Sandbox.tsx, LINK_KINDS in sim/links.ts — so a new tool without a card, or a
// card for a tool that no longer exists, fails here rather than opening an empty card. The
// animations are read as source: the colour and keyframe rules in AUTHORING.md are what keep a
// card looking right in all three themes and standing still under "reduce motion".

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RENDERER_SRC, readSource } from './helpers/repo'
import { TOOL_CARDS } from '../src/renderer/src/app/toolCards/registry'
import { TOOL_GROUP } from '../src/renderer/src/app/toolCards/anims/tools'
import { ADD_GROUP } from '../src/renderer/src/app/toolCards/anims/add'
import { LINK_GROUP } from '../src/renderer/src/app/toolCards/anims/links'
import { Placeholder } from '../src/renderer/src/app/toolCards/anims/Placeholder'
import { BEATS, CURSOR_HOME, LOOP_SECONDS, REDUCED_MOTION_FRAME, VIEW_BOX, appearClass, cursorStops, reducedMotionDelay } from '../src/renderer/src/app/toolCards/animMath'
import { CARD_CLOSERS, POPUP_SELECTOR, TOOL_CARD_DELAY, TOOL_CARD_ID, hideCard, showCard } from '../src/renderer/src/ui/useToolCard'
import { placeTourCard } from '../src/renderer/src/app/layoutMath'
import { TOOLS } from '../src/renderer/src/render/tools'
import { LINK_KINDS } from '../src/renderer/src/sim/links'
import { SHORTCUTS, TOUR } from '../src/renderer/src/app/tour/steps'
import { DEFAULT_SIZE, makeBody } from '../src/renderer/src/sim/store'

const ANIMS = join(RENDERER_SRC, 'app', 'toolCards', 'anims')
const animFiles = readdirSync(ANIMS).filter((n) => n.endsWith('.tsx'))
const css = readSource('src/renderer/src/styles.css')

/** The shapes the Sandbox ADD buttons offer, read from the panel because the list is not exported. */
function sandboxAddShapes(): string[] {
  const src = readSource('src/renderer/src/panels/Sandbox.tsx')
  const block = src.match(/const ADD:[^=]*=\s*\[([\s\S]*?)\n\]/)?.[1]
  expect(block, 'the ADD list in Sandbox.tsx').toBeDefined()
  return [...block!.matchAll(/shape:\s*'([a-z]+)'/g)].map((m) => m[1])
}

describe('the registry covers every button', () => {
  it('has a card for every drawing tool, with the button\'s own label and key', () => {
    for (const t of TOOLS) {
      const card = TOOL_CARDS[`tool:${t.id}`]
      expect(card, t.id).toBeDefined()
      expect(card.title, t.id).toBe(t.label)
      expect(card.shortcut ?? '', t.id).toBe(t.key)
    }
  })

  it('has a card for every Sandbox ADD shape', () => {
    const shapes = sandboxAddShapes()
    expect(shapes.length).toBeGreaterThanOrEqual(9)
    for (const s of shapes) expect(TOOL_CARDS[`add:${s}` as keyof typeof TOOL_CARDS], s).toBeDefined()
  })

  it('has a card for every way of joining two objects', () => {
    for (const k of LINK_KINDS) expect(TOOL_CARDS[`link:${k}`], k).toBeDefined()
  })

  it('has no card for a button that does not exist', () => {
    const valid = new Set([...TOOLS.map((t) => `tool:${t.id}`), ...sandboxAddShapes().map((s) => `add:${s}`), ...LINK_KINDS.map((k) => `link:${k}`)])
    expect(Object.keys(TOOL_CARDS).filter((k) => !valid.has(k))).toEqual([])
  })

  it('is the three groups and nothing else, so three authors never share a file', () => {
    expect(Object.keys(TOOL_CARDS).sort()).toEqual([...Object.keys(TOOL_GROUP), ...Object.keys(ADD_GROUP), ...Object.keys(LINK_GROUP)].sort())
    for (const k of Object.keys(TOOL_GROUP)) expect(k).toMatch(/^tool:/)
    for (const k of Object.keys(ADD_GROUP)) expect(k).toMatch(/^add:/)
    for (const k of Object.keys(LINK_GROUP)) expect(k).toMatch(/^link:/)
  })

  it('draws the two pattern cards for real', () => {
    expect(TOOL_CARDS['tool:point'].Animation).not.toBe(Placeholder)
    expect(TOOL_CARDS['link:rope'].Animation).not.toBe(Placeholder)
  })
})

describe('every sentence reads plainly', () => {
  for (const [key, card] of Object.entries(TOOL_CARDS)) {
    it(`${key}: one plain sentence under 120 characters, ending with a full stop`, () => {
      expect(card.sentence.length).toBeLessThanOrEqual(120)
      expect(card.sentence).toMatch(/\.$/)
      // One sentence, not two: a full stop, question or exclamation mark before the end is a second one.
      expect(card.sentence.slice(0, -1)).not.toMatch(/[.!?](\s|$)/)
      expect(card.sentence).not.toMatch(/\\|_\{|\^\{|[{}<>]|=>/)
      expect(card.sentence.trim()).toBe(card.sentence)
      expect(card.title.length).toBeGreaterThan(0)
      expect(typeof card.Animation).toBe('function')
    })
  }
})

describe('a link card speaks to a pair already chosen', () => {
  // KindCard in panels/Sandbox.tsx is the only place that asks for a `link:` card, and it only
  // shows on the last step of Connect, under "Join A and B with…". A sentence that opened with
  // "Click one object, then another" was telling the student to do what they had just done.
  it('the Sandbox asks for the link cards from the Connect flow alone', () => {
    const src = readSource('src/renderer/src/panels/Sandbox.tsx')
    expect(src.match(/useToolCard\(`link:/g)).toHaveLength(1)
    expect(src).toMatch(/function KindCard[\s\S]*?useToolCard\(`link:\$\{kind\}`\)/)
  })

  for (const k of LINK_KINDS) {
    it(`link:${k} says what the choice does to the two, not how to pick them`, () => {
      const card = TOOL_CARDS[`link:${k}`]
      expect(card.sentence).not.toMatch(/click/i)
      expect(card.sentence).toMatch(/the two you chose/)
    })
  }
})

describe('the pan gesture is taught the same way everywhere', () => {
  // With the Move tool a left-drag on empty space draws a selection box, and the pan moved to
  // Space + drag (or a right-drag). The hover card, the tour and the shortcuts list are where a
  // student first learns the gesture, and each of them once still said "drag empty space".
  const oldGesture = /drag(ging)? empty space to (pan|move)/i
  const shelfHint = TOOLS.find((t) => t.id === 'select')!.hint[0]

  it("the Move tool's own hint says Space + drag, and mentions the box", () => {
    expect(shelfHint).toMatch(/Space/)
    expect(shelfHint).toMatch(/box/)
    expect(shelfHint).not.toMatch(oldGesture)
  })

  it('the Move card teaches the same gesture as the hint', () => {
    const card = TOOL_CARDS['tool:select']
    expect(card.sentence).toMatch(/hold Space and drag to pan/i)
    expect(card.sentence).toMatch(/box/)
    expect(card.sentence).not.toMatch(oldGesture)
  })

  it('the tour and the shortcuts list agree', () => {
    const drawing = TOUR.find((step) => step.title === 'The drawing')!
    expect(drawing.body).toMatch(/Hold Space and drag to move the view/)
    expect(drawing.body).toMatch(/box/)
    for (const step of TOUR) expect(step.body).not.toMatch(oldGesture)
    for (const card of Object.values(TOOL_CARDS)) expect(card.sentence).not.toMatch(oldGesture)
    const space = SHORTCUTS.find(([key]) => key === 'Space')!
    expect(space[1]).toMatch(/drag to move the view/)
  })
})

describe('the animations follow the one pattern', () => {
  it('scans the folder where the animations live', () => {
    expect(animFiles).toContain('Point.tsx')
    expect(animFiles).toContain('Rope.tsx')
    expect(animFiles).toContain('Placeholder.tsx')
    expect(animFiles).toContain('parts.tsx')
  })

  for (const name of animFiles) {
    const src = readFileSync(join(ANIMS, name), 'utf8')
    it(`${name} colours only through the three tokens`, () => {
      // Attributes and style-object keys alike: `stroke="…"`, `fill={…}` and `style={{ stroke: '…' }}`.
      const colours = [...src.matchAll(/\b(?:fill|stroke|stopColor|color)\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)')\s*\})/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4])
      for (const c of colours) expect(c, name).toMatch(/^(?:none|var\(--(?:accent|text-dim|good)\))$/)
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|currentColor/)
      // No other token either, however it is written: the three are what AUTHORING.md promises reads in every theme.
      for (const v of src.match(/var\(--[a-z0-9-]+\)/g) ?? []) expect(v, name).toMatch(/^var\(--(?:accent|text-dim|good)\)$/)
    })
  }

  // Every card, not just the two patterns: a card without the gesture would show a still picture.
  for (const name of animFiles.filter((n) => n !== 'parts.tsx' && n !== 'Placeholder.tsx')) {
    const src = readFileSync(join(ANIMS, name), 'utf8')
    it(`${name} has a cursor, a click and something that appears`, () => {
      expect(src).toMatch(/<Cursor\b/)
      expect(src).toMatch(/<Click\b/)
      expect(src).toMatch(/tc-appear/)
      expect(src).toMatch(/<Scene\b/)
    })
  }

  it('draws in the 160×100 view box the card is sized for', () => {
    expect(VIEW_BOX).toBe('0 0 160 100')
    expect(readFileSync(join(ANIMS, 'parts.tsx'), 'utf8')).toMatch(/viewBox=\{VIEW_BOX\}/)
  })

  it('shows a two-click tool as two clicks: the rope card clicks both ends', () => {
    const rope = readFileSync(join(ANIMS, 'Rope.tsx'), 'utf8')
    expect(rope.match(/<Click\b/g)).toHaveLength(2)
    expect(rope).toMatch(/<Click[^>]*second/)
    expect(rope).toMatch(/tc-appear tc-late/)
  })

  it('takes away what a click removes: the deleted object and the moved point vanish', () => {
    // A solid disc left under the dashed outline read as "selected"; a point left where the drag
    // began read as a copy. Both go with the first click.
    const del = readFileSync(join(ANIMS, 'Delete.tsx'), 'utf8')
    expect(del).toMatch(/<circle className="tc-vanish"[^>]*fill="var\(--text-dim\)"/)
    const move = readFileSync(join(ANIMS, 'Move.tsx'), 'utf8')
    expect(move).toMatch(/<circle className="tc-vanish"[^>]*fill="var\(--text-dim\)"/)
    expect(move).toMatch(/tc-appear tc-late/)
  })

  it('says the cone stands, because the Sandbox adds it upright and it stays that way', () => {
    // No tilt from makeBody, and the centre of mass (a quarter of the height up) sits well inside
    // the base: a cone that "tips onto its side" by itself would be a promise the engine breaks.
    expect(makeBody('cone', 'Cone').rotation).toEqual([0, 0, 0])
    const [radius, height] = DEFAULT_SIZE.cone
    expect(height / 4).toBeLessThan(radius)
    expect(ADD_GROUP['add:cone'].sentence).toMatch(/stands on its base/)
    expect(ADD_GROUP['add:cone'].sentence).not.toMatch(/which tips/)
  })
})

describe('the cursor is steered by custom properties, not by a keyframe per card', () => {
  it('rests at home, then goes to the click', () => {
    expect(cursorStops([[84, 54]])).toEqual({ '--tc-a': '14px 10px', '--tc-b': '84px 54px' })
    expect(CURSOR_HOME).toEqual([14, 10])
  })

  it('takes a second click and a different home', () => {
    expect(cursorStops([[44, 66], [124, 18]], [150, 90])).toEqual({ '--tc-a': '150px 90px', '--tc-b': '44px 66px', '--tc-c': '124px 18px' })
  })

  it('marks what belongs to the second click', () => {
    expect(appearClass()).toBe('tc-appear')
    expect(appearClass(true)).toBe('tc-appear tc-late')
  })
})

describe('the stylesheet carries the shared loop', () => {
  const start = css.indexOf('/* ---------- Tool cards ---------- */')
  const end = css.indexOf('/* ---------- Smaller screens ---------- */')
  const section = css.slice(start, end)

  it('has a fenced Tool cards section inside the components layer', () => {
    expect(start).toBeGreaterThan(css.indexOf('@layer components {'))
    expect(end).toBeGreaterThan(start)
    expect(end).toBeLessThan(css.indexOf('} /* end @layer components */'))
  })

  it('declares the four keyframes, once each, on the 2.5 s loop', () => {
    for (const k of ['tc-cursor', 'tc-ripple', 'tc-appear', 'tc-vanish']) {
      expect(css.match(new RegExp(`@keyframes ${k} \\{`, 'g')), k).toHaveLength(1)
      expect(section).toMatch(new RegExp(`animation-name: ${k};`))
    }
    expect(section).toMatch(new RegExp(`animation-duration: ${LOOP_SECONDS}s;`))
    expect(section).toMatch(/animation-iteration-count: infinite;/)
  })

  it('clicks where animMath says the beats are', () => {
    // The keyframe percentages and BEATS describe the same loop; an author reads one, the browser the other.
    const cursor = section.match(/@keyframes tc-cursor \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(cursor).toContain(`${BEATS.firstClick * 100}%`)
    expect(cursor).toContain(`${BEATS.secondClick * 100}%`)
    expect(cursor).toContain(`${BEATS.fade * 100}%`)
    const ripple = section.match(/@keyframes tc-ripple \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(ripple).toContain(`${BEATS.firstClick * 100}%`)
    expect(ripple).toContain(`${BEATS.secondClick * 100}%`)
    // What vanishes is whole until the first click and gone well before the frozen frame.
    const vanish = section.match(/@keyframes tc-vanish \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(vanish).toMatch(new RegExp(`${BEATS.firstClick * 100}% \\{\\s*opacity: 1;`))
    expect(vanish).toMatch(/36%,\s*100% \{\s*opacity: 0;/)
  })

  it('freezes on a telling frame when the OS asks for less motion', () => {
    const reduced = section.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)?.[0]
    expect(reduced).toBeDefined()
    expect(reduced).toMatch(/animation-play-state: paused;/)
    expect(reduced).toContain(`animation-delay: ${reducedMotionDelay()};`)
    // Every shared keyframe is held, or a vanished object would come back on the still frame.
    for (const k of ['tc-cursor', 'tc-ripple', 'tc-appear', 'tc-vanish']) expect(reduced, k).toContain(`.${k}`)
    expect(reducedMotionDelay()).toBe('-2.1s')
    // Past the second click and its ripple, before the fade: the result is on screen.
    expect(REDUCED_MOTION_FRAME).toBeGreaterThan(BEATS.secondClick + 0.18)
    expect(REDUCED_MOTION_FRAME).toBeLessThan(BEATS.fade)
  })

  const zOf = (selector: string): number => {
    const z = css.match(new RegExp(`${selector.replace(/[.]/g, '\\.')} \\{[^}]*z-index: (\\d+)`))?.[1]
    expect(z, `${selector} has a z-index`).toBeDefined()
    return Number(z)
  }

  it('draws over the command bar\'s example list, under the tour, and out of the pointer\'s way', () => {
    const card = section.match(/\.tool-card \{[^}]*\}/)?.[0] ?? ''
    expect(card).toMatch(/position: fixed;/)
    expect(card).toMatch(/pointer-events: none;/)
    const z = Number(card.match(/z-index: (\d+)/)?.[1])
    // The list opens whenever the bar is focused, which is most of the time; at 40 the card was under it.
    expect(z).toBeGreaterThan(zOf('.suggest'))
    expect(z).toBeLessThan(zOf('.tour-backdrop'))
    expect(card).not.toMatch(/#[0-9a-f]{3,8}/i)
  })

  it('never covers a menu: no card opens while one is on screen, and the selector names real classes', () => {
    for (const sel of POPUP_SELECTOR.split(',').map((s) => s.trim())) {
      expect(sel).toMatch(/^\.[a-z-]+$/)
      expect(css, sel).toMatch(new RegExp(`\n${sel.replace('.', '\\.')} \\{`))
      expect(readSource('src/renderer/src/app/TopBar.tsx') + readSource('src/renderer/src/ui/ContextMenu.tsx')).toContain(`className="${sel.slice(1)}`)
    }
    expect(POPUP_SELECTOR).not.toContain('.suggest')
  })
})

describe('the card opens late and closes for its own button only', () => {
  const box = { left: 100, top: 40, width: 50, height: 36 }

  it('waits half a second, long enough that a pass across the shelf opens nothing', () => {
    expect(TOOL_CARD_DELAY).toBe(500)
  })

  it('shows the card that was hovered', () => {
    expect(showCard('tool:point', box)).toEqual({ key: 'tool:point', anchor: box })
  })

  it('ignores a late leave from the previous button', () => {
    const shown = showCard('tool:segment', box)
    expect(hideCard(shown, 'tool:point')).toBe(shown)
    expect(hideCard(shown, 'tool:segment')).toBeNull()
  })

  it('closes whatever is showing on Esc, and is calm about nothing showing', () => {
    expect(hideCard(showCard('tool:point', box))).toBeNull()
    expect(hideCard(null, 'tool:point')).toBeNull()
    expect(hideCard(null)).toBeNull()
  })

  it('closes when its button may have moved: a resize, or a scroll anywhere, even inside a panel', () => {
    // The Sandbox ADD buttons sit in a scrolling panel; its scroll never bubbles to the document,
    // so the listener has to be a capture one, and pointerleave never fires for a scroll.
    expect(CARD_CLOSERS).toContainEqual({ on: 'window', type: 'resize', capture: false })
    expect(CARD_CLOSERS).toContainEqual({ on: 'document', type: 'scroll', capture: true })
    expect(CARD_CLOSERS).toContainEqual({ on: 'window', type: 'blur', capture: false })
    const host = readSource('src/renderer/src/ui/ToolCard.tsx')
    expect(host).toMatch(/for \(const c of CARD_CLOSERS\) .*addEventListener\(c\.type, close, c\.capture\)/)
    expect(host).toMatch(/for \(const c of CARD_CLOSERS\) .*removeEventListener\(c\.type, close, c\.capture\)/)
  })

  it('is what its button is described by, for a reader, and only while it shows', () => {
    const host = readSource('src/renderer/src/ui/ToolCard.tsx')
    expect(host).toMatch(/id=\{TOOL_CARD_ID\} className="tool-card" role="tooltip"/)
    expect(TOOL_CARD_ID).toBe('tool-card')
    const hook = readSource('src/renderer/src/ui/useToolCard.ts')
    expect(hook).toContain("'aria-describedby': shownHere ? TOOL_CARD_ID : undefined")
  })
})

describe('the card stays on screen', () => {
  const win = { w: 1366, h: 768 }
  const card = { w: 240, h: 220 }

  it('sits under a shelf button, in line with its left edge', () => {
    const p = placeTourCard({ left: 300, top: 44, width: 50, height: 36 }, card, win, 8)
    expect(p).toEqual({ left: 300, top: 88 })
  })

  it('slides left for a button at the top-right corner', () => {
    const p = placeTourCard({ left: 1330, top: 44, width: 36, height: 36 }, card, win, 8)
    expect(p.left + card.w + 8).toBeLessThanOrEqual(win.w)
    expect(p.top).toBe(88)
  })

  it('goes above a button near the bottom, as the Sandbox ADD buttons will be', () => {
    const p = placeTourCard({ left: 20, top: 720, width: 60, height: 28 }, card, win, 8)
    expect(p.top + card.h).toBeLessThanOrEqual(720 - 8)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })
})
