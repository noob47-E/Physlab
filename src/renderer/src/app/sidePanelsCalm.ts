// Rules for side panels in Geometry, Vectors, and Graphing (CALM 2):
// Never show the left and right side panels at the same time in Geometry, Vectors and Graphing.
// The lessons panel (Examples) closes when the student selects or draws something.

import { panelHome } from './layoutMath'

/** The modes where having panels on both sides at once crowds the drawing canvas. */
export function isCalmMode(mode: string): boolean {
  return mode === 'shapes' || mode === 'vectors' || mode === 'graphing'
}

/** Which open panels conflict with opening a panel on `side` in `mode`. */
export function conflictingPanels(mode: string, side: 'left' | 'right', openPanels: string[]): string[] {
  if (!isCalmMode(mode)) return []
  const opposite = side === 'left' ? 'right' : 'left'
  // 'practice' belongs to Problem Sets and stays open beside a question's picture (skipFocus)
  // 'ai_copilot' is the student's AI companion and stays open alongside geometry and tools
  return openPanels.filter((id) => id !== 'practice' && id !== 'ai_copilot' && panelHome(id) === opposite)
}

/** Whether a panel on `side` ('left' or 'right') is allowed given the currently open panels. */
export function isSidePanelAllowed(mode: string, side: 'left' | 'right', openPanels: string[]): boolean {
  if (!isCalmMode(mode)) return true
  return conflictingPanels(mode, side, openPanels).length === 0
}
