// Calculator-style modes: every feature lives in a mode (no grade levels).

import { create } from 'zustand'
import type { ToolId } from '../core/types'

export type ModeId =
  | 'calculator'
  | 'vectors'
  | 'shapes'
  | 'graphing'
  | 'gpu'
  | 'sandbox'
  | 'proofs'
  | 'mechanics'
  | 'instruments'
  | 'electricity'
  | 'optics'
  | 'waves'
  | 'heat'
  | 'nuclear'
  | 'problems'
  | 'lab'

export interface ModeDef {
  id: ModeId
  label: string
  description: string
  ready: boolean
  /** Tool shelf for this mode ('|' = separator). */
  tools: (ToolId | '|')[]
  /** Panel to bring forward when the mode opens. */
  panel?: string
  /** A panel for the big centre area, shown instead of the viewport while this mode is open. */
  centre?: string
  view?: '2d' | '3d'
  /** The Examples panel has lessons for this mode, so the default layout opens it. */
  examples?: boolean
}

export const MODES: ModeDef[] = [
  {
    id: 'calculator',
    label: 'Calculator',
    description: 'Scientific calculator in natural textbook math, plus Pure Math: factorising, division, partial fractions, HCF/LCM and complex numbers worked out step by step.',
    ready: true,
    tools: ['select', '|', 'point', 'distance', '|', 'delete'],
    panel: 'calculator',
    centre: 'working'
  },
  {
    id: 'vectors',
    label: 'Vectors',
    description: 'Vector calculator, drawing vectors with live measurements, step-by-step solutions.',
    ready: true,
    tools: ['select', '|', 'vector', 'point', '|', 'distance', 'angle', '|', 'segment', 'text', '|', 'delete'],
    panel: 'vectorcalc',
    view: '2d',
    examples: true
  },
  {
    id: 'shapes',
    label: 'Geometry',
    description: 'Sketch or click shapes: automatic recognition, area formulas, decomposition, constructions.',
    ready: true,
    tools: ['select', '|', 'sketch', 'segment', 'triangle', 'polygon', 'circle', '|', 'point', 'line', 'ray', 'vector', '|', 'midpoint', 'perpendicular', 'parallel', 'perpBisector', 'angleBisector', 'intersect', '|', 'angle', 'distance', 'text', '|', 'delete'],
    panel: 'measure',
    view: '2d',
    examples: true
  },
  {
    id: 'graphing',
    label: 'Graphing',
    description: 'Graph functions, equations, inequalities, polar and parametric curves, 3D surfaces.',
    ready: true,
    tools: ['select', '|', 'point', 'intersect', 'distance', '|', 'delete'],
    panel: 'console',
    examples: true
  },
  {
    id: 'sandbox',
    label: 'Sandbox',
    description: 'Real objects that collide: mass, velocity, bounciness, friction, gravity, air resistance and throwing.',
    ready: true,
    tools: ['select'],
    panel: 'sandbox',
    view: '3d'
  },
  { id: 'gpu', label: 'GPU Lab', description: 'Millions of charged particles in electric and magnetic fields on the graphics card.', ready: true, tools: ['select'], panel: 'gpulab', view: '3d' },
  { id: 'proofs', label: 'Proofs', description: 'Interactive proofs of theorems, laws and formulas with written steps.', ready: false, tools: ['select'] },
  { id: 'mechanics', label: 'Mechanics', description: 'Free fall, projectiles and pendulums with air resistance, trains, collisions, circular motion.', ready: false, tools: ['select'] },
  { id: 'instruments', label: 'Instruments', description: 'Vernier caliper, screw gauge, stopwatch, metre rule, spring balance, meters, with practicals.', ready: false, tools: ['select'] },
  { id: 'electricity', label: 'Electricity & Electronics', description: 'Circuits, meters, fields, magnetism, induction, electronic components.', ready: false, tools: ['select'] },
  { id: 'optics', label: 'Optics', description: 'Mirrors, lenses, prisms, refraction, interference and diffraction.', ready: false, tools: ['select'] },
  { id: 'waves', label: 'Waves & Sound', description: 'Oscillations, waves, superposition, standing waves, the Doppler effect.', ready: false, tools: ['select'] },
  { id: 'heat', label: 'Heat', description: 'Temperature, gases, kinetic theory, thermodynamic cycles.', ready: false, tools: ['select'] },
  { id: 'nuclear', label: 'Nuclear & Modern', description: 'Radioactivity, half-life, binding energy, relativity.', ready: false, tools: ['select'] },
  {
    id: 'lab',
    label: 'Lab Data',
    description: 'Readings from an experiment: type them in, plot them, and read the gradient off the best-fit line.',
    ready: true,
    tools: ['select'],
    panel: 'labdata',
    view: '2d'
  },
  {
    id: 'problems',
    label: 'Problem Sets',
    description: 'Random practice problems: hints one step at a time, and checking of the answer you worked out yourself.',
    ready: true,
    tools: ['select', '|', 'vector', 'point', '|', 'delete'],
    panel: 'practice',
    view: '2d'
  }
]

/** Never throws: a file from a newer version may name a mode this build does not have. */
export const modeById = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0]

/** The modes a student can open today; the rest are announced, not clickable. */
export const readyModes = (): ModeDef[] => MODES.filter((m) => m.ready)

const INFO_KEY = 'physlab.graphicsInfo'

const readGraphicsInfo = (): boolean => {
  try {
    return localStorage.getItem(INFO_KEY) === '1'
  } catch {
    return false
  }
}

export const useApp = create<{
  mode: ModeId
  searchOpen: boolean
  layoutReady: boolean
  /** The WebGPU / quality / fps badges on the drawing: off unless someone is diagnosing graphics. */
  graphicsInfo: boolean
  setMode: (m: ModeId) => void
  setSearchOpen: (o: boolean) => void
  setGraphicsInfo: (on: boolean) => void
}>((set) => ({
  mode: 'vectors',
  searchOpen: false,
  /** The dock layout has settled; the 3D canvas waits for this so the GPU renderer starts only once. */
  layoutReady: false,
  graphicsInfo: readGraphicsInfo(),
  setMode: (mode) => set({ mode }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setGraphicsInfo: (graphicsInfo) => {
    try {
      localStorage.setItem(INFO_KEY, graphicsInfo ? '1' : '0')
    } catch {
      // Not remembered; the badges just come back hidden next time.
    }
    set({ graphicsInfo })
  }
}))

// Handy while developing: inspect app state from the browser console.
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __useApp?: typeof useApp }).__useApp = useApp
