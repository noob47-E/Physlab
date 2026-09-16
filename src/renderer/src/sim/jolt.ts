// Loads the Jolt physics engine (WebAssembly, MIT) the first time the Sandbox is opened.
// Nothing here runs at startup, so the calculator and vectors keep their fast start.

import { useEffect, useState } from 'react'
import type JoltType from 'jolt-physics/wasm'

export type Jolt = typeof JoltType

let loading: Promise<Jolt> | null = null

/** Progress text for the UI while the engine loads. */
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
let state: LoadState = 'idle'
const listeners = new Set<(s: LoadState, message?: string) => void>()

export const joltState = () => state

/** React hook: re-renders when the engine finishes loading. */
export function useJoltState(): LoadState {
  const [value, setValue] = useState(state)
  useEffect(() => onJoltState((s) => setValue(s)), [])
  return value
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
