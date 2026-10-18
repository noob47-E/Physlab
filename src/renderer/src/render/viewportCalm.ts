// Pure logic for viewport grid calm behavior (CALM 4).
// In Problem Sets mode: the empty drawing grid is not shown while a question has no picture.

import { isDrawingMode, type ModeId } from '../app/modes'

/** Whether the drawing grid should be shown in the viewport. */
export function shouldShowDrawingGrid(mode: ModeId, hasPicture: boolean): boolean {
  if (mode === 'sandbox' || mode === 'gpu') return false
  if (mode === 'problems') {
    return hasPicture
  }
  return isDrawingMode(mode)
}
