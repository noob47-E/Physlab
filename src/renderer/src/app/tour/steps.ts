// What the tour points at, and the little tasks that tick themselves off.

import { scene } from '../../core/store'
import { useCalc } from '../../calc/calcStore'
import type { ModeId } from '../modes'
import type { JobId } from '../../math/pure/run'

/**
 * The worked example behind the Welcome screen's "Show your working" tile: a factorisation,
 * because that is the homework question most students meet first and the working is short
 * enough to read in one go. tests/layout.test.ts checks it really produces steps.
 */
export const WELCOME_JOB: JobId = 'factor'

/**
 * What the tile promises, in the notation a student writes. It has to match the job's own
 * example, which is what the tile actually runs: tests/layout.test.ts holds the two together,
 * so a changed example in math/pure/run.ts cannot leave the tile promising one problem and
 * showing another.
 */
export const WELCOME_PROMISE = 'Factorise 6x² + 7x − 3'

export interface TourStep {
  /** Element to spotlight (a data-tour name). Missing element: the card is centred. */
  anchor?: string
  title: string
  body: string
  /** Switch to this mode before showing the step. */
  mode?: ModeId
}

export const TOUR: TourStep[] = [
  {
    title: 'Welcome to PhysLab',
    body: 'A two-minute look around. You can stop at any time and start it again from the Help menu.'
  },
  {
    anchor: 'modes',
    title: 'Modes',
    body: 'Like the modes on a calculator. Calculator, Vectors, Geometry, Graphing — each one brings its own tools and panels.'
  },
  {
    anchor: 'tools',
    title: 'Tools',
    body: 'The tools for the mode you are in. Each one shows a hint at the bottom of the drawing while you use it. Press Esc to stop, right-click or Enter to finish a shape.',
    mode: 'shapes'
  },
  {
    anchor: 'viewport',
    title: 'The drawing',
    body: 'Drag empty space to move, scroll to zoom, and drag points or vector heads to change them. Everything is measured live.'
  },
  {
    anchor: 'labels',
    title: 'Labels',
    body: 'Labels appear when you point at something and hide again when the cursor leaves. Switch to Always if you want them on all the time, or pin one object from the right-click menu.'
  },
  {
    anchor: 'measure',
    title: 'Measure panel',
    body: 'Every value lives here: lengths, angles, areas with their formulas, and the steps behind an answer. Point at a row to light up that object on the drawing.'
  },
  {
    anchor: 'command',
    title: 'Type what you want',
    body: 'A = <3, 4>, R = A + B, Triangle((0,0),(4,0),(0,3)), y = sin(x), solve(x^2 = 4). Type "help" to see more.'
  },
  {
    anchor: 'search',
    title: 'Find anything',
    body: 'Ctrl+K searches modes, tools, lessons, settings and commands. If you cannot remember where something is, look there.'
  },
  {
    title: 'That is the tour',
    body: 'Open a ready-made lesson in the Examples panel, or try the small tasks in Help ▸ Practice tasks.'
  }
]

export interface Mission {
  id: string
  label: string
  hint: string
  mode: ModeId
  done: () => boolean
}

const objectsOf = (type: string) => Object.values(scene().objects).filter((o) => o.type === type)

export const MISSIONS: Mission[] = [
  {
    id: 'vector',
    label: 'Draw a vector',
    hint: 'Pick the Vector tool and drag in the drawing, or type A = <3, 4>.',
    mode: 'vectors',
    done: () => objectsOf('vector').length > 0
  },
  {
    id: 'drag',
    label: 'Drag its head and watch the numbers change',
    hint: 'Point at the arrow head with the Move tool and drag it.',
    mode: 'vectors',
    done: () => objectsOf('vector').some((o) => o.type === 'vector' && o.def.kind === 'free' && (o.def.comp[0] !== 3 || o.def.comp[1] !== 4))
  },
  {
    id: 'sum',
    label: 'Add two vectors',
    hint: 'Draw a second vector, then type R = A + B, or press Add all in the Vector Calculator.',
    mode: 'vectors',
    done: () => objectsOf('vector').length >= 3
  },
  {
    id: 'shape',
    label: 'Sketch a shape',
    hint: 'Pick the Sketch tool (K) and draw a rough rectangle or triangle.',
    mode: 'shapes',
    done: () => objectsOf('polygon').length > 0 || objectsOf('circle').length > 0
  },
  {
    id: 'area',
    label: 'Read its area formula',
    hint: 'Select the shape and look at the Measure panel; point at the formula to shade the region.',
    mode: 'shapes',
    done: () => scene().selection.some((id) => scene().objects[id]?.type === 'polygon' || scene().objects[id]?.type === 'circle')
  },
  {
    id: 'decompose',
    label: 'Split a shape into simple parts',
    hint: 'Press Decompose in the Measure panel for a shape that is not already a rectangle or triangle.',
    mode: 'shapes',
    done: () => objectsOf('polygon').some((o) => o.type === 'polygon' && o.decomposed)
  },
  {
    id: 'calc',
    label: 'Work something out in the calculator',
    hint: 'Try sin 30 + ½, or an integral with the ∫ key.',
    mode: 'calculator',
    done: () => useCalc.getState().history.length > 0
  },
  {
    id: 'graph',
    label: 'Draw a graph',
    hint: 'Type y = x^2 - 4 in the command bar.',
    mode: 'graphing',
    done: () => objectsOf('graph').length > 0
  }
]

export const SHORTCUTS: [string, string][] = [
  ['Ctrl+K', 'Search everything'],
  ['Enter or /', 'Jump to the command bar'],
  ['Right-click', 'Menu for the object you clicked (finishes a shape while drawing)'],
  ['Enter, double-click', 'Finish the shape you are drawing'],
  ['Backspace', 'Remove the last point while drawing'],
  ['Esc', 'Cancel the drawing, then back to the Move tool'],
  ['Alt (hold)', 'Draw without snapping'],
  ['Shift (hold)', 'Snap the direction to 15° steps'],
  ['3', '2D / 3D view'],
  ['Tab', 'Move between the buttons and fields'],
  ['Home', 'Reset the view'],
  ['Space', 'Play or pause the timeline'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Del', 'Delete what is selected'],
  ['Ctrl+S / Ctrl+O', 'Save / open a project'],
  ['Ctrl+= / Ctrl+− / Ctrl+0', 'Bigger text, smaller text, normal size'],
  ['V P W S L C T G A D X K', 'Tools: move, point, vector, segment, line, circle, triangle, polygon, angle, measure, delete, sketch']
]
