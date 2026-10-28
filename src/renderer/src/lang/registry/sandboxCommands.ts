// Sandbox Commands: body, link, gravity, reset, step, rewind, branch, preset
import { useSandbox } from '../../sim/store'
import { loadExperiment, stepForward, playBackwards, branchFromHere } from '../../sim/transportActions'
import { searchPresets } from '../../sim/presets'
import type { ShapeKind, LinkKind } from '../../sim/types'
import type { CommandEntry, RegistryResult } from './types'

export const sandboxCommands: CommandEntry[] = [
  {
    name: 'body',
    modes: ['sandbox'],
    args: [
      { name: 'shape', type: 'string', required: true, description: 'sphere, box, ramp, floor, cylinder' },
      { name: 'name', type: 'string', required: false, description: 'Body name' },
      { name: 'mass', type: 'number', required: false, description: 'Mass in kg' },
      { name: 'pos', type: 'point', required: false, description: 'Position (x, y, z)' },
      { name: 'vel', type: 'vector', required: false, description: 'Initial velocity (vx, vy, vz)' },
      { name: 'static', type: 'boolean', required: false, description: 'Whether body is static/fixed' }
    ],
    summary: 'Add a physics simulation body in the Sandbox',
    examples: [
      'body sphere mass 2 pos (0, 5, 0)',
      'body box name crate mass 5 pos (2, 0, 0)',
      'body ramp angle 30 height 2',
      'body floor'
    ],
    parse: (raw) => {
      const match = raw.match(/^body\s+(\w+)(.*)$/i)
      if (!match) return null
      const rawShape = match[1].toLowerCase()
      const shape: ShapeKind = rawShape === 'floor' ? 'ground' : (rawShape as ShapeKind)
      const rest = match[2]

      let name: string | undefined
      const nameM = rest.match(/name\s+(\S+)/i)
      if (nameM) name = nameM[1]

      let mass: number | undefined
      const massM = rest.match(/mass\s+([-\d.]+)/i)
      if (massM) mass = parseFloat(massM[1])

      let radius: number | undefined
      const radM = rest.match(/radius\s+([-\d.]+)/i)
      if (radM) radius = parseFloat(radM[1])

      let pos: [number, number, number] | undefined
      const posM = rest.match(/pos(?:ition)?\s*\(?([-\d.]+)[,\s]+([-\d.]+)(?:[,\s]+([-\d.]+))?\)?/i)
      if (posM) pos = [parseFloat(posM[1]), parseFloat(posM[2]), posM[3] !== undefined ? parseFloat(posM[3]) : 0]

      let vel: [number, number, number] | undefined
      const velM = rest.match(/vel(?:ocity)?\s*\(?([-\d.]+)[,\s]+([-\d.]+)(?:[,\s]+([-\d.]+))?\)?/i)
      if (velM) vel = [parseFloat(velM[1]), parseFloat(velM[2]), velM[3] !== undefined ? parseFloat(velM[3]) : 0]

      const isStatic = /\bstatic\b/i.test(rest) || shape === 'ground' || shape === 'ramp'

      return { shape, name, mass, radius, pos, vel, static: isStatic }
    },
    run: (args): RegistryResult => {
      const sb = useSandbox.getState()
      const shape = (args.shape === 'floor' ? 'ground' : args.shape) as ShapeKind
      const pos: [number, number, number] = args.pos || [0, 1, 0]

      const created = sb.addBody(shape, pos)
      const patch: Record<string, any> = {}
      if (args.name) patch.name = args.name
      if (args.mass !== undefined && !isNaN(args.mass)) {
        patch.mass = args.mass
        patch.massMode = 'mass'
      }
      if (args.radius !== undefined && !isNaN(args.radius) && shape === 'sphere') {
        patch.size = [args.radius * 2, args.radius * 2, args.radius * 2]
      }
      if (args.vel) patch.velocity = args.vel
      if (args.static) patch.motion = 'static'

      if (Object.keys(patch).length) {
        sb.updateBody(created.id, patch)
      }

      const finalName = patch.name ?? created.name
      return { ok: true, created: [created.id], removed: [], changed: [], message: `Created ${shape} "${finalName}" at (${pos.join(', ')}).` }
    }
  },
  {
    name: 'link',
    modes: ['sandbox'],
    args: [
      { name: 'kind', type: 'string', required: true, description: 'rope, rod, spring, pulley, hinge' },
      { name: 'bodyA', type: 'string', required: true, description: 'First body name' },
      { name: 'bodyB', type: 'string', required: true, description: 'Second body name' },
      { name: 'length', type: 'number', required: false, description: 'Link length' },
      { name: 'stiffness', type: 'number', required: false, description: 'Spring stiffness' }
    ],
    summary: 'Connect two simulation bodies with a constraint or link',
    examples: ['link rope ball1 ball2 length 3', 'link spring crate1 crate2 stiffness 50', 'link rod A B'],
    parse: (raw) => {
      const m = raw.match(/^link\s+(\w+)\s+(\S+)\s+(\S+)(.*)$/i)
      if (!m) return null
      const kind = m[1].toLowerCase() as LinkKind
      const bodyA = m[2]
      const bodyB = m[3]
      const rest = m[4]

      let length: number | undefined
      const lenM = rest.match(/length\s+([-\d.]+)/i)
      if (lenM) length = parseFloat(lenM[1])

      let stiffness: number | undefined
      const stiffM = rest.match(/stiff(?:ness)?\s+([-\d.]+)/i)
      if (stiffM) stiffness = parseFloat(stiffM[1])

      return { kind, bodyA, bodyB, length, stiffness }
    },
    run: (args): RegistryResult => {
      const sb = useSandbox.getState()
      const bA = sb.bodies.find((b) => b.name === args.bodyA || b.id === args.bodyA)
      const bB = sb.bodies.find((b) => b.name === args.bodyB || b.id === args.bodyB)
      if (!bA || !bB) return { ok: false, created: [], removed: [], changed: [], message: 'Both target bodies must exist to create a link.' }

      const kind = args.kind as LinkKind
      const res = sb.addLink(bA.id, bB.id, kind)
      if (!res.ok) return { ok: false, created: [], removed: [], changed: [], message: res.why }

      const updatedLinks = useSandbox.getState().links
      const link = updatedLinks[updatedLinks.length - 1]
      if (link && (args.length !== undefined || args.stiffness !== undefined)) {
        useSandbox.getState().updateLink(link.id, {
          ...(args.length !== undefined ? { length: args.length } : {}),
          ...(args.stiffness !== undefined ? { stiffness: args.stiffness } : {})
        })
      }

      return { ok: true, created: [link ? link.id : 'link'], removed: [], changed: [], message: `Connected ${bA.name} and ${bB.name} with ${kind}.` }
    }
  },
  {
    name: 'gravity',
    modes: ['sandbox'],
    args: [
      { name: 'val', type: 'any', required: true, description: 'Gravity value (number, e.g. 9.81, 0, 1.62)' }
    ],
    summary: 'Set the world gravity in the Sandbox',
    examples: ['gravity 9.81', 'gravity 0', 'gravity 1.62'],
    parse: (raw) => {
      const numM = raw.match(/^gravity\s+([-\d.]+)$/i)
      if (numM) return { val: Math.abs(parseFloat(numM[1])) }
      return null
    },
    run: (args): RegistryResult => {
      const sb = useSandbox.getState()
      const g = typeof args.val === 'number' && !isNaN(args.val) ? args.val : 9.81
      sb.setWorld({ gravity: g })
      return { ok: true, created: [], removed: [], changed: [], message: `Set world gravity to ${g} m/s².` }
    }
  },
  {
    name: 'reset',
    modes: ['sandbox'],
    args: [],
    summary: 'Reset simulation to initial state',
    examples: ['reset'],
    parse: (raw) => (raw.trim().toLowerCase() === 'reset' ? {} : null),
    run: (): RegistryResult => {
      const sb = useSandbox.getState()
      sb.resetRun()
      return { ok: true, created: [], removed: [], changed: [], message: 'Simulation reset to start state.' }
    }
  },
  {
    name: 'step',
    modes: ['sandbox'],
    args: [],
    summary: 'Advance simulation by one frame (1/60 s)',
    examples: ['step'],
    parse: (raw) => (raw.trim().toLowerCase() === 'step' ? {} : null),
    run: (): RegistryResult => {
      stepForward()
      return { ok: true, created: [], removed: [], changed: [], message: 'Stepped forward 1 frame.' }
    }
  },
  {
    name: 'rewind',
    modes: ['sandbox'],
    args: [],
    summary: 'Play simulation backwards',
    examples: ['rewind'],
    parse: (raw) => (raw.trim().toLowerCase() === 'rewind' ? {} : null),
    run: (): RegistryResult => {
      playBackwards()
      return { ok: true, created: [], removed: [], changed: [], message: 'Playing backwards.' }
    }
  },
  {
    name: 'branch',
    modes: ['sandbox'],
    args: [],
    summary: 'Branch simulation run from the current moment',
    examples: ['branch'],
    parse: (raw) => (raw.trim().toLowerCase() === 'branch' ? {} : null),
    run: (): RegistryResult => {
      branchFromHere()
      return { ok: true, created: [], removed: [], changed: [], message: 'Branched simulation.' }
    }
  },
  {
    name: 'preset',
    aliases: ['experiment'],
    modes: ['sandbox'],
    args: [
      { name: 'query', type: 'string', required: true, description: 'Preset name or search keywords' }
    ],
    summary: 'Load a ready-made physics experiment preset',
    examples: ['preset projectile', 'preset newton cradle', 'preset free fall', 'experiment pendulum'],
    parse: (raw) => {
      const m = raw.match(/^(?:preset|experiment)\s+(.+)$/i)
      return m ? { query: m[1].trim() } : null
    },
    run: (args): RegistryResult => {
      const query = String(args.query ?? '').trim()
      const found = searchPresets(query)
      if (!found.length) return { ok: false, created: [], removed: [], changed: [], message: `No preset matching "${query}".` }

      const picked = found[0]
      loadExperiment(picked.id)
      return { ok: true, created: [], removed: [], changed: [], message: `Loaded experiment: ${picked.label}.` }
    }
  }
]
