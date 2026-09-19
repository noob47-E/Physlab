import { create } from 'zustand'

/** Coarse view information that React components can subscribe to (updated only on significant camera changes). */
export interface ViewInfo {
  /** Sampling bounds (visible area plus a margin). */
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  /** Visible height in world units (for asymptote detection). */
  viewH: number
  /** World units per pixel at the view centre. */
  wpp: number
  widthPx: number
  version: number
}

export const useView = create<ViewInfo>(() => ({
  xMin: -20,
  xMax: 20,
  yMin: -12,
  yMax: 12,
  viewH: 24,
  wpp: 0.02,
  widthPx: 1200,
  version: 0
}))

/** Request to reset / frame the camera; CameraRig listens. */
export const useCameraCommand = create<{ nonce: number; kind: 'home' | 'fit' }>(() => ({ nonce: 0, kind: 'home' }))
export const resetCamera = () => useCameraCommand.setState({ nonce: Date.now(), kind: 'home' })
/** Zoom and pan so every visible object fits in the view. */
export const fitCamera = () => setTimeout(() => useCameraCommand.setState({ nonce: Date.now(), kind: 'fit' }), 30)
