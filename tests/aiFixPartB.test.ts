import { describe, it, expect } from 'vitest'
import { extractThinkTrace } from '../src/renderer/src/ai/bridge'
import { stripIncompleteActionBlocks } from '../src/renderer/src/ai/contract'
import { PHYSLAB_BRAIN_BASE_PROMPT } from '../src/renderer/src/ai/systemPrompt'
import {
  OWNER_PASTED_CEVA_ANSWER,
  OWNER_PASTED_ANSWER_WITH_HALF_STREAM
} from './fixtures/ownerPastedAnswer'

describe('Part B: Clean Answers & Planning Stripping', () => {
  describe('Owner pasted answer pattern fixture', () => {
    it('moves planning text and tags out of cleanContent and into think in extractThinkTrace', () => {
      const trace = extractThinkTrace(OWNER_PASTED_CEVA_ANSWER)

      // Clean content must NOT have planning bullets or stray action tags
      expect(trace.cleanContent).not.toMatch(/Domain:/i)
      expect(trace.cleanContent).not.toMatch(/User wants to construct/i)
      expect(trace.cleanContent).not.toMatch(/We will use run_commands/i)
      expect(trace.cleanContent).not.toMatch(/<\/physlab_action>/i)
      expect(trace.cleanContent).not.toMatch(/<physlab_action>/i)

      // The real mathematical explanation remains intact in clean content
      expect(trace.cleanContent).toMatch(/Ceva's Theorem states that/i)
      expect(trace.cleanContent).toMatch(/\\frac{BD}{DC}/)

      // The planning text is preserved in think for the collapsed thinking UI section
      expect(trace.think).toBeDefined()
      expect(trace.think).toMatch(/Domain: Geometry/i)
      expect(trace.think).toMatch(/User wants to construct/i)
      expect(trace.think).toMatch(/We will use run_commands/i)
      expect(trace.think).not.toMatch(/<\/physlab_action>/i)
    })

    it('strips planning bullets and stray tags completely in stripIncompleteActionBlocks', () => {
      const cleaned = stripIncompleteActionBlocks(OWNER_PASTED_CEVA_ANSWER)

      expect(cleaned).not.toMatch(/Domain:/i)
      expect(cleaned).not.toMatch(/User wants to construct/i)
      expect(cleaned).not.toMatch(/We will use run_commands/i)
      expect(cleaned).not.toMatch(/<\/physlab_action>/i)
      expect(cleaned).not.toMatch(/<physlab_action>/i)
      expect(cleaned).toMatch(/Ceva's Theorem states that/i)
    })

    it('handles half-streamed action tags at the end of text', () => {
      const cleaned = stripIncompleteActionBlocks(OWNER_PASTED_ANSWER_WITH_HALF_STREAM)

      expect(cleaned).not.toMatch(/Domain:/i)
      expect(cleaned).not.toMatch(/<\/physlab_act/i)
      expect(cleaned).not.toMatch(/<\/physlab_action>/i)
      expect(cleaned).toMatch(/Here is the theorem:/i)
      expect(cleaned).toMatch(/\\frac{AF}{FB}/)
    })

    it('strips streaming unclosed action block', () => {
      const raw = 'Here is the answer:\n<physlab_action>{"tool": "run_commands", "args": {"commands": ["A=(0,0)"'
      const cleaned = stripIncompleteActionBlocks(raw)
      expect(cleaned).toBe('Here is the answer:')
    })
  })

  describe('System prompt rules verification', () => {
    it('instructs exact coordinates for constructions', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/Constructions use exact coordinates/i)
    })

    it('instructs measuring theorems with PhysLab numbers rather than restating', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/For a theorem: construct it, then measure it with PhysLab/i)
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/Never "prove" by restating the theorem/i)
    })

    it('instructs asking one short question when unclear', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/Ask one short question instead of guessing when the request is unclear/i)
    })

    it('contains honest action instruction and remove examples', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/The AI may only say it did something when PhysLab confirms it happened on screen/i)
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/remove the circle/i)
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toMatch(/clear the graph/i)
    })
  })
})
