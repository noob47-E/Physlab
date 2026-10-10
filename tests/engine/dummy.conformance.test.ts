// The dummy engine (math/engine/dummy.ts, one job: diff) passes the conformance suite for the job
// it answers, and refuses the rest in a sentence: the socket takes a new engine with no other file
// changing.

import { engineConformance } from './conformance'
import { dummyEngine } from '../../src/renderer/src/math/engine/dummy'

engineConformance('dummy (mathjs diff)', async () => dummyEngine(), { timeoutMs: 10_000 })
