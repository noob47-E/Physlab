// The list of panels and how to get one back.
//
// This lives apart from App.tsx so that the top bar and the search palette can reopen a panel
// without importing App (which imports them, and the resulting cycle left PANEL_LIST undefined
// at start-up).

import { create } from 'zustand'
import type { DockviewApi } from 'dockview-react'
import { columns, panelHome } from './layoutMath'

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
  author: 'Author',
  labdata: 'Lab Data',
  maths: 'Maths',
  console: 'Console',
  timeline: 'Timeline',
  graphs: 'Graphs',
  gpulab: 'GPU Lab',
  sandbox: 'Sandbox'
}

export const PANEL_LIST = Object.entries(PANEL_TITLES).map(([id, title]) => ({ id, title }))

/** Which panels share a home, so a closed one comes back beside the ones it lived with. */
const PANEL_GROUPS: string[][] = [
  ['outliner', 'examples'],
  ['viewport', 'maths'],
  // GPU Lab is a mode's own panel, so it lives beside the drawing with the others, as
  // panelHome in layoutMath.ts says; listed under the console strip it opened in two places.
  ['vectorcalc', 'measure', 'properties', 'solver', 'practice', 'author', 'labdata', 'sandbox', 'gpulab'],
  ['console', 'timeline', 'graphs']
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

/** True while the panel is open somewhere in the layout. */
export const isPanelOpen = (id: string): boolean => !!dockApi?.getPanel(id)

/**
 * Bring a panel forward, putting it back first if it was closed. Without this, closing a panel
 * was a one-way door: the only way to see it again was resetting the whole layout.
 */
export function showPanel(id: string): void {
  const api = dockApi
  if (!api || !PANEL_TITLES[id]) return
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
    const c = columns(api.width, api.height)
    const anchor = api.getPanel('viewport') ?? api.getPanel('maths') ?? api.panels[0]
    const size =
      home === 'right'
        ? { initialWidth: c.side, minimumWidth: c.sideMin }
        : home === 'left'
          ? { initialWidth: c.examples, minimumWidth: c.examplesMin }
          : home === 'below'
            ? { initialHeight: c.bottom, minimumHeight: c.bottomMin }
            : {}
    api.addPanel({
      id,
      component: id,
      title: PANEL_TITLES[id],
      position: anchor ? { referencePanel: anchor.id, direction: home === 'centre' ? 'within' : home } : undefined,
      ...size
    })
  }
  api.getPanel(id)?.api.setActive()
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
