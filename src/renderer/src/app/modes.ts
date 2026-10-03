// Calculator-style modes: every feature lives in a mode (no grade levels).

import { create } from 'zustand'
import type { ToolId } from '../core/types'

/**
 * A mode's id is stored: in a saved layout (`mode`) and, through `spaceOf`, in every object of a
 * saved file (`space`). So an id is never renamed to follow its label. 'shapes' is the mode every
 * student and every document calls Geometry (its `label`); renaming the id would need a file
 * format step and a layout migration and would change nothing anyone reads (Fix 16).
 */
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
  | 'author'
  | 'results'

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
    description: 'One Maths screen: type in natural textbook maths, get the answer, then the working step by step — factorising, division, partial fractions, HCF/LCM and complex numbers.',
    ready: true,
    tools: ['select', '|', 'point', 'distance', '|', 'delete'],
    // One screen holds the field, the answer and the working, so it is the mode's panel and its
    // centre at once: the keypad used to live in a side panel and the working in the middle,
    // and every "Work it out" was a jump between the two.
    panel: 'maths',
    centre: 'maths'
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
    // Stored id 'shapes', shown name Geometry: see ModeId.
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
  },
  {
    id: 'author',
    label: 'Question Author',
    description: 'Write a question with random numbers, a picture or an experiment, and the worked steps; save it as a set for your class.',
    ready: true,
    tools: ['select'],
    panel: 'author',
    view: '2d'
  },
  {
    id: 'results',
    label: 'Class Results',
    description: 'Open the result files your class saved from Problem Sets and see each question part’s facility, correlation and discrimination, worked out on this computer.',
    ready: true,
    tools: ['select'],
    panel: 'classresults',
    view: '2d'
  }
]

/**
 * Modes this build keeps out of reach. Question Author and Class Results are not ready for students
 * or for the science exhibition (owner, 2026-10-01), so no tab, More modes row, search row, View-menu
 * panel, saved layout, results card or opened file leads to them. Nothing is deleted: their code,
 * tests and file formats stay. To bring both back, empty this set: `new Set<ModeId>()`.
 */
export const HIDDEN_MODES: ReadonlySet<ModeId> = new Set<ModeId>(['author', 'results'])

// Each helper below takes the set as its last parameter, defaulting to HIDDEN_MODES, so a test can
// pass an empty one and see the modes come back: the default is the switch, nothing else is.

export const isModeHidden = (id: ModeId, hidden: ReadonlySet<ModeId> = HIDDEN_MODES): boolean => hidden.has(id)

/** Never throws: a file from a newer version may name a mode this build does not have. */
export const modeById = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0]

/** The modes a student can open in this build; the rest are announced (comingSoonModes), not clickable, or kept out of reach. */
export const readyModes = (hidden: ReadonlySet<ModeId> = HIDDEN_MODES): ModeDef[] => MODES.filter((m) => m.ready && !hidden.has(m.id))

/** The modes announced as "(coming soon)". A hidden mode is not announced either: it is not coming. */
export const comingSoonModes = (hidden: ReadonlySet<ModeId> = HIDDEN_MODES): ModeDef[] => MODES.filter((m) => !m.ready && !hidden.has(m.id))

/** The panels of the hidden modes — the panel each opens and the centre panel it shows — which nothing may open. */
export const hiddenPanels = (hidden: ReadonlySet<ModeId> = HIDDEN_MODES): string[] => [
  ...new Set(MODES.filter((m) => hidden.has(m.id)).flatMap((m) => [m.panel, m.centre]).filter((p): p is string => !!p))
]

/**
 * The mode a saved session may open in. A hidden mode opens Problem Sets, the visible mode nearest
 * to both: it plays the sets Question Author writes and makes the results Class Results reads.
 */
export const openableMode = (id: ModeId, hidden: ReadonlySet<ModeId> = HIDDEN_MODES): ModeId => (hidden.has(id) ? 'problems' : id)

/** A result file is only worth saving while the mode that reads it is in the build. */
export const resultFilesOffered = (hidden: ReadonlySet<ModeId> = HIDDEN_MODES): boolean => !hidden.has('results')

/**
 * Whether the mode shows the maths drawing, whose 2D/3D switch, grid and snapping apply. The
 * Sandbox and the GPU Lab are 3D worlds of their own: the viewport hides those switches there, and
 * the keyboard and the View menu must agree, or a brushed 3 key dropped the particles into a flat
 * 2D view with no button on screen to bring 3D back.
 */
export const isDrawingMode = (id: ModeId): boolean => id !== 'sandbox' && id !== 'gpu'

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
