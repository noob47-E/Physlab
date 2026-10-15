// 3D-2 (the owner's black 3-D canvas, seen right after the Sandbox and on a 2-D/3-D switch). A component that makes a GPU
// object in useMemo and disposes it in an effect's cleanup lost it under React's StrictMode: the development build mounts,
// cleans up and mounts again, so the cleanup disposed a geometry the component went on drawing. WebGPU then met a destroyed
// buffer in a frame ("[Buffer] used in submit while destroyed"), dropped that frame and every one after it, and the canvas
// stayed black. Found by switching disposals off file by file (FatLine's geometry: no error in 4 runs of 4; StrictMode off:
// none in 3 of 3). A production build does not mount twice, but the checks and the pictures run the development build.
//
// So the cleanup only schedules the dispose, a frame later, and mounting the same object again cancels it: StrictMode's
// second mount keeps the object, a real unmount (or a new object for new inputs) frees the old one once nothing draws it.

import { useEffect } from 'react'

const waiting = new Map<object, ReturnType<typeof setTimeout>>()

/** Frees `target` with `release` a little later, unless `keep` is called for it first. Exported for tests. */
export function releaseSoon<T extends object>(target: T, release: (t: T) => void, wait = 50): void {
  if (waiting.has(target)) return
  waiting.set(
    target,
    setTimeout(() => {
      waiting.delete(target)
      release(target)
    }, wait)
  )
}

/** The object is in use again (StrictMode's second mount): its pending release is called off. Exported for tests. */
export function keep(target: object): void {
  const t = waiting.get(target)
  if (t === undefined) return
  clearTimeout(t)
  waiting.delete(target)
}

/** Whether a release is waiting for `target`. For tests. */
export const releasePending = (target: object): boolean => waiting.has(target)

/**
 * Disposes `target` when the component lets go of it for good: unmounted, or given a new one for new inputs. Replaces
 * `useEffect(() => () => target.dispose(), [target])`, which StrictMode's double mount turned into a dispose of an object
 * still on screen. `null` and `undefined` are nothing to free.
 */
export function useReleaseLater<T extends object>(target: T | null | undefined, release: (t: T) => void): void {
  useEffect(() => {
    if (!target) return
    keep(target)
    return () => releaseSoon(target, release)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `release` is how to free it, not a reason to free it again
  }, [target])
}
