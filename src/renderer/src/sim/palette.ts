// The colours the Sandbox paints its moving bodies in (P28 L5, "add some colours to the
// Sandbox"). Every body used to take its material's colour, the same in all four themes, and the
// materials an experiment uses most — steel, aluminium, lead, concrete — are greys: a scene of
// three balls was three grey discs, and on the Light canvas a steel one all but vanished.
//
// A moving body now stores a theme colour, `var(--sim-c3)`, and each theme block of styles.css
// gives the eight tokens its own values: deep inks on Light, brighter tones on the dark themes.
// Stored as a CSS reference it is shown as it is by anything styled (the list's swatch, the
// label chip) and follows a theme switch with no edit; whatever draws with three.js reads it
// through `drawnColour`. A colour a student picks is plain hex and stays exactly what they chose.
// Nothing here touches the document: the reader of the stylesheet is handed in, so it is tested
// in node.

import { materialById } from './materials'
import type { BodyDef } from './types'

/**
 * The eight tokens, in the order they are handed out. The first five stay apart for every kind
 * of colour vision (no experiment moves more than five bodies) and all eight for normal eyes;
 * tests/sandboxPalette.test.ts holds every theme to that, to the canvas and to the label chip.
 */
export const SIM_PALETTE = ['--sim-c1', '--sim-c2', '--sim-c3', '--sim-c4', '--sim-c5', '--sim-c6', '--sim-c7', '--sim-c8'] as const

/** The i-th colour of the palette, as a body stores it; it goes round again after the eighth. */
export const paletteColour = (i: number): string => {
  const n = SIM_PALETTE.length
  return `var(${SIM_PALETTE[((Math.trunc(i) % n) + n) % n]})`
}

/** A reference to one token, such as var(--sim-c3), and nothing else: a fallback inside the brackets would hide a misspelt name. */
const TOKEN = /^var\((--[a-z0-9-]+)\)$/

/** The token a body colour names, or undefined for a plain colour. */
export const colourToken = (colour: string): string | undefined => TOKEN.exec(colour.trim())?.[1]

/** What a token the stylesheet does not declare is drawn in: a grey, not black and not a crash. */
const STAND_IN = '#888888'

/** The colour to draw a body in now: its theme token's value, or its own colour as it is. */
export function drawnColour(colour: string, read: (token: string) => string): string {
  const token = colourToken(colour)
  if (!token) return colour
  return read(token).trim() || STAND_IN
}

/**
 * The colour for the panel's colour picker, as the six hex digits `<input type="color">` insists
 * on: handed `var(--sim-c3)`, or even `#abc`, it shows black and a click starts from black.
 */
export function pickerColour(colour: string, read: (token: string) => string): string {
  const shown = drawnColour(colour, read).trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(shown)) return shown
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(shown)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return STAND_IN
}

/**
 * The bodies of a scene with the moving ones painted from the palette, in order. Only the colour
 * changes, so friction, bounce and everything else a material brought stay as they were; a fixed
 * body (floor, ramp, wall, post, wheel) keeps the colour of what it is made of.
 */
export function paintBodies(bodies: BodyDef[]): BodyDef[] {
  let next = 0
  return bodies.map((b) => (b.motion === 'dynamic' ? { ...b, color: paletteColour(next++) } : b))
}

/** The colour for a new moving body: the first one no body has yet, or once all eight are taken, the next round. */
export function nextPaletteColour(bodies: BodyDef[]): string {
  const used = new Set(bodies.map((b) => b.color))
  for (let i = 0; i < SIM_PALETTE.length; i++) if (!used.has(paletteColour(i))) return paletteColour(i)
  return paletteColour(bodies.filter((b) => b.motion === 'dynamic').length)
}

/** What the colour row says beside the swatch: where the colour comes from. */
export function colourNote(def: BodyDef): string {
  if (colourToken(def.color)) return 'follows the theme'
  const m = materialById(def.material)
  return m.color === def.color ? `the colour of ${m.label.toLowerCase()}` : 'custom'
}
