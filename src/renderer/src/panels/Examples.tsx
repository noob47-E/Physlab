import { useState } from 'react'
import { Play } from 'lucide-react'
import { runCommand } from '../lang/commands'
import { scene } from '../core/store'
import { useParticleLab } from '../render/GpuParticles'
import { fitCamera, resetCamera } from '../render/viewState'
import { enterMode } from '../app/TopBar'

export interface Example {
  title: string
  topic: string
  what: string
  tryThis: string
  commands: string[]
  after?: () => void
}

const byName = (n: string) => scene().ev.names.get(n)

export const EXAMPLES: Example[] = [
  {
    title: 'Rectangular components',
    topic: 'Ch 2 · Fig 2.1 · Eq 2.2–2.5',
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
    topic: 'Ch 2 · Addition of vectors',
    what: 'R = A + B + C. The grey copies place each vector at the head of the previous one.',
    tryThis: 'Drag any head. The resultant R always goes from the start of A to the end of the chain.',
    commands: ['A = <3, 1>', 'B = <1, 3>', 'C = <-2, 1>', 'R = A + B + C']
  },
  {
    title: 'Two equal forces (Example 2.1)',
    topic: 'Ch 2 · Example 2.1',
    what: 'Two 5 N forces with angle k between them. When is the resultant also 5 N?',
    tryThis: 'Drag the slider k. At k = 120° the resultant R has the same size as each force.',
    commands: ['k = 120', 'F1 = <5, 0>', 'F2 = 5 ∠ k°', 'R = F1 + F2', 'resultant(5, 5, 120)']
  },
  {
    title: 'Dot product & projection',
    topic: 'Ch 2 · Eq 2.6–2.8',
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
    topic: 'Ch 2 · Eq 2.9–2.10 · right-hand rule',
    what: 'C = A × B is perpendicular to both. Its length equals the area of the parallelogram.',
    tryThis: 'Drag slider k (angle between A and B). Past 180°, C flips downward. Orbit the 3D view with the left mouse button.',
    commands: ['3d', 'k = 60', 'A = <3, 0, 0>', 'B = 3 ∠ k°', 'C = A × B', 'Polygon((0,0,0), A, A + B, B)', 'A × B']
  },
  {
    title: 'Equilibrium of forces',
    topic: 'Ch 2 · Net force = 0',
    what: 'The equilibrant E cancels F1 and F2, so F1 + F2 + E = 0.',
    tryThis: 'Drag F1 or F2. E updates so the three forces always balance.',
    commands: ['F1 = <4, 0>', 'F2 = <-1, 3>', 'E = -(F1 + F2)', 'equilibrium(F1, F2)']
  },
  {
    title: 'Torque τ = r × F',
    topic: 'Ch 2 · Examples of vector product',
    what: 'A force F at position r produces a turning effect τ along the rotation axis.',
    tryThis: 'Change F in Properties. A force parallel to r gives zero torque.',
    commands: ['3d', 'r = <2, 0, 0>', 'F = <0, 3, 0>', 'T = r × F', 'torque(<2, 0, 0>, <0, 3, 0>)']
  },
  {
    title: 'Rotating vector (animation)',
    topic: 'Time & vectors',
    what: 'A turns with time t. R = A + B changes size as A rotates.',
    tryThis: 'Press Play in the Timeline. Add |R| in the Graphs tab to see how it varies.',
    commands: ['A = 3 ∠ (45t)°', 'B = <4, 0>', 'R = A + B', 'play']
  },
  {
    title: 'Area of a composite shape',
    topic: 'Shapes · decomposition',
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
    topic: 'Shapes · recognition',
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
    topic: 'Geometry',
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
    topic: 'Ch 2 · Projectile motion (preview)',
    what: 'y = x tan θ − g x² / (2 v² cos² θ). Sliders v (speed) and a (angle in degrees).',
    tryThis: 'Drag the sliders. The marked root is the range; the top point is the maximum height.',
    commands: ['v = 15', 'a = 45', 'y = x*tan(a*pi/180) - 9.8*x^2/(2*v^2*cos(a*pi/180)^2)']
  },
  {
    title: 'Charged particles in a magnetic field',
    topic: 'Ch 10 preview · F = q(v × B) · GPU',
    what: '500,000 charged particles simulated on your graphics card. B along z makes them spiral.',
    tryThis: 'Change B and E in the GPU Lab tab. Try 1M or 2M particles.',
    commands: ['3d'],
    after: () => useParticleLab.setState({ enabled: true, count: 500_000 })
  }
]

/** Replace the scene with an example lesson. */
export async function runExample(ex: Example): Promise<void> {
  const s = scene()
  if (s.dirty && s.order.length && !confirm('Replace the current scene with this example?')) return
  useParticleLab.setState({ enabled: false })
  s.newScene()
  s.setViewMode('2d')
  resetCamera()
  for (const c of ex.commands) await runCommand(c)
  ex.after?.()
  fitCamera()
}

export function Examples() {
  const [running, setRunning] = useState<string | null>(null)

  const run = async (ex: Example) => {
    setRunning(ex.title)
    try {
      await runExample(ex)
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="panel pb-6">
      <div className="px-3 pb-1 pt-3 text-zinc-300">Ready-made lessons. Click one, then play with it.</div>
      {EXAMPLES.map((ex) => (
        <div key={ex.title} className="card p-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">{ex.title}</div>
              <div className="text-[11px] text-sky-300">{ex.topic}</div>
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
  )
}
