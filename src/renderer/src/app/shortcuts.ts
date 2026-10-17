import { useEffect } from 'react'
import { newProject, openProject, saveProject } from './files'
import { scene } from '../core/store'
import { cancelTool, finishTool, resetTool, undoLastPick, useTool } from '../render/tools'
import { isViewShown, resetCamera, turnView } from '../render/viewState'
import { turnForKey } from '../render/viewMath'
import { useTour } from './tour/Tour'
import { isDrawingMode, modeById, useApp } from './modes'
import { toolForKey } from './toolKeys'
import { useSandbox } from '../sim/store'
import * as transport from '../sim/transportActions'
import { runHistory } from './undoRoute'
import { visibleOrder } from '../core/visibility'
import { pressSpace, releaseSpace, resetSpace } from '../render/panKey'

import { isActivatable, isTyping as typingIn } from './keyTargets'
import { useModeWheel } from './modeWheelStore'
import { closeActiveMenu } from './topBarInputs'

const isTyping = (e: KeyboardEvent) => typingIn(e.target as HTMLElement)

/**
 * The key that flips the drawing between 2D and 3D. It used to be Tab, which also stopped Tab
 * from moving keyboard focus anywhere in the app. V would have been the natural choice, but V is
 * the Move tool; 3 reads as "3D".
 */
export const VIEW_KEY = '3'

/**
 * The Sandbox's transport keys (SB17), as a video editor has them: J plays the recording backwards, K pauses, L plays, comma steps back
 * and full stop steps on, B branches the run from the moment on screen, M leaves a bookmark and [ and ] set the ends of a loop. Space plays and pauses too (shortcutKeyUp). What each does
 * depends on the tape's mode (sim/transportActions.ts). Held keys repeat only for the two step keys, so a held comma scrubs back.
 */
function sandboxTransportKey(e: KeyboardEvent): boolean {
  if (e.altKey) return false
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
  const steps = key === ',' || key === '.'
  let action: (() => void) | null = null
  switch (key) {
    case 'j':
      action = transport.playBackwards
      break
    case 'k':
      action = transport.pause
      break
    case 'l':
      action = transport.play
      break
    case ',':
      action = transport.stepBack
      break
    case '.':
      action = transport.stepForward
      break
    case 'b':
      action = transport.branchFromHere
      break
    case 'm':
      action = transport.bookmarkHere
      break
    case '[':
      action = transport.loopStart
      break
    case ']':
      action = transport.loopEnd
      break
  }
  if (!action) return false
  e.preventDefault()
  if (!e.repeat || steps) action()
  return true
}

/**
 * The window's keydown handler. It sits at module level so tests/shortcutKeys.test.ts can drive it
 * with the real stores; useShortcuts only adds it to the window and takes it away again.
 */
export function shortcutKeyDown(e: KeyboardEvent): void {
  const s = scene()
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    useApp.getState().setSearchOpen(true)
    return
  }
  if (ctrl && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveProject(e.shiftKey)
    return
  }
  if (ctrl && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    openProject()
    return
  }
  if (ctrl && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    newProject()
    return
  }
  if (isTyping(e)) return
  if (useModeWheel.getState().open) {
    if (useModeWheel.getState().handleKeyDown(e.key, e.shiftKey)) {
      e.preventDefault()
      return
    }
  }
  // Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y reach the history of the mode in front (the Sandbox and Lab
  // Data each keep their own); undoRoute decides, for the Edit menu too.
  if (ctrl && runHistory(useApp.getState().mode, { key: e.key, shift: e.shiftKey })) {
    e.preventDefault()
    return
  }
  if (ctrl && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    s.select(visibleOrder(s.order, s.objects, s.activeSpace))
    return
  }
  if (ctrl) return
  // The arrow keys turn a 3-D drawing (Shift for a small step); everywhere else they are left
  // alone, and the tour keeps ← and → for its own Back and Next. A key the right-click menu
  // already took (it calls preventDefault in the capture phase) is its, and a drawing that is
  // not on screen (the Calculator's Maths tab in front) is not turned behind the student's back.
  const turn = turnForKey(e.key, e.shiftKey, {
    drawing: isDrawingMode(useApp.getState().mode),
    viewMode: s.viewMode,
    tourOpen: useTour.getState().step !== null,
    typing: false,
    viewShown: isViewShown(),
    claimed: e.defaultPrevented
  })
  if (turn) {
    // Without this the arrow keys also scroll whichever panel holds the page.
    e.preventDefault()
    turnView(turn.dir, turn.fine)
    return
  }
  // Tab is the keyboard's way from one control to the next, so it is never taken here; the
  // 2D/3D switch lives on its own key (VIEW_KEY) instead.
  if (e.key === 'Tab') return
  // The Sandbox has its own objects and its own camera: Delete removes the selected body, Esc
  // drops the selection, and the drawing tools and the 2D view do not apply.
  if (useApp.getState().mode === 'sandbox') {
    const sb = useSandbox.getState()
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (sb.selection) sb.removeBody(sb.selection)
      return
    }
    if (e.key === 'Home') {
      resetCamera()
      return
    }
    if (sandboxTransportKey(e)) return
    if (e.key !== ' ' && e.key !== 'Escape') return
  }
  switch (e.key) {
    case 'Escape':
      // Esc order (Part L2):
      // 0. If wheel is open: close it
      if (useModeWheel.getState().open) {
        useModeWheel.getState().close(false)
        return
      }
      // 1. Close open menu or dialog
      if (closeActiveMenu()) return
      // 2. Throw away unfinished drawing
      if (cancelTool()) return
      // 3. Go back to Move tool
      if (s.tool !== 'select') {
        resetTool()
        s.setTool('select')
        s.select([])
        return
      }
      // 4. Clear selection
      if (useApp.getState().mode === 'sandbox') {
        const sb = useSandbox.getState()
        if (sb.selection) {
          sb.select(null)
          return
        }
      } else {
        if (s.selection.length > 0) {
          s.select([])
          return
        }
      }
      // 5. Open the mode wheel
      useModeWheel.getState().openWheel()
      return
    case 'Delete':
      if (s.selection.length) s.removeObjects(s.selection)
      return
    case 'Backspace':
      if (undoLastPick()) return
      if (s.selection.length) s.removeObjects(s.selection)
      return
    case VIEW_KEY:
      // The GPU Lab hides the 2D/3D switch, so the key must not flip what no button can undo.
      if (!isDrawingMode(useApp.getState().mode)) return
      s.setViewMode(s.viewMode === '2d' ? '3d' : '2d')
      return
    case 'Home':
      resetCamera()
      return
    case ' ':
      // Space on a focused button is that button's click, not play/pause.
      if (isActivatable(e.target as HTMLElement)) return
      e.preventDefault()
      // Held for a pan or released for play/pause: the key-up decides.
      pressSpace()
      return
    case '/':
    case 'Enter':
      // The same for Enter on a focused button, link or menu item.
      if (e.key === 'Enter' && isActivatable(e.target as HTMLElement)) return
      e.preventDefault()
      // While drawing, Enter finishes the shape instead of jumping to the command bar.
      if (e.key === 'Enter' && useTool.getState().picks.length && finishTool()) return
      document.getElementById('command-input')?.focus()
      return
  }
  const tool = toolForKey(e.key, modeById(useApp.getState().mode).tools)
  if (tool) s.setTool(tool)
}

/**
 * Space plays or pauses on the way up, unless it was held to pan the drawing (see panKey.ts). In the Sandbox it plays and pauses
 * whatever is playing: the engine in live, the recording in replay. Module level so tests/shortcutKeys.test.ts can drive it.
 */
export function shortcutKeyUp(e: KeyboardEvent): void {
  if (e.key !== ' ') return
  if (releaseSpace() && !isTyping(e) && !isActivatable(e.target as HTMLElement)) {
    if (useApp.getState().mode === 'sandbox') {
      transport.togglePlay()
      return
    }
    const s = scene()
    s.setPlaying(!s.playing)
  }
}

export function useShortcuts() {
  useEffect(() => {
    const onKeyUp = shortcutKeyUp
    const onBlur = () => resetSpace()
    window.addEventListener('keydown', shortcutKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', shortcutKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
}
