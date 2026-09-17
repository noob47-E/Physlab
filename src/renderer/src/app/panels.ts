// The list of panels and how to get one back.
//
// This lives apart from App.tsx so that the top bar and the search palette can reopen a panel
// without importing App (which imports them, and the resulting cycle left PANEL_LIST undefined
// at start-up).

import { create } from 'zustand'
import type { DockviewApi } from 'dockview-react'

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
  calculator: 'Calculator',
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
  ['viewport'],
  ['vectorcalc', 'measure', 'calculator', 'properties', 'solver', 'practice', 'sandbox'],
  ['console', 'timeline', 'graphs', 'gpulab']
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
  api.addPanel({
    id,
    component: id,
    title: PANEL_TITLES[id],
    position: neighbour ? { referencePanel: neighbour, direction: 'within' } : undefined
  })
  api.getPanel(id)?.api.setActive()
  refreshOpenPanels()
}
