import { useEffect } from 'react'
import { newProject, openProject, saveProject } from './files'
import { scene } from '../core/store'
import { TOOLS, resetTool } from '../render/tools'
import { resetCamera } from '../render/viewState'
import { useApp } from './modes'

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'MATH-FIELD' || t.isContentEditable
}

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
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        s.select(s.order)
        return
      }
      if (ctrl) return
      switch (e.key) {
        case 'Escape':
          resetTool()
          s.setTool('select')
          s.select([])
          return
        case 'Delete':
        case 'Backspace':
          if (s.selection.length) s.removeObjects(s.selection)
          return
        case 'Tab':
          e.preventDefault()
          s.setViewMode(s.viewMode === '2d' ? '3d' : '2d')
          return
        case 'Home':
          resetCamera()
          return
        case ' ':
          e.preventDefault()
          s.setPlaying(!s.playing)
          return
        case '/':
        case 'Enter':
          e.preventDefault()
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
