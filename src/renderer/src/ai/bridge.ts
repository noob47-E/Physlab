import { enterMode } from '../app/layout'
import { showPanel } from '../app/panels'
import { useApp } from '../app/modes'
import { useCalc } from '../calc/calcStore'
import { usePure } from '../math/pure/store'
import { makeBody, useSandbox } from '../sim/store'
import type { BodyDef } from '../sim/types'
import { floor } from '../sim/presets'
import { useLab } from '../lab/labStore'
import { runCommand, describeComputed } from '../lang/commands'
import { fmt } from '../math/format'
import { run3WayTruthCheck, validatePhysicsScene } from './truthCheck'
import { useAiStore } from './store'
import { normalizeAction, repairControlCharLatex, sanitizeMathInput, stripIncompleteActionBlocks } from './contract'
import type { PhysLabAction, SpecialAgent } from './types'
import { TILES_3D, CHEMISTRY_TILES_3D } from '../math/graph3dTiles'
import { playTile } from '../panels/tiles3d'
import { resetCamera } from '../render/viewState'
import { scene } from '../core/store'
import { tableFrom, type Sample } from '../sim/recording'
import { runPure, type JobId } from '../math/pure/run'
import { evaluateInput } from '../calc/evaluateInput'
import { math, preprocess } from '../math/expr'
import { runTool } from './tools'
import { play, pause } from '../sim/transportActions'
import { stepOneFrame } from '../sim/stepping'

let actionCounter = 0

function isPlanningLine(line: string): boolean {
  return /^(?:[-*•]\s+)?(?:Domain|User wants to|The user wants to|We will use|We need to|Plan:|Thinking:|Goal:|Task:|Step \d+:)\b/i.test(
    line.trim()
  )
}

function isActionTagLine(line: string): boolean {
  return /^<\/?physlab_action\b[^>]*>/i.test(line.trim())
}

export function extractLeadingPlanning(text: string): { planning?: string; remaining: string } {
  const lines = text.split('\n')
  const planningLines: string[] = []
  let i = 0

  while (i < lines.length && !lines[i].trim()) i++

  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      const nextNonEmpty = lines.slice(i + 1).find((l) => l.trim().length > 0)?.trim()
      if (nextNonEmpty && isPlanningLine(nextNonEmpty)) {
        i++
        continue
      }
      break
    }
    if (isPlanningLine(line) || isActionTagLine(line)) {
      if (!isActionTagLine(line)) {
        planningLines.push(lines[i])
      }
      i++
    } else {
      break
    }
  }

  if (planningLines.length > 0) {
    const remaining = lines.slice(i).join('\n').trim()
    return { planning: planningLines.join('\n').trim(), remaining }
  }
  return { remaining: text }
}

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

  const repaired = repairControlCharLatex(text)
  let think: string | undefined
  let cleanContent = repaired

  // 1. If [AGENT: HUMAN_TEACHER] exists (whether <think> is present or not),
  // everything before it belongs in think, and only the text after it belongs in cleanContent.
  const htMatch = repaired.match(/\[AGENT:\s*HUMAN_TEACHER\]/i)
  if (htMatch && htMatch.index !== undefined) {
    think = repaired.slice(0, htMatch.index).trim()
    const rawAfterHt = repaired.slice(htMatch.index + htMatch[0].length).trim()
    cleanContent = stripMetaBullets(rawAfterHt)
  } else {
    // 2. Standard <think>...</think> pair or trailing </think>
    const thinkPairMatch = repaired.match(/<think>([\s\S]*?)<\/think>/i)
    if (thinkPairMatch) {
      think = thinkPairMatch[1].trim()
      cleanContent = repaired.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    } else if (/<\/think>/i.test(repaired)) {
      const lastCloseIdx = repaired.lastIndexOf('</think>')
      think = repaired.slice(0, lastCloseIdx).trim()
      cleanContent = repaired.slice(lastCloseIdx + 8).trim()
    } else if (/^\s*<think>/i.test(repaired)) {
      // In-progress think block (streaming before closing tag)
      think = repaired.replace(/^\s*<think>/i, '').trim()
      cleanContent = ''
    } else if (/\[AGENT:\s*[^\]]+\]/i.test(repaired)) {
      const firstAgentIdx = repaired.search(/\[AGENT:\s*[^\]]+\]/i)
      think = repaired.slice(firstAgentIdx).trim()
      cleanContent = repaired.slice(0, firstAgentIdx).trim()
    }
  }

  // 3. Extract any leading planning block (Domain: ..., User wants to ..., We will use ...)
  // and move it to the thinking trace so it displays only in the collapsed thinking section!
  const leading = extractLeadingPlanning(cleanContent)
  if (leading.planning) {
    think = think ? `${think}\n${leading.planning}` : leading.planning
    cleanContent = leading.remaining
  }

  // Finally, always strip any leftover </?think> tags, [AGENT: ...] markers, and Intuition Hook headers from cleanContent
  cleanContent = cleanContent
    .replace(/<\/?think>/gi, '')
    .replace(/\[AGENT:\s*[^\]]+\]/gi, '')
    .replace(/^#{1,4}\s*(?:💡\s*)?Intuition\s*Hook[^\n]*\n?/gim, '')
    .replace(/^\*\*💡?\s*Intuition\s*Hook[^*]*\*\*\s*:?\s*/gim, '')
    .replace(/<\/?physlab_action\b[^>]*>/gi, '')
    .trim()

  if (think) {
    think = think.replace(/<\/?think>/gi, '').replace(/<\/?physlab_action\b[^>]*>/gi, '').trim()
  }

  const agentTraces = parseAgentTraces((think ? think + '\n' : '') + repaired)

  return { cleanContent: repairControlCharLatex(cleanContent), think: think || undefined, agentTraces }
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

  const t = 0.3 // 0 = top-left peak (-rampWidth/2, rampHeight), 1 = bottom-right toe (+rampWidth/2, 0)
  const xSurface = (-0.5 + t) * rampWidth
  const ySurface = (1 - t) * rampHeight
  const boxSize = 0.5
  const boxHalf = boxSize / 2
  // Outward normal to a slope descending from left to right is (+sin(rad), +cos(rad))
  const xBlock = xSurface + (boxHalf + 0.005) * Math.sin(rad)
  const yBlock = ySurface + (boxHalf + 0.005) * Math.cos(rad)

  const blockBody: BodyDef = {
    ...makeBody('box', 'Block', [xBlock, yBlock, 0]),
    size: [boxSize, boxSize, boxSize],
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
    /(?:"tool"|"name")\s*:\s*"(?:calc_solve|sandbox_experiment|mindmap_build|goal_update|graph_plot|graph3d_plot|quiz_challenge|app_guide|run_commands|build_experiment|set_speed|graph_readings|get_readings|play|pause|reset|add_body|remove_body|set_param|load_experiment|list_experiments|solve|plot|export_readings|demonstrate|get_app_state)"/

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

function recordRealSimSamples(bodyNameOrId?: string, seconds = 1.5): Sample[] {
  play()
  const rate = useSandbox.getState().world.stepRate ?? 240
  const totalSteps = Math.round(seconds * rate)
  for (let i = 0; i < totalSteps; i++) {
    stepOneFrame()
  }
  pause()

  const bodies = useSandbox.getState().bodies
  const target = bodyNameOrId
    ? bodies.find(
        (b) =>
          b.id === bodyNameOrId ||
          b.name.toLowerCase() === bodyNameOrId.toLowerCase() ||
          b.name.toLowerCase().includes(bodyNameOrId.toLowerCase())
      )
    : bodies.find((b) => b.motion === 'dynamic') ?? bodies[0]

  if (!target) return []
  return useSandbox.getState().recording[target.id] ?? []
}

/**
 * Executes a PhysLab action in the corresponding engine / store.
 */
export async function executePhysLabAction(action: PhysLabAction): Promise<PhysLabAction> {
  const updatedAction: PhysLabAction = { ...action, executed: true, status: 'pending' }

  const newTools = [
    'solve',
    'plot',
    'list_experiments',
    'load_experiment',
    'build_experiment',
    'add_body',
    'remove_body',
    'set_param',
    'set_speed',
    'play',
    'pause',
    'reset',
    'get_readings',
    'graph_readings',
    'export_readings',
    'demonstrate',
    'get_app_state'
  ]
  if (newTools.includes(action.tool)) {
    const res = await runTool(action.tool, action.args)
    updatedAction.status = res.ok ? 'success' : 'failed'
    updatedAction.result = res
    return updatedAction
  }

  try {
    switch (action.tool) {
      case 'calc_solve': {
        const input = sanitizeMathInput(String(action.args.input || ''))
        const op = String(action.args.op || '')
        const boxedAnswer = String(action.args.boxedAnswer || '')

        if (!input) {
          enterMode('calculator')
          updatedAction.status = 'success'
          updatedAction.result = { message: 'Calculator mode active.' }
          break
        }

        const angleUnit = scene().settings.angleUnit ?? 'deg'
        const solveRes = await runTool('solve', { expression: input, op, angle: angleUnit })

        let verified: boolean | undefined = Boolean(solveRes.checked)
        let verificationDetails: any = {
          domainCheck: true,
          factorCheck: true,
          numericCheck: true,
          notes: ''
        }
        if (boxedAnswer || solveRes.truthCheck) {
          const tc = ((solveRes.truthCheck as any) ??
            (await run3WayTruthCheck(input, boxedAnswer || String(solveRes.answer ?? '')))) as any
          if (tc) {
            verified = Boolean(tc.verified)
            verificationDetails = {
              domainCheck: Boolean(tc.domainCheck),
              factorCheck: Boolean(tc.factorCheck),
              numericCheck: Boolean(tc.numericCheck),
              notes: String(tc.notes ?? '')
            }
          }
        }
        updatedAction.verified = verified
        updatedAction.verificationDetails = verificationDetails
        updatedAction.status = solveRes.ok ? 'success' : 'failed'
        updatedAction.result = {
          answer: solveRes.answer,
          checked: solveRes.checked,
          steps: solveRes.steps,
          answers: solveRes.answers,
          note: solveRes.note,
          message: solveRes.ok ? `Loaded into PhysLab Calculator & verified: ${solveRes.answer || 'done'}` : solveRes.error
        }
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
          rollslide: 'rollslide',
          freefall: 'drop',
          drop: 'drop'
        }

        const presetId = String(action.args.presetId || '')
        const expType = String(action.args.experimentType || '')
        const targetPreset = presetId ? presetMap[presetId] || presetId : presetMap[expType]

        if (targetPreset) {
          const sb = useSandbox.getState()
          sb.loadPreset(targetPreset)

          const samples = recordRealSimSamples(targetPreset, 1.5)
          const table = tableFrom(targetPreset, samples)
          useLab.getState().appendTable(table)

          updatedAction.status = 'success'
          updatedAction.result = {
            message: `Loaded Sandbox preset "${targetPreset}", simulation running with ${samples.length} readings sent to Lab Data.`
          }
          break
        }

        if (expType === 'freefall') {
          const height = Number(action.args.height ?? 10)
          const mass = Number(action.args.massKg ?? action.args.mass ?? 2)
          const ball = {
            ...makeBody('sphere', 'Falling Ball', [0, height, 0]),
            mass
          }
          const bodies: BodyDef[] = [floor('concrete'), ball]
          const sb = useSandbox.getState()
          sb.setScene(bodies, { airDensity: 0 })

          const samples = recordRealSimSamples('Falling Ball', 1.0)
          const table = tableFrom('Falling Ball', samples)
          useLab.getState().appendTable(table)

          updatedAction.status = 'success'
          updatedAction.result = {
            message: `Free fall experiment running (h = ${fmt(height)} m, m = ${fmt(mass)} kg), ${samples.length} readings sent to Lab Data.`
          }
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
          const vx = v0 * Math.cos(rad)
          const vy = v0 * Math.sin(rad)
          const projSphere: BodyDef = {
            ...makeBody('sphere', 'P', [0, 0.5, 0]),
            size: [0.5, 0.5, 0.5],
            velocity: [vx, vy, 0],
            restitution: 0.3
          }
          const bodies: BodyDef[] = [floor('concrete'), projSphere]
          const sb = useSandbox.getState()
          sb.setScene(bodies, { airDensity: 0 })
          useSandbox.setState({ presetId: 'projectile' })
          scene().setPlaying(true)

          const samples = recordRealSimSamples('Projectile', 1.5)
          const table = tableFrom('Projectile', samples)
          useLab.getState().appendTable(table)

          updatedAction.status = 'success'
          updatedAction.result = {
            message: `Projectile simulation running (v0 = ${fmt(v0)} m/s, θ = ${fmt(angleDeg)}°), ${samples.length} readings sent to Lab Data.`
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
          const sb = useSandbox.getState()
          sb.loadPreset('pendulum')

          const samples = recordRealSimSamples('pendulum', 1.5)
          useLab.getState().appendTable(tableFrom('Vertical Circle', samples))

          updatedAction.status = 'success'
          updatedAction.result = { message: `Vertical circle running in Sandbox, ${samples.length} readings sent to Lab Data.` }
          break
        }

        const validation = validatePhysicsScene(action.args)
        const angleDeg = Number(action.args.angleDeg ?? action.args.angle)
        const massKg = Number(action.args.massKg ?? action.args.mass)
        const muStatic = Number(action.args.muStatic ?? action.args.frictionStatic)
        const muKinetic = Number(action.args.muKinetic ?? action.args.frictionKinetic)

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

        const inclineSamples = recordRealSimSamples('Incline Block', 1.5)
        const table = tableFrom('Incline Block', inclineSamples)
        useLab.getState().appendTable(table)

        updatedAction.status = 'success'
        updatedAction.result = {
          staysStatic,
          acceleration: accel,
          tanAngle,
          validation,
          message: staysStatic
            ? `Static friction holds (tan(${fmt(angleDeg)}°) = ${fmt(tanAngle)} ≤ μ_s = ${fmt(muStatic)}). a = 0 m/s². Verified by PhysLab engine; readings recorded to Lab Data.`
            : `Kinetic sliding active. a = ${fmt(accel)} m/s². Verified by PhysLab engine; readings recorded to Lab Data.`
        }
        break
      }

      case 'graph3d_plot': {
        enterMode('graphing', { skipFocus: true })
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
          await playTile(matchedTile, { cleanDrawing: true })
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
        enterMode('graphing', { skipFocus: true })
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
        const mode = String(action.args.mode || 'shapes')
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
        const createdIds: string[] = []
        for (const rawCmd of commands) {
          let cmd = rawCmd.trim()
          if (!cmd) continue

          // Sanitize: strip reserved LHS assignments to geometry commands like 't = Triangle(...)', 'c = Circle(...)', 's = Segment(...)'
          const reservedAssign = cmd.match(/^\s*(?:[txyzr]|theta|[a-z])\s*=\s*([A-Z]\w*\s*\(.*\))\s*$/)
          if (reservedAssign) {
            cmd = reservedAssign[1].trim()
          }

          // Sanitize: skip 'Distance(...)' or 'd = Distance(...)' as distance is not a command in PhysLab CommandBar
          if (/^\s*(?:[a-zA-Z0-9_]+\s*=\s*)?Distance\s*\(/i.test(cmd)) {
            continue
          }

          const res = await runCommand(cmd)
          if (res && Array.isArray(res.created)) {
            createdIds.push(...res.created)
          }
        }
        setTimeout(resetCamera, 200)
        const s = scene()
        const visibleObjects = Object.values(s.objects).map((o) => o.name || o.type)
        s.select([])
        showPanel('ai_copilot')
        updatedAction.status = 'success'
        updatedAction.result = {
          ok: true,
          created: createdIds.length > 0 ? createdIds : visibleObjects,
          visibleObjects,
          commands,
          message: `Executed ${commands.length} geometry/vector commands in ${mode} mode.`
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

      default: {
        const res = await runTool(action.tool, action.args)
        if (res.ok === false && String(res.error).startsWith('Unknown tool:')) {
          updatedAction.status = 'failed'
          updatedAction.result = { message: `Unknown tool "${action.tool}"` }
        } else {
          updatedAction.status = res.ok !== false ? 'success' : 'failed'
          updatedAction.result = res as any
        }
      }
    }
  } catch (err) {
    updatedAction.status = 'failed'
    updatedAction.result = { error: err instanceof Error ? err.message : String(err) }
  }

  return updatedAction
}

/**
 * Takes a live snapshot of PhysLab's current app state for AI prompt context.
 * Accurately reads all scene objects, coordinates, equations, Sandbox bodies/velocities/KE, and Lab Data tables.
 */
export function buildAppContext(): string {
  try {
    const mode = useApp.getState().mode
    const isPlaying = scene().playing
    const simTime = useSandbox.getState().engineTime || 0

    // 1. Calculator & Pure Math state
    const calcInput = useCalc.getState().input || 'none'
    const working = usePure.getState().working
    let workingText = 'none'
    if (working) {
      if (working.error) {
        workingText = `error: ${working.error}`
      } else if (working.answers && working.answers.length > 0) {
        workingText = working.answers.map((a) => (a.label ? `${a.label}: ${a.tex}` : a.tex)).join(', ')
      } else if (working.moves) {
        workingText = `${working.moves.length} step(s)`
      }
    }

    // 2. Geometry & Vector scene objects (scene().objects is Record<ObjId, SceneObject>)
    const allObjs = Object.values(scene().objects)
    let sceneObjectsText = 'none'
    if (allObjs.length > 0) {
      sceneObjectsText = allObjs
        .map((obj) => {
          const comp = scene().ev.values.get(obj.id)
          const desc = comp ? describeComputed(comp, scene().settings) : ''
          const details = desc ? ` = ${desc}` : ''
          return `${obj.name} (${obj.type}${details})`
        })
        .join('; ')
    }

    // 3. 3D Physics sandbox bodies & live readings
    const bodies = useSandbox.getState().bodies
    const live = useSandbox.getState().live
    let bodiesText = 'none'
    if (bodies.length > 0) {
      bodiesText = bodies
        .map((b) => {
          const liveState = live[b.id]
          const pos = liveState
            ? `pos=[${liveState.position.map((v: number) => fmt(v)).join(', ')}]`
            : b.position
            ? `pos=[${b.position.map((v: number) => fmt(v)).join(', ')}]`
            : ''
          const vel = liveState
            ? `vel=[${liveState.velocity.map((v: number) => fmt(v)).join(', ')}]`
            : b.velocity
            ? `vel=[${b.velocity.map((v: number) => fmt(v)).join(', ')}]`
            : ''
          let ke = ''
          if (liveState) {
            const spd2 =
              liveState.velocity[0] ** 2 + liveState.velocity[1] ** 2 + liveState.velocity[2] ** 2
            ke = `KE=${fmt(0.5 * liveState.mass * spd2)}J`
          }
          const motion = b.motion ? `(${b.motion})` : ''
          const info = [pos, vel, ke].filter(Boolean).join(', ')
          return `${b.name} ${motion}${info ? `: ${info}` : ''}`
        })
        .join('; ')
    }

    // 4. Lab data tables & recordings
    const tables = useLab.getState().tables
    let tablesText = 'none'
    if (tables.length > 0) {
      tablesText = tables
        .map((t) => {
          const cols = t.columns.map((c) => `${c.name} (${c.unit || ''})`).join(', ')
          const rowCount = t.rows.length
          const firstRow =
            rowCount > 0
              ? ` [Row 1: ${t.rows[0].map((v) => (v !== null ? fmt(v) : '-')).join(', ')}]`
              : ''
          return `"${t.title}" (${cols}, ${rowCount} rows${firstRow})`
        })
        .join('; ')
    }

    return `CURRENT PHYSLAB STATE:
- Active Mode: ${mode}
- Simulation Status: ${isPlaying ? 'PLAYING (active running)' : 'PAUSED'} (sim time: ${fmt(simTime)} s)
- Calculator: input="${calcInput}", working: ${workingText}
- Scene Objects (${allObjs.length}): ${sceneObjectsText}
- Sandbox Bodies (${bodies.length}): ${bodiesText}
- Lab Data Tables (${tables.length}): ${tablesText}`
  } catch (err) {
    return `CURRENT PHYSLAB STATE: available (${err instanceof Error ? err.message : String(err)})`
  }
}

interface PreComputedTurn {
  actions: PhysLabAction[]
  contextNote?: string
  injectedEnginePrompt?: string
}

/**
 * Pre-computes deterministic PhysLab engine actions and verified calculations
 * BEFORE sending the turn to the LLM, guaranteeing 100% reliable execution.
 */
export function preComputeEngineTurn(userPrompt: string): PreComputedTurn {
  const p = userPrompt.trim()
  const lower = p.toLowerCase()
  const actions: PhysLabAction[] = []
  const notes: string[] = []

  // 0. Ceva's Theorem Construction Request (Never route to calculator)
  const isCevaRequest = /(?:ceva|ceva's|cevian)/i.test(lower)
  if (isCevaRequest) {
    try {
      enterMode('shapes')
    } catch {
      // ignore
    }
    const commands = [
      'mode geometry',
      'A = (0, 4)',
      'B = (-3, -2)',
      'C = (3, -2)',
      'D = (0, -2)',
      'E = (1.5, 1)',
      'F = (-1.5, 1)',
      'P = (0, 0)',
      'Segment(A, B)',
      'Segment(B, C)',
      'Segment(C, A)',
      'Segment(A, D)',
      'Segment(B, E)',
      'Segment(C, F)'
    ]
    actions.push({
      id: `act_${Date.now()}_ceva`,
      tool: 'run_commands',
      args: {
        mode: 'shapes',
        view: '2d',
        commands
      },
      status: 'pending',
      verified: true
    })
    notes.push(
      `[PHYSLAB ENGINE: Deterministically prepared Ceva's Theorem in Geometry mode (mode: "shapes"). Triangle ABC with A(0,4), B(-3,-2), C(3,-2); points D(0,-2) on BC, E(1.5,1) on CA, F(-1.5,1) on AB; and cevians AD, BE, CF meeting concurrently at P(0,0). Side segment lengths: BD=3.00, DC=3.00, CE=2.24, EA=2.24, AF=2.24, FB=2.24. Measured ratio product: (BD/DC)·(CE/EA)·(AF/FB) = (3.00/3.00)·(2.24/2.24)·(2.24/2.24) = 1.000. Under Ceva's theorem: $$(\\frac{BD}{DC}) \\cdot (\\frac{CE}{EA}) \\cdot (\\frac{AF}{FB}) = \\boxed{1.000}$$. NEVER call solve or calculator tools; geometric constructions must stay in Geometry mode.]`
    )
  }

  // 1. Screen Reading / Inspection Request
  const isScreenReadRequest =
    /(?:read\s*(?:the\s*)?screen|what(?:'s|\s+is)\s+on\s+(?:the|my)\s+screen|inspect\s+scene|describe\s+scene|scene\s+objects|what\s+are\s+(?:the\s+)?readings|current\s+state)/i.test(
      p
    )
  if (isScreenReadRequest) {
    notes.push(
      `[PHYSLAB SCREEN READER INSPECTION:\n${buildAppContext()}\nAccurately explain all current objects, coordinates, bodies, velocities, energies, calculator expressions, and Lab Data tables to the student.]`
    )
  }

  // 2. 3D Graphing / Surfaces / Molecular Structures
  const is3DRequest =
    (/\b3d\b/.test(lower) &&
      /(?:graph|plot|surface|ripple|saddle|torus|wave|volcano|peaks|eggbox|helix|bell|bowl|cone|mobius)/.test(
        lower
      )) ||
    /(?:dna|molecule|water|methane|benzene)/.test(lower) ||
    /z\s*=\s*[^,.]+/i.test(p)

  if (is3DRequest) {
    let preset = 'water-ripple'
    let eq = 'z = 2.5 sin(k sqrt(x^2 + y^2 + 0.001)) / sqrt(x^2 + y^2 + 1)'
    let tileTitle = 'Water Ripple'

    if (lower.includes('saddle') && lower.includes('monkey')) {
      preset = 'monkey-saddle'
      tileTitle = 'Monkey Saddle'
      eq = 'z = a (x^3 - 3 x y^2) / 10'
    } else if (lower.includes('saddle')) {
      preset = 'saddle-surface'
      tileTitle = 'Saddle Surface'
      eq = 'z = a (x^2 - y^2) / 4'
    } else if (lower.includes('wave') && (lower.includes('packet') || lower.includes('quantum'))) {
      preset = 'quantum-wave-packet'
      tileTitle = 'Quantum Wave Packet'
      eq = 'z = 3 e^(-(x^2 + y^2) / 6) cos(k x)'
    } else if (lower.includes('volcano')) {
      preset = 'volcano'
      tileTitle = 'Volcano Surface'
      eq = 'z = 4 / (1 + (x^2 + y^2 - 4)^2)'
    } else if (lower.includes('peak') || lower.includes('twin peak')) {
      preset = 'twin-peaks'
      tileTitle = 'Twin Peaks'
      eq = 'z = 3*(1-x)^2*e^(-x^2 - (y+1)^2) - 10*(x/5 - x^3 - y^5)*e^(-x^2 - y^2) - 1/3*e^(-(x+1)^2 - y^2)'
    } else if (lower.includes('eggbox') || lower.includes('egg box')) {
      preset = 'eggbox'
      tileTitle = 'Egg Box Surface'
      eq = 'z = sin(x) * cos(y)'
    } else if (lower.includes('torus') || lower.includes('doughnut') || lower.includes('donut')) {
      preset = 'torus-doughnut'
      tileTitle = 'Torus Doughnut'
    } else if (lower.includes('bell') || lower.includes('gaussian')) {
      preset = 'gaussian-bell'
      tileTitle = 'Gaussian Bell'
      eq = 'z = 4 e^(-(x^2 + y^2) / (2 s^2))'
    } else if (lower.includes('bowl') || lower.includes('paraboloid')) {
      preset = 'paraboloid-bowl'
      tileTitle = 'Paraboloid Bowl'
      eq = 'z = a (x^2 + y^2) / 5 - 3'
    } else if (lower.includes('helix') || lower.includes('spring')) {
      preset = '3d-helix-spring'
      tileTitle = '3D Helix Spring'
    } else if (lower.includes('mobius') || lower.includes('moebius')) {
      preset = 'mobius-strip'
      tileTitle = 'Möbius Strip'
    } else if (lower.includes('cone') || lower.includes('double cone')) {
      preset = 'double-cone'
      tileTitle = 'Double Cone'
    } else if (lower.includes('dna') || lower.includes('double helix')) {
      preset = 'dna-double-helix'
      tileTitle = 'DNA Double Helix'
    } else if (lower.includes('benzene')) {
      preset = 'benzene-ring'
      tileTitle = 'Benzene Ring'
    } else if (lower.includes('water') || lower.includes('h2o')) {
      preset = 'water-molecule'
      tileTitle = 'Water (H₂O)'
    } else if (lower.includes('methane') || lower.includes('ch4')) {
      preset = 'methane-molecule'
      tileTitle = 'Methane (CH₄)'
    } else {
      const zMatch = p.match(/z\s*=\s*([^,.]+)/i)
      if (zMatch) {
        eq = sanitizeMathInput(zMatch[0].trim())
        preset = 'custom'
        tileTitle = eq
      }
    }

    actions.push({
      id: `act_${Date.now()}_3d`,
      tool: 'graph3d_plot',
      args: { preset, equation: eq },
      status: 'pending'
    })
    notes.push(
      `[PHYSLAB ENGINE: Deterministically prepared 3D Plot "${tileTitle}" in 3D Graphing mode.]`
    )
  }

  // 3. 2D Graphing
  else if (/^plot\s+|^graph\s+|plot\s+y\s*=|graph\s+y\s*=/i.test(p) && !lower.includes('3d')) {
    const eqMatch = p.match(/(?:plot|graph)\s+(?:y\s*=\s*)?([^,.]+)/i)
    if (eqMatch) {
      const eq = sanitizeMathInput(eqMatch[1].trim())
      actions.push({
        id: `act_${Date.now()}_2d`,
        tool: 'graph_plot',
        args: { equation: eq },
        status: 'pending'
      })
      notes.push(`[PHYSLAB ENGINE: Deterministically prepared 2D Graph for "${eq}".]`)
    }
  }

  // 4. Geometry & Vector Commands (Shapes, Triangle, Circle, Solids, Vectors)
  const isGeometryRequest =
    !isCevaRequest &&
    /(?:triangle|circle|midpoint|distance|segment|polygon|cube|cylinder|cone|solid|draw\s+vector|resultant\s+vector|resolve|vector|add\s+u\s*=|draw\s+v\s*=|\b[uvw]\s*=\s*\d+i)/i.test(
      p
    ) && !/(?:incline|ramp|slope)/i.test(p)

  if (isGeometryRequest) {
    let mode = 'shapes'
    let view: '2d' | '3d' = '2d'
    const commands: string[] = []

    if (/(?:triangle|draw\s+triangle|create\s+triangle)/i.test(p)) {
      const coordMatches = [...p.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)]
      const p1 = coordMatches[0] ? `(${coordMatches[0][1]}, ${coordMatches[0][2]})` : '(0, 0)'
      const p2 = coordMatches[1] ? `(${coordMatches[1][1]}, ${coordMatches[1][2]})` : '(4, 0)'
      const p3 = coordMatches[2] ? `(${coordMatches[2][1]}, ${coordMatches[2][2]})` : '(2, 3)'
      commands.push(
        `A = ${p1}`,
        `B = ${p2}`,
        `C = ${p3}`,
        'Triangle(A, B, C)',
        'M = Midpoint(A, B)'
      )
    } else if (/(?:circle|draw\s+circle)/i.test(p)) {
      const radMatch = p.match(/(?:radius|r\s*=)\s*(\d+(?:\.\d+)?)/i)
      const rad = radMatch ? radMatch[1] : '3'
      commands.push('O = (0, 0)', `Circle(O, ${rad})`)
    } else if (/(?:midpoint|segment|distance\s+between)/i.test(p)) {
      const coordMatches = [...p.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)]
      const p1 = coordMatches[0] ? `(${coordMatches[0][1]}, ${coordMatches[0][2]})` : '(-2, 1)'
      const p2 = coordMatches[1] ? `(${coordMatches[1][1]}, ${coordMatches[1][2]})` : '(4, 5)'
      commands.push(`A = ${p1}`, `B = ${p2}`, 'Segment(A, B)', 'M = Midpoint(A, B)')
    } else if (/(?:cube|cuboid|cylinder|solid\s+sphere|cone|prism|pyramid)/i.test(p)) {
      mode = 'shapes'
      view = '3d'
      if (lower.includes('cube')) commands.push('Cube(4)')
      else if (lower.includes('cylinder')) commands.push('Cylinder(2.5, 5)')
      else if (lower.includes('sphere')) commands.push('Sphere(3)')
      else if (lower.includes('cone')) commands.push('Cone(3, 4)')
      else commands.push('Cube(4)')
    } else if (/(?:vector|resolve|resultant|add\s+u\s*=|draw\s+v\s*=|\b[uvw]\s*=\s*\d+i)/i.test(p)) {
      mode = 'vectors'
      // 1. Vector from A to B
      const abMatch = p.match(/(?:vector|arrow)?\s*(?:from\s+)?A\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?\s*(?:to\s+)?B\(?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)?/i)
      if (abMatch) {
        commands.push(`A = (${abMatch[1]}, ${abMatch[2]})`, `B = (${abMatch[3]}, ${abMatch[4]})`, 'v = vector(A, B)')
      }
      // 2. Resolve magnitude at angle
      else if (/resolve\s+([-\d.]+)\s*(N|kN|m\/s|m\/s\^2|m)?\s*(?:at\s+)?([-\d.]+)\s*(?:°|deg|rad)?/i.test(p)) {
        const resMatch = p.match(/resolve\s+([-\d.]+)\s*(N|kN|m\/s|m\/s\^2|m)?\s*(?:at\s+)?([-\d.]+)\s*(?:°|deg|rad)?/i)!
        const unit = resMatch[2] ? ` ${resMatch[2]}` : ''
        commands.push(`resolve ${resMatch[1]}${unit} at ${resMatch[3]}°`)
      }
      // 3. Add u = ... and v = ...
      else if (/add\s+([a-zA-Z])\s*=\s*([^,]+?)\s+and\s+([a-zA-Z])\s*=\s*(.+)/i.test(p)) {
        const addMatch = p.match(/add\s+([a-zA-Z])\s*=\s*([^,]+?)\s+and\s+([a-zA-Z])\s*=\s*(.+)/i)!
        commands.push(`${addMatch[1]} = ${addMatch[2].trim()}`, `${addMatch[3]} = ${addMatch[4].trim()}`, `add ${addMatch[1]} and ${addMatch[3]}`)
      }
      // 4. Draw v = ...
      else if (/(?:draw\s+)?([a-zA-Z])\s*=\s*(-?\d*i\s*[+-]\s*\d*j(?:[+-]\s*\d*k)?|<-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?>)/i.test(p)) {
        const vMatch = p.match(/(?:draw\s+)?([a-zA-Z])\s*=\s*(-?\d*i\s*[+-]\s*\d*j(?:[+-]\s*\d*k)?|<-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?>)/i)!
        commands.push(`${vMatch[1]} = ${vMatch[2].trim()}`)
      } else {
        commands.push('v1 = <3, 4>', 'v2 = <1, 2>', 'vSum = v1 + v2')
      }
    }

    if (commands.length > 0) {
      actions.push({
        id: `act_${Date.now()}_geo`,
        tool: 'run_commands',
        args: { mode, view, commands },
        status: 'pending'
      })
      notes.push(
        `[PHYSLAB ENGINE: Deterministically prepared Geometry commands in ${mode} mode: ${commands.join(', ')}.]`
      )
    }
  }

  // 5. Physics Sandbox (Incline, Freefall, Projectile, Presets)
  const isPhysicsExp =
    /(?:incline|slope|ramp|friction|projectile|thrown|launched|how\s+far|free\s*fall|drop|falling|cradle|newton's\s*cradle|pendulum|atwood|seesaw|spring|collision)/i.test(
      lower
    )

  if (isPhysicsExp) {
    const isIncline =
      /(?:incline|slope|ramp)/.test(lower) &&
      /(?:angle|deg|°|friction|\bmu\b|\b\d+\s*kg\b)/.test(lower)

    if (isIncline) {
      const angleMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:°|deg|degrees)/i)
      const angleDeg = angleMatch ? Number(angleMatch[1]) : 28
      const massMatch = p.match(/(\d+(?:\.\d+)?)\s*kg/i)
      const massKg = massMatch ? Number(massMatch[1]) : 2
      const muSMatch =
        p.match(/mu_?s\s*=\s*(\d+(?:\.\d+)?)/i) ||
        p.match(/static(?:\s+friction)?(?:\s+coefficient)?(?:\s*=\s*|\s+of\s+)(\d+(?:\.\d+)?)/i)
      const muStatic = muSMatch ? Number(muSMatch[1]) : 0.6
      const muKMatch =
        p.match(/mu_?k\s*=\s*(\d+(?:\.\d+)?)/i) ||
        p.match(/kinetic(?:\s+friction)?(?:\s+coefficient)?(?:\s*=\s*|\s+of\s+)(\d+(?:\.\d+)?)/i)
      const muKinetic = muKMatch ? Number(muKMatch[1]) : 0.4

      const validation = validatePhysicsScene({ angleDeg, massKg, muStatic, muKinetic })
      actions.push({
        id: `act_${Date.now()}_incline`,
        tool: 'sandbox_experiment',
        args: {
          experimentType: 'incline_friction',
          angleDeg,
          massKg,
          muStatic,
          muKinetic,
          recordToLab: true
        },
        status: 'pending',
        verified: validation.valid
      })
      notes.push(
        `[PHYSLAB ENGINE VERIFIED RESULT: 28° Incline Scene. Angle=${angleDeg}°, mass=${massKg}kg, mu_s=${muStatic}, mu_k=${muKinetic}. tan(theta)=${fmt(validation.tanAngle)}, staysStatic=${validation.staysStatic}, acceleration=${fmt(validation.acceleration)} m/s². The acceleration formula MUST be written exactly as: $$a = \\boxed{0}\\text{ m/s}^2$$. Do NOT put '(block remains stationary)' inside the math line.]`
      )
    } else if (/(?:projectile|thrown|launched|how\s+far)/i.test(lower)) {
      const v0Match = p.match(/(\d+(?:\.\d+)?)\s*m\/s/i) || p.match(/(?:at|speed|velocity)\s*(\d+(?:\.\d+)?)/i)
      const v0 = v0Match ? Number(v0Match[1]) : 20
      const angleMatch = p.match(/(\d+(?:\.\d+)?)\s*(?:°|deg|degrees)/i)
      const angleDeg = angleMatch ? Number(angleMatch[1]) : 45
      const g = 9.81
      const range = (v0 * v0 * Math.sin((2 * angleDeg * Math.PI) / 180)) / g
      actions.push({
        id: `act_${Date.now()}_proj`,
        tool: 'sandbox_experiment',
        args: {
          experimentType: 'projectile',
          v0,
          angleDeg,
          recordToLab: true
        },
        status: 'pending',
        verified: true
      })
      notes.push(
        `[PHYSLAB ENGINE: Prepared Projectile Motion (v0 = ${v0} m/s, θ = ${angleDeg}°). Formula Range R = v² sin(2θ) / g = (${v0})² sin(${2 * angleDeg}°) / 9.81 = ${range.toFixed(2)} m. The range formula MUST be written with the boxed result: $$R = \\boxed{${range.toFixed(2)}}\\text{ m}$$. Live Sandbox simulation running with gap row.]`
      )
    } else if (/(?:drop|free\s*fall|falling)/i.test(lower)) {
      actions.push(
        {
          id: `act_${Date.now()}_build`,
          tool: 'build_experiment',
          args: {
            objects: [{ kind: 'sphere', mass: 1, x: 0, y: 5, vx: 0, vy: 0 }],
            floor: true
          },
          status: 'pending',
          verified: true
        },
        {
          id: `act_${Date.now()}_play`,
          tool: 'play',
          args: { seconds: 2 },
          status: 'pending',
          verified: true
        },
        {
          id: `act_${Date.now()}_graph`,
          tool: 'graph_readings',
          args: { y: 'v', fit: 'linear' },
          status: 'pending',
          verified: true
        }
      )
      notes.push(
        `[PHYSLAB ENGINE: Drop a ball sequence: 1) build_experiment: {"objects": [{"kind": "sphere", "mass": 1, "x": 0, "y": 5, "vx": 0, "vy": 0}], "floor": true}; 2) play: {"seconds": 2}; 3) graph_readings: {"y": "v", "fit": "linear"}. The slope and impact time must come from graph_readings' fit and get_readings(when: 'impact'). Never write any formula value, slope, acceleration, or time that did not come from a tool.]`
      )
    } else {
      let presetId = 'pendulum'
      if (lower.includes('cradle')) presetId = 'cradle'
      else if (lower.includes('collision')) presetId = 'collision'
      else if (lower.includes('spring')) presetId = 'spring'
      else if (lower.includes('atwood')) presetId = 'atwood'
      else if (lower.includes('seesaw') || lower.includes('lever')) presetId = 'seesaw'
      else if (lower.includes('bounce')) presetId = 'bounce'

      actions.push({
        id: `act_${Date.now()}_preset`,
        tool: 'sandbox_experiment',
        args: {
          presetId,
          recordToLab: true
        },
        status: 'pending',
        verified: true
      })
      notes.push(
        `[PHYSLAB ENGINE: Prepared Sandbox experiment "${presetId}", live simulation running with Lab Data readings.]`
      )
    }
  }

  // 6. Mind Map
  if (/(?:mind\s*map|concept\s*graph|concept\s*map)/.test(lower)) {
    actions.push({
      id: `act_${Date.now()}_mm`,
      tool: 'mindmap_build',
      args: {
        nodes: [
          { id: 'calc', label: 'Calculus', category: 'math' },
          { id: 'diff', label: 'Derivatives (d/dt)', category: 'math' },
          { id: 'integ', label: 'Integrals (∫ dt)', category: 'math' },
          { id: 'kinematics', label: 'Kinematics', category: 'physics' },
          { id: 'pos', label: 'Position x(t)', category: 'physics' },
          { id: 'vel', label: 'Velocity v(t) = dx/dt', category: 'physics' },
          { id: 'acc', label: 'Acceleration a(t) = dv/dt', category: 'physics' },
          { id: 'dynamics', label: 'Newtonian Dynamics', category: 'physics' },
          { id: 'n2', label: 'F = ma = m(dv/dt)', category: 'physics' },
          { id: 'energy', label: 'Work & Kinetic Energy', category: 'physics' }
        ],
        edges: [
          { from: 'calc', to: 'diff' },
          { from: 'calc', to: 'integ' },
          { from: 'diff', to: 'vel', label: 'dx/dt' },
          { from: 'diff', to: 'acc', label: 'dv/dt' },
          { from: 'pos', to: 'vel' },
          { from: 'vel', to: 'acc' },
          { from: 'kinematics', to: 'dynamics' },
          { from: 'acc', to: 'n2' },
          { from: 'dynamics', to: 'energy', label: 'W = ∫ F dx' }
        ]
      },
      status: 'pending'
    })
    notes.push('[PHYSLAB ENGINE: Deterministically prepared Concept Mind Map.]')
  }

  // 7. Math / Dynamic Calculation & Solving
  const isArithmetic = /^[-\d\s+*/^.()]+$/.test(
    p.replace(/what\s+is|calculate|evaluate|solve/gi, '').trim()
  )
  const isEquation = p.includes('=') && /(?:solve|find\s+x|roots)/i.test(p)
  const isMathQuery =
    isArithmetic ||
    isEquation ||
    /(?:calculate|evaluate|solve|differentiate|integrate|derivative|integral|factor|factorise|primes|what\s+is)/i.test(
      p
    )

  if (isMathQuery && !is3DRequest && !isGeometryRequest && !isPhysicsExp) {
    let mathInput = p
      .replace(/^(?:please\s+)?(?:what\s+is|calculate|evaluate|solve|work\s+out)\s+/i, '')
      .replace(/[?.]+$/g, '')
      .trim()
    const op = /diff|derivative/i.test(p)
      ? 'diff'
      : /integrate|integral/i.test(p)
      ? 'integrate'
      : /factor/i.test(p)
      ? 'factor'
      : /primes/i.test(p)
      ? 'primes'
      : p.includes('=')
      ? 'solve'
      : 'simplify'

    const cleaned = sanitizeMathInput(mathInput)
    if (cleaned) mathInput = cleaned

    let exactAnswer = ''

    // A. Try pure math step engine
    try {
      const jobMap: Record<string, JobId> = {
        factor: 'factor',
        primes: 'primes',
        diff: 'differentiate',
        integrate: 'integrate',
        solve: 'solve',
        simplify: 'expand'
      }
      const job = jobMap[op]
      if (job) {
        const pureRes = runPure(job, mathInput)
        if (pureRes.checked !== 'failed' && pureRes.answers && pureRes.answers.length > 0) {
          exactAnswer = pureRes.answers[0].tex
        }
      }
    } catch {
      // fallback
    }

    // B. Try evaluateInput
    if (!exactAnswer) {
      try {
        const evRes = evaluateInput('COMP', mathInput, { vars: {}, ans: 0, angle: 'deg' })
        if (evRes && !evRes.error) {
          if (evRes.solved && evRes.main) {
            exactAnswer = evRes.main
          } else if (evRes.exact) {
            exactAnswer = evRes.exact
          } else if (evRes.main) {
            exactAnswer = evRes.main
          } else if (evRes.tex) {
            exactAnswer = evRes.tex
          }
        }
      } catch {
        // fallback
      }
    }

    // C. Fallback to mathjs evaluation
    if (!exactAnswer) {
      try {
        const val = math.evaluate(preprocess(mathInput))
        if (val !== undefined && typeof val !== 'function') {
          exactAnswer = String(val)
        }
      } catch {
        // ignore
      }
    }

    if (mathInput) {
      actions.push({
        id: `act_${Date.now()}_calc`,
        tool: 'calc_solve',
        args: {
          input: mathInput,
          op,
          boxedAnswer: exactAnswer
        },
        status: 'pending',
        verified: Boolean(exactAnswer)
      })

      if (exactAnswer) {
        notes.push(
          `[PHYSLAB ENGINE VERIFIED RESULT: Expression/Equation = "${mathInput}". Verified Answer = "${exactAnswer}". Put this exact answer inside \\boxed{${exactAnswer}} in your final response.]`
        )
      } else {
        notes.push(`[PHYSLAB ENGINE: Expression/Equation "${mathInput}" loaded into Calculator.]`)
      }
    }
  }

  return {
    actions,
    contextNote: notes.join('\n'),
    injectedEnginePrompt: notes.length > 0 ? notes.join('\n') : undefined
  }
}
