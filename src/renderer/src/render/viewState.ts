import { create } from 'zustand'
import { turnAngles, type TurnDirection } from './viewMath'
import { overlay } from './overlay'

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
export const resetCamera = () => {
  // Home means home: a turn still easing in would carry the view off again.
  pendingTurn.az = 0
  pendingTurn.el = 0
  useCameraCommand.setState({ nonce: Date.now(), kind: 'home', box: undefined })
}
/** Zoom and pan so every visible object fits in the view, or just `box` when one is given. */
export const fitCamera = (box?: FitBox) => setTimeout(() => useCameraCommand.setState({ nonce: Date.now(), kind: 'fit', box }), 30)

/**
 * The Turn switch over the 3-D drawing. While it is on, the left button and one finger turn the
 * view whatever tool is out (see drag3D in viewMath.ts); choosing a tool switches it off.
 */
export const useTurnMode = create<{ on: boolean }>(() => ({ on: false }))

/**
 * Turns asked for by the arrow keys and the turn buttons that are not on screen yet. CameraRig
 * eases them in, a share each frame. A plain object, not a store: it is written inside the frame,
 * and a store written inside a frame cannot be what asks for the next one (see the Invalidator).
 */
export const pendingTurn = { az: 0, el: 0 }
let wake: (() => void) | null = null

/** Turn the 3-D drawing one step (a small one with `fine`); several presses add up. */
export function turnView(dir: TurnDirection, fine = false): void {
  // No CameraRig, no drawing to turn: saving the turn up would swing the view round the moment
  // the drawing came back.
  if (!wake) return
  const a = turnAngles(dir, fine)
  pendingTurn.az += a.az
  pendingTurn.el += a.el
  // The canvas draws on demand: nothing moves unless someone asks for the frame.
  wake()
}

/**
 * Whether the 3-D drawing is on screen to be turned: a CameraRig is registered and its canvas is
 * in the page and not hidden (a tab behind another, or a panel shut, has no offsetParent).
 */
export function isViewShown(): boolean {
  const host = overlay.canvasHost
  return wake !== null && !!host && host.isConnected && host.offsetParent !== null
}

/** CameraRig registers how to ask for a frame; returns the way to unregister. */
export function onTurnRequested(fn: () => void): () => void {
  wake = fn
  return () => {
    if (wake === fn) wake = null
  }
}
