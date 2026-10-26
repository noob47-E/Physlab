// The list of panels and how to get one back.
//
// This lives apart from App.tsx so that the top bar and the search palette can reopen a panel
// without importing App (which imports them, and the resulting cycle left PANEL_LIST undefined
// at start-up).

import { create } from 'zustand'
import type { DockviewApi } from 'dockview-react'
import { columns, panelHome, windowClass } from './layoutMath'
import { HIDDEN_MODES, hiddenPanels, useApp, type ModeId } from './modes'
import { conflictingPanels, isCalmMode } from './sidePanelsCalm'

/** Panel id → the name shown on its tab. */
export const PANEL_TITLES: Record<string, string> = {
  viewport: 'Viewport',
  outliner: 'Outliner',
  examples: 'Examples',
  properties: 'Properties',
  measure: 'Measure',
  vectorcalc: 'Vector Calculator',
  solver: 'Solver',
  practice: 'Practice',
  labdata: 'Lab Data',
  maths: 'Calculator',
  console: 'Console',
  timeline: 'Timeline',
  graphs: 'Graphs',
  expressions: 'Expressions',
  gpulab: 'GPU Lab',
  sandbox: 'Sandbox',
  ai_copilot: 'AI Tutor'
}

/** Panels kept out of student view (Phase 0.9 cuts). Stored in PANEL_TITLES so code remains. */
const HIDDEN_PANELS: ReadonlySet<string> = new Set<string>(['console'])

/** True for a panel that belongs to a mode this build keeps out of reach, or is hidden. */
export const isPanelHidden = (id: string, hidden: ReadonlySet<ModeId> = HIDDEN_MODES): boolean =>
  HIDDEN_PANELS.has(id) || hiddenPanels(hidden).includes(id)

/** The panels a student can ask for: PANEL_TITLES without the hidden ones. */
export const panelList = (hidden: ReadonlySet<ModeId> = HIDDEN_MODES): { id: string; title: string }[] =>
  Object.entries(PANEL_TITLES)
    .filter(([id]) => !isPanelHidden(id, hidden))
    .map(([id, title]) => ({ id, title }))

/** The View menu's panel rows and Ctrl+K's Panels rows. */
export const PANEL_LIST = panelList()

/** Which panels share a home, so a closed one comes back beside the ones it lived with. */
const PANEL_GROUPS: string[][] = [
  // Graphing's list of lines lives on the left with the other lists.
  ['outliner', 'examples', 'expressions', 'ai_copilot'],
  ['viewport', 'maths', 'labdata'],
  // GPU Lab is a mode's own panel, so it lives beside the drawing with the others, as
  // panelHome in layoutMath.ts says; listed under the console strip it opened in two places.
  ['vectorcalc', 'measure', 'properties', 'solver', 'practice', 'sandbox', 'gpulab', 'timeline', 'graphs'],
  ['console']
]

let dockApi: DockviewApi | null = null

/**
 * Which panels are open right now. The top bar is built before the layout exists, so it cannot
 * simply ask the layout — it follows this instead, and the menu always tells the truth.
 */
export const useOpenPanels = create<{ open: string[] }>(() => ({ open: [] }))

export const refreshOpenPanels = (): void => useOpenPanels.setState({ open: dockApi ? dockApi.panels.map((p) => p.id) : [] })

export const setDockApi = (api: DockviewApi | null): void => {
  dockApi = api
  refreshOpenPanels()
}

export const getDockApi = (): DockviewApi | null => dockApi

/** True while the panel is open somewhere in the layout. */
export const isPanelOpen = (id: string): boolean => !!dockApi?.getPanel(id)

if (typeof window !== 'undefined') {
  ;(window as unknown as { showPanel?: (id: string) => void }).showPanel = (id: string) => showPanel(id)
}

/**
 * Bring a panel forward, putting it back first if it was closed. Without this, closing a panel
 * was a one-way door: the only way to see it again was resetting the whole layout.
 */
export function showPanel(id: string): void {
  const api = dockApi
  // A hidden mode's panel opens from nowhere, not even a stray requestFocus.
  if (!api || !PANEL_TITLES[id] || isPanelHidden(id)) return
  const home = panelHome(id)
  const mode = useApp.getState().mode
  if (isCalmMode(mode) && (home === 'left' || home === 'right')) {
    const conflicts = conflictingPanels(mode, home, api.panels.map((p) => p.id))
    for (const conflictId of conflicts) {
      hidePanel(conflictId)
    }
  }
  const existing = api.getPanel(id)
  if (existing) {
    existing.api.setActive()
    return
  }
  const family = PANEL_GROUPS.find((g) => g.includes(id)) ?? []
  const neighbour = family.find((other) => other !== id && api.getPanel(other))
  if (neighbour) {
    api.addPanel({ id, component: id, title: PANEL_TITLES[id], position: { referencePanel: neighbour, direction: 'within' } })
  } else {
    // No family member is open, so the panel goes to its own home beside the drawing. Left to
    // dockview it would land in whichever group happened to be active — a Lab Data table
    // appearing as a tab inside the drawing, for instance.
    const home = panelHome(id)
    const isMobile = api.width < 768
    const isTablet = api.width >= 768 && api.width < 1024
    const c = columns(api.width, api.height)
    const anchor = api.getPanel('viewport') ?? api.getPanel('maths') ?? api.panels[0]
    let dir: 'left' | 'right' | 'above' | 'below' | 'within' = isMobile || home === 'centre' ? 'within' : home
    let ref = anchor ? anchor.id : undefined
    if (isTablet && home === 'left') {
      const openSide = api.panels.find((p) => p.id !== 'viewport' && p.id !== 'maths' && panelHome(p.id) === 'right')
      if (openSide) {
        ref = openSide.id
        dir = 'within'
      } else {
        dir = 'right'
      }
    }
    const size =
      isMobile
        ? {}
        : dir === 'right'
          ? { initialWidth: c.side, minimumWidth: c.sideMin }
          : dir === 'left'
            ? { initialWidth: c.examples, minimumWidth: c.examplesMin }
            : dir === 'below'
              ? { initialHeight: c.bottom, minimumHeight: c.bottomMin }
              : {}
    api.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      position: ref ? { referencePanel: ref, direction: dir } : undefined,
      ...size
    })
  }
  api.getPanel(id)?.api.setActive()
  refreshOpenPanels()
}

/**
 * Show panel `id` NEXT TO panel `besideId`, both in view (P-GCALC GC2). The Calculator's Visualize
 * used to bring the drawing forward as a tab in the Maths screen's own group, hiding the working
 * it was drawing. Now the drawing moves into its own group to the right of Maths (below it on a
 * narrow window); moved, not re-made, so the drawing keeps its view. Already beside: it is only made
 * active. With `besideId` closed it is simply shown.
 */
export function showBeside(id: string, besideId: string): void {
  const api = dockApi
  if (!api || !PANEL_TITLES[id] || isPanelHidden(id)) return
  const beside = api.getPanel(besideId)
  if (!beside) return showPanel(id)
  const isMobile = api.width < 768
  if (isMobile) {
    const panel = api.getPanel(id)
    if (panel) {
      if (panel.api.group !== beside.api.group) panel.api.moveTo({ group: beside.api.group, position: 'center' })
    } else {
      api.addPanel({ id, component: id, title: PANEL_TITLES[id], position: { referencePanel: besideId, direction: 'within' } })
    }
    api.getPanel(id)?.api.setActive()
    refreshOpenPanels()
    return
  }
  const narrow = windowClass(api.width) === 'narrow'
  const panel = api.getPanel(id)
  if (panel) {
    if (panel.api.group === beside.api.group) panel.api.moveTo({ group: beside.api.group, position: narrow ? 'bottom' : 'right' })
  } else {
    api.addPanel({ id, component: id, title: PANEL_TITLES[id], position: { referencePanel: besideId, direction: narrow ? 'below' : 'right' } })
  }
  api.getPanel(id)?.api.setActive()
  refreshOpenPanels()
}

/**
 * Puts panel `id` back into the drawing's own group when showBeside split it off (P-GCALC GC2): a
 * mode with no centre panel must not keep the Maths screen as a column beside its drawing.
 */
export function regroupWithViewport(id: string): void {
  const api = dockApi
  const panel = api?.getPanel(id)
  const viewport = api?.getPanel('viewport')
  if (!api || !panel || !viewport || panel.api.group === viewport.api.group) return
  panel.api.moveTo({ group: viewport.api.group, position: 'center' })
  viewport.api.setActive()
  refreshOpenPanels()
}

/** Close a panel; the View menu can bring it back. The last panel stays, or the window is empty. */
export function hidePanel(id: string): void {
  const api = dockApi
  const panel = api?.getPanel(id)
  if (!api || !panel || api.panels.length <= 1) return
  api.removePanel(panel)
  refreshOpenPanels()
}

/** The View menu's panel rows: a closed panel opens, an open one closes. */
export function togglePanel(id: string): void {
  if (isPanelOpen(id)) hidePanel(id)
  else showPanel(id)
}

/**
 * Closes every hidden panel a restored layout still holds: a layout saved while those modes could
 * be opened may have their panels in it, and nothing else would ever take them out. True while any
 * panel is left; false means the layout is empty now, and the caller builds a fresh one.
 */
export function dropHiddenPanels(): boolean {
  const api = dockApi
  if (!api) return false
  for (const panel of [...api.panels]) {
    if (!PANEL_TITLES[panel.id] || isPanelHidden(panel.id)) api.removePanel(panel)
  }
  refreshOpenPanels()
  return api.panels.length > 0
}
