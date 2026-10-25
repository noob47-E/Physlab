import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, PHYSLAB_BRAIN_BASE_PROMPT } from '../src/renderer/src/ai/systemPrompt'
import { extractActions, extractThinkTrace, getBrainStageText } from '../src/renderer/src/ai/bridge'
import { run3WayTruthCheck, validatePhysicsScene } from '../src/renderer/src/ai/truthCheck'
import type { TruthCheckResult, PhysicsValidationResult } from '../src/renderer/src/ai/truthCheck'
import { useAiStore } from '../src/renderer/src/ai/store'
import { panelHome } from '../src/renderer/src/app/layoutMath'
import { PANEL_TITLES } from '../src/renderer/src/app/panels'

describe('PhysLab-Brain AI Copilot System', () => {
  describe('System Prompt & 5 Special Agents', () => {
    it('embeds all 5 Ultimatrix special agents', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('[AGENT: OCR_VISION]')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('[AGENT: PLANNER_MINDMAP]')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('[AGENT: MATH_AUDITOR]')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('[AGENT: PHYSICS_SANDBOX]')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('[AGENT: HUMAN_TEACHER]')
    })

    it('instructs 3-Way Truth Check and incline static friction trap', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('3-Way Truth Check')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('f_{s,\\max} = \\mu_s m g \\cos\\theta')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('<physlab_action>')
    })

    it('injects dynamic Mem0 student memory and study goals into prompt', () => {
      const mockMemories = [
        {
          id: 'm1',
          topic: 'Calculus',
          weakness: 'Quotient factor cancellation',
          strength: 'Power rule',
          note: 'Remember to check difference of cubes',
          updatedAt: Date.now()
        }
      ]
      const mockGoals = [
        {
          id: 'g1',
          title: 'Master Incline Friction Trap',
          target: 3,
          current: 2,
          completed: false
        }
      ]

      const prompt = buildSystemPrompt(mockMemories, mockGoals)
      expect(prompt).toContain('<student_profile>')
      expect(prompt).toContain('Quotient factor cancellation')
      expect(prompt).toContain('<study_goals>')
      expect(prompt).toContain('Master Incline Friction Trap (2/3)')
    })
  })

  describe('Action & Think Trace Extraction', () => {
    it('extracts <think> block and tags individual agent traces', () => {
      const raw = `<think>
[AGENT: OCR_VISION]
Decoded diagram: 28° incline with mass 2 kg and mu_s = 0.6.
[AGENT: PHYSICS_SANDBOX]
Static friction check: tan(28°) = 0.5317 <= 0.6, so block is stationary.
[AGENT: HUMAN_TEACHER]
Open with intuition hook about why friction holds.
</think>
### 💡 Intuition Hook
Before plugging in formulas, gravity cannot overcome static friction!
$$\\boxed{a = 0\\text{ m/s}^2}$$`

      const { cleanContent, think, agentTraces } = extractThinkTrace(raw)
      expect(think).toBeDefined()
      expect(think).toContain('Decoded diagram')
      expect(cleanContent).not.toContain('<think>')
      expect(cleanContent).toContain('Intuition Hook')

      expect(agentTraces.map((t) => t.agent)).toEqual([
        'OCR_VISION',
        'PHYSICS_SANDBOX',
        'HUMAN_TEACHER'
      ])
    })

    it('extracts <physlab_action> JSON blocks and cleans prose', () => {
      const raw = `Here is the experiment:
<physlab_action>
{
  "tool": "sandbox_experiment",
  "args": {
    "title": "28° Incline",
    "angleDeg": 28,
    "massKg": 2,
    "muStatic": 0.6,
    "muKinetic": 0.4
  }
}
</physlab_action>
Simulation ready to run!`

      const { cleanContent, actions } = extractActions(raw)
      expect(actions).toHaveLength(1)
      expect(actions[0].tool).toBe('sandbox_experiment')
      expect(actions[0].args.angleDeg).toBe(28)
      expect(cleanContent).toContain('Simulation ready to run!')
      expect(cleanContent).not.toContain('<physlab_action>')
    })
  })

  describe('3-Way Truth Check Logic', () => {
    it('verifies algebraic identities and numerical spot-checking', async () => {
      // (x^2 - 1)/(x - 1) is equivalent to x + 1 for x != 1
      const res: TruthCheckResult = await run3WayTruthCheck('(x^2 - 1)/(x - 1)', 'x + 1', 'x')
      expect(res.domainCheck).toBe(true)
      expect(res.numericCheck).toBe(true)
      expect(res.verified).toBe(true)
      expect(res.statusBadge).toBe('verified')
    })
  })

  describe('Deterministic Physics Constraint Validator', () => {
    it('proves static friction holds when tan(theta) <= mu_s', () => {
      // 25° incline, mu_s = 0.6, tan(25°) ≈ 0.4663 <= 0.6 => static holds, a = 0
      const res: PhysicsValidationResult = validatePhysicsScene({
        angleDeg: 25,
        massKg: 2,
        muStatic: 0.6,
        muKinetic: 0.4
      })
      expect(res.valid).toBe(true)
      expect(res.staysStatic).toBe(true)
      expect(res.acceleration).toBe(0)
      expect(res.tanAngle).toBeCloseTo(0.466, 2)
    })

    it('proves kinetic sliding occurs when tan(theta) > mu_s with exact acceleration', () => {
      // 45° incline, mu_s = 0.5, mu_k = 0.3, g = 9.81
      // a = 9.81 * (sin(45°) - 0.3*cos(45°)) = 9.81 * (0.7071 - 0.2121) = 9.81 * 0.4950 ≈ 4.856
      const res = validatePhysicsScene({
        angleDeg: 45,
        massKg: 2,
        muStatic: 0.5,
        muKinetic: 0.3
      })
      expect(res.valid).toBe(true)
      expect(res.staysStatic).toBe(false)
      expect(res.acceleration).toBeGreaterThan(4.8)
      expect(res.acceleration).toBeLessThan(4.9)
    })

    it('rejects unphysical parameters with detailed reasons', () => {
      const negativeMass = validatePhysicsScene({ massKg: -2, angleDeg: 30 })
      expect(negativeMass.valid).toBe(false)
      expect(negativeMass.reasons.some((r) => r.includes('Mass'))).toBe(true)

      const badAngle = validatePhysicsScene({ massKg: 1, angleDeg: 120 })
      expect(badAngle.valid).toBe(false)
      expect(badAngle.reasons.some((r) => r.includes('angle'))).toBe(true)

      const invertedFriction = validatePhysicsScene({
        massKg: 1,
        angleDeg: 30,
        muStatic: 0.2,
        muKinetic: 0.5
      })
      expect(invertedFriction.valid).toBe(false)
      expect(invertedFriction.reasons.some((r) => r.includes('Static friction coefficient'))).toBe(true)
    })
  })

  describe('Live Brain Stage Derivation', () => {
    it('identifies appropriate agent stage based on stream contents', () => {
      expect(getBrainStageText('')).toBe('🔍 Reading problem / diagram…')
      expect(getBrainStageText('<think>\n[AGENT: OCR_VISION] scanning diagram')).toBe('🔍 Reading problem / diagram…')
      expect(getBrainStageText('<think>...[AGENT: PLANNER_MINDMAP] building map')).toBe('🧭 Planning concept graph…')
      expect(getBrainStageText('<think>...[AGENT: MATH_AUDITOR] auditing steps')).toBe('🧮 Verifying algebra with SymPy CAS…')
      expect(getBrainStageText('<think>...[AGENT: PHYSICS_SANDBOX] checking incline limit')).toBe('⚙️ Checking physical boundary limits…')
      expect(getBrainStageText('<think>...[AGENT: HUMAN_TEACHER] writing intuition')).toBe('✍️ Writing intuition & steps…')
      expect(getBrainStageText('<think>done</think> here is the final answer')).toBe('✍️ Writing intuition & steps…')
    })
  })

  describe('AI Store State & Goal Keeper', () => {
    it('initializes with empty goals and memories', () => {
      const store = useAiStore.getState()
      expect(Array.isArray(store.goals)).toBe(true)
      expect(Array.isArray(store.memories)).toBe(true)
      expect(store.activeMindMap === null || typeof store.activeMindMap === 'object').toBe(true)
    })

    it('manages chat threads, study goals progress and toggles', () => {
      const store = useAiStore.getState()
      const newThreadId = store.createThread()
      expect(useAiStore.getState().activeThreadId).toBe(newThreadId)

      const msg = store.addMessage({
        role: 'user',
        content: 'Solve incline problem'
      })
      expect(msg.content).toBe('Solve incline problem')

      store.addGoal({
        title: 'Master Rotational Dynamics',
        target: 3,
        current: 1
      })
      const goal = useAiStore.getState().goals.find((g) => g.title === 'Master Rotational Dynamics')
      expect(goal).toBeDefined()
      expect(goal?.completed).toBe(false)

      if (goal) {
        store.incrementGoal(goal.id, 2)
        let updated = useAiStore.getState().goals.find((g) => g.id === goal.id)
        expect(updated?.current).toBe(3)
        expect(updated?.completed).toBe(true)

        store.decrementGoal(goal.id, 1)
        updated = useAiStore.getState().goals.find((g) => g.id === goal.id)
        expect(updated?.current).toBe(2)
        expect(updated?.completed).toBe(false)

        store.toggleGoal(goal.id)
        updated = useAiStore.getState().goals.find((g) => g.id === goal.id)
        expect(updated?.completed).toBe(true)
      }
    })
  })

  describe('Shell & Dockview Layout Integration', () => {
    it('registers ai_copilot in PANEL_TITLES and panelHome', () => {
      expect(PANEL_TITLES.ai_copilot).toBe('AI Tutor')
      expect(panelHome('ai_copilot')).toBe('left')
    })
  })
})
