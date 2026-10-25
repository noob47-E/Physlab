import { enterMode } from '../app/layout'
import { usePure } from '../math/pure/store'
import { makeBody, useSandbox } from '../sim/store'
import type { BodyDef } from '../sim/types'
import { floor } from '../sim/presets'
import { useLab } from '../lab/labStore'
import { runCommand } from '../lang/commands'
import { fmt } from '../math/format'
import { run3WayTruthCheck, validatePhysicsScene } from './truthCheck'
import { useAiStore } from './store'
import { normalizeAction, sanitizeMathInput, stripIncompleteActionBlocks } from './contract'
import type { PhysLabAction, SpecialAgent } from './types'
import { TILES_3D, CHEMISTRY_TILES_3D } from '../math/graph3dTiles'
import { playTile } from '../panels/tiles3d'
import { resetCamera } from '../render/viewState'
import { scene } from '../core/store'

let actionCounter = 0

function stripMetaBullets(s: string): string {
  const bulletMatch = s.match(/^((?:\s*[-*•]\s+[^\n]+\n+)+)([\s\S]*)$/)
  if (bulletMatch) {
    const rest = bulletMatch[2].trim()
    if (rest.length > 0) {
      return rest
    }
  }
  return s
}

function parseAgentTraces(text: string): { agent: SpecialAgent; summary: string }[] {
  const agentTraces: { agent: SpecialAgent; summary: string }[] = []
  const agentPatterns: { agent: SpecialAgent; re: RegExp }[] = [
    { agent: 'OCR_VISION', re: /\[AGENT:\s*OCR_VISION\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'PLANNER_MINDMAP', re: /\[AGENT:\s*PLANNER_MINDMAP\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'MATH_AUDITOR', re: /\[AGENT:\s*MATH_AUDITOR\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'PHYSICS_SANDBOX', re: /\[AGENT:\s*PHYSICS_SANDBOX\]([\s\S]*?)(?=\[AGENT:|$)/i },
    { agent: 'HUMAN_TEACHER', re: /\[AGENT:\s*HUMAN_TEACHER\]([\s\S]*?)(?=\[AGENT:|$)/i }
  ]
  const seen = new Set<SpecialAgent>()
  for (const { agent, re } of agentPatterns) {
    const m = text.match(re)
    if (m && !seen.has(agent)) {
      seen.add(agent)
      agentTraces.push({
        agent,
        summary: m[1].replace(/<\/?think>/gi, '').trim().slice(0, 300)
      })
    }
  }
  return agentTraces
}

/**
 * Extracts <think>...</think> blocks and identifies special agent trace sections,
 * handling missing open tags, trailing tags, and meta-bullet cleanup.
 */
export function extractThinkTrace(text: string): {
  cleanContent: string
  think?: string
  agentTraces: { agent: SpecialAgent; summary: string }[]
} {
  if (!text) {
    return { cleanContent: '', agentTraces: [] }
  }

  let think: string | undefined
  let cleanContent = text

  const hasThinkOpen = /<think>/i.test(text)
  const hasThinkClose = /<\/think>/i.test(text)
  const thinkPairMatch = text.match(/<think>([\s\S]*?)<\/think>/i)

  if (thinkPairMatch) {
    // Case A: <think>...</think> pair exists
    think = thinkPairMatch[1].trim()
    cleanContent = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  } else if (!hasThinkOpen && hasThinkClose) {
    // Case B: No <think> open tag, but </think> exists
    const lastCloseIdx = text.lastIndexOf('</think>')
    const afterLastClose = text.slice(lastCloseIdx + 8).replace(/<\/?think>/gi, '').trim()

    if (afterLastClose.length > 0) {
      // Meaningful prose exists after </think>
      think = text.slice(0, lastCloseIdx).trim()
      cleanContent = afterLastClose
    } else {
      // No meaningful prose after </think> (e.g. </think> is at the very end!)
      const htMatch = text.match(/\[AGENT:\s*HUMAN_TEACHER\]/i)
      if (htMatch && htMatch.index !== undefined) {
        think = text.slice(0, htMatch.index).trim()
        const rawAfterHt = text.slice(htMatch.index + htMatch[0].length).replace(/<\/?think>/gi, '').trim()
        cleanContent = stripMetaBullets(rawAfterHt)
      } else {
        think = text.slice(0, lastCloseIdx).trim()
        cleanContent = afterLastClose
      }
    }
  } else if (!hasThinkOpen && !hasThinkClose && /\[AGENT:\s*[^\]]+\]/i.test(text)) {
    // Case C: No <think> or </think> tags, but [AGENT: ...] headers exist
    const htMatch = text.match(/\[AGENT:\s*HUMAN_TEACHER\]/i)
    if (htMatch && htMatch.index !== undefined) {
      think = text.slice(0, htMatch.index).trim()
      const rawAfterHt = text.slice(htMatch.index + htMatch[0].length).trim()
      cleanContent = stripMetaBullets(rawAfterHt)
    } else {
      think = text.trim()
      cleanContent = text.replace(/\[AGENT:\s*[^\]]+\][\s\S]*?(?=\[AGENT:|$)/gi, '').trim()
    }
  }

  // Finally, always strip any leftover </?think> tags and [AGENT: ...] markers from cleanContent
  cleanContent = cleanContent
    .replace(/<\/?think>/gi, '')
    .replace(/\[AGENT:\s*[^\]]+\]/gi, '')
    .trim()

  if (think) {
    think = think.replace(/<\/?think>/gi, '').trim()
  }

  const agentTraces = parseAgentTraces((think ? think + '\n' : '') + text)

  return { cleanContent, think: think || undefined, agentTraces }
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
    return '🧮 Verifying algebra with CAS engine…'
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
 * Builds an inclined plane scene with physics properties set without polluting undo past.
 */
export function buildInclineScene(params: {
  angleDeg: number
  massKg: number
  muStatic: number
  muKinetic: number
  staysStatic: boolean
}): { bodies: BodyDef[]; muEff: number } {
  const { angleDeg, massKg, muStatic, muKinetic, staysStatic } = params
  const muEff = staysStatic ? muStatic : muKinetic
  const rad = (angleDeg * Math.PI) / 180
  const rampWidth = 5
  const rampHeight = Math.max(0.1, Math.tan(rad) * rampWidth)

  const groundBody: BodyDef = {
    ...floor('concrete'),
    friction: muEff
  }

  const rampBody: BodyDef = {
    ...makeBody('ramp', 'Incline', [0, rampHeight / 2, 0]),
    size: [rampWidth, rampHeight, 1.5],
    friction: muEff,
    color: 'var(--mode-sandbox)'
  }

  const s = 0.7
  const xSurface = (s - 0.5) * rampWidth
  const ySurface = s * rampHeight
  const boxHalfH = 0.3
  const xBlock = xSurface - boxHalfH * Math.sin(rad)
  const yBlock = ySurface + boxHalfH * Math.cos(rad)

  const blockBody: BodyDef = {
    ...makeBody('box', 'Block', [xBlock, yBlock, 0]),
    size: [0.6, 0.6, 0.6],
    mass: massKg,
    friction: muEff,
    rotation: [0, 0, -angleDeg]
  }

  const bodies: BodyDef[] = [groundBody, rampBody, blockBody]
  return { bodies, muEff }
}

function extractRawJsonActions(text: string): { remainingText: string; rawActions: PhysLabAction[] } {
  const rawActions: PhysLabAction[] = []
  let remaining = text

  const toolCheckRegex =
    /"tool"\s*:\s*"(?:calc_solve|sandbox_experiment|mindmap_build|goal_update|graph_plot|graph3d_plot|quiz_challenge|app_guide|run_commands)"/

  let changed = true
  while (changed) {
    changed = false
    for (let i = 0; i < remaining.length; i++) {
      const char = remaining[i]
      if (char === '[' || char === '{') {
        const closeChar = char === '[' ? ']' : '}'
        let depth = 0
        let inString = false
        let escape = false
        let endIdx = -1

        for (let j = i; j < remaining.length; j++) {
          const c = remaining[j]
          if (escape) {
            escape = false
            continue
          }
          if (c === '\\') {
            escape = true
            continue
          }
          if (c === '"') {
            inString = !inString
            continue
          }
          if (inString) continue

          if (c === char) depth++
          else if (c === closeChar) {
            depth--
            if (depth === 0) {
              endIdx = j
              break
            }
          }
        }

        if (endIdx !== -1) {
          const candidate = remaining.slice(i, endIdx + 1)
          if (toolCheckRegex.test(candidate)) {
            try {
              const parsed = JSON.parse(candidate)
              const items = Array.isArray(parsed) ? parsed : [parsed]
              let validCount = 0
              for (const item of items) {
                const norm = normalizeAction(item)
                if (norm) {
                  rawActions.push({
                    id: `act_${Date.now()}_${++actionCounter}`,
                    tool: norm.tool,
                    args: norm.args,
                    status: 'pending'
                  })
                  validCount++
                }
              }
              if (validCount > 0) {
                remaining = remaining.slice(0, i) + remaining.slice(endIdx + 1)
                changed = true
                break
              }
            } catch {
              // Ignore ill-formed candidate and continue search
            }
          }
        }
      }
    }
  }

  return { remainingText: remaining, rawActions }
}

/**
 * Parses <physlab_action>{...}</physlab_action> JSON blocks and raw JSON action objects/arrays from the response.
 */
export function extractActions(text: string): {
  cleanContent: string
  actions: PhysLabAction[]
} {
  const actionRegex = /<physlab_action>([\s\S]*?)<\/physlab_action>/gi
  const actions: PhysLabAction[] = []
  let cleanText = text

  let match: RegExpExecArray | null
  while ((match = actionRegex.exec(text)) !== null) {
    try {
      const rawJson = match[1].trim()
      const parsed = JSON.parse(rawJson)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of items) {
        const norm = normalizeAction(item)
        if (norm) {
          actions.push({
            id: `act_${Date.now()}_${++actionCounter}`,
            tool: norm.tool,
            args: norm.args,
            status: 'pending'
          })
        }
      }
    } catch {
      // Ignore ill-formed JSON action blocks during streaming
    }
  }

  cleanText = cleanText.replace(actionRegex, '')

  // Scan remaining text for raw JSON objects / arrays containing "tool": "..."
  const { remainingText, rawActions } = extractRawJsonActions(cleanText)
  actions.push(...rawActions)

  const clean = stripIncompleteActionBlocks(remainingText)
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
        const input = sanitizeMathInput(String(action.args.input || ''))
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

        // Switch to Calculator mode and run in pure math engine (calcStore auto-syncs)
        enterMode('calculator')
        if (input) {
          const opToJob: Record<
            string,
            'differentiate' | 'integrate' | 'solve' | 'factor' | 'limit' | 'auto'
          > = {
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

        const presetMap: Record<string, string> = {
          'newtons-cradle': 'cradle',
          'newton-cradle': 'cradle',
          cradle: 'cradle',
          pendulum: 'pendulum',
          collision: 'collision',
          atwood: 'atwood',
          lever: 'seesaw',
          seesaw: 'seesaw',
          spring: 'spring',
          bouncing: 'bounce',
          bounce: 'bounce',
          rollslide: 'rollslide'
        }

        const presetId = String(action.args.presetId || '')
        const expType = String(action.args.experimentType || '')
        const targetPreset = presetId ? (presetMap[presetId] || presetId) : presetMap[expType]

        if (targetPreset) {
          useSandbox.getState().loadPreset(targetPreset)
          updatedAction.status = 'success'
          updatedAction.result = { message: `Loaded Sandbox preset "${targetPreset}".` }
          break
        }

        if (expType === 'projectile') {
          const validation = validatePhysicsScene(action.args)
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
          const v0 = Number(action.args.v0)
          const angleDeg = Number(action.args.angleDeg)
          const rad = (angleDeg * Math.PI) / 180
          const projSphere: BodyDef = {
            ...makeBody('sphere', 'Projectile', [-3, 0.5, 0]),
            velocity: [v0 * Math.cos(rad), v0 * Math.sin(rad), 0]
          }
          const bodies: BodyDef[] = [floor('concrete'), projSphere]
          useSandbox.getState().setScene(bodies, { airDensity: 0 })
          updatedAction.status = 'success'
          updatedAction.result = {
            message: `Projectile simulation loaded (v0 = ${fmt(v0)} m/s, θ = ${fmt(angleDeg)}°).`
          }
          break
        }

        if (expType === 'vertical_circle') {
          const validation = validatePhysicsScene(action.args)
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
          useSandbox.getState().loadPreset('pendulum')
          updatedAction.status = 'success'
          updatedAction.result = { message: 'Vertical circle loaded in Sandbox.' }
          break
        }

        const validation = validatePhysicsScene(action.args)
        const angleDeg = Number(action.args.angleDeg ?? action.args.angle)
        const massKg = Number(action.args.massKg ?? action.args.mass)
        const muStatic = Number(action.args.muStatic ?? action.args.frictionStatic)
        const muKinetic = Number(action.args.muKinetic ?? action.args.frictionKinetic)
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

        // Configure sandbox scene via buildInclineScene without polluting undo past
        const { bodies } = buildInclineScene({
          angleDeg,
          massKg,
          muStatic,
          muKinetic,
          staysStatic
        })
        const sb = useSandbox.getState()
        sb.setScene(bodies, { airDensity: 0 })

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

          const customTitle = String(action.args.title || 'Incline Dynamics')
          const tableTitle = `Predicted from a = ${fmt(accel)} m/s² (${customTitle})`

          useLab.getState().appendTable({
            id: `tab_sb_${Date.now()}`,
            title: tableTitle,
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

      case 'graph3d_plot': {
        enterMode('graphing')
        scene().setViewMode('3d')
        const target = String(action.args.preset || action.args.equation || '')
          .toLowerCase()
          .trim()
        const allTiles = [...TILES_3D, ...CHEMISTRY_TILES_3D]
        const matchedTile = allTiles.find((t) => {
          const id = t.id.toLowerCase()
          const title = t.title.toLowerCase()
          return (
            target === id ||
            target === title ||
            (target.length >= 3 && (target.includes(id) || target.includes(title)))
          )
        })

        if (matchedTile) {
          await playTile(matchedTile)
          updatedAction.status = 'success'
          updatedAction.result = { message: `Loaded 3D Gallery Tile "${matchedTile.title}".` }
        } else {
          let eq = sanitizeMathInput(String(action.args.equation || ''))
          if (!eq || !eq.includes('=')) {
            eq = eq ? `z = ${eq}` : 'z = sin(sqrt(x^2 + y^2))'
          }
          await runCommand(eq)
          setTimeout(resetCamera, 300)
          updatedAction.status = 'success'
          updatedAction.result = { message: `Plotted "${eq}" in 3D Graphing mode.` }
        }
        break
      }

      case 'graph_plot': {
        enterMode('graphing')
        scene().setViewMode('2d')
        const eq = sanitizeMathInput(String(action.args.equation || ''))
        if (eq) {
          await runCommand(eq)
        }
        updatedAction.status = 'success'
        updatedAction.result = { message: `Plotted "${eq}" in 2D Graphing mode.` }
        break
      }

      case 'run_commands': {
        const mode = String(action.args.mode || 'vectors')
        const view = action.args.view === '3d' ? '3d' : action.args.view === '2d' ? '2d' : undefined
        const commands = Array.isArray(action.args.commands) ? action.args.commands.map(String) : []
        try {
          enterMode(mode as Parameters<typeof enterMode>[0])
        } catch {
          // ignore
        }
        if (view) {
          scene().setViewMode(view)
        }
        for (const cmd of commands) {
          if (cmd.trim()) {
            await runCommand(cmd.trim())
          }
        }
        updatedAction.status = 'success'
        updatedAction.result = {
          message: `Executed ${commands.length} scene commands in ${mode} mode.`
        }
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
        const note = action.args.note ? String(action.args.note) : undefined
        if (goalTitle) {
          useAiStore.getState().incrementGoal(goalTitle, increment, note)
        }
        updatedAction.status = 'success'
        updatedAction.result = { message: `Updated Goal Keeper progress for "${goalTitle}".` }
        break
      }

      case 'quiz_challenge': {
        updatedAction.status = 'success'
        updatedAction.result = { message: 'Quiz challenge active.' }
        break
      }

      case 'app_guide': {
        const targetMode = String(action.args.mode || 'calculator')
        try {
          enterMode(targetMode as Parameters<typeof enterMode>[0])
        } catch {
          // ignore
        }
        updatedAction.status = 'success'
        updatedAction.result = { message: `Guided student to ${targetMode} mode.` }
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
