import { enterMode } from '../app/layout'
import { useApp } from '../app/modes'
import { useScene } from '../core/store'
import { useCalc } from '../calc/calcStore'
import { evaluateInput } from '../calc/evaluateInput'
import { usePure } from '../math/pure/store'
import { reconcile } from '../calc/working'
import { run3WayTruthCheck } from './truthCheck'
import { runCommand } from '../lang/commands'
import { resetCamera } from '../render/viewState'
import { PRESETS } from '../sim/presets'
import { loadExperiment, play, pause } from '../sim/transportActions'
import { useSandbox, engine, makeBody } from '../sim/store'
import { SimWorld } from '../sim/world'
import { startRecorder } from '../sim/recorder'
import { stepOneFrame } from '../sim/stepping'
import { type ShapeKind, type BodyDef } from '../sim/types'
import { tableFrom, type Sample } from '../sim/recording'
import { useLab } from '../lab/labStore'
import { useTape } from '../sim/tapeStore'
import { fitOf } from '../lab/fit'
import type { FitShape } from '../lab/types'

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_app_state',
      description: 'Get the current application state: active mode, calculator input, graph lines, and sandbox simulation bodies.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'solve',
      description: 'Solve a mathematical equation or evaluate an expression with complete step-by-step working and checked answers in the Calculator.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The math equation or expression to solve (e.g. x^2 - 5x + 6 = 0, 2 sin x = 1, differentiate x^3 sin x).'
          },
          angle: {
            type: 'string',
            enum: ['deg', 'rad'],
            description: 'Angle unit: deg or rad (default: deg).'
          }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'plot',
      description: 'Plot a function or mathematical curve in 2D or 3D graphing mode.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'The equation to plot (e.g. y = sin x, z = (x^2 - y^2)/6).'
          },
          dim: {
            type: 'string',
            enum: ['2d', '3d'],
            description: 'Graph dimension: 2d or 3d (default: 2d).'
          }
        },
        required: ['expression']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_experiments',
      description: 'List available ready-made physics experiments and presets.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_experiment',
      description: 'Load a ready-made physics experiment preset into the Sandbox (e.g. cradle, pendulum, collision, atwood, bounce).',
      parameters: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The preset ID (e.g. cradle, pendulum, collision, atwood, bounce, drop).'
          }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'build_experiment',
      description: 'Build a custom physics experiment with multiple bodies, custom gravity, and floor settings in the Sandbox.',
      parameters: {
        type: 'object',
        properties: {
          objects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                kind: { type: 'string', description: 'Shape kind (sphere/ball, box, cylinder, ramp, etc.).' },
                mass: { type: 'number', description: 'Mass in kg.' },
                x: { type: 'number', description: 'X position in meters.' },
                y: { type: 'number', description: 'Y position (height) in meters.' },
                vx: { type: 'number', description: 'Horizontal velocity in m/s.' },
                vy: { type: 'number', description: 'Vertical velocity in m/s.' },
                radius: { type: 'number', description: 'Radius in meters.' },
                fixed: { type: 'boolean', description: 'Whether the body is fixed (static).' }
              },
              required: ['kind']
            },
            description: 'List of objects to create.'
          },
          gravity: {
            type: 'number',
            description: 'Downward gravitational acceleration in m/s² (default: 9.81).'
          },
          floor: {
            type: 'boolean',
            description: 'Whether to include the ground floor (default: true).'
          }
        },
        required: ['objects']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'add_body',
      description: 'Add a new physical body to the Sandbox simulation.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['sphere', 'box', 'cylinder', 'capsule', 'cone', 'ramp', 'plank', 'ball'],
            description: 'The shape kind (sphere/ball, box, cylinder, etc.).'
          },
          mass: { type: 'number', description: 'Mass in kg.' },
          x: { type: 'number', description: 'Initial X position in meters.' },
          y: { type: 'number', description: 'Initial Y position (height) in meters.' },
          vx: { type: 'number', description: 'Initial horizontal velocity in m/s.' },
          vy: { type: 'number', description: 'Initial vertical velocity in m/s.' },
          radius: { type: 'number', description: 'Radius in meters (for sphere/cylinder).' }
        },
        required: ['kind']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_body',
      description: 'Remove a body from the Sandbox by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID of the body to remove.' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_param',
      description: 'Set a property on a physical body (e.g. velocity, speed, mass, friction, restitution).',
      parameters: {
        type: 'object',
        properties: {
          bodyId: { type: 'string', description: 'ID of the body.' },
          name: { type: 'string', description: 'Property name (e.g. velocity, speed, mass, friction, restitution).' },
          value: { description: 'Numeric value or [vx, vy] array to set.' }
        },
        required: ['bodyId', 'name', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_speed',
      description: 'Set simulation playback speed / slow motion factor (range 0.1 to 4).',
      parameters: {
        type: 'object',
        properties: {
          factor: {
            type: 'number',
            description: 'Playback speed factor (0.1 = 10x slow motion, 1 = normal, 2 = 2x speed, up to 4).'
          }
        },
        required: ['factor']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'play',
      description: 'Start or resume running the Sandbox physics simulation.',
      parameters: {
        type: 'object',
        properties: {
          seconds: {
            type: 'number',
            description: 'Optional duration in simulated seconds to run before pausing.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'pause',
      description: 'Pause the physics simulation.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'reset',
      description: 'Reset the physics simulation to t = 0 and restore initial positions.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_readings',
      description: 'Get real recorded simulation readings (t, x, y, v, a, KE, PE) for a body from the simulation.',
      parameters: {
        type: 'object',
        properties: {
          bodyId: {
            type: 'string',
            description: 'ID or name of the body (optional: defaults to first dynamic body).'
          },
          quantities: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of quantities to include (e.g. ["t", "y", "v", "ke", "pe"]).'
          },
          every: {
            type: 'number',
            description: 'Sampling interval in steps.'
          },
          at: {
            type: 'array',
            items: { type: 'number' },
            description: 'Specific timestamps in seconds to retrieve readings for (e.g. [0.5, 1, 1.5]).'
          },
          when: {
            type: 'string',
            enum: ['max_height', 'impact', 'stop'],
            description: 'Specific moment to sample: max_height (peak y), impact (contact/bounce), or stop (v < 0.01).'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'graph_readings',
      description: 'Plot real recorded experiment data into Lab Data with optional curve fitting (linear or quadratic).',
      parameters: {
        type: 'object',
        properties: {
          bodyId: {
            type: 'string',
            description: 'ID or name of the body.'
          },
          x: {
            type: 'string',
            description: 'Quantity on x-axis (default: "t").'
          },
          y: {
            type: 'string',
            description: 'Quantity on y-axis (e.g. "v", "y", "x", "ke", "pe", "p").'
          },
          fit: {
            type: 'string',
            enum: ['linear', 'quadratic'],
            description: 'Curve fitting shape: linear or quadratic.'
          }
        },
        required: ['y']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'export_readings',
      description: 'Export simulation readings to a file (CSV or Markdown) and append them to Lab Data.',
      parameters: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['csv', 'md', 'xlsx', 'pdf'],
            description: 'Export file format (csv and md are natively supported; xlsx/pdf will save csv with a note).'
          },
          title: {
            type: 'string',
            description: 'Table title for the export.'
          }
        },
        required: ['format', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'demonstrate',
      description: 'Run a sequential demonstration of actions with a pause and caption between each.',
      parameters: {
        type: 'object',
        properties: {
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool: { type: 'string' },
                args: { type: 'object' },
                caption: { type: 'string' }
              },
              required: ['tool', 'args', 'caption']
            },
            description: 'List of steps to execute sequentially.'
          }
        },
        required: ['steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_commands',
      description: 'Run one or more PhysLab command bar commands.',
      parameters: {
        type: 'object',
        properties: {
          commands: {
            type: 'array',
            items: { type: 'string' },
            description: 'Commands to run.'
          },
          mode: { type: 'string', description: 'Target mode (default: graphing).' },
          view: { type: 'string', enum: ['2d', '3d'], description: 'View dimension.' }
        },
        required: ['commands']
      }
    }
  }
]

export interface ToolResult {
  ok: boolean
  error?: string
  [key: string]: unknown
}

export type StepCaptionCallback = (caption: string) => void

export async function runTool(
  name: string,
  args: Record<string, any> = {},
  onCaption?: StepCaptionCallback
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'get_app_state': {
        const mode = useApp.getState().mode
        const calcInput = useCalc.getState().input
        const bodies = useSandbox.getState().bodies.map((b) => ({
          id: b.id,
          name: b.name,
          kind: b.shape,
          position: b.position,
          motion: b.motion,
          mass: b.mass
        }))
        const isPlaying = useScene.getState().playing
        return {
          ok: true,
          mode,
          calcInput,
          bodies,
          isPlaying
        }
      }

      case 'solve': {
        const expression = String(args.expression || '').trim()
        if (!expression) {
          return { ok: false, error: 'Expression is required.' }
        }

        // 1. Switch mode
        enterMode('calculator')
        useCalc.setState({ input: expression, mode: 'COMP' })

        const angleUnit = args.angle === 'rad' ? 'rad' : 'deg'
        const s = useCalc.getState()
        const card = evaluateInput('COMP', expression, {
          vars: s.vars ?? {},
          ans: s.ans ?? 0,
          angle: angleUnit
        })

        // 2. Run step engine
        const opToJob: Record<string, 'differentiate' | 'integrate' | 'solve' | 'factor' | 'limit' | 'auto'> = {
          diff: 'differentiate',
          differentiate: 'differentiate',
          integrate: 'integrate',
          solve: 'solve',
          factor: 'factor',
          limit: 'limit',
          simplify: 'auto'
        }
        const job = args.op ? (opToJob[args.op] ?? 'auto') : (expression.includes('=') ? 'solve' : 'auto')
        const latexExpr = expression.replace(/\b(sin|cos|tan|arcsin|arccos|arctan)\b/g, '\\$1')
        usePure.getState().runLatex(latexExpr, job, { quiet: true })

        // 3. Await working if async
        if (usePure.getState().asking) {
          await new Promise<void>((resolve) => {
            const unsub = usePure.subscribe((state) => {
              if (!state.asking) {
                unsub()
                resolve()
              }
            })
            setTimeout(() => {
              unsub()
              resolve()
            }, 8000)
          })
        }

        const working = usePure.getState().working
        const reconciled = card ? reconcile(card, working) : null
        let answer = reconciled?.result?.main ?? working?.answers?.[0]?.label ?? ''
        if (!answer && working?.answers && working.answers.length > 0) {
          answer = working.answers.map((a) => a.tex || a.label).join(', ')
        }

        // 4. Run 3-way truth check
        let truthCheck: any = null
        try {
          truthCheck = await run3WayTruthCheck(expression, answer)
        } catch {
          // truth check error should not crash
        }

        // 5. Update calc history like '=' does
        if (reconciled?.result?.main) {
          useCalc.setState((c) => ({
            ans: reconciled.result.value ?? c.ans,
            history: [{ input: expression, result: reconciled.result.main, mode: 'COMP' as const }, ...c.history].slice(0, 100)
          }))
        }

        const steps = (working?.moves ?? []).slice(0, 12).map((m) => ({
          text: m.head ?? (m as any).text ?? '',
          rule: m.rule ?? '',
          tex: m.tex ?? ''
        }))

        const isUnsolved = !answer && (reconciled?.result?.error || working?.error)
        const note = isUnsolved ? 'AI explanation, not checked by PhysLab' : undefined

        return {
          ok: true,
          answer,
          checked: working?.checked === 'ok',
          truthCheck,
          steps,
          answers: working?.answers ?? [],
          unsolved: isUnsolved ? true : undefined,
          note
        }
      }

      case 'plot': {
        const expr = String(args.expression || '').trim()
        if (!expr) {
          return { ok: false, error: 'Expression is required.' }
        }

        const dim = args.dim === '3d' ? '3d' : '2d'
        enterMode('graphing', { skipFocus: true })
        useScene.getState().setViewMode(dim)

        let eq = expr
        if (dim === '3d' && !eq.includes('=')) {
          eq = `z = ${eq}`
        }
        await runCommand(eq)
        if (dim === '3d') {
          setTimeout(resetCamera, 200)
        }

        return { ok: true, expression: eq, dim }
      }

      case 'list_experiments': {
        const experiments = PRESETS.map((p) => ({
          id: p.id,
          name: p.label,
          about: p.about
        }))
        return { ok: true, experiments }
      }

      case 'load_experiment': {
        const id = String(args.id || '').trim().toLowerCase()
        if (!id) {
          return { ok: false, error: 'Experiment preset ID is required.' }
        }

        enterMode('sandbox')
        // Match preset ID or alias
        const presetMap: Record<string, string> = {
          'newtons-cradle': 'cradle',
          'newton-cradle': 'cradle',
          'newton cradle': 'cradle',
          'pendulum': 'pendulum',
          'collision': 'collision',
          'atwood': 'atwood',
          'lever': 'seesaw',
          'seesaw': 'seesaw',
          'spring': 'spring',
          'bouncing': 'bounce',
          'bounce': 'bounce',
          'freefall': 'drop',
          'drop': 'drop'
        }
        const resolvedId = presetMap[id] ?? id
        loadExperiment(resolvedId)

        if (engine.world) {
          const s = useSandbox.getState()
          engine.world.rebuild(s.bodies, s.links)
        }

        const bodies = useSandbox.getState().bodies.map((b) => ({
          id: b.id,
          name: b.name,
          shape: b.shape,
          position: b.position
        }))

        return { ok: true, id: resolvedId, bodies }
      }

      case 'build_experiment': {
        enterMode('sandbox')
        useScene.getState().setPlaying(false)

        const floorWanted = args.floor !== false
        const floorBody = floorWanted ? makeBody('ground', 'Floor', [0, -0.2, 0]) : null
        const initialBodies: BodyDef[] = floorBody ? [floorBody] : []
        const gravityPatch = typeof args.gravity === 'number' ? { gravity: args.gravity } : undefined

        useSandbox.getState().setScene(initialBodies, gravityPatch, [])
        useSandbox.getState().resetRun()

        const objects = Array.isArray(args.objects) ? args.objects : []
        const createdBodyIds: string[] = []
        const createdBodies: any[] = []

        for (const obj of objects) {
          const rawKind = String(obj.kind || 'sphere').toLowerCase()
          const shapeKind = (rawKind === 'ball' ? 'sphere' : rawKind === 'crate' ? 'box' : rawKind) as ShapeKind
          const x = typeof obj.x === 'number' ? obj.x : 0
          const y = typeof obj.y === 'number' ? obj.y : 2
          const body = useSandbox.getState().addBody(shapeKind, [x, y, 0])

          const patch: Partial<BodyDef> = {}
          if (typeof obj.mass === 'number') patch.mass = obj.mass
          if (typeof obj.radius === 'number') {
            patch.size = [obj.radius, obj.radius, obj.radius]
          }
          if (typeof obj.vx === 'number' || typeof obj.vy === 'number') {
            patch.velocity = [obj.vx ?? 0, obj.vy ?? 0, 0]
          }
          if (obj.fixed === true) {
            patch.motion = 'static'
          } else if (obj.fixed === false) {
            patch.motion = 'dynamic'
          }

          if (Object.keys(patch).length > 0) {
            useSandbox.getState().updateBody(body.id, patch)
          }

          const updated = useSandbox.getState().bodies.find((b) => b.id === body.id) ?? body
          createdBodyIds.push(updated.id)
          createdBodies.push({
            id: updated.id,
            name: updated.name,
            kind: updated.shape,
            position: updated.position,
            mass: updated.mass,
            velocity: updated.velocity
          })
        }

        if (engine.world) {
          const s = useSandbox.getState()
          engine.world.rebuild(s.bodies, s.links)
        }

        return {
          ok: true,
          bodyIds: createdBodyIds,
          bodies: createdBodies,
          gravity: useSandbox.getState().world.gravity,
          floor: floorWanted
        }
      }

      case 'add_body': {
        enterMode('sandbox')
        const rawKind = String(args.kind || 'sphere').toLowerCase()
        const shapeKind = (rawKind === 'ball' ? 'sphere' : rawKind === 'crate' ? 'box' : rawKind) as ShapeKind
        const x = typeof args.x === 'number' ? args.x : 0
        const y = typeof args.y === 'number' ? args.y : 2
        const body = useSandbox.getState().addBody(shapeKind, [x, y, 0])

        const patch: Record<string, any> = {}
        if (typeof args.mass === 'number') patch.mass = args.mass
        if (typeof args.radius === 'number') patch.radius = args.radius
        if (typeof args.vx === 'number' || typeof args.vy === 'number') {
          patch.velocity = [args.vx ?? 0, args.vy ?? 0, 0]
        }
        if (Object.keys(patch).length > 0) {
          useSandbox.getState().updateBody(body.id, patch)
        }

        const updated = useSandbox.getState().bodies.find((b) => b.id === body.id) ?? body
        return { ok: true, bodyId: updated.id, body: updated }
      }

      case 'remove_body': {
        const id = String(args.id || '').trim()
        if (!id) return { ok: false, error: 'Body ID is required.' }
        const bodies = useSandbox.getState().bodies
        const target = bodies.find((b) => b.id === id || b.name.toLowerCase() === id.toLowerCase())
        if (!target) return { ok: false, error: `Body not found: ${id}` }
        useSandbox.getState().removeBody(target.id)
        return { ok: true, removedId: target.id }
      }

      case 'set_param': {
        const bodyId = String(args.bodyId || '').trim()
        const name = String(args.name || '').trim().toLowerCase()
        const rawValue = args.value
        if (!bodyId || !name || rawValue === undefined) {
          return { ok: false, error: 'bodyId, name, and value are required.' }
        }
        const target = useSandbox.getState().bodies.find((b) => b.id === bodyId || b.name.toLowerCase() === bodyId.toLowerCase())
        if (!target) return { ok: false, error: `Body not found: ${bodyId}` }

        const patch: Partial<BodyDef> = {}
        if (name === 'velocity') {
          if (Array.isArray(rawValue)) {
            const vx = Number(rawValue[0]) || 0
            const vy = Number(rawValue[1]) || 0
            patch.velocity = [vx, vy, 0]
          } else if (typeof rawValue === 'number' || !Number.isNaN(Number(rawValue))) {
            const speed = Number(rawValue)
            const curr = target.velocity
            const curSpeed = Math.hypot(curr[0], curr[1])
            patch.velocity = curSpeed < 1e-4 ? [0, -speed, 0] : [(curr[0] / curSpeed) * speed, (curr[1] / curSpeed) * speed, 0]
          }
        } else if (name === 'speed' || name === 'v') {
          const speed = Number(rawValue)
          if (Number.isNaN(speed)) {
            return { ok: false, error: 'speed value must be a number' }
          }
          const curr = target.velocity
          const curSpeed = Math.hypot(curr[0], curr[1])
          patch.velocity = curSpeed < 1e-4 ? [0, -speed, 0] : [(curr[0] / curSpeed) * speed, (curr[1] / curSpeed) * speed, 0]
        } else if (name === 'vx') {
          patch.velocity = [Number(rawValue) || 0, target.velocity[1], 0]
        } else if (name === 'vy') {
          patch.velocity = [target.velocity[0], Number(rawValue) || 0, 0]
        } else if (name === 'mass') {
          patch.mass = Number(rawValue)
        } else if (name === 'restitution' || name === 'bounciness' || name === 'e') {
          patch.restitution = Math.max(0, Math.min(1, Number(rawValue)))
        } else if (name === 'friction' || name === 'mu') {
          patch.friction = Math.max(0, Number(rawValue))
        } else {
          ;(patch as any)[name] = rawValue
        }

        useSandbox.getState().updateBody(target.id, patch)

        if (engine.world) {
          if (patch.velocity) {
            engine.world.setVelocity(target.id, patch.velocity)
          }
          const updatedDef = useSandbox.getState().bodies.find((b) => b.id === target.id)
          if (updatedDef) {
            engine.world.updateBody(updatedDef)
          }
        }

        return { ok: true, bodyId: target.id, [name]: rawValue, velocity: patch.velocity }
      }

      case 'set_speed': {
        const factor = Math.max(0.1, Math.min(4, Number(args.factor) || 1))
        useSandbox.getState().setWorld({ timeScale: factor })
        useTape.getState().setSpeed(factor as any)
        return { ok: true, factor, timeScale: factor }
      }

      case 'play': {
        play()
        const seconds = typeof args.seconds === 'number' ? args.seconds : 0
        if (seconds > 0) {
          if (!engine.world) {
            const w = await SimWorld.create(useSandbox.getState().world)
            engine.world = w
            startRecorder(w)
          }
          const s = useSandbox.getState()
          engine.world.rebuild(s.bodies, s.links)
          const rate = useSandbox.getState().world.stepRate ?? 240
          const totalSteps = Math.round(seconds * rate)
          for (let i = 0; i < totalSteps; i++) {
            stepOneFrame()
          }
          pause()
        }
        return { ok: true, playing: seconds > 0 ? false : true }
      }

      case 'pause': {
        pause()
        return { ok: true, playing: false }
      }

      case 'reset': {
        useScene.getState().setPlaying(false)
        useSandbox.getState().resetRun()
        return { ok: true, reset: true }
      }

      case 'get_readings': {
        const bodies = useSandbox.getState().bodies
        const targetBody = args.bodyId
          ? bodies.find((b) => b.id === args.bodyId || b.name.toLowerCase() === String(args.bodyId).toLowerCase())
          : bodies.find((b) => b.motion === 'dynamic') ?? bodies[0]

        if (!targetBody) {
          return { ok: false, error: 'No dynamic body found in Sandbox. Add a body or load an experiment first.' }
        }

        const recordedSamples = useSandbox.getState().recording[targetBody.id] ?? []
        if (!recordedSamples || recordedSamples.length === 0) {
          return {
            ok: false,
            error: 'No simulation recording available yet. Please call play(seconds) first to run the experiment.'
          }
        }

        let selectedSamples: Sample[] = []

        if (args.at && Array.isArray(args.at) && args.at.length > 0) {
          selectedSamples = args.at.map((reqTime: number) => {
            const targetT = Number(reqTime)
            return recordedSamples.reduce((best, curr) =>
              Math.abs(curr.t - targetT) < Math.abs(best.t - targetT) ? curr : best
            )
          })
        } else if (args.when) {
          const whenType = String(args.when).toLowerCase()
          if (whenType === 'max_height') {
            const maxSample = recordedSamples.reduce((max, s) => (s.y > max.y ? s : max), recordedSamples[0])
            selectedSamples = [maxSample]
          } else if (whenType === 'impact') {
            const contacts = useSandbox.getState().contacts.filter((c) => c.a === targetBody.id || c.b === targetBody.id)
            if (contacts.length > 0 && typeof contacts[0].engineTime === 'number') {
              const impactT = contacts[0].engineTime
              const impactSample = recordedSamples.reduce((best, curr) =>
                Math.abs(curr.t - impactT) < Math.abs(best.t - impactT) ? curr : best
              )
              selectedSamples = [impactSample]
            } else {
              let turnSample = recordedSamples[0]
              for (let i = 1; i < recordedSamples.length - 1; i++) {
                if (
                  recordedSamples[i].y <= recordedSamples[i - 1].y &&
                  recordedSamples[i].y <= recordedSamples[i + 1].y &&
                  recordedSamples[i].y < recordedSamples[0].y - 0.05
                ) {
                  turnSample = recordedSamples[i]
                  break
                }
              }
              selectedSamples = [turnSample]
            }
          } else if (whenType === 'stop') {
            const stopSample =
              recordedSamples.find((s) => s.v < 0.01) ??
              recordedSamples.reduce((min, s) => (s.v < min.v ? s : min), recordedSamples[0])
            selectedSamples = [stopSample]
          } else {
            selectedSamples = recordedSamples
          }
        } else {
          const step = Math.max(1, Math.floor(recordedSamples.length / 200))
          selectedSamples = recordedSamples.filter((_, idx) => idx % step === 0).slice(0, 200)
        }

        const rows = selectedSamples.map((s) => {
          const row: Record<string, number> = {
            t: s.t,
            x: s.x,
            y: s.y,
            v: s.v,
            ke: s.ke,
            pe: s.pe,
            p: s.p
          }
          if (args.quantities && Array.isArray(args.quantities) && args.quantities.length > 0) {
            const filtered: Record<string, number> = { t: s.t }
            for (const q of args.quantities) {
              const key = String(q).toLowerCase()
              if (key in row) filtered[key] = row[key]
            }
            return filtered
          }
          return row
        })

        return {
          ok: true,
          bodyId: targetBody.id,
          bodyName: targetBody.name,
          rows,
          totalSamples: recordedSamples.length
        }
      }

      case 'graph_readings': {
        enterMode('lab')
        const bodies = useSandbox.getState().bodies
        const targetBody = args.bodyId
          ? bodies.find((b) => b.id === args.bodyId || b.name.toLowerCase() === String(args.bodyId).toLowerCase())
          : bodies.find((b) => b.motion === 'dynamic') ?? bodies[0]

        if (!targetBody) {
          return { ok: false, error: 'No dynamic body found to graph.' }
        }

        const samples = useSandbox.getState().recording[targetBody.id] ?? []
        if (!samples || samples.length === 0) {
          return {
            ok: false,
            error: 'No simulation recording available yet. Please call play(seconds) first to generate data.'
          }
        }

        const labTable = tableFrom(targetBody.name, samples)

        const xArg = String(args.x || 't').toLowerCase()
        const yArg = String(args.y || 'v').toLowerCase()

        const colX = labTable.columns.find((c) => c.name.toLowerCase() === xArg) ?? labTable.columns[0]
        const colY = labTable.columns.find((c) => c.name.toLowerCase() === yArg) ?? labTable.columns[3]

        const fitShape: FitShape = args.fit === 'quadratic' ? 'quadratic' : 'linear'
        labTable.plot = {
          x: colX.id,
          y: colY.id,
          fit: args.fit ? fitShape : null
        }

        useLab.getState().appendTable(labTable)

        const getColVal = (s: Sample, colName: string): number => {
          switch (colName.toLowerCase()) {
            case 't': return s.t
            case 'x': return s.x
            case 'y': return s.y
            case 'v': return s.v
            case 'ke': return s.ke
            case 'pe': return s.pe
            case 'p': return s.p
            default: return s.v
          }
        }

        const xs = samples.map((s) => getColVal(s, colX.name))
        const ys = samples.map((s) => getColVal(s, colY.name))
        const fitResult = args.fit ? fitOf(xs, ys, fitShape) : null

        return {
          ok: true,
          tableId: labTable.id,
          tableName: labTable.title,
          x: colX.name,
          y: colY.name,
          fit: args.fit ?? undefined,
          slope: fitResult?.slope,
          intercept: fitResult?.intercept,
          coefficients: fitResult?.coef,
          r2: fitResult?.r2,
          expr: fitResult?.expr
        }
      }

      case 'export_readings': {
        const format = String(args.format || 'csv').toLowerCase()
        const title = String(args.title || 'Simulation Readings').trim()

        const bodies = useSandbox.getState().bodies
        const targetBody = bodies.find((b) => b.motion === 'dynamic') ?? bodies[0]
        const samples: Sample[] = targetBody ? (useSandbox.getState().recording[targetBody.id] ?? []) : []

        if (!samples || samples.length === 0) {
          return {
            ok: false,
            error: 'No simulation recording available to export. Run the experiment first.'
          }
        }

        // CSV content
        const header = ['t', 'x', 'y', 'v', 'KE', 'PE', 'p']
        const csvLines = [
          header.join(','),
          ...samples.map((s) => [s.t, s.x, s.y, s.v, s.ke, s.pe, s.p].join(','))
        ]
        const csvContent = csvLines.join('\n')

        // Markdown content
        const mdLines = [
          `# ${title}`,
          '',
          '| t (s) | x (m) | y (m) | v (m/s) | KE (J) | PE (J) | p (kg m/s) |',
          '|---|---|---|---|---|---|---|',
          ...samples.slice(0, 100).map((s) => `| ${s.t} | ${s.x} | ${s.y} | ${s.v} | ${s.ke} | ${s.pe} | ${s.p} |`)
        ]
        const mdContent = mdLines.join('\n')

        let note: string | undefined
        let ext = 'csv'
        let content = csvContent
        let filterName = 'CSV file'

        if (format === 'md') {
          ext = 'md'
          content = mdContent
          filterName = 'Markdown file'
        } else if (format === 'xlsx' || format === 'pdf') {
          note = `${format.toUpperCase()} not available yet, saved CSV.`
          ext = 'csv'
          content = csvContent
          filterName = 'CSV file'
        }

        // Append to Lab Data table
        const labTable = tableFrom(title, samples)
        useLab.getState().appendTable(labTable)

        // Save via electron bridge if available
        let savedPath: string | null = null
        if (typeof window !== 'undefined' && window.physlab?.saveText) {
          const defaultName = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${ext}`
          savedPath = await window.physlab.saveText(content, defaultName, filterName, ext)
        }

        return {
          ok: true,
          format: ext,
          path: savedPath ?? `${title}.${ext}`,
          tableId: labTable.id,
          note
        }
      }

      case 'demonstrate': {
        const steps = Array.isArray(args.steps) ? args.steps : []
        if (steps.length === 0) return { ok: false, error: 'No demonstration steps provided.' }

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i]
          if (step.caption) {
            onCaption?.(step.caption)
          }
          const res = await runTool(step.tool, step.args, onCaption)
          if (!res.ok) {
            return { ok: false, error: `Demonstration stopped at step ${i + 1}: ${res.error}` }
          }
          if (i < steps.length - 1) {
            await new Promise((r) => setTimeout(r, 1500))
          }
        }
        return { ok: true, completedSteps: steps.length }
      }

      case 'run_commands': {
        const targetMode = args.mode ? (args.mode === 'calc' ? 'calculator' : args.mode) : undefined
        if (targetMode) {
          enterMode(targetMode)
        }
        if (args.view === '2d' || args.view === '3d') {
          useScene.getState().setViewMode(args.view)
        }
        const commands = Array.isArray(args.commands) ? args.commands.map(String) : []
        const dropped: string[] = []
        for (const cmd of commands) {
          const trimmed = cmd.trim()
          if (/^distance/i.test(trimmed)) {
            dropped.push(trimmed)
            continue
          }
          await runCommand(trimmed)
        }
        return { ok: true, executedCount: commands.length - dropped.length, dropped }
      }

      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
