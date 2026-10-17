// The vector problem solver's decisions that are not drawing, kept pure so the tests can pin them:
// which vectors a problem keeps when it is chosen and which it reads when it is solved, and which
// tab Practice's "Show it" brings forward.
import type { V3 } from '../math/vec'

type VecInput = { mode: 'comp' | 'polar' | 'scene'; comp: V3; mag: number; angle: number; sceneId: string; name: string }

export const newVec = (name: string, comp: V3 = [3, 4, 0]): VecInput => ({ mode: 'comp', comp, mag: 10, angle: 30, sceneId: '', name })

/** The starting value of the i-th vector a problem adds: A = (3, 4, 0), then (2, −1, 0). */
const starter = (i: number): V3 => (i === 0 ? [3, 4, 0] : [2, -1, 0])

/**
 * The vectors after choosing a problem that needs `need` of them (−1: two or more, 0: none), named
 * `names`. A vector already typed is kept: from one vector to "Add vectors" used to start again from
 * (3, 4, 0) and (2, −1, 0), losing the student's A.
 */
export function vectorsOnChoose(current: VecInput[], need: number, names: string[]): VecInput[] {
  if (need === 0) return current
  if (need === -1) {
    if (current.length >= 2) return current
    return [0, 1].map((i) => current[i] ?? newVec(names[i], starter(i)))
  }
  return Array.from({ length: need }, (_, i) => (current[i] ? { ...current[i], name: names[i] } : newVec(names[i], starter(i))))
}

/**
 * The vectors a problem reads when solved. A problem with no vectors reads none: every stored vector
 * was read first, so a left-over "from the scene" vector never picked stopped the components problem
 * with "Pick a vector for A".
 */
export function vectorsToSolve<T>(vecs: T[], need: number): T[] {
  if (need === 0) return []
  return need > 0 ? vecs.slice(0, need) : vecs
}

/**
 * The tab "Show it" brings to the front. Practice shares its dock group with the Sandbox and Lab
 * Data, so after "Send the readings to Lab Data" the table stayed behind Practice while the note
 * said "Switched to Lab Data". Graphing is a view of its own.
 */
export function panelToFront(mode: 'graphing' | 'sandbox' | 'lab'): 'sandbox' | 'labdata' | null {
  return mode === 'sandbox' ? 'sandbox' : mode === 'lab' ? 'labdata' : null
}
