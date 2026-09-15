// Calculator-style modes: every feature lives in a mode (no grade levels).

import { create } from 'zustand'
import type { ToolId } from '../core/types'

export type ModeId =
  | 'calculator'
  | 'vectors'
  | 'shapes'
  | 'graphing'
  | 'gpu'
  | 'proofs'
  | 'mechanics'
  | 'instruments'
  | 'electricity'
  | 'optics'
  | 'waves'
  | 'heat'
  | 'nuclear'
  | 'problems'

export interface ModeDef {
  id: ModeId
  label: string
  description: string
  ready: boolean
  /** Tool shelf for this mode ('|' = separator). */
  tools: (ToolId | '|')[]
  /** Panel to bring forward when the mode opens. */
  panel?: string
  view?: '2d' | '3d'
}

export const MODES: ModeDef[] = [
  {
    id: 'calculator',
    label: 'Calculator',
    description: 'Scientific calculator in natural textbook math, with every fx-991EX mode and more.',
    ready: true,
    tools: ['select', '|', 'point', 'distance', '|', 'delete'],
    panel: 'calculator'
  },
  {
    id: 'vectors',
    label: 'Vectors',
    description: 'Vector calculator, drawing vectors with live measurements, step-by-step solutions.',
    ready: true,
    tools: ['select', '|', 'vector', 'point', '|', 'distance', 'angle', '|', 'segment', 'text', '|', 'delete'],
    panel: 'vectorcalc',
    view: '2d'
  },
  {
    id: 'shapes',
    label: 'Shapes & Geometry',
    description: 'Sketch or click shapes: automatic recognition, area formulas, decomposition, constructions.',
    ready: true,
    tools: ['select', '|', 'sketch', 'segment', 'triangle', 'polygon', 'circle', '|', 'point', 'line', 'ray', 'vector', '|', 'midpoint', 'perpendicular', 'parallel', 'perpBisector', 'angleBisector', 'intersect', '|', 'angle', 'distance', 'text', '|', 'delete'],
    panel: 'measure',
    view: '2d'
  },
  {
    id: 'graphing',
    label: 'Graphing',
    description: 'Graph functions, equations, inequalities, polar and parametric curves, 3D surfaces.',
    ready: true,
    tools: ['select', '|', 'point', 'intersect', 'distance', '|', 'delete'],
    panel: 'console'
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
  { id: 'problems', label: 'Problem Sets', description: 'Random practice problems with checking, hints and worksheets.', ready: false, tools: ['select'] }
]

export const modeById = (id: ModeId) => MODES.find((m) => m.id === id)!

export const useApp = create<{ mode: ModeId; searchOpen: boolean; layoutReady: boolean; setMode: (m: ModeId) => void; setSearchOpen: (o: boolean) => void }>((set) => ({
  mode: 'vectors',
  searchOpen: false,
  /** The dock layout has settled; the 3D canvas waits for this so the GPU renderer starts only once. */
  layoutReady: false,
  setMode: (mode) => set({ mode }),
  setSearchOpen: (searchOpen) => set({ searchOpen })
}))
