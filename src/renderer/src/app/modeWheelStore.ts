// Zustand store and transport pause/resume logic for the Esc Mode Wheel (Part L2)
//
// Opening the wheel pauses running simulation / replay / slider.
// Closing without picking resumes exactly what was running.
// Picking a new mode enters that mode, leaving the previous run paused.

import { create } from 'zustand'
import { scene } from '../core/store'
import { useTape } from '../sim/tapeStore'
import { enterMode } from './layout'
import { useApp, type ModeId } from './modes'
import { getWheelIndexByModeId, getWheelModeByIndex, WHEEL_MODES } from './modeWheelData'

interface PausedState {
  scenePlaying: boolean
  tapePlaying: boolean
}

interface ModeWheelState {
  open: boolean
  highlightedIndex: number
  pausedState: PausedState | null
  openWheel: () => void
  close: (picked?: boolean) => void
  toggle: () => void
  setHighlightedIndex: (index: number) => void
  selectIndex: (index: number) => void
  selectMode: (modeId: ModeId) => void
  handleKeyDown: (key: string, shiftKey?: boolean) => boolean
}

export const useModeWheel = create<ModeWheelState>((set, get) => ({
  open: false,
  highlightedIndex: 0,
  pausedState: null,

  openWheel: () => {
    if (get().open) return
    const s = scene()
    const scenePlaying = !!s?.playing
    let tapePlaying = false
    try {
      if (useTape.getState()?.playing) tapePlaying = true
    } catch {
      // tape store not yet initialized or test environment
    }

    const paused: PausedState = { scenePlaying, tapePlaying }
    if (scenePlaying) s.setPlaying(false)
    if (tapePlaying) {
      useTape.getState().pause()
      if (useTape.getState().playing) useTape.setState({ playing: false })
    }

    const currentMode = useApp.getState().mode
    const initialIndex = getWheelIndexByModeId(currentMode)

    set({
      open: true,
      highlightedIndex: initialIndex,
      pausedState: paused
    })
  },

  close: (picked = false) => {
    if (!get().open) return
    const paused = get().pausedState

    set({ open: false, pausedState: null })

    if (!picked && paused) {
      if (paused.scenePlaying) scene().setPlaying(true)
      if (paused.tapePlaying) {
        useTape.getState().play()
        if (!useTape.getState().playing) useTape.setState({ playing: true })
      }
    }
  },

  toggle: () => {
    if (get().open) {
      get().close(false)
    } else {
      get().openWheel()
    }
  },

  setHighlightedIndex: (index: number) => {
    if (index >= 0 && index < WHEEL_MODES.length) {
      set({ highlightedIndex: index })
    }
  },

  selectIndex: (index: number) => {
    if (index >= 0 && index < WHEEL_MODES.length) {
      const mode = WHEEL_MODES[index].id
      get().close(true)
      enterMode(mode)
    }
  },

  selectMode: (modeId: ModeId) => {
    get().close(true)
    enterMode(modeId)
  },

  handleKeyDown: (key: string, shiftKey = false) => {
    if (!get().open) return false

    if (key === 'Escape') {
      get().close(false)
      return true
    }

    // Number keys 1-7
    const num = parseInt(key, 10)
    if (!isNaN(num) && num >= 1 && num <= 7) {
      const mode = getWheelModeByIndex(num)
      if (mode) {
        get().selectMode(mode.id)
        return true
      }
    }

    // Navigation around the 7 modes
    if (key === 'ArrowRight' || key === 'ArrowDown' || (key === 'Tab' && !shiftKey)) {
      set((state) => ({
        highlightedIndex: (state.highlightedIndex + 1) % WHEEL_MODES.length
      }))
      return true
    }

    if (key === 'ArrowLeft' || key === 'ArrowUp' || (key === 'Tab' && shiftKey)) {
      set((state) => ({
        highlightedIndex: (state.highlightedIndex + WHEEL_MODES.length - 1) % WHEEL_MODES.length
      }))
      return true
    }

    if (key === 'Enter' || key === ' ') {
      get().selectIndex(get().highlightedIndex)
      return true
    }

    return false
  }
}))

/**
 * The open wheel's own key handler. The wheel takes focus when it opens, so a key reaches it first and then bubbled on to the app's
 * shortcuts (shortcuts.ts) as well: Esc closed the wheel and the same press, finding nothing else to do, opened it again; 3 picked
 * Geometry and flipped 2-D/3-D; Space picked a mode and set the Sandbox playing; the arrows turned a 3-D drawing behind it. A key the
 * wheel uses stops here; any other goes on (Ctrl+S still saves).
 */
export function wheelKeyDown(e: { key: string; shiftKey: boolean; preventDefault: () => void; stopPropagation: () => void }): void {
  if (!useModeWheel.getState().handleKeyDown(e.key, e.shiftKey)) return
  e.preventDefault()
  e.stopPropagation()
}
