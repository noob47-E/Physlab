import { useState } from 'react'
import { Play } from 'lucide-react'
import { runCommand } from '../lang/commands'
import { scene } from '../core/store'
import { useParticleLab } from '../render/GpuParticles'
import { fitCamera, resetCamera } from '../render/viewState'
import { enterMode } from '../app/TopBar'
import { useLab } from '../lab/labStore'
import type { LabTable } from '../lab/types'

/** Level tags replace grade levels: the same topic turns up in many classes. */
export type Level = 'Basic' | 'Intermediate' | 'Advanced'

export type Area = 'Vectors' | 'Shapes & geometry' | 'Graphs & functions' | 'Motion' | 'Electricity & magnetism'

export interface Example {
  title: string
  /** What it teaches, in plain words (no book or chapter numbers). */
  topic: string
  area: Area
  level: Level
  what: string
  tryThis: string
  commands: string[]
  after?: () => void
}

const byName = (n: string) => scene().ev.names.get(n)

export const EXAMPLES: Example[] = [
  {
    title: 'Rectangular components',
    topic: 'Components of a vector',
    area: 'Vectors',
    level: 'Basic',
    what: 'A vector A at angle θ splits into Ax = A cos θ along x and Ay = A sin θ along y.',
    tryThis: 'Drag the head of A. Watch Ax, Ay, |A| and θ change in the Measure panel.',
    commands: ['A = 10 ∠ 30°', 'components(A)'],
    after: () => {
      const id = byName('A')
      if (id) {
        scene().updateObject(id, (d) => {
          if (d.type === 'vector') d.showComponents = true
        })
        scene().select([id])
      }
    }
  },
  {
    title: 'Head-to-tail addition',
    topic: 'Adding vectors: head-to-tail',
    area: 'Vectors',
    level: 'Basic',
    what: 'R = A + B + C. The grey copies place each vector at the head of the previous one.',
    tryThis: 'Drag any head. The resultant R always goes from the start of A to the end of the chain.',
    commands: ['A = <3, 1>', 'B = <1, 3>', 'C = <-2, 1>', 'R = A + B + C']
  },
  {
    title: 'Two equal forces at an angle',
    topic: 'Resultant of two forces',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'Two 5 N forces with angle k between them. When is the resultant also 5 N?',
    tryThis: 'Drag the slider k. At k = 120° the resultant R has the same size as each force.',
    commands: ['k = 120', 'F1 = <5, 0>', 'F2 = 5 ∠ k°', 'R = F1 + F2', 'resultant(5, 5, 120)']
  },
  {
    title: 'Dot product & projection',
    topic: 'Scalar (dot) product and projection',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'A·B = AB cos θ = A × (projection of B on A). P is the projection (shadow) of B on A.',
    tryThis: 'Drag B around. When B is perpendicular to A, the dot product becomes 0 and P disappears.',
    commands: ['A = <5, 1>', 'B = <2, 3>', 'P = proj(B, A)', 'A · B'],
    after: () => {
      const a = byName('A')
      const b = byName('B')
      if (a && b) scene().select([a, b])
    }
  },
  {
    title: 'Cross product in 3D',
    topic: 'Vector (cross) product and the right-hand rule',
    area: 'Vectors',
    level: 'Advanced',
    what: 'C = A × B is perpendicular to both. Its length equals the area of the parallelogram.',
    tryThis: 'Drag slider k (angle between A and B). Past 180°, C flips downward. Orbit the 3D view with the left mouse button.',
    commands: ['3d', 'k = 60', 'A = <3, 0, 0>', 'B = 3 ∠ k°', 'C = A × B', 'Polygon((0,0,0), A, A + B, B)', 'A × B']
  },
  {
    title: 'Equilibrium of forces',
    topic: 'Equilibrium: forces that balance',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'The equilibrant E cancels F1 and F2, so F1 + F2 + E = 0.',
    tryThis: 'Drag F1 or F2. E updates so the three forces always balance.',
    commands: ['F1 = <4, 0>', 'F2 = <-1, 3>', 'E = -(F1 + F2)', 'equilibrium(F1, F2)']
  },
  {
    title: 'Torque τ = r × F',
    topic: 'Torque as a vector product',
    area: 'Vectors',
    level: 'Advanced',
    what: 'A force F at position r produces a turning effect τ along the rotation axis.',
    tryThis: 'Change F in Properties. A force parallel to r gives zero torque.',
    commands: ['3d', 'r = <2, 0, 0>', 'F = <0, 3, 0>', 'T = r × F', 'torque(<2, 0, 0>, <0, 3, 0>)']
  },
  {
    title: 'Rotating vector (animation)',
    topic: 'Vectors that change with time',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'A turns with time t. R = A + B changes size as A rotates.',
    tryThis: 'Press Play in the Timeline. Add |R| in the Graphs tab to see how it varies.',
    commands: ['A = 3 ∠ (45t)°', 'B = <4, 0>', 'R = A + B', 'play']
  },
  {
    title: 'Parallelogram law',
    topic: 'Adding vectors: parallelogram method',
    area: 'Vectors',
    level: 'Basic',
    what: 'Two vectors from the same point make a parallelogram; its diagonal is the resultant.',
    tryThis: 'Drag A or B. The diagonal always equals A + B, whichever method you use.',
    commands: ['A = <4, 1>', 'B = <1, 3>', 'R = A + B', 'Polygon((0,0), A, A + B, B)']
  },
  {
    title: 'Resultant by the law of cosines',
    topic: 'Adding two vectors without components',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'R\u00b2 = A\u00b2 + B\u00b2 + 2AB cos \u03b8, and the direction comes from the law of sines \u2014 the same answer as the component method.',
    tryThis: 'Try other numbers in the command bar: resultant(6, 4, 70).',
    commands: ['A = 6 \u2220 0\u00b0', 'B = 4 \u2220 70\u00b0', 'R = A + B', 'resultant(6, 4, 70)']
  },
  {
    title: 'Relative velocity: a boat crossing a river',
    topic: 'Relative velocity',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'The boat heads straight across at 4 m/s while the river pushes it sideways at 3 m/s. The real path is the sum.',
    tryThis: 'Change the river speed in Properties and watch the crossing angle change.',
    commands: ['vb = <0, 4>', 'vr = <3, 0>', 'v = vb + vr']
  },
  {
    title: 'Weight on a slope',
    topic: 'Resolving a vector along a slope',
    area: 'Vectors',
    level: 'Intermediate',
    what: 'Weight splits into a part down the slope (mg sin \u03b8) and a part into the slope (mg cos \u03b8).',
    tryThis: 'Drag the slider a (the slope angle) and watch both parts change.',
    commands: ['a = 30', 'W = <0, -10>', 'S = 1 \u2220 (180 + a)\u00b0', 'Wpar = proj(W, S)', 'Wperp = W - Wpar']
  },
  {
    title: 'Direction angles in 3D',
    topic: 'Unit vectors and direction cosines',
    area: 'Vectors',
    level: 'Advanced',
    what: 'A 3D vector makes angles \u03b1, \u03b2 and \u03b3 with the three axes, and cos\u00b2\u03b1 + cos\u00b2\u03b2 + cos\u00b2\u03b3 = 1.',
    tryThis: 'Select A and read \u03b1, \u03b2, \u03b3 in the Measure panel. Orbit the view with the left mouse button.',
    commands: ['3d', 'A = <2, 3, 6>', 'unit(A)'],
    after: () => {
      const id = byName('A')
      if (id) scene().select([id])
    }
  },
  {
    title: 'Circle: area and circumference',
    topic: 'Circle measurements',
    area: 'Shapes & geometry',
    level: 'Basic',
    what: 'Area = \u03c0r\u00b2 and circumference = 2\u03c0r, each shown as the formula, the numbers and the answer.',
    tryThis: 'Drag the centre or change the radius in Properties and watch both update.',
    commands: ['P = (0, 0)', 'Circle(P, 3)'],
    after: () => {
      const c = Object.values(scene().objects).find((o) => o.type === 'circle')
      enterMode('shapes')
      if (c) scene().select([c.id])
    }
  },
  {
    title: 'Area of a composite shape',
    topic: 'Composite shapes and decomposition',
    area: 'Shapes & geometry',
    level: 'Basic',
    what: 'A house shape is a rectangle plus a triangle. PhysLab recognises it and splits it into simple shapes.',
    tryThis: 'In the Measure tab press Decompose, then hover the formulas to shade each part. Drag the roof point up and down.',
    commands: ['Polygon((0,0), (6,0), (6,4), (3,7), (0,4))'],
    after: () => {
      const poly = Object.values(scene().objects).find((o) => o.type === 'polygon')
      enterMode('shapes')
      if (poly) scene().select([poly.id])
    }
  },
  {
    title: 'Sketch a shape',
    topic: 'Shape recognition and area formulas',
    area: 'Shapes & geometry',
    level: 'Basic',
    what: 'Draw a rough square, rectangle, triangle or circle with the mouse. It snaps to a perfect shape and shows its area formula.',
    tryThis: 'The Sketch tool is already selected: draw in the viewport. Hover the area formula in the Measure tab to shade the region.',
    commands: [],
    after: () => {
      enterMode('shapes')
      scene().setTool('sketch')
    }
  },
  {
    title: 'Triangle explorer',
    topic: 'Sides, angles and centres of a triangle',
    area: 'Shapes & geometry',
    level: 'Basic',
    what: 'Every side, angle, height and centre updates live.',
    tryThis: 'Click a side to see all the measurements. Drag a corner and watch the angles always add up to 180°.',
    commands: ['Triangle((0,0), (5,0), (1.5,3.5))'],
    after: () => {
      const seg = Object.values(scene().objects).find((o) => o.type === 'segment')
      if (seg) scene().select([seg.id])
    }
  },
  {
    title: 'Projectile path graph',
    topic: 'Projectile path',
    area: 'Motion',
    level: 'Intermediate',
    what: 'y = x tan θ − g x² / (2 v² cos² θ). Sliders v (speed) and a (angle in degrees).',
    tryThis: 'Drag the sliders. The marked root is the range; the top point is the maximum height.',
    commands: ['v = 15', 'a = 45', 'y = x*tan(a*pi/180) - 9.8*x^2/(2*v^2*cos(a*pi/180)^2)']
  },
  {
    title: 'Charged particles in a magnetic field',
    topic: 'Magnetic force F = q(v × B)',
    area: 'Electricity & magnetism',
    level: 'Advanced',
    what: '500,000 charged particles simulated on your graphics card. B along z makes them spiral.',
    tryThis: 'Change B and E in the GPU Lab tab. Try 1M or 2M particles.',
    commands: ['3d'],
    after: () => useParticleLab.setState({ enabled: true, count: 500_000 })
  },
  {
    title: 'Free fall: find g from d and t',
    topic: 'Reading a constant off the gradient of a graph',
    area: 'Motion',
    level: 'Basic',
    what: 'Five timed drops, measured to ± 2 cm. d = ½gt², so d against t² is a straight line of gradient g/2.',
    tryThis: 'Read the gradient under the graph and double it. Turn the residuals on, or try the curve fit, to see why the straight line is the right choice.',
    commands: [],
    after: () => {
      useLab.getState().setTables([freeFallReadings()])
      enterMode('lab')
    }
  }
]

/** The readings the free-fall example starts with: real-looking, not perfect. */
function freeFallReadings(): LabTable {
  const measured: [number, number][] = [
    [0.2, 0.21],
    [0.4, 0.78],
    [0.6, 1.8],
    [0.8, 3.1],
    [1.0, 4.95]
  ]
  return {
    id: 'exFreeFall',
    title: 'Free fall',
    columns: [
      { id: 'exT', name: 't', unit: 's' },
      { id: 'exTsq', name: 'tsq', unit: 's^2', formula: 't^2' },
      { id: 'exD', name: 'd', unit: 'm' },
      { id: 'exDu', name: 'd_u', unit: 'm', uncertaintyFor: 'exD' }
    ],
    // The t² column works itself out, so its cell is left empty.
    rows: measured.map(([t, d]) => [t, null, d, 0.02]),
    plot: { x: 'exTsq', y: 'exD', fit: 'linear' }
  }
}

/** Replace the scene with an example lesson. */
export async function runExample(ex: Example): Promise<void> {
  const s = scene()
  // Lab readings and a sandbox count as work too; the old test only looked at the drawing.
  if (s.dirty && !confirm('Replace your current work with this example? Unsaved changes will be lost.')) return
  useParticleLab.setState({ enabled: false })
  s.newScene()
  s.setViewMode('2d')
  resetCamera()
  for (const c of ex.commands) await runCommand(c)
  ex.after?.()
  fitCamera()
}

const LEVELS: Level[] = ['Basic', 'Intermediate', 'Advanced']
const AREAS: Area[] = ['Vectors', 'Shapes & geometry', 'Graphs & functions', 'Motion', 'Electricity & magnetism']

export function Examples() {
  const [running, setRunning] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<Level | 'All'>('All')

  const run = async (ex: Example) => {
    setRunning(ex.title)
    try {
      await runExample(ex)
    } finally {
      setRunning(null)
    }
  }

  const q = query.trim().toLowerCase()
  const shown = EXAMPLES.filter(
    (ex) => (level === 'All' || ex.level === level) && (!q || `${ex.title} ${ex.topic} ${ex.what} ${ex.area}`.toLowerCase().includes(q))
  )

  return (
    <div className="panel pb-6">
      <div className="px-3 pb-1 pt-3 text-zinc-300">Ready-made lessons, by topic. Click one, then play with it.</div>
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-1">
        <input
          className="field flex-1"
          placeholder="Search: dot product, area, relative velocity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <div className="seg">
          {(['All', ...LEVELS] as const).map((l) => (
            <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <div className="px-3 py-4 text-zinc-500">Nothing matches that search.</div>}
      {AREAS.filter((a) => shown.some((ex) => ex.area === a)).map((area) => (
        <div key={area}>
          <div className="section-title">{area}</div>
          {shown
            .filter((ex) => ex.area === area)
            .map((ex) => (
              <div key={ex.title} className="card p-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white">{ex.title}</div>
                    <div className="text-[11px] text-sky-300">
                      {ex.topic} <span className="text-zinc-500">· {ex.level}</span>
                    </div>
                  </div>
                  <button className="btn primary h-7" onClick={() => run(ex)} disabled={running !== null}>
                    <Play size={12} /> {running === ex.title ? '…' : 'Open'}
                  </button>
                </div>
                <div className="mt-1.5 text-zinc-300">{ex.what}</div>
                <div className="mt-1 text-zinc-500">
                  <span className="text-amber-300">Try: </span>
                  {ex.tryThis}
                </div>
              </div>
            ))}
        </div>
      ))}
    </div>
  )
}
