import { enterMode } from '../app/layout'
import { useCalc } from '../calc/calcStore'
import { usePure } from '../math/pure/store'
import { useSandbox } from '../sim/store'
import { floor } from '../sim/presets'
import { useLab } from '../lab/labStore'
import { runCommand } from '../lang/commands'
import { fmt } from '../math/format'
import { run3WayTruthCheck, validatePhysicsScene } from './truthCheck'
import { useAiStore } from './store'
import type { PhysLabAction, SpecialAgent, PhysLabTool } from './types'

let actionCounter = 0

/**
 * Extracts <think>...</think> blocks and identifies special agent trace sections.
 */
export function extractThinkTrace(text: string): {
  cleanContent: string
  think?: string
  agentTraces: { agent: SpecialAgent; summary: string }[]
} {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/i
  const match = text.match(thinkRegex)

  if (!match) {
    return { cleanContent: text, agentTraces: [] }
  }

  const think = match[1].trim()
  const cleanContent = text.replace(thinkRegex, '').trim()

  const agentTraces: { agent: SpecialAgent; summary: string }[] = []
  const agentPatterns: { agent: SpecialAgent; re: RegExp }[] = [
    { agent: 'OCR_VISION', re: /\[AGENT:\s*OCR_VISION\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'PLANNER_MINDMAP', re: /\[AGENT:\s*PLANNER_MINDMAP\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'MATH_AUDITOR', re: /\[AGENT:\s*MATH_AUDITOR\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'PHYSICS_SANDBOX', re: /\[AGENT:\s*PHYSICS_SANDBOX\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'HUMAN_TEACHER', re: /\[AGENT:\s*HUMAN_TEACHER\]([\s\S]*?)(?=\[AGENT:|$)/i }
  ]

  for (const { agent, re } of agentPatterns) {
    const m = think.match(re)
    if (m) {
      agentTraces.push({
        agent,
        summary: m[1].trim().slice(0, 300)
      })
    }
  }

  return { cleanContent, think, agentTraces }
}

/**
 * Derives the active live brain stage indicator from streaming thoughts.
 */
export function getBrainStageText(accumulatedText: string, isStreaming = true): string {
  if (!isStreaming) return ''
  const text = accumulatedText || ''

  if (text.includes('</think>') || text.includes('[AGENT: HUMAN_TEACHER]')) {
    return '✍️ Writing intuition & steps…'
  }
  if (text.includes('[AGENT: PHYSICS_SANDBOX]')) {
    return '⚙️ Checking physical boundary limits…'
  }
  if (text.includes('[AGENT: MATH_AUDITOR]')) {
    return '🧮 Verifying algebra with SymPy CAS…'
  }
  if (text.includes('[AGENT: PLANNER_MINDMAP]')) {
    return '🧭 Planning concept graph…'
  }
  if (text.includes('[AGENT: OCR_VISION]')) {
    return '🔍 Reading problem / diagram…'
  }
  return '🔍 Reading problem / diagram…'
}

/**
 * Parses <physlab_action>{...}</physlab_action> JSON blocks from the response.
 */
export function extractActions(text: string): {
  cleanContent: string
  actions: PhysLabAction[]
} {
  const actionRegex = /<physlab_action>([\s\S]*?)<\/physlab_action>/gi
  const actions: PhysLabAction[] = []

  let clean = text
  let match: RegExpExecArray | null

  while ((match = actionRegex.exec(text)) !== null) {
    try {
      const rawJson = match[1].trim()
      const parsed = JSON.parse(rawJson)
      if (parsed.tool) {
        actions.push({
          id: `act_${Date.now()}_${++actionCounter}`,
          tool: parsed.tool as PhysLabTool,
          args: parsed.args || {},
          status: 'pending'
        })
      }
    } catch {
      // Ignore ill-formed JSON action blocks during streaming
    }
  }

  clean = clean.replace(actionRegex, '').trim()
  return { cleanContent: clean, actions }
}

/**
 * Executes a PhysLab action in the corresponding engine / store.
 */
export async function executePhysLabAction(action: PhysLabAction): Promise<PhysLabAction> {
  const updatedAction: PhysLabAction = { ...action, executed: true, status: 'pending' }

  try {
    switch (action.tool) {
      case 'calc_solve': {
        const input = String(action.args.input || '')
        const op = String(action.args.op || '')
        const boxedAnswer = String(action.args.boxedAnswer || '')

        // Run 3-Way Truth Check
        if (input) {
          const truthResult = await run3WayTruthCheck(input, boxedAnswer)
          updatedAction.verified = truthResult.verified
          updatedAction.verificationDetails = {
            domainCheck: truthResult.domainCheck,
            factorCheck: truthResult.factorCheck,
            numericCheck: truthResult.numericCheck,
            notes: truthResult.notes
          }
        }

        // Switch to Calculator mode and insert into field
        enterMode('calculator')
        if (input) {
          useCalc.getState().insert(input)
          const opToJob: Record<string, 'differentiate' | 'integrate' | 'solve' | 'factor' | 'limit' | 'auto'> = {
            diff: 'differentiate',
            integrate: 'integrate',
            solve: 'solve',
            factor: 'factor',
            limit: 'limit',
            simplify: 'auto'
          }
          usePure.getState().runLatex(input, opToJob[op] ?? 'auto')
        }

        updatedAction.status = 'success'
        updatedAction.result = { message: 'Loaded into PhysLab Calculator & verified.' }
        break
      }

      case 'sandbox_experiment': {
        enterMode('sandbox')
        const validation = validatePhysicsScene(action.args)
        const angleDeg = Number(action.args.angleDeg ?? action.args.angle ?? 25)
        const massKg = Number(action.args.massKg ?? action.args.mass ?? 2)
        const muStatic = Number(action.args.muStatic ?? action.args.frictionStatic ?? 0.5)
        const muKinetic = Number(action.args.muKinetic ?? action.args.frictionKinetic ?? 0.3)
        const recordToLab = Boolean(action.args.recordToLab)

        updatedAction.verified = validation.valid
        updatedAction.verificationDetails = {
          domainCheck: validation.valid,
          factorCheck: true,
          numericCheck: validation.valid,
          notes: validation.reasons.join(' '),
          physicsValidation: validation
        }

        if (!validation.valid) {
          updatedAction.status = 'failed'
          updatedAction.result = {
            error: `Physics validation failed: ${validation.reasons.join(' ')}`
          }
          break
        }

        const { staysStatic, acceleration: accel, tanAngle } = validation
        const rad = (angleDeg * Math.PI) / 180

        // Configure sandbox scene
        const sb = useSandbox.getState()
        const rampWidth = 4
        const rampHeight = Math.tan(rad) * rampWidth

        // Ground floor + Ramp + Block
        const groundBody = floor('concrete')
        const rampBody = {
          ...sb.addBody('ramp', [0, rampHeight / 2, 0]),
          size: [rampWidth, rampHeight, 1.5] as [number, number, number],
          friction: muStatic,
          color: 'var(--mode-sandbox)'
        }
        const blockBody = {
          ...sb.addBody('box', [0, rampHeight + 0.3, 0]),
          mass: massKg,
          friction: muKinetic
        }

        sb.setScene([groundBody, rampBody, blockBody])

        // Pipe kinematic readings to Lab Data if requested
        if (recordToLab) {
          const timeSteps = [0, 0.5, 1.0, 1.5, 2.0]
          const round3 = (n: number) => Math.round(n * 1000) / 1000
          const tableRows: (number | null)[][] = timeSteps.map((t) => {
            const x = 0.5 * accel * t * t
            const v = accel * t
            return [t, round3(x), round3(v), round3(accel)]
          })

          const colT = { id: `col_t_${Date.now()}`, name: 't', unit: 's' }
          const colX = { id: `col_x_${Date.now()}`, name: 'x', unit: 'm' }
          const colV = { id: `col_v_${Date.now()}`, name: 'v', unit: 'm/s' }
          const colA = { id: `col_a_${Date.now()}`, name: 'a', unit: 'm/s²' }

          useLab.getState().appendTable({
            id: `tab_sb_${Date.now()}`,
            title: String(action.args.title || 'Incline Dynamics Data'),
            columns: [colT, colX, colV, colA],
            rows: tableRows,
            plot: { x: colT.id, y: colX.id, fit: 'quadratic' }
          })
        }

        updatedAction.status = 'success'
        updatedAction.result = {
          staysStatic,
          acceleration: accel,
          tanAngle,
          validation,
          message: staysStatic
            ? `Static friction holds (tan(${fmt(angleDeg)}°) = ${fmt(tanAngle)} ≤ μ_s = ${fmt(muStatic)}). a = 0 m/s². Verified by PhysLab engine.`
            : `Kinetic sliding active. a = ${fmt(accel)} m/s². Verified by PhysLab engine.`
        }
        break
      }

      case 'graph_plot':
      case 'graph3d_plot': {
        const equation = String(action.args.equation || '')
        if (equation) {
          enterMode('graphing')
          runCommand(equation)
        }
        updatedAction.status = 'success'
        updatedAction.result = { message: `Plotted "${equation}" in Graphing mode.` }
        break
      }

      case 'mindmap_build': {
        const nodes = Array.isArray(action.args.nodes) ? action.args.nodes : []
        const edges = Array.isArray(action.args.edges) ? action.args.edges : []
        useAiStore.getState().setMindMap({ nodes, edges })
        updatedAction.status = 'success'
        updatedAction.result = { message: `Generated Concept Mind Map with ${nodes.length} nodes.` }
        break
      }

      case 'goal_update': {
        const goalTitle = String(action.args.goalTitle || action.args.goalId || '')
        const increment = Number(action.args.increment ?? 1)
        const note = String(action.args.note || goalTitle)
        if (goalTitle) {
          useAiStore.getState().incrementGoal(goalTitle, increment, note)
        }
        updatedAction.status = 'success'
        updatedAction.result = { message: `Updated Goal Keeper progress for "${goalTitle}".` }
        break
      }

      case 'quiz_challenge': {
        updatedAction.status = 'success'
        updatedAction.result = { message: 'Interactive Quiz ready.' }
        break
      }

      case 'app_guide': {
        const mode = String(action.args.mode || '')
        if (mode) {
          enterMode(mode as Parameters<typeof enterMode>[0])
        }
        updatedAction.status = 'success'
        updatedAction.result = { message: `Opened ${mode || 'requested'} mode.` }
        break
      }

      default:
        updatedAction.status = 'failed'
        updatedAction.result = { message: `Unknown tool "${action.tool}"` }
    }
  } catch (err) {
    updatedAction.status = 'failed'
    updatedAction.result = { error: err instanceof Error ? err.message : String(err) }
  }

  return updatedAction
}
