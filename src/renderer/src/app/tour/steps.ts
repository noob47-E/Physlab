// What the tour points at, and the little tasks that tick themselves off.

import { scene, useScene } from '../../core/store'
import { useCalc } from '../../calc/calcStore'
import { useSandbox } from '../../sim/store'
import { usePure } from '../../math/pure/store'
import { usePracticeMission } from '../../panels/practiceMission'
import { useActionSignals, type ActionCounts } from '../../core/actionSignals'
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

interface TourStep {
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
    body: 'Hold Space and drag to move the view, scroll to zoom, and drag points or vector heads to change them. Drag a box on empty space to select several things. Everything is measured live.'
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
    anchor: 'connect',
    title: 'Join things together',
    body: 'In the Sandbox, press Connect two objects: click one, click the other, then pick a string, rod, spring, real rope, hinge, weld, or a rope over a pulley. Lengthen a rope in Connections and it sags; shorten it and it lifts.',
    mode: 'sandbox'
  },
  {
    title: 'That is the tour',
    body: 'Open a ready-made lesson in the Examples panel, or try the six missions in Help ▸ Start here.'
  }
]

export interface Mission {
  id: string
  label: string
  hint: string
  mode: ModeId
  anchor: string
  done: () => boolean
}

const objectsOf = (type: string) => Object.values(scene().objects).filter((o) => o.type === type)

/**
 * Where the missions start counting from (the app's start, or Start over). A mission ticks only
 * for something the student DID after it, counted where it happens (core/actionSignals.ts): done()
 * used to read what was on screen, so a graph loaded from a file, the Welcome tile's worked example,
 * a vector retyped by the bar, a preset that zeroed the clock or the Sketch tool's own selection
 * ticked missions nobody did, Start over was undone by the next store change, and a tap on a shape
 * that was already selected changed nothing the screen could show.
 */
interface Baseline {
  /** usePure's run counter: a working counts only from a later run. */
  workingRun: number
  /** The action counts at the start. */
  counts: ActionCounts
  /** The Reset count when the Sandbox was seen playing, in this session; null until it plays. */
  playedAtResets: number | null
}

const countsNow = (): ActionCounts => {
  const { typedGraphs, headDrags, shapeClicks, resets } = useActionSignals.getState()
  return { typedGraphs, headDrags, shapeClicks, resets }
}
/** How many times the student has done `k` since the start. */
const since = (k: keyof ActionCounts): number => useActionSignals.getState()[k] - base.counts[k]

let base: Baseline = { workingRun: 0, counts: { typedGraphs: 0, headDrags: 0, shapeClicks: 0, resets: 0 }, playedAtResets: null }

/** Starts the missions afresh from now (the app's start, Start over). */
export function resetMissionBaseline(): void {
  base = { workingRun: usePure.getState().runSeq, counts: countsNow(), playedAtResets: null }
}

/**
 * Runs the Welcome tile's worked example as PhysLab's, not the student's: it does not tick mission 1.
 * No working counts while `run` runs, because run()'s own set() already calls the mission watcher;
 * moving the starting point only after the run (as before) came after mission 1 was ticked.
 */
export function runAsPhysLab(run: () => void): void {
  base.workingRun = Number.POSITIVE_INFINITY
  try {
    run()
  } finally {
    base.workingRun = usePure.getState().runSeq
  }
}

export const MISSIONS: Mission[] = [
  {
    id: 'calc',
    label: 'Show your working',
    // Work it out picks the kind of question itself (Factorise for this one); the ▾ beside it is for choosing by hand.
    hint: 'Type 6x^2 + 7x - 3 (the ^ key makes the power), then press Work it out. Read each step.',
    mode: 'calculator',
    anchor: 'work-it-out',
    done: () => {
      const p = usePure.getState()
      const w = p.working
      // A refusal is a working too (it says why), and so is the "Working it out…" placeholder of an
      // algebra-engine job: neither is the steps the mission asks for.
      return p.runSeq > base.workingRun && !!w && !w.error && (w.moves.length > 0 || w.answers.length > 0)
    }
  },
  {
    id: 'graph',
    label: 'Draw a graph',
    hint: 'Type y = x^2 - 4 in the bar at the top and press Enter.',
    mode: 'graphing',
    anchor: 'command',
    // A line typed in the command bar that made a graph (app/CommandBar.tsx), not one loaded with a file.
    done: () => since('typedGraphs') > 0 && objectsOf('graph').length > 0
  },
  {
    id: 'vector',
    label: 'Draw a vector and drag it',
    hint: 'Type A = <3, 4> and press Enter. Then drag the tip of the arrow.',
    mode: 'vectors',
    anchor: 'command',
    // A drag of a vector's head with the Move tool (render/Interaction.tsx), not a retyped vector.
    done: () => since('headDrags') > 0
  },
  {
    id: 'geometry',
    label: 'Find the area of a shape',
    hint: 'Pick the Sketch tool and draw a rough rectangle. Press Esc, then click the rectangle to see its area and the formula in the Measure panel.',
    mode: 'shapes',
    anchor: 'tool-sketch',
    // A click or tap on a shape with the Move tool, and the shape selected (so the Measure panel shows
    // its area); the Sketch tool selecting the shape it has just made is not a click.
    done: () => {
      const s = scene()
      return (
        since('shapeClicks') > 0 &&
        s.selection.some((id) => {
          const o = s.objects[id]
          return o?.type === 'polygon' || o?.type === 'circle'
        })
      )
    }
  },
  {
    id: 'sandbox',
    label: 'Run an experiment',
    hint: 'Press Play. Watch the ball fall. Then press Reset.',
    mode: 'sandbox',
    anchor: 'play',
    done: () => {
      const s = useSandbox.getState()
      // Played in this session (kept in memory: a restart begins at 0 with nothing played), then
      // Reset pressed (resetRun counts it; a preset or file load also zeroes the clock but is not Reset).
      if (s.engineTime > 0 && base.playedAtResets === null) base.playedAtResets = useActionSignals.getState().resets
      return base.playedAtResets !== null && useActionSignals.getState().resets > base.playedAtResets && s.engineTime === 0
    }
  },
  {
    id: 'practice',
    label: 'Answer a question',
    hint: 'Press Start practice and answer the first question.',
    mode: 'problems',
    anchor: 'start-practice',
    done: () => usePracticeMission.getState().marked
  }
]

/** Said under mission 5 once it is ticked (TOUR-OPTIONS.md: Lab Data fills itself from the Sandbox). */
export const AFTER_SANDBOX = 'Next: Send to Lab Data puts this run’s readings in a table.'

/**
 * The stores a mission's `done` reads, so the tour re-checks the list whenever one of them
 * changes. A mission that watches a store not listed here only ticks itself off when some
 * other store happens to change — the Sandbox mission sat undone until the next drawing edit.
 */
export const MISSION_STORES: { subscribe: (listener: () => void) => () => void }[] = [
  useScene,
  useCalc,
  useSandbox,
  usePure,
  usePracticeMission,
  useActionSignals
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
  ['Space', 'Play or pause the timeline; hold it and drag to move the view'],
  ['Drag on empty space', 'Select everything inside the box (Shift adds to the selection)'],
  ['Ctrl+A', 'Select everything on this drawing'],
  ['Shift+click (Sandbox)', 'Choose the second object to join to the selected one'],
  ['Esc (Sandbox)', 'Stop connecting two objects'],
  ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
  ['Del', 'Delete what is selected'],
  ['Ctrl+S / Ctrl+O', 'Save / open a project'],
  ['Ctrl+= / Ctrl+− / Ctrl+0', 'Bigger text, smaller text, normal size'],
  ['V P W S L C T G A D X K', 'Tools: move, point, vector, segment, line, circle, triangle, polygon, angle, measure, delete, sketch']
]
