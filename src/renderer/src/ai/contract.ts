import type { PhysLabTool, MindMapNode, MindMapEdge } from './types'

export const G = 9.81

export const OPS = new Set(['diff', 'integrate', 'solve', 'simplify', 'factor', 'limit'] as const)
export type CalcOp = 'diff' | 'integrate' | 'solve' | 'simplify' | 'factor' | 'limit'

export const CATEGORIES = new Set(['physics', 'math', 'concept', 'trap'] as const)
export type MindMapCategory = 'physics' | 'math' | 'concept' | 'trap'

export const SANDBOX_SPECS = {
  incline_friction: {
    angleDeg: [0, 90] as [number, number],
    massKg: [1e-9, 1e4] as [number, number],
    muStatic: [0, 5] as [number, number],
    muKinetic: [0, 5] as [number, number]
  },
  projectile: {
    v0: [1e-9, 1e3] as [number, number],
    angleDeg: [0, 90] as [number, number]
  },
  vertical_circle: {
    radiusM: [1e-9, 1e3] as [number, number],
    massKg: [1e-9, 1e4] as [number, number]
  }
} as const

export type ExperimentType = keyof typeof SANDBOX_SPECS

/**
 * Sanitizes natural English words and extraneous punctuation from mathematical expressions.
 */
export function sanitizeMathInput(raw: string): string {
  if (!raw) return ''
  let s = raw.trim()

  const prefixRegex =
    /^(?:please\s+|can\s+you\s+)?(?:what\s+is\s+(?:the\s+value\s+of\s+|the\s+derivative\s+of\s+|the\s+integral\s+of\s+|the\s+)?|calculate\s+|compute\s+|evaluate\s+|solve\s+this\s+for\s+[a-z]\s*:\s*|solve\s+for\s+[a-z]\s*:\s*|solve\s+this\s+equation\s*:\s*|solve\s+equation\s*:\s*|solve\s+this\s*:\s*|solve\s*:\s*|solve\s+|find\s+the\s+derivative\s+of\s+|find\s+the\s+integral\s+of\s+|find\s+the\s+value\s+of\s+|find\s+the\s+roots\s+of\s+|find\s+the\s+root\s+of\s+|find\s+roots\s+of\s+|find\s+root\s+of\s+|find\s+|differentiate\s+|integrate\s+|simplify\s+|factorise\s+|factor\s+|plot\s+|graph\s+)+/i

  s = s.replace(prefixRegex, '').trim()
  s = s.replace(/^[:\s=]+/, '').trim()

  // Trailing English like "for x", "?", ".", etc.
  s = s.replace(/\s+for\s+[a-z]\s*$/i, '').trim()
  s = s.replace(/[\s?.,;!]+$/, '').trim()

  // Normalize `+ -` or `+-` (with optional spaces) into `- `
  s = s.replace(/\+\s*-\s*/g, '- ')

  return s.trim()
}

/**
 * Normalizes both v2.1 ({ tool, args }) and v2.0 flat actions into canonical { tool, args }.
 */
export function normalizeAction(
  raw: unknown
): { tool: PhysLabTool; args: Record<string, unknown> } | null {
  if (!raw || typeof raw !== 'object') return null
  const rec = raw as Record<string, unknown>
  const tool = rec.tool as PhysLabTool
  if (!tool || typeof tool !== 'string') return null

  // Collect raw args from rec.args (v2.1) or fall back to rec itself (v2.0 flat)
  const nested = rec.args && typeof rec.args === 'object' ? (rec.args as Record<string, unknown>) : {}
  const rawArgs: Record<string, unknown> = { ...rec, ...nested }

  switch (tool) {
    case 'calc_solve': {
      const rawInput = String(rawArgs.input ?? rawArgs.expr ?? rawArgs.expression ?? '').trim()
      const input = sanitizeMathInput(rawInput)
      const rawOp = String(rawArgs.op ?? rawArgs.operation ?? 'simplify').toLowerCase().trim()
      const op = OPS.has(rawOp as CalcOp) ? (rawOp as CalcOp) : 'simplify'
      const variable = String(rawArgs.var ?? rawArgs.variable ?? 'x').trim()
      const boxedAnswer = String(rawArgs.boxedAnswer ?? rawArgs.answer ?? '').trim()

      return {
        tool: 'calc_solve',
        args: { input, op, var: variable, boxedAnswer }
      }
    }

    case 'sandbox_experiment': {
      // Check v2.0 scene.bodies format
      let angleDeg = rawArgs.angleDeg ?? rawArgs.angle ?? rawArgs.theta
      let massKg = rawArgs.massKg ?? rawArgs.mass ?? rawArgs.m
      let muStatic = rawArgs.muStatic ?? rawArgs.frictionStatic ?? rawArgs.mu_s ?? rawArgs.muS
      let muKinetic = rawArgs.muKinetic ?? rawArgs.frictionKinetic ?? rawArgs.mu_k ?? rawArgs.muK
      const experimentType = String(rawArgs.experimentType ?? 'incline_friction')
      const presetId = rawArgs.presetId ? String(rawArgs.presetId).trim() : undefined

      const scene = rawArgs.scene as Record<string, unknown> | undefined
      if (scene && Array.isArray(scene.bodies)) {
        for (const b of scene.bodies) {
          if (!b || typeof b !== 'object') continue
          const body = b as Record<string, unknown>
          if (body.type === 'ramp' || body.angle !== undefined) {
            angleDeg = angleDeg ?? body.angle ?? body.angleDeg
            muStatic = muStatic ?? body.mu_s ?? body.muStatic
            muKinetic = muKinetic ?? body.mu_k ?? body.muKinetic
          }
          if (body.type === 'box' || body.mass !== undefined) {
            massKg = massKg ?? body.mass ?? body.massKg
          }
        }
      }

      const args: Record<string, unknown> = {
        experimentType,
        angleDeg: angleDeg !== undefined ? Number(angleDeg) : undefined,
        massKg: massKg !== undefined ? Number(massKg) : undefined,
        muStatic: muStatic !== undefined ? Number(muStatic) : undefined,
        muKinetic: muKinetic !== undefined ? Number(muKinetic) : undefined,
        recordToLab: Boolean(rawArgs.recordToLab),
        title: rawArgs.title ? String(rawArgs.title) : undefined
      }

      if (presetId) args.presetId = presetId

      if (experimentType === 'projectile') {
        const v0 = rawArgs.v0 ?? rawArgs.velocity
        if (v0 !== undefined) args.v0 = Number(v0)
      } else if (experimentType === 'vertical_circle') {
        const radiusM = rawArgs.radiusM ?? rawArgs.radius ?? rawArgs.r
        if (radiusM !== undefined) args.radiusM = Number(radiusM)
      }

      return { tool: 'sandbox_experiment', args }
    }

    case 'mindmap_build': {
      const rawNodes = Array.isArray(rawArgs.nodes) ? rawArgs.nodes : []
      const rawEdges = Array.isArray(rawArgs.edges) ? rawArgs.edges : []

      const nodes: MindMapNode[] = []
      const synthesizedEdges: MindMapEdge[] = []

      for (let i = 0; i < rawNodes.length; i++) {
        const n = rawNodes[i]
        if (!n || typeof n !== 'object') continue
        const item = n as Record<string, unknown>
        const id = String(item.id ?? `node_${i + 1}`)
        const label = String(item.label ?? item.title ?? id)
        const rawCat = String(item.category ?? 'concept')
        const category: MindMapCategory = CATEGORIES.has(rawCat as MindMapCategory)
          ? (rawCat as MindMapCategory)
          : 'concept'

        nodes.push({
          id,
          label,
          category,
          summary: item.summary ? String(item.summary) : undefined,
          formula: item.formula ? String(item.formula) : undefined
        })

        // v2.0 synthesized parent edge
        if (item.parent && typeof item.parent === 'string' && item.parent.trim()) {
          synthesizedEdges.push({
            source: item.parent.trim(),
            target: id
          })
        }
      }

      const nodeIds = new Set(nodes.map((n) => n.id))

      const allEdges: MindMapEdge[] = []
      for (const e of [...rawEdges, ...synthesizedEdges]) {
        if (!e || typeof e !== 'object') continue
        const edge = e as Record<string, unknown>
        const source = String(edge.source ?? '')
        const target = String(edge.target ?? '')
        if (nodeIds.has(source) && nodeIds.has(target) && source !== target) {
          allEdges.push({
            source,
            target,
            label: edge.label ? String(edge.label) : undefined
          })
        }
      }

      return {
        tool: 'mindmap_build',
        args: { nodes, edges: allEdges }
      }
    }

    case 'goal_update': {
      const goalTitle = String(
        rawArgs.goalTitle ?? rawArgs.title ?? rawArgs.goalId ?? rawArgs.topic ?? ''
      ).trim()
      const increment = Number(rawArgs.increment ?? rawArgs.progress_delta ?? 1)
      const note = rawArgs.note ? String(rawArgs.note).trim() : undefined

      return {
        tool: 'goal_update',
        args: { goalTitle, increment, note }
      }
    }

    case 'graph_plot': {
      const equation = sanitizeMathInput(
        String(rawArgs.equation ?? rawArgs.expr ?? rawArgs.expression ?? rawArgs.f ?? '')
      ).trim()
      return {
        tool: 'graph_plot',
        args: { equation }
      }
    }

    case 'graph3d_plot': {
      const equation = sanitizeMathInput(
        String(rawArgs.equation ?? rawArgs.expr ?? rawArgs.expression ?? rawArgs.f ?? '')
      ).trim()
      const preset = rawArgs.preset ? String(rawArgs.preset).trim() : undefined
      return {
        tool: 'graph3d_plot',
        args: { equation, ...(preset ? { preset } : {}) }
      }
    }

    case 'run_commands': {
      const mode = String(rawArgs.mode ?? 'vectors').trim()
      const view = rawArgs.view === '3d' ? '3d' : rawArgs.view === '2d' ? '2d' : undefined
      const rawCmds = Array.isArray(rawArgs.commands)
        ? rawArgs.commands
        : typeof rawArgs.commands === 'string'
          ? [rawArgs.commands]
          : []
      const commands = rawCmds.map(String).map((c) => c.trim()).filter(Boolean)
      return {
        tool: 'run_commands',
        args: { mode, ...(view ? { view } : {}), commands }
      }
    }

    case 'quiz_challenge': {
      const question = String(rawArgs.question ?? '').trim()
      const choices = Array.isArray(rawArgs.choices)
        ? rawArgs.choices.map((c) => String(c).trim())
        : []
      let answerIndex = Number(rawArgs.answerIndex ?? rawArgs.answer ?? 0)
      if (isNaN(answerIndex)) answerIndex = 0
      const explanation = String(rawArgs.explanation ?? '').trim()

      return {
        tool: 'quiz_challenge',
        args: { question, choices, answerIndex, explanation }
      }
    }

    case 'app_guide': {
      const mode = String(rawArgs.mode ?? rawArgs.feature ?? 'calculator').trim()
      const steps = Array.isArray(rawArgs.steps) ? rawArgs.steps.map((s) => String(s).trim()) : []
      const tip = rawArgs.tip ? String(rawArgs.tip).trim() : undefined

      return {
        tool: 'app_guide',
        args: { mode, steps, tip }
      }
    }

    case 'build_experiment':
    case 'set_speed':
    case 'graph_readings':
    case 'get_readings':
    case 'play':
    case 'pause':
    case 'reset':
    case 'add_body':
    case 'remove_body':
    case 'set_param':
    case 'load_experiment':
    case 'list_experiments':
    case 'solve':
    case 'plot':
    case 'export_readings':
    case 'demonstrate':
    case 'get_app_state': {
      return {
        tool,
        args: (nested && Object.keys(nested).length > 0 ? nested : rawArgs) as Record<string, unknown>
      }
    }

    default:
      return null
  }
}

/**
 * Validates normalized action against strict contract schemas.
 */
export function validateAction(obj: unknown): { ok: boolean; reason: string } {
  if (!obj || typeof obj !== 'object') {
    return { ok: false, reason: 'Action must be an object' }
  }
  const norm = normalizeAction(obj)
  if (!norm) {
    return { ok: false, reason: 'Unknown or malformed action tool' }
  }

  const { tool, args } = norm

  switch (tool) {
    case 'calc_solve': {
      if (!args.input || typeof args.input !== 'string') {
        return { ok: false, reason: 'calc_solve requires a non-empty "input" expression' }
      }
      if (!OPS.has(args.op as CalcOp)) {
        return { ok: false, reason: `calc_solve operation "${args.op}" is not in valid OPS` }
      }
      return { ok: true, reason: 'Valid calc_solve action' }
    }

    case 'sandbox_experiment': {
      if (args.presetId) {
        return { ok: true, reason: 'Valid sandbox_experiment preset action' }
      }
      const expType = String(args.experimentType || 'incline_friction')
      if (expType === 'freefall') {
        const height = Number(args.height ?? args.heightM ?? 10)
        const mass = Number(args.massKg ?? args.mass ?? 2)
        if (isNaN(height) || height <= 0 || height > 1e4) {
          return { ok: false, reason: 'Height must be within (0, 10000] m' }
        }
        if (isNaN(mass) || mass <= 0 || mass > 1e4) {
          return { ok: false, reason: 'Mass must be strictly positive' }
        }
        return { ok: true, reason: 'Valid freefall action' }
      }
      const PRESETS = [
        'cradle',
        'newtons-cradle',
        'newton-cradle',
        'pendulum',
        'collision',
        'spring',
        'atwood',
        'seesaw',
        'lever',
        'bounce',
        'bouncing',
        'rollslide',
        'orbit'
      ]
      if (PRESETS.includes(expType)) {
        return { ok: true, reason: 'Valid sandbox_experiment preset action' }
      }
      if (!(expType in SANDBOX_SPECS)) {
        return { ok: false, reason: `Unknown experimentType "${expType}"` }
      }

      if (expType === 'incline_friction') {
        const { angleDeg, massKg, muStatic, muKinetic } = args as {
          angleDeg?: number
          massKg?: number
          muStatic?: number
          muKinetic?: number
        }
        if (angleDeg === undefined || isNaN(angleDeg)) {
          return { ok: false, reason: 'Incline angle (angleDeg) is required' }
        }
        if (angleDeg < 0 || angleDeg > 90) {
          return { ok: false, reason: 'Incline angle must be within [0, 90] degrees' }
        }
        if (massKg === undefined || isNaN(massKg) || massKg <= 0) {
          return { ok: false, reason: 'Mass (massKg) must be strictly positive' }
        }
        if (muStatic === undefined || isNaN(muStatic) || muStatic < 0 || muStatic > 5) {
          return { ok: false, reason: 'Static friction (muStatic) must be within [0, 5]' }
        }
        if (muKinetic === undefined || isNaN(muKinetic) || muKinetic < 0 || muKinetic > 5) {
          return { ok: false, reason: 'Kinetic friction (muKinetic) must be within [0, 5]' }
        }
        if (muStatic < muKinetic) {
          return {
            ok: false,
            reason: 'Static friction (muStatic) cannot be less than kinetic friction (muKinetic)'
          }
        }
      } else if (expType === 'projectile') {
        const { v0, angleDeg } = args as { v0?: number; angleDeg?: number }
        if (v0 === undefined || isNaN(v0) || v0 <= 0 || v0 > 1e3) {
          return { ok: false, reason: 'Initial velocity (v0) must be within (0, 1000] m/s' }
        }
        if (angleDeg === undefined || isNaN(angleDeg) || angleDeg < 0 || angleDeg > 90) {
          return { ok: false, reason: 'Launch angle must be within [0, 90] degrees' }
        }
      } else if (expType === 'vertical_circle') {
        const { radiusM, massKg } = args as { radiusM?: number; massKg?: number }
        if (radiusM === undefined || isNaN(radiusM) || radiusM <= 0 || radiusM > 1e3) {
          return { ok: false, reason: 'Radius (radiusM) must be within (0, 1000] m' }
        }
        if (massKg === undefined || isNaN(massKg) || massKg <= 0 || massKg > 1e4) {
          return { ok: false, reason: 'Mass (massKg) must be strictly positive' }
        }
      }
      return { ok: true, reason: 'Valid sandbox_experiment action' }
    }

    case 'mindmap_build': {
      const nodes = args.nodes as MindMapNode[] | undefined
      if (!Array.isArray(nodes) || nodes.length === 0) {
        return { ok: false, reason: 'mindmap_build requires at least one node' }
      }
      const nodeIds = new Set<string>()
      for (const n of nodes) {
        if (!n.id || !n.label) {
          return { ok: false, reason: 'Each mindmap node must have an id and label' }
        }
        if (!CATEGORIES.has(n.category)) {
          return { ok: false, reason: `Invalid node category "${n.category}"` }
        }
        nodeIds.add(n.id)
      }

      // Check raw input edges so dangling edge attempts are rejected
      const rawRec = obj as Record<string, unknown>
      const rawMapArgs = (
        rawRec.args && typeof rawRec.args === 'object' ? rawRec.args : rawRec
      ) as Record<string, unknown>
      const rawEdges = Array.isArray(rawMapArgs.edges)
        ? (rawMapArgs.edges as Array<Record<string, unknown>>)
        : []
      for (const e of rawEdges) {
        if (!e || typeof e !== 'object') continue
        const s = String(e.source ?? '')
        const t = String(e.target ?? '')
        if (!nodeIds.has(s) || !nodeIds.has(t)) {
          return { ok: false, reason: `Dangling edge between "${s}" and "${t}"` }
        }
      }

      const edges = (args.edges as MindMapEdge[]) || []
      for (const e of edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
          return { ok: false, reason: `Dangling edge between "${e.source}" and "${e.target}"` }
        }
      }
      return { ok: true, reason: 'Valid mindmap_build action' }
    }

    case 'goal_update': {
      if (!args.goalTitle || typeof args.goalTitle !== 'string') {
        return { ok: false, reason: 'goal_update requires a non-empty "goalTitle"' }
      }
      if (typeof args.increment !== 'number' || isNaN(args.increment)) {
        return { ok: false, reason: 'goal_update increment must be a valid number' }
      }
      return { ok: true, reason: 'Valid goal_update action' }
    }

    case 'graph_plot': {
      if (!args.equation || typeof args.equation !== 'string') {
        return { ok: false, reason: 'graph_plot requires a non-empty "equation"' }
      }
      return { ok: true, reason: 'Valid graph_plot action' }
    }

    case 'graph3d_plot': {
      if (!args.equation && !args.preset) {
        return { ok: false, reason: 'graph3d_plot requires an "equation" or "preset"' }
      }
      return { ok: true, reason: 'Valid graph3d_plot action' }
    }

    case 'run_commands': {
      const commands = args.commands as string[] | undefined
      if (!Array.isArray(commands) || commands.length === 0) {
        return { ok: false, reason: 'run_commands requires a non-empty "commands" list' }
      }
      return { ok: true, reason: 'Valid run_commands action' }
    }

    case 'quiz_challenge': {
      if (!args.question || typeof args.question !== 'string') {
        return { ok: false, reason: 'quiz_challenge requires a question' }
      }
      const choices = args.choices as string[] | undefined
      if (!Array.isArray(choices) || choices.length < 2) {
        return { ok: false, reason: 'quiz_challenge requires at least 2 choices' }
      }
      const ansIdx = Number(args.answerIndex)
      if (isNaN(ansIdx) || ansIdx < 0 || ansIdx >= choices.length) {
        return {
          ok: false,
          reason: `quiz_challenge answerIndex must be between 0 and ${choices.length - 1}`
        }
      }
      return { ok: true, reason: 'Valid quiz_challenge action' }
    }

    case 'app_guide': {
      if (!args.mode || typeof args.mode !== 'string') {
        return { ok: false, reason: 'app_guide requires a mode name' }
      }
      if (!Array.isArray(args.steps) || args.steps.length === 0) {
        return { ok: false, reason: 'app_guide requires steps list' }
      }
      return { ok: true, reason: 'Valid app_guide action' }
    }

    case 'build_experiment':
    case 'set_speed':
    case 'graph_readings':
    case 'get_readings':
    case 'play':
    case 'pause':
    case 'reset':
    case 'add_body':
    case 'remove_body':
    case 'set_param':
    case 'load_experiment':
    case 'list_experiments':
    case 'solve':
    case 'plot':
    case 'export_readings':
    case 'demonstrate':
    case 'get_app_state':
      return { ok: true, reason: `Valid ${tool} action` }

    default:
      return { ok: false, reason: 'Unsupported action tool' }
  }
}

/**
 * Repairs LaTeX strings corrupted by unescaped JSON/JS control characters (\b, \f, \t, etc.)
 */
/* eslint-disable no-control-regex */
export function repairControlCharLatex(text: string): string {
  if (!text) return ''
  return text
    .replace(/\x08oxed\{/g, '\\boxed{')
    .replace(/\x08egin\{/g, '\\begin{')
    .replace(/\x0cfrac\{/g, '\\frac{')
    .replace(/\x09ext\{/g, '\\text{')
    .replace(/\x09heta\b/g, '\\theta')
    .replace(/\x09an\b/g, '\\tan')
    .replace(/\x09imes\b/g, '\\times')
    .replace(/\x08eta\b/g, '\\beta')
}
/* eslint-enable no-control-regex */

/**
 * Finds the LAST \boxed{...} in text using balanced brace depth counting.
 * Correctly returns nested fractions and functions without clipping at inner braces.
 */
export function extractLastBoxed(text: string): string | null {
  if (!text) return null
  const clean = repairControlCharLatex(text)
  const marker = '\\boxed{'
  let lastFound: string | null = null
  let searchFrom = 0

  while (true) {
    const idx = clean.indexOf(marker, searchFrom)
    if (idx === -1) break
    let depth = 0
    const start = idx + marker.length
    let foundEnd = -1
    for (let i = start; i < clean.length; i++) {
      if (clean[i] === '{') depth++
      else if (clean[i] === '}') {
        if (depth === 0) {
          foundEnd = i
          break
        }
        depth--
      }
    }
    if (foundEnd !== -1) {
      lastFound = clean.slice(start, foundEnd).trim()
      searchFrom = foundEnd + 1
    } else {
      break
    }
  }
  return lastFound
}

/**
 * Strips complete and trailing unclosed <physlab_action>... blocks, stray think tags,
 * and standalone raw JSON action blocks/arrays so raw JSON never flashes while streaming.
 */
export function stripIncompleteActionBlocks(text: string): string {
  if (!text) return ''
  return text
    .replace(/<physlab_action>[\s\S]*?<\/physlab_action>/gi, '')
    .replace(/<physlab_action>[\s\S]*$/gi, '')
    .replace(/<\/?physlab_action>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\[\s*\{\s*"tool"\s*:[\s\S]*?\]/gi, '')
    .replace(
      /\{\s*"tool"\s*:\s*"(?:calc_solve|sandbox_experiment|mindmap_build|goal_update|graph_plot|graph3d_plot|quiz_challenge|app_guide|run_commands|build_experiment|set_speed|graph_readings|get_readings|play|pause|reset|add_body|remove_body|set_param|load_experiment|list_experiments|solve|plot|export_readings|demonstrate|get_app_state|list_objects|remove)"[\s\S]*?\}\s*\}?/gi,
      ''
    )
    .trim()
}
