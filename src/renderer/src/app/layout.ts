// The dock layout: what a mode opens, how it is arranged, and how it is remembered.
//
// This lives apart from App.tsx so that the top bar can offer "Reset the panel layout" without
// importing App — which imports the top bar, and the cycle left the reset function undefined at
// start-up. The decisions (column fractions, which panels a mode opens, when a saved layout is
// stale) are pure functions in layoutMath.ts, which is what tests/layout.test.ts pins.

import type { DockviewApi } from 'dockview-react'
import { scene } from '../core/store'
import { spaceOf } from '../core/visibility'
import { QUALITY, qualityNow } from '../render/renderer'
import { useParticleLab } from '../render/GpuParticles'
import { warmupCas } from '../math/cas'
import { MODES, modeById, useApp, type ModeId } from './modes'
import { PANEL_TITLES, isPanelOpen, refreshOpenPanels, showPanel } from './panels'
import { LAYOUT_VERSION, columns, needsLayoutRebuild, panelHome, panelsForMode, type LayoutStamp } from './layoutMath'

export const LAYOUT_KEY = 'physlab.layout'

const appVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0')

let casWarmed = false

/** Switch mode: tool shelf, view and the panel that belongs to the mode. */
export function enterMode(id: ModeId) {
  const m = modeById(id)
  useApp.getState().setMode(id)
  const s = scene()
  s.setActiveSpace(spaceOf(id))
  useParticleLab.setState(id === 'gpu' ? { enabled: true, count: QUALITY[qualityNow()].particles } : { enabled: false })
  if (m.view) s.setViewMode(m.view)
  if (!m.tools.includes(s.tool)) s.setTool('select')
  // The centre panel is switched directly: requestFocus holds one panel at a time, so asking
  // for two in a row would lose the first.
  if (m.centre) showPanel(m.centre)
  else if (isPanelOpen('working')) showPanel('viewport')
  if (m.panel) s.requestFocus(m.panel)
  if (!m.ready) s.pushLog({ input: m.label, kind: 'info', text: `${m.label} is coming in the next build stages: ${m.description}` })
  // Pyodide takes several seconds to wake. Starting it the moment the calculator opens means the
  // first question SymPy is asked gets its answer sooner; it used to start only when first asked.
  if (id === 'calculator' && !casWarmed) {
    casWarmed = true
    void warmupCas().catch(() => {})
  }
}

interface SavedLayout extends Partial<LayoutStamp> {
  layout?: object
  mode?: ModeId
}

const readSaved = (): SavedLayout | null => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    return raw ? (JSON.parse(raw) as SavedLayout) : null
  } catch {
    return null
  }
}

/**
 * Build the default arrangement for one mode: the drawing (or the mode's centre panel), the
 * mode's own panel, and Examples where the mode has lessons. Three panels, not sixteen.
 */
export function buildLayout(api: DockviewApi, modeId: ModeId): void {
  const m = modeById(modeId)
  const c = columns(api.width, api.height)
  api.clear()
  api.addPanel({ id: 'viewport', component: 'viewport', title: PANEL_TITLES.viewport, minimumWidth: c.viewportMin })
  for (const id of panelsForMode(m)) {
    if (id === 'viewport' || !PANEL_TITLES[id]) continue
    const home = panelHome(id)
    const base = { id, component: id, title: PANEL_TITLES[id] }
    if (home === 'centre') api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'within' } })
    else if (home === 'left') api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'left' }, initialWidth: c.examples, minimumWidth: c.examplesMin })
    else if (home === 'below') api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'below' }, initialHeight: c.bottom, minimumHeight: c.bottomMin })
    else api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'right' }, initialWidth: c.side, minimumWidth: c.sideMin })
  }
  // A centre panel was added inside the drawing's group, so it is what shows; the drawing comes
  // back the moment another mode opens.
  if (!m.centre) api.getPanel('viewport')?.api.setActive()
}

/**
 * Put the panels back where the student left them, in the mode they were in. Returns false when
 * there is nothing usable to restore, in which case the caller builds the default layout.
 *
 * Nothing is removed from storage here: the next save overwrites it within a second, and React's
 * development double-mount calls this twice — a key removed on the first pass left the second
 * pass with no saved mode, so a Sandbox session came back as Vectors.
 */
export function restoreLayout(api: DockviewApi): boolean {
  const saved = readSaved()
  if (!saved?.layout) return false
  // A layout saved for another size of window or by an older schema is rebuilt, not squeezed.
  if (needsLayoutRebuild(saved, { w: api.width, h: api.height })) return false
  try {
    api.fromJSON(saved.layout as never)
  } catch {
    return false
  }
  // A layout with nothing in it would leave the window empty for good, with no tab to click.
  return api.panels.length > 0
}

/** The mode the last session was in, if a usable one was saved. */
export function savedMode(): ModeId | null {
  const m = readSaved()?.mode
  return m && MODES.some((d) => d.id === m && d.ready) ? m : null
}

let resetting = false

/**
 * Save the layout when it changes, and once more as the window closes. Returns a disposer, so a
 * re-mounted dock does not leave the old timers and listeners writing over the new ones.
 */
export function watchLayout(api: DockviewApi): () => void {
  const save = () => {
    // Reset removes the key and reloads; the save on the way out used to put the old layout
    // straight back, which is why "Reset the panel layout" never reset anything.
    if (resetting) return
    try {
      const stamp: LayoutStamp = { v: LAYOUT_VERSION, app: appVersion(), w: api.width, h: api.height }
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...stamp, layout: api.toJSON(), mode: useApp.getState().mode }))
    } catch {
      // Storage blocked: the layout just will not be remembered.
    }
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  const queue = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, 800)
  }
  const subs = [api.onDidLayoutChange(queue), api.onDidLayoutChange(refreshOpenPanels)]
  window.addEventListener('beforeunload', save)
  return () => {
    if (timer) clearTimeout(timer)
    subs.forEach((d) => d.dispose())
    window.removeEventListener('beforeunload', save)
  }
}

/**
 * Forget the saved arrangement and start again from the standard one for the current mode.
 * The flag goes up first: the save on the way out used to write the old layout straight back,
 * which is why "Reset the panel layout" never reset anything. The mode is kept so the student
 * comes back where they were, in the default arrangement for it.
 */
export function resetLayout(): void {
  resetting = true
  try {
    const mode = useApp.getState().mode
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ mode }))
  } catch {
    // Nothing saved anyway.
  }
  location.reload()
}
