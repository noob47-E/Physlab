// The Giac adapter (math/engine/giac/adapter.ts) passes the conformance suite against the real
// runtime: the app's own worker file runs headless in a Node worker thread and loads the vendored
// giacwasm.js (tests/engine/giacHeadless.ts), as sympy.conformance.test.ts runs Pyodide headless.
//
// Known gaps, and why the suite skips them (a job an adapter does not list is skipped by the suite
// and must be refused in a sentence, which its refusal test checks):
// - exact: Giac has no closed-form recogniser. Its exact() gives the nearest fraction
//   (1607521/1136689 for 1.4142135623730951, not √2), so answering would be a guess.
// - integralSteps, diffSteps: Giac returns no rule tree; the working is PhysLab's own methods' job (S1).
// The other engine's gap, 'infinite-number', is not one here: Giac sends ∞ as a number.

import { afterAll } from 'vitest'
import { engineConformance } from './conformance'
import { headlessGiacEngine } from './giacHeadless'
import type { GiacClient } from '../../src/renderer/src/math/engine/giac/worker'

let client: GiacClient | null = null

engineConformance(
  'giac (headless)',
  async () => {
    const made = headlessGiacEngine()
    client = made.client
    return made.engine
  },
  { timeoutMs: 60000 }
)

afterAll(() => client?.dispose())
