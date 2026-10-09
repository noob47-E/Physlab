// Counts of a few things the student DID (not what is on screen), for the Start here missions
// (app/tour/steps.ts). Reading the screen ticked missions nobody did: a graph loaded from a file, a
// vector retyped by the bar, a preset that set the clock to 0, and on a touch screen a tap on the
// shape the Sketch tool had already selected changed nothing to read at all.

import { create } from 'zustand'

export interface ActionCounts {
  /** A graph made by a line the student typed in the command bar. */
  typedGraphs: number
  /** A drag of a vector's head with the Move tool. */
  headDrags: number
  /** A click or tap on a shape (polygon or circle) with the Move tool. */
  shapeClicks: number
  /** The Sandbox's Reset (resetRun), not a preset or file load. */
  resets: number
}

export const useActionSignals = create<ActionCounts & { bump: (k: keyof ActionCounts) => void }>((set, get) => ({
  typedGraphs: 0,
  headDrags: 0,
  shapeClicks: 0,
  resets: 0,
  bump: (k) => set({ [k]: get()[k] + 1 } as Partial<ActionCounts>)
}))

export const bumpAction = (k: keyof ActionCounts): void => useActionSignals.getState().bump(k)

/**
 * What a Move-tool press on an object counts as: a click or tap (not moved) on a polygon or circle
 * is a shape click; a drag of a vector by its head is a head drag. `part` is the part of the object
 * the press started on ('head' for a vector's tip), or 'click' for a press that did not move.
 */
export function pressAction(type: string | undefined, part: string | undefined): keyof ActionCounts | null {
  // A finger tap that drifts a few pixels becomes a small drag of the body; it still selected the shape.
  if ((part === 'click' || part === 'body') && (type === 'polygon' || type === 'circle')) return 'shapeClicks'
  if (part === 'head' && type === 'vector') return 'headDrags'
  return null
}
