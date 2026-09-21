import { useEffect } from 'react'
import { newProject, openProject, saveProject } from './files'
import { scene } from '../core/store'
import { TOOLS, cancelTool, finishTool, resetTool, undoLastPick, useTool } from '../render/tools'
import { resetCamera } from '../render/viewState'
import { isDrawingMode, useApp } from './modes'
import { useSandbox } from '../sim/store'
import { useLab } from '../lab/labStore'
import { visibleOrder } from '../core/visibility'

import { isActivatable, isTyping as typingIn } from './keyTargets'

const isTyping = (e: KeyboardEvent) => typingIn(e.target as HTMLElement)

/**
 * The key that flips the drawing between 2D and 3D. It used to be Tab, which also stopped Tab
 * from moving keyboard focus anywhere in the app. V would have been the natural choice, but V is
 * the Move tool; 3 reads as "3D".
 */
export const VIEW_KEY = '3'

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        // The Sandbox keeps its own objects in its own store, so Ctrl+Z there has to reach that
        // history rather than the drawing's.
        if (useApp.getState().mode === 'sandbox') {
          if (e.shiftKey) useSandbox.getState().redo()
          else useSandbox.getState().undo()
          return
        }
        if (useApp.getState().mode === 'lab') {
          useLab.getState().undo()
          return
        }
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (useApp.getState().mode === 'sandbox') useSandbox.getState().redo()
        else s.redo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.select(visibleOrder(s.order, s.objects, s.activeSpace))
        return
      }
      if (ctrl) return
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
        if (e.key === 'Escape') {
          sb.select(null)
          return
        }
        if (e.key === 'Home') {
          resetCamera()
          return
        }
        if (e.key !== ' ') return
      }
      switch (e.key) {
        case 'Escape':
          // First Esc throws away the unfinished drawing, a second one goes back to Move.
          if (cancelTool()) return
          resetTool()
          s.setTool('select')
          s.select([])
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
          s.setPlaying(!s.playing)
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
      const tool = TOOLS.find((t) => t.key && t.key.toLowerCase() === e.key.toLowerCase())
      if (tool) s.setTool(tool.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
