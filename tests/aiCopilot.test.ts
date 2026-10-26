import { describe, expect, it } from 'vitest'
import { buildSystemPrompt, PHYSLAB_BRAIN_BASE_PROMPT } from '../src/renderer/src/ai/systemPrompt'
import {
  buildInclineScene,
  extractActions,
  extractThinkTrace,
  getBrainStageText
} from '../src/renderer/src/ai/bridge'
import {
  toLinearMath,
  run3WayTruthCheck,
  validatePhysicsScene,
  verifyMessage
} from '../src/renderer/src/ai/truthCheck'
import type { TruthCheckResult, PhysicsValidationResult } from '../src/renderer/src/ai/truthCheck'
import {
  CATEGORIES,
  G,
  OPS,
  SANDBOX_SPECS,
  extractLastBoxed,
  normalizeAction,
  sanitizeMathInput,
  validateAction,
  type ExperimentType,
  type MindMapCategory
} from '../src/renderer/src/ai/contract'
import type { PhysLabAction, VerificationState } from '../src/renderer/src/ai/types'
import { useAiStore } from '../src/renderer/src/ai/store'
import { useSandbox } from '../src/renderer/src/sim/store'
import { panelHome } from '../src/renderer/src/app/layoutMath'
import { PANEL_TITLES } from '../src/renderer/src/app/panels'

describe('PhysLab-Brain AI Copilot System', () => {
  describe('System Prompt & Core Instructions', () => {
    it('embeds prompt instructions and critical rules', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('PhysLab-Brain')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('<think>')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('<physlab_action>')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('calc_solve')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('sandbox_experiment')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('mindmap_build')
    })

    it('instructs physics boundary limits and incline static friction trap', () => {
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('static friction threshold')
      expect(PHYSLAB_BRAIN_BASE_PROMPT).toContain('Incline Static Check')
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

  describe('Contract Normalization & Validation (P1)', () => {
    it('exports G, OPS, CATEGORIES, SANDBOX_SPECS and converts linear math correctly', () => {
      expect(G).toBe(9.81)
      expect(OPS.has('diff')).toBe(true)
      expect(OPS.has('integrate')).toBe(true)
      expect(CATEGORIES.has('physics')).toBe(true)
      expect(CATEGORIES.has('concept')).toBe(true)
      expect(SANDBOX_SPECS.incline_friction.angleDeg).toEqual([0, 90])
      expect(SANDBOX_SPECS.projectile.v0).toEqual([1e-9, 1000])
      expect(SANDBOX_SPECS.vertical_circle.radiusM).toEqual([1e-9, 1000])

      const state: VerificationState = 'verified'
      expect(state).toBe('verified')
      const cat: MindMapCategory = 'concept'
      expect(cat).toBe('concept')
      const exp: ExperimentType = 'incline_friction'
      expect(exp).toBe('incline_friction')

      expect(toLinearMath('\\frac{1}{2}')).toBe('((1)/(2))')
    })

    it('normalizes v2.0 flat calc_solve, v2.0 nested sandbox_experiment, and v2.0 mindmap_build into canonical { tool, args }', () => {
      // 1. v2.0 flat calc_solve
      const flatCalc = {
        tool: 'calc_solve',
        expr: '(x^2 - 1)/(x - 1)',
        operation: 'simplify',
        variable: 'x',
        answer: 'x + 1'
      }
      const normCalc = normalizeAction(flatCalc)
      expect(normCalc).toEqual({
        tool: 'calc_solve',
        args: {
          input: '(x^2 - 1)/(x - 1)',
          op: 'simplify',
          var: 'x',
          boxedAnswer: 'x + 1'
        }
      })

      // 2. v2.0 nested sandbox_experiment
      const nestedSandbox = {
        tool: 'sandbox_experiment',
        scene: {
          bodies: [
            { type: 'ramp', angle: 25, mu_s: 0.65, mu_k: 0.5 },
            { type: 'box', mass: 5 }
          ]
        }
      }
      const normSandbox = normalizeAction(nestedSandbox)
      expect(normSandbox?.tool).toBe('sandbox_experiment')
      expect(normSandbox?.args.angleDeg).toBe(25)
      expect(normSandbox?.args.massKg).toBe(5)
      expect(normSandbox?.args.muStatic).toBe(0.65)
      expect(normSandbox?.args.muKinetic).toBe(0.5)

      // 3. v2.0 mindmap_build with parent field
      const parentMindMap = {
        tool: 'mindmap_build',
        nodes: [
          { id: 'n1', label: 'Incline Mechanics', category: 'physics' },
          { id: 'n2', label: 'Static Friction Trap', category: 'trap', parent: 'n1' }
        ]
      }
      const normMindMap = normalizeAction(parentMindMap)
      expect(normMindMap?.tool).toBe('mindmap_build')
      const edges = normMindMap?.args.edges as Array<{ source: string; target: string }>
      expect(edges).toHaveLength(1)
      expect(edges[0]).toEqual({ source: 'n1', target: 'n2' })
    })

    it('accepts valid actions and rejects unphysical/dangling parameters', () => {
      // Rejects muStatic < muKinetic
      const badFriction = {
        tool: 'sandbox_experiment',
        args: { angleDeg: 25, massKg: 5, muStatic: 0.3, muKinetic: 0.6 }
      }
      expect(validateAction(badFriction).ok).toBe(false)

      // Rejects dangling mindmap edges
      const danglingEdge = {
        tool: 'mindmap_build',
        args: {
          nodes: [{ id: 'n1', label: 'A', category: 'concept' }],
          edges: [{ source: 'n1', target: 'n_missing' }]
        }
      }
      expect(validateAction(danglingEdge).ok).toBe(false)

      // Rejects out-of-range answerIndex in quiz
      const badQuiz = {
        tool: 'quiz_challenge',
        args: {
          question: 'What is g?',
          choices: ['9.81 m/s²', '3.14 m/s²'],
          answerIndex: 5
        }
      }
      expect(validateAction(badQuiz).ok).toBe(false)
    })

    it('extracts nested fractions intact and picks the last \\boxed{...}', () => {
      const single =
        'The derivative is \\boxed{\\frac{3x^{3/2}+3\\sqrt{x}+2x+1}{2\\sqrt{x}\\sqrt{x+1}}} and that is all.'
      expect(extractLastBoxed(single)).toBe(
        '\\frac{3x^{3/2}+3\\sqrt{x}+2x+1}{2\\sqrt{x}\\sqrt{x+1}}'
      )

      const multiple = 'First we thought \\boxed{x=1}, but then proved \\boxed{x=4}.'
      expect(extractLastBoxed(multiple)).toBe('x=4')
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

    it('extracts think trace and cleans content when <think> open tag is missing', () => {
      const raw = '[AGENT: OCR_VISION] Reading problem [AGENT: HUMAN_TEACHER] Hello! </think>'
      const res = extractThinkTrace(raw)
      expect(res.cleanContent).toBe('Hello!')
      expect(res.cleanContent).not.toContain('</think>')
      expect(res.cleanContent).not.toContain('[AGENT:')
      expect(res.think).toContain('[AGENT: OCR_VISION]')
      expect(res.agentTraces.some((t) => t.agent === 'OCR_VISION')).toBe(true)
      expect(res.agentTraces.some((t) => t.agent === 'HUMAN_TEACHER')).toBe(true)
    })

    it('extracts raw JSON action arrays emitted without <physlab_action> tags', () => {
      const raw =
        'Here is the step:\n[{"tool": "calc_solve", "args": {"input": "what is 12 + 3233 + -123", "op": "simplify"}}]\nDone!'
      const { cleanContent, actions } = extractActions(raw)
      expect(actions).toHaveLength(1)
      expect(actions[0].tool).toBe('calc_solve')
      expect(actions[0].args.input).toBe('12 + 3233 - 123')
      expect(cleanContent).toContain('Here is the step:')
      expect(cleanContent).toContain('Done!')
      expect(cleanContent).not.toContain('"tool"')
    })

    it('sanitizes English prose and normalizes +- in math expressions', () => {
      expect(sanitizeMathInput('what is 12 + 3233 + -123')).toBe('12 + 3233 - 123')
    })
  })

  describe('3-Way Truth Check Logic', () => {
    it('verifies algebraic identities and numerical spot-checking', async () => {
      // (x^2 - 1)/(x - 1) is equivalent to x + 1 for x != 1
      const res: TruthCheckResult = await run3WayTruthCheck(
        '(x^2 - 1)/(x - 1)',
        'x + 1',
        'x',
        'simplify'
      )
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
      const res: PhysicsValidationResult = validatePhysicsScene({
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
      expect(
        invertedFriction.reasons.some((r) => r.includes('Static friction coefficient'))
      ).toBe(true)
    })
  })

  describe('Real Verifier Gate (P2 & Rule 3)', () => {
    it('verifies or flags message answers according to physics and math engines', async () => {
      // 1. Colab v2.0 failure case: 25° incline, m=5, mu_s=0.65, mu_k=0.50 -> stationary (a=0)
      // Model claims \boxed{1.84}\text{ m/s}^2
      const inclineAction: PhysLabAction = {
        id: 'act_1',
        tool: 'sandbox_experiment' as const,
        args: { angleDeg: 25, massKg: 5, muStatic: 0.65, muKinetic: 0.5 }
      }
      const v1 = await verifyMessage(
        'The block slides with acceleration $\\boxed{1.84}\\text{ m/s}^2$.',
        [inclineAction]
      )
      expect(v1.state).toBe('disagrees')
      expect(v1.engineAnswerText).toBe('0 m/s²')
      expect(inclineAction.verified).toBe(false)

      // 2. Calculus derivative true answer:
      const calcAction: PhysLabAction = {
        id: 'act_2',
        tool: 'calc_solve' as const,
        args: {
          input: '(sqrt(x+1)*(x^(3/2)-1))/(sqrt(x)-1)',
          op: 'diff',
          var: 'x'
        }
      }
      const v2 = await verifyMessage(
        'The true derivative is $\\boxed{\\frac{3x^{3/2}+3\\sqrt{x}+2x+1}{2\\sqrt{x}\\sqrt{x+1}}}$.',
        [calcAction]
      )
      expect(v2.state).toBe('verified')
      expect(calcAction.verified).toBe(true)

      // 3. Model claims undifferentiated input for op: 'diff'
      const v3 = await verifyMessage(
        'The answer is $\\boxed{\\frac{\\sqrt{x+1}(x^{3/2}-1)}{\\sqrt{x}-1}}$.',
        [calcAction]
      )
      expect(v3.state).toBe('disagrees')

      // 4. Model claims no real solution for quadratic with Delta < 0 (-x^2 + 2x - 8 = 0)
      const v4 = await verifyMessage(
        'The equation $-x^2 + 2x - 8 = 0$ has discriminant $\\Delta = 4 - 32 = -28 < 0$, so there is $\\boxed{\\text{no solution}}$.',
        [
          {
            id: 'act_no_sol',
            tool: 'calc_solve',
            args: {
              input: '-x^2 + 2x - 8 = 0',
              op: 'solve',
              var: 'x',
              boxedAnswer: 'no solution'
            }
          }
        ]
      )
      expect(v4.state).toBe('verified')

      // 5. Model solves exact plain arithmetic
      const v5 = await verifyMessage('12 + 3233 - 123 evaluates to $\\boxed{3122}$.', [
        {
          id: 'act_arith',
          tool: 'calc_solve',
          args: {
            input: '12 + 3233 - 123',
            op: 'simplify',
            var: 'x',
            boxedAnswer: '3122'
          }
        }
      ])
      expect(v5.state).toBe('verified')
    })
  })

  describe('Incline Scene Builder (A5)', () => {
    it('sets equal friction (muEff) on ramp and block and rotates block to -angleDeg without mutating undo past', () => {
      const pastBefore = useSandbox.getState().past.length
      const sceneDef = buildInclineScene({
        angleDeg: 30,
        massKg: 4,
        muStatic: 0.6,
        muKinetic: 0.4,
        staysStatic: true
      })
      const pastAfter = useSandbox.getState().past.length
      expect(pastAfter).toBe(pastBefore) // past not mutated!

      expect(sceneDef.muEff).toBe(0.6)
      const ramp = sceneDef.bodies.find((b) => b.shape === 'ramp')
      const block = sceneDef.bodies.find((b) => b.shape === 'box')
      expect(ramp).toBeDefined()
      expect(block).toBeDefined()
      expect(ramp?.friction).toBe(0.6)
      expect(block?.friction).toBe(0.6)
      expect(block?.rotation).toEqual([0, 0, -30])
    })
  })

  describe('Live Brain Stage Derivation', () => {
    it('identifies appropriate agent stage based on stream contents', () => {
      expect(getBrainStageText('')).toBe('🔍 Reading problem / diagram…')
      expect(getBrainStageText('<think>\n[AGENT: OCR_VISION] scanning diagram')).toBe(
        '🔍 Reading problem / diagram…'
      )
      expect(getBrainStageText('<think>...[AGENT: PLANNER_MINDMAP] building map')).toBe(
        '🧭 Planning concept graph…'
      )
      expect(getBrainStageText('<think>...[AGENT: MATH_AUDITOR] auditing steps')).toBe(
        '🧮 Verifying algebra with CAS engine…'
      )
      expect(
        getBrainStageText('<think>...[AGENT: PHYSICS_SANDBOX] checking incline limit')
      ).toBe('⚙️ Checking physical boundary limits…')
      expect(getBrainStageText('<think>...[AGENT: HUMAN_TEACHER] writing intuition')).toBe(
        '✍️ Writing intuition & steps…'
      )
      expect(getBrainStageText('<think>done</think> here is the final answer')).toBe(
        '✍️ Writing intuition & steps…'
      )
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

    it('deleting the only remaining thread creates a fresh fallback thread and updates activeThreadId (never empty string)', () => {
      const store = useAiStore.getState()
      const threadIds = [...store.threads.map((t) => t.id)]
      for (const id of threadIds) {
        useAiStore.getState().deleteThread(id)
      }
      const updated = useAiStore.getState()
      expect(updated.threads.length).toBe(1)
      expect(updated.activeThreadId).not.toBe('')
      expect(updated.activeThreadId).toBe(updated.threads[0].id)
    })
  })

  describe('Shell & Dockview Layout Integration', () => {
    it('registers ai_copilot in PANEL_TITLES and panelHome', () => {
      expect(PANEL_TITLES.ai_copilot).toBe('AI Tutor')
      expect(panelHome('ai_copilot')).toBe('left')
    })
  })
})
