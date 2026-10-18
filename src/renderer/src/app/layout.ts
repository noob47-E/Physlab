// The dock layout: what a mode opens, how it is arranged, and how it is remembered.
//
// This lives apart from App.tsx so that the top bar can offer "Reset the panel layout" without
// importing App — which imports the top bar, and the cycle left the reset function undefined at
// start-up. The decisions (column fractions, which panels a mode opens, when a saved layout is
// stale) are pure functions in layoutMath.ts, which is what tests/layout.test.ts pins.

import type { DockviewApi } from 'dockview-react'
import { scene } from '../core/store'
import { spaceOf } from '../core/visibility'
import { resetTool } from '../render/tools'
import { QUALITY, qualityNow } from '../render/renderer'
import { useParticleLab } from '../render/GpuParticles'
import { warmupEngine } from '../math/engine'
import { MODES, modeById, useApp, type ModeId } from './modes'
import { getDockApi, hidePanel, isPanelOpen, PANEL_TITLES, refreshOpenPanels, regroupWithViewport, showPanel } from './panels'
import { LAYOUT_VERSION, columns, needsLayoutRebuild, panelHome, panelsForMode, type LayoutStamp } from './layoutMath'
import { storedRecord } from '../core/schema'
import { useSandboxView } from '../sim/sandboxView'

export const LAYOUT_KEY = 'physlab.layout'

const appVersion = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0')

let casWarmed = false

/** Examples was closed by the simple Sandbox (enterMode below) and is owed back to the next mode that has lessons. */
let examplesLentBySandbox = false

/** Vector Calculator panel was closed by the simple Sandbox and is owed back to its mode. */
let vectorcalcLentBySandbox = false

/**
 * Switch mode: tool shelf, view and the panel that belongs to the mode. `restored` is the start-up call on a layout put
 * back from the last session, which is left as the student had it. `skipFocus` prevents requesting focus on the mode's panel,
 * used when opening a visual alongside Practice so the answer box keeps focus.
 */
export function enterMode(id: ModeId, opts: { restored?: boolean; skipFocus?: boolean } = {}) {
  const m = modeById(id)
  const from = useApp.getState().mode
  useApp.getState().setMode(id)
  const s = scene()
  s.setActiveSpace(spaceOf(id))
  useParticleLab.setState(id === 'gpu' ? { enabled: true, count: QUALITY[qualityNow()].particles } : { enabled: false })
  if (m.view) s.setViewMode(m.view)
  if (!m.tools.includes(s.tool)) s.setTool('select')
  // A new mode starts every tool afresh: a half-made segment or a pending vector tail from the
  // last drawing would otherwise finish here, joined to a point this drawing cannot show. The
  // tool's own reset only runs when the tool changes, which it does not when both modes share it.
  resetTool()
  // The centre panel is switched directly: requestFocus holds one panel at a time, so asking
  // for two in a row would lose the first.
  if (m.centre && isPanelOpen(m.centre)) {
    const api = getDockApi()
    const p = api?.getPanel(m.centre)
    const vp = api?.getPanel('viewport')
    if (api && p && vp && p.api.group !== vp.api.group) {
      p.api.moveTo({ group: vp.api.group, position: 'center' })
    }
    showPanel(m.centre)
  }
  else if (isPanelOpen('maths') || isPanelOpen('labdata')) {
    // Visualize may have split a centre screen off beside the drawing: in a mode without a centre
    // panel it goes back behind the drawing, as a tab, instead of keeping a column everywhere.
    if (isPanelOpen('maths')) regroupWithViewport('maths')
    if (isPanelOpen('labdata')) regroupWithViewport('labdata')
    showPanel('viewport')
  }
  // One Mode = One Layout (Part L1): switching modes closes panels that do not belong to the new mode.
  if (from !== id && !opts.restored) {
    if (id !== 'graphing' && isPanelOpen('expressions')) hidePanel('expressions')
    if (id !== 'shapes' && isPanelOpen('measure')) hidePanel('measure')
    // skipFocus is how a question opens its picture beside Practice: the question and its answer box stay.
    if (id !== 'problems' && !opts.skipFocus && isPanelOpen('practice')) hidePanel('practice')
    if (id !== 'gpu' && isPanelOpen('gpulab')) hidePanel('gpulab')
    if (id !== 'sandbox' && isPanelOpen('sandbox')) hidePanel('sandbox')
    if (id !== 'vectors') {
      if (isPanelOpen('solver')) hidePanel('solver')
      if (isPanelOpen('vectorcalc')) {
        if (!(id === 'sandbox' && useSandboxView.getState().view === 'all')) {
          hidePanel('vectorcalc')
          if (!isPanelOpen('vectorcalc')) vectorcalcLentBySandbox = true
        }
      }
    }
    if (!m.examples) {
      if (isPanelOpen('examples')) {
        if (!(id === 'sandbox' && useSandboxView.getState().view === 'all')) {
          hidePanel('examples')
          if (!isPanelOpen('examples')) examplesLentBySandbox = true
        }
      }
    }
    if (isPanelOpen('console')) hidePanel('console')
  }

  // Restore Examples and other owed panels to their modes.
  if (m.examples) {
    if (examplesLentBySandbox && !isPanelOpen('examples')) {
      showPanel('examples')
    }
    const api = getDockApi()
    const examples = api?.getPanel('examples')
    if (api && examples?.api.group?.api?.setSize) {
      const c = columns(api.width, api.height)
      examples.api.group.api.setSize({ width: c.examples })
    }
    examplesLentBySandbox = false
  }
  if (id === 'vectors') {
    if (vectorcalcLentBySandbox && !isPanelOpen('vectorcalc')) {
      showPanel('vectorcalc')
    }
    vectorcalcLentBySandbox = false
  }
  if (m.panel && !opts.skipFocus) {
    const api = getDockApi()
    const isMobile = api && api.width < 768
    if (!isMobile) {
      s.requestFocus(m.panel)
    } else {
      showPanel(m.panel)
      if (!m.centre) {
        api?.getPanel('viewport')?.api.setActive()
      }
    }
  }
  // After requestFocus opens the panel, constrain the side panel group back to its normal width
  // (SB63, T310: the sandbox panel doesn't exist until requestFocus is called).
  if (id === 'sandbox' && from !== id && !opts.restored && useSandboxView.getState().view === 'simple') {
    setTimeout(() => {
      const api = getDockApi()
      const sandbox = api?.getPanel('sandbox')
      if (api && sandbox?.api.group?.api?.setSize) {
        const c = columns(api.width, api.height)
        const targetWidth = c.side
        const currentWidth = sandbox.api.group.width
        // Only resize if the current width is significantly larger than the target (allow 40 px tolerance).
        if (currentWidth && currentWidth > targetWidth + 40) {
          sandbox.api.group.api.setSize({ width: targetWidth })
        }
      }
    }, 0)
  }
  if (!m.ready) s.pushLog({ input: m.label, kind: 'info', text: `${m.label} is coming in the next build stages: ${m.description}` })
  // The algebra engine takes several seconds to wake. Starting it the moment the calculator opens
  // means the first question it is asked gets its answer sooner; it used to start only when first asked.
  if (id === 'calculator' && !casWarmed) {
    casWarmed = true
    warmupEngine()
  }
  const api = getDockApi()
  if (api) updateTabHeaderVisibility(api)
}

interface SavedLayout extends Partial<LayoutStamp> {
  layout?: object
  mode?: ModeId
}

const readSaved = (): SavedLayout | null => {
  try {
    return storedRecord(localStorage.getItem(LAYOUT_KEY)) as SavedLayout | null
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
  const isMobile = api.width < 768
  const isTablet = api.width >= 768 && api.width < 1024
  const c = columns(api.width, api.height)
  api.clear()
  api.addPanel({ id: 'viewport', component: 'viewport', title: PANEL_TITLES.viewport, minimumWidth: isMobile ? 100 : c.viewportMin })
  let leftDone: string | null = null
  let sideDone: string | null = null
  for (const id of panelsForMode(m)) {
    if (id === 'viewport' || !PANEL_TITLES[id]) continue
    const home = panelHome(id)
    const base = { id, component: id, title: PANEL_TITLES[id] }
    if (isMobile) {
      // Under 768px: strictly one pane, all panels are 'within' the single group.
      api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'within' } })
    } else if (isTablet && (home === 'left' || home === 'right')) {
      // Tablet (800x1100): avoid 3 columns. Examples sits as a tab with the side panel.
      if (sideDone) {
        api.addPanel({ ...base, position: { referencePanel: sideDone, direction: 'within' } })
      } else {
        api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'right' }, initialWidth: c.side, minimumWidth: c.sideMin })
        sideDone = id
      }
    } else if (home === 'centre') {
      api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'within' } })
    } else if (home === 'left' && leftDone) {
      api.addPanel({ ...base, position: { referencePanel: leftDone, direction: 'within' } })
    } else if (home === 'left') {
      api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'left' }, initialWidth: c.examples, minimumWidth: c.examplesMin })
      leftDone = id
    } else if (home === 'below') {
      api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'below' }, initialHeight: c.bottom, minimumHeight: c.bottomMin })
    } else {
      api.addPanel({ ...base, position: { referencePanel: 'viewport', direction: 'right' }, initialWidth: c.side, minimumWidth: c.sideMin })
      sideDone = id
    }
  }
  // A centre panel was added inside the drawing's group, so it is what shows; the drawing comes
  // back the moment another mode opens.
  if (!m.centre) api.getPanel('viewport')?.api.setActive()
  updateTabHeaderVisibility(api)
}

/**
 * Dock tab headers are hidden unless two or more tabs share one group (Part L3).
 * A single panel in a group does not need a tab header taking up vertical space.
 */
export function updateTabHeaderVisibility(api: DockviewApi): void {
  if (!api?.groups) return
  for (const group of api.groups) {
    const shouldHide = group.panels.length <= 1
    if (group.header && group.header.hidden !== shouldHide) {
      group.header.hidden = shouldHide
    }
  }
}

/**
 * Prevent docking to top or bottom positions (Part L3: panels on the side only).
 */
export function preventTopBottomDrop(event: { position: string; preventDefault: () => void }): void {
  if (event.position === 'top' || event.position === 'bottom') {
    event.preventDefault()
  }
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
    updateTabHeaderVisibility(api)
  } catch {
    return false
  }
  // A layout with nothing in it would leave the window empty for good, with no tab to click.
  return api.panels.length > 0
}

/**
 * The mode the last session was in, if a usable one was saved. Only a "coming soon" mode is turned
 * away here (null: the session opens Vectors). Any other id is handed on as it was saved, and App
 * opens `openableMode(savedMode() ?? 'vectors')`: openableMode is the one rule for which modes may
 * open, and it turns a hidden mode, or one this build does not have (Question Author, Class
 * Results), into Problem Sets. This function used to keep its own check of the mode list beside it.
 */
export function savedMode(): ModeId | null {
  const m = readSaved()?.mode
  if (!m) return null
  return MODES.some((d) => d.id === m && !d.ready) ? null : m
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
  const syncHeaders = () => updateTabHeaderVisibility(api)
  const subs = [
    api.onDidLayoutChange(queue),
    api.onDidLayoutChange(refreshOpenPanels),
    api.onDidLayoutChange(syncHeaders),
    api.onDidAddGroup?.(syncHeaders),
    api.onDidRemoveGroup?.(syncHeaders),
    api.onDidAddPanel?.(syncHeaders),
    api.onDidRemovePanel?.(syncHeaders),
    api.onDidMovePanel?.(syncHeaders),
    api.onWillShowOverlay?.(preventTopBottomDrop),
    api.onWillDrop?.(preventTopBottomDrop)
  ].filter(Boolean) as { dispose: () => void }[]
  updateTabHeaderVisibility(api)
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
  // Ctrl+R asks before throwing unsaved work into the autosave copy; this reloads too, so it asks
  // the same question rather than being the one way to reload without one.
  if (scene().dirty && !window.confirm('There is unsaved work. Resetting the layout reloads PhysLab: the work will be offered back afterwards, but it is not saved in a file. Press Cancel and Ctrl+S first to keep it.')) return
  resetting = true
  try {
    const mode = useApp.getState().mode
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ mode }))
  } catch {
    // Nothing saved anyway.
  }
  location.reload()
}
