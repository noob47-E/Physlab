// Loads the Jolt physics engine (WebAssembly, MIT) the first time the Sandbox is opened.
// Nothing here runs at startup, so the calculator and vectors keep their fast start.

import { useSyncExternalStore } from 'react'
import type JoltType from 'jolt-physics/wasm'

export type Jolt = typeof JoltType

let loading: Promise<Jolt> | null = null

/** Progress text for the UI while the engine loads. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
let state: LoadState = 'idle'
const listeners = new Set<(s: LoadState, message?: string) => void>()

export const joltState = () => state

/**
 * React hook: re-renders when the engine finishes loading. Read through the store hook rather
 * than a state-plus-effect pair: the engine used to become ready between a panel's first render
 * and its subscription, and "Starting the physics engine…" stayed on screen for good.
 */
export function useJoltState(): LoadState {
  return useSyncExternalStore(onJoltState, joltState)
}
export function onJoltState(fn: (s: LoadState, message?: string) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const setState = (s: LoadState, message?: string) => {
  state = s
  for (const fn of listeners) fn(s, message)
}

/**
 * Nothing may touch a Jolt type before this resolves — the WASM module has to finish
 * loading first, or every class is undefined.
 */
export function loadJolt(): Promise<Jolt> {
  if (!loading) {
    setState('loading')
    loading = (async () => {
      // In the app the .wasm sits in public/jolt/ (like the SymPy files); under Node (tests)
      // the loader finds it next to the package itself.
      const inBrowser = typeof window !== 'undefined' && !!window.location
      const base = inBrowser ? new URL('/jolt/', window.location.href).href : ''
      const init = (await import('jolt-physics/wasm')).default
      const options = inBrowser ? { locateFile: (file: string) => `${base}${file}` } : {}
      const jolt = (await init(options)) as unknown as Jolt
      setState('ready')
      console.info('PHYSLAB_CHECK jolt=ready')
      return jolt
    })().catch((e: unknown) => {
      setState('error', e instanceof Error ? e.message : String(e))
      loading = null
      throw e
    })
  }
  return loading
}
