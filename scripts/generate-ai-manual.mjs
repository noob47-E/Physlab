#!/usr/bin/env node
// PhysLab AI Manual Generator (scripts/generate-ai-manual.mjs)
// Reads the command registry (src/renderer/src/lang/registry/) and generates
// src/renderer/src/ai/manual.generated.ts with ALWAYS_ON_MANUAL and MANUAL_BY_MODE.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const registryDir = path.resolve(rootDir, 'src/renderer/src/lang/registry')
const outputPath = path.resolve(rootDir, 'src/renderer/src/ai/manual.generated.ts')

// Parse a TypeScript registry file to extract command metadata
function parseRegistryFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const commands = []

  // Split content by command object blocks
  const nameMatches = [...content.matchAll(/name:\s*'([^']+)'/g)]
  for (const match of nameMatches) {
    const startIndex = match.index
    // Find enclosing block approximate bounds
    const nextMatch = content.indexOf("name: '", startIndex + 7)
    const blockEnd = nextMatch !== -1 ? nextMatch : content.length
    const block = content.slice(startIndex, blockEnd)

    const name = match[1]

    // Summary
    const summaryMatch = block.match(/summary:\s*'([^']+)'/)
    const summary = summaryMatch ? summaryMatch[1] : ''

    // Modes
    let modes = 'all'
    const modesMatch = block.match(/modes:\s*(\[[^\]]+\]|'all')/)
    if (modesMatch) {
      if (modesMatch[1] === "'all'") modes = 'all'
      else {
        try {
          modes = eval(modesMatch[1])
        } catch {
          modes = ['graphing', 'shapes', 'vectors', 'sandbox']
        }
      }
    }

    // Aliases
    let aliases = []
    const aliasesMatch = block.match(/aliases:\s*(\[[^\]]+\])/)
    if (aliasesMatch) {
      try {
        aliases = eval(aliasesMatch[1])
      } catch {
        aliases = []
      }
    }

    // Examples
    let examples = []
    const examplesMatch = block.match(/examples:\s*(\[[^\]]+\])/)
    if (examplesMatch) {
      try {
        examples = eval(examplesMatch[1])
      } catch {
        examples = []
      }
    }

    // Args
    const args = []
    const argsBlockMatch = block.match(/args:\s*\[([\s\S]*?)\]\s*,/)
    if (argsBlockMatch) {
      const argMatches = [...argsBlockMatch[1].matchAll(/name:\s*'([^']+)'(?:,\s*type:\s*'([^']+)')?(?:,\s*required:\s*(true|false))?(?:,\s*description:\s*'([^']+)')?/g)]
      for (const am of argMatches) {
        args.push({
          name: am[1],
          type: am[2] || 'string',
          required: am[3] === 'true',
          description: am[4] || ''
        })
      }
    }

    commands.push({ name, aliases, modes, summary, args, examples })
  }

  return commands
}

function generate() {
  console.log('Generating PhysLab AI Manual from registry...')

  const files = [
    'sceneCommands.ts',
    'constructionCommands.ts',
    'graphCommands.ts',
    'vectorCommands.ts',
    'sandboxCommands.ts',
    'labCommands.ts',
    'appCommands.ts'
  ]

  const allCommands = []
  for (const f of files) {
    const fullPath = path.join(registryDir, f)
    if (fs.existsSync(fullPath)) {
      const cmds = parseRegistryFile(fullPath)
      allCommands.push(...cmds)
    }
  }

  console.log(`Parsed ${allCommands.length} commands from ${files.length} registry files.`)

  // Compact ALWAYS_ON_MANUAL (< 12,000 chars / < 3,000 tokens)
  const ALWAYS_ON_MANUAL = `# PhysLab AI Command Manual (Always-On Reference)

## Modes & Switching
PhysLab features 6 primary modes (use tool \`run_commands\` with \`mode: "<mode>"\` or command \`mode <target>\`):
- \`calculator\`: Scientific calculator, pure exact math, step-by-step working engine.
- \`graphing\`: 2D/3D function curves, implicit curves, parametrics, sliders, tangents, roots, area.
- \`shapes\` (geometry): Euclidean geometric constructions, points, lines, circles, polygons, measures.
- \`vectors\`: 2D/3D vector arithmetic, component resolution, resultant addition, dot/cross products.
- \`sandbox\`: Rigid-body physics simulation (Jolt), forces, collisions, springs, ropes, pulleys, gravity.
- \`lab\`: Experimental lab data tables, multi-column analysis, curve fitting (linear/quadratic).

## Syntax & Notation
- Points: \`A = (1, 2)\`, \`P = (1, 2, 3)\`
- Vectors: \`u = <3, 4>\`, \`v = <1, 2, 3>\`, polar: \`10 N ∠ 30°\`
- Functions: \`y = sin(x)\`, \`y = x^2 - 4\`, 3D surface: \`z = x^2 - y^2\`
- Sliders: \`a = 3.5\`, \`slider a -5 10 0.1\`
- Calculations: \`solve(x^2 - 5x + 6 = 0)\`, \`diff(x^3 * sin(x))\`, \`integrate(x^2)\`
- Units: Angles \`deg\` or \`rad\` (\`angles deg\`); forces \`N\`, lengths \`m, cm, mm\`, mass \`kg, g\`, velocity \`m/s\`, accel \`m/s^2\`.

## Core Commands Quick Table
| Command | Mode | Syntax & Example | Summary |
|---|---|---|---|
| plot | graphing | \`plot y = x^2 - 4\` | Plot function or curve |
| roots | graphing | \`roots\` | Find and mark roots of active curve |
| extrema | graphing | \`extrema\` | Find and mark local min/max |
| tangent | graphing | \`tangent x = 2\` / \`tangent P\` | Draw tangent line to curve |
| area | graphing | \`area 0 2\` | Calculate & shade area under curve |
| distance | shapes | \`distance A B\` | Measure length between points/segments |
| midpoint | shapes | \`midpoint A B\` | Construct midpoint of two points |
| perpendicular | shapes | \`perpendicular C lineAB\` | Construct perpendicular line through point |
| parallel | shapes | \`parallel C lineAB\` | Construct parallel line through point |
| perpbisector | shapes | \`perpbisector A B\` | Construct perpendicular bisector |
| anglebisector | shapes | \`anglebisector A B C\` | Construct angle bisector |
| resolve | vectors | \`resolve 50 30\` | Resolve magnitude & angle into <x, y> |
| addvector | vectors | \`addvector u v\` | Add vectors to construct resultant |
| body | sandbox | \`body sphere mass:2 pos:0,5,0\` | Create physics body (sphere, box, ramp...) |
| link | sandbox | \`link rod A B\` / \`link spring A B\` | Link bodies (rod, spring, rope, pulley) |
| gravity | sandbox | \`gravity 9.81\` / \`gravity 1.62\` / \`0\` | Set downward gravitational acceleration |
| reset / step | sandbox | \`reset\`, \`step\` | Reset simulation to t=0 or step one frame |
| table | lab | \`table "Pendulum" "L (m)" "T (s)"\` | Create experimental data table |
| column / row | lab | \`column "T^2" formula:"T^2"\`, \`row 1 2.01\` | Add columns or data rows |
| fit | lab | \`fit linear\` / \`fit quadratic\` | Perform curve fit on active table |
| delete / hide / show | all | \`delete A\`, \`hide f\`, \`show f\` | Manage scene object visibility/lifecycle |
| move / set / color | all | \`move A 2 3\`, \`set b.friction 0.5\` | Modify object coordinates and properties |
| mode / view / clear | app | \`mode sandbox\`, \`view 3d\`, \`clear\` | App mode, 2D/3D dimension, and clear |
| undo / redo | app | \`undo\`, \`redo\` | Canvas history undo / redo |

## AI Control Tools
1. \`run_commands({ commands: ["..."], mode: "..." })\`: Execute one or more command bar commands. Returns created/removed IDs and screen description.
2. \`describe_screen({ mode: "...", filter: "..." })\`: Inspect visible screen state (curves, points, bodies, readings, questions).
3. \`manual({ mode: "<mode>" })\`: Look up detailed commands, options, and examples for any specific mode.
`

  if (ALWAYS_ON_MANUAL.length > 12000) {
    throw new Error(`ALWAYS_ON_MANUAL exceeds 12,000 characters limit (${ALWAYS_ON_MANUAL.length} chars)`)
  }

  // Generate MANUAL_BY_MODE
  const modesList = ['graphing', 'shapes', 'vectors', 'sandbox', 'calculator', 'pure', 'lab', 'view', 'app']
  const manuals = {}

  for (const m of modesList) {
    const relevant = allCommands.filter((c) => {
      if (c.modes === 'all') return true
      if (Array.isArray(c.modes)) {
        if (m === 'shapes' && (c.modes.includes('shapes') || c.modes.includes('geometry'))) return true
        if (m === 'calculator' && c.modes.includes('calculator')) return true
        return c.modes.includes(m)
      }
      return false
    })

    const title = m === 'shapes' ? 'Geometry (Shapes)' : m.charAt(0).toUpperCase() + m.slice(1)
    let text = `# PhysLab ${title} Mode Command Reference\n\n`
    text += `Target mode: \`${m}\`\n\n`
    text += `## Available Commands\n\n`

    for (const c of relevant) {
      const aliasStr = c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : ''
      text += `### \`${c.name}\`${aliasStr}\n`
      text += `${c.summary}\n\n`
      if (c.args && c.args.length > 0) {
        text += `**Arguments**:\n`
        for (const a of c.args) {
          text += `- \`${a.name}\` (${a.type}${a.required ? ', required' : ', optional'}): ${a.description}\n`
        }
        text += `\n`
      }
      if (c.examples && c.examples.length > 0) {
        text += `**Examples**:\n`
        for (const ex of c.examples) {
          text += `- \`${ex}\`\n`
        }
        text += `\n`
      }
    }

    manuals[m] = text
  }

  // Aliases for mode lookup
  manuals['geometry'] = manuals['shapes']
  manuals['data'] = manuals['lab']
  manuals['all'] = Object.values(manuals).join('\n---\n\n')

  const code = `// GENERATED FILE - DO NOT EDIT DIRECTLY
// Generated by scripts/generate-ai-manual.mjs
// Run "npm run ai:manual" to regenerate.

/** Compact cheat sheet embedded in system prompt (< 3,000 tokens / < 12,000 chars) */
export const ALWAYS_ON_MANUAL: string = ${JSON.stringify(ALWAYS_ON_MANUAL)}

/** Detailed command manuals per mode */
export const MANUAL_BY_MODE: Record<string, string> = ${JSON.stringify(manuals, null, 2)}

/**
 * Retrieve mode manual by name. Supports aliases.
 */
export function getModeManual(mode?: string): string {
  const m = String(mode || 'all').toLowerCase().trim()
  if (m === 'geometry' || m === 'geom' || m === 'shapes') return MANUAL_BY_MODE.shapes || MANUAL_BY_MODE.geometry
  if (m === 'graph' || m === 'graphing') return MANUAL_BY_MODE.graphing
  if (m === 'vector' || m === 'vectors') return MANUAL_BY_MODE.vectors
  if (m === 'sandbox' || m === 'sim' || m === 'physics') return MANUAL_BY_MODE.sandbox
  if (m === 'calculator' || m === 'calc') return MANUAL_BY_MODE.calculator || ALWAYS_ON_MANUAL
  if (m === 'pure' || m === 'math' || m === 'puremath') return MANUAL_BY_MODE.pure || ALWAYS_ON_MANUAL
  if (m === 'lab' || m === 'data' || m === 'labdata') return MANUAL_BY_MODE.lab || MANUAL_BY_MODE.data
  if (m === 'view' || m === 'camera') return MANUAL_BY_MODE.view || ALWAYS_ON_MANUAL
  if (m === 'app') return MANUAL_BY_MODE.app || ALWAYS_ON_MANUAL
  return MANUAL_BY_MODE[m] || MANUAL_BY_MODE.all || ALWAYS_ON_MANUAL
}
`

  fs.writeFileSync(outputPath, code, 'utf8')
  console.log(`Successfully generated ${outputPath}`)
  console.log(`ALWAYS_ON_MANUAL length: ${ALWAYS_ON_MANUAL.length} characters (limit: 12,000)`)
}

generate()
