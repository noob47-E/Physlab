// The decisions behind the shell's layout, as pure functions with no DOM and no dockview.
//
// Everything here is a number in, a number out, so tests/layout.test.ts can pin it. The reason it
// exists: the old default layout opened all sixteen panels at fixed pixel widths for every mode,
// and a 1366-pixel laptop at 125 % scaling was left with a viewport the size of a postcard.

/** A panel's own tools, without the separators. */
export type ToolList = readonly string[]

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Which class of window a layout was built for. A layout saved on a wide screen is rebuilt when
 * the app next opens on a narrow one: dockview rescales proportionally, but 430 px of side panel
 * scaled to a 960 px window leaves nothing to draw in.
 */
export type WindowClass = 'narrow' | 'medium' | 'wide'

export function windowClass(width: number): WindowClass {
  if (width < 1150) return 'narrow'
  if (width < 1500) return 'medium'
  return 'wide'
}

/** How much of the top bar can be shown: every mode tab, a "Mode" menu, or icons only. */
export type BarDensity = 'full' | 'compact' | 'tight'

export function barDensity(width: number): BarDensity {
  // 0 means "not measured yet": show everything, as the shelf does, rather than flash icons.
  if (width <= 0) return 'full'
  if (width < 1150) return 'tight'
  if (width < 1500) return 'compact'
  return 'full'
}

export interface Columns {
  /** The mode's side panel (right of the drawing). */
  side: number
  sideMin: number
  /** The Examples column (left of the drawing). */
  examples: number
  examplesMin: number
  /** A panel that lives under the drawing (the graphing console). */
  bottom: number
  bottomMin: number
  /** The drawing itself never goes below this. */
  viewportMin: number
}

/**
 * Column sizes as clamped fractions of the window, so the side panel is roomy on a monitor and
 * still leaves the drawing most of a laptop screen.
 */
export function columns(width: number, height: number): Columns {
  return {
    side: Math.round(clamp(width * 0.28, 300, 460)),
    sideMin: 240,
    examples: Math.round(clamp(width * 0.17, 200, 280)),
    examplesMin: 180,
    bottom: Math.round(clamp(height * 0.26, 140, 260)),
    bottomMin: 100,
    viewportMin: 320
  }
}

/** What the saved layout is stamped with. */
export interface LayoutStamp {
  /** Schema version of the layout file itself. */
  v: number
  /** Which PhysLab wrote it (informational: a new build keeps the arrangement). */
  app: string
  w: number
  h: number
}

export const LAYOUT_VERSION = 2

/**
 * A saved layout is used again only when it was made by this schema for this size of window.
 * The app version is deliberately not compared: an update should not throw the arrangement away.
 */
export function needsLayoutRebuild(saved: Partial<LayoutStamp> | null | undefined, now: { w: number; h: number }): boolean {
  if (!saved || typeof saved.v !== 'number' || typeof saved.w !== 'number') return true
  if (saved.v !== LAYOUT_VERSION) return true
  return windowClass(saved.w) !== windowClass(now.w)
}

/** Where a panel lives when it has no open neighbour to sit beside. */
export type PanelHome = 'centre' | 'left' | 'right' | 'below'

export function panelHome(id: string): PanelHome {
  switch (id) {
    case 'viewport':
    case 'working':
      return 'centre'
    case 'outliner':
    case 'examples':
      return 'left'
    case 'console':
    case 'timeline':
    case 'graphs':
      return 'below'
    default:
      return 'right'
  }
}

export interface ModeShape {
  panel?: string
  centre?: string
  examples?: boolean
}

/**
 * The panels a mode opens by default: the drawing, the mode's own panel, and Examples where the
 * mode has any. Three panels, not sixteen. Everything else is a View-menu or Ctrl+K away.
 */
export function panelsForMode(mode: ModeShape): string[] {
  const ids = ['viewport']
  if (mode.centre) ids.push(mode.centre)
  if (mode.examples) ids.push('examples')
  if (mode.panel && !ids.includes(mode.panel)) ids.push(mode.panel)
  return ids
}

/** The tool shelf: full labels, icons only when the labels would not fit, or gone entirely. */
export type ShelfMode = 'full' | 'icons' | 'hidden'

// Measured from the stylesheet: a labelled tool is at least 50 px wide plus 2 px gap, an
// icon-only one 32 px, a separator 1 px with 6 px margins and the 2 px gap, and the shelf has
// 16 px of padding.
export const SHELF_TOOL_FULL = 52
export const SHELF_TOOL_ICON = 34
export const SHELF_SEP = 15
export const SHELF_PAD = 16
/** A character of the 10.5 px label, and the button's own side padding. */
export const SHELF_CHAR = 5.4
export const SHELF_TOOL_PAD = 12

/** The label a tool shows under its icon, when the caller knows it. */
export type LabelOf = (id: string) => string | undefined

/**
 * A labelled tool is as wide as its longest word: the button shrinks to that when the shelf is
 * squeezed, so "Perpendicular" takes 80-odd px however the estimate is rounded. A flat 52 px per
 * tool left Geometry's shelf scrolling — with Delete out of reach — in a band of window widths
 * just above where it claimed to fit.
 */
export function toolWidth(label: string | undefined): number {
  const longest = (label ?? '').split(/\s+/).reduce((n, word) => Math.max(n, word.length), 0)
  return Math.max(SHELF_TOOL_FULL, longest * SHELF_CHAR + SHELF_TOOL_PAD + 2)
}

export function shelfWidth(tools: ToolList, mode: 'full' | 'icons', labelOf?: LabelOf): number {
  let w = SHELF_PAD
  for (const t of tools) w += t === '|' ? SHELF_SEP : mode === 'full' ? toolWidth(labelOf?.(t)) : SHELF_TOOL_ICON
  return w
}

export function shelfMode(width: number, tools: ToolList, labelOf?: LabelOf): ShelfMode {
  const real = tools.filter((t) => t !== '|')
  // A shelf whose only tool is Move gives the student nothing to pick: it is just 40 px lost.
  if (real.length <= 1) return 'hidden'
  if (width <= 0) return 'full'
  return shelfWidth(tools, 'full', labelOf) <= width ? 'full' : 'icons'
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where the tour card goes: under the highlighted thing when there is room, above it otherwise,
 * and always inside the window. Measured card size in, so a longer step never falls off screen.
 */
export function placeTourCard(hole: Box, card: { w: number; h: number }, win: { w: number; h: number }, gap = 12, margin = 8): { left: number; top: number } {
  const left = clamp(hole.left, margin, Math.max(margin, win.w - card.w - margin))
  const below = hole.top + hole.height + gap
  const above = hole.top - gap - card.h
  let top: number
  if (below + card.h + margin <= win.h) top = below
  else if (above >= margin) top = above
  else top = clamp(below, margin, Math.max(margin, win.h - card.h - margin))
  return { left: Math.round(left), top: Math.round(top) }
}

/**
 * The window's zoom, kept inside what still leaves the shell usable. src/main/index.ts holds the
 * same three lines for the keyboard shortcuts (the main bundle cannot import renderer code):
 * change both together, or the popover will offer a step the menu refuses.
 */
export const ZOOM_MIN = -3
export const ZOOM_MAX = 3
export const clampZoom = (level: number): number => (Number.isFinite(level) ? clamp(Math.round(level * 2) / 2, ZOOM_MIN, ZOOM_MAX) : 0)

/** Chromium's zoom level to the percentage a student recognises (level 1 = 120 %). */
export const zoomPercent = (level: number): number => Math.round(100 * Math.pow(1.2, level))
