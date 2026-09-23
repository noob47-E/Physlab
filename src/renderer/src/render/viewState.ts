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
/** A box on the drawing to frame, lowest corner and highest corner. */
export type FitBox = { min: [number, number, number]; max: [number, number, number] }
export const useCameraCommand = create<{ nonce: number; kind: 'home' | 'fit'; box?: FitBox }>(() => ({ nonce: 0, kind: 'home' }))
export const resetCamera = () => useCameraCommand.setState({ nonce: Date.now(), kind: 'home', box: undefined })
/** Zoom and pan so every visible object fits in the view, or just `box` when one is given. */
export const fitCamera = (box?: FitBox) => setTimeout(() => useCameraCommand.setState({ nonce: Date.now(), kind: 'fit', box }), 30)
