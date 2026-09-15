import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, TerminalSquare } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { runCommand } from '../lang/commands'
import { useScene } from '../core/store'
import { useCasStatus } from '../math/cas'

export const CATALOG: { insert: string; desc: string; group: string }[] = [
  { insert: 'A = (3, 4)', desc: 'Point', group: 'Create' },
  { insert: 'A = <3, 4>', desc: 'Vector from components', group: 'Vectors' },
  { insert: 'A = 3i + 4j', desc: 'Vector with unit vectors', group: 'Vectors' },
  { insert: 'F = 10 N ∠ 30°', desc: 'Vector from magnitude and angle', group: 'Vectors' },
  { insert: 'R = A + B', desc: 'Live resultant (head-to-tail)', group: 'Vectors' },
  { insert: 'A · B', desc: 'Dot (scalar) product with steps', group: 'Vectors' },
  { insert: 'A × B', desc: 'Cross (vector) product with steps', group: 'Vectors' },
  { insert: '|A|', desc: 'Magnitude and direction', group: 'Vectors' },
  { insert: 'unit(A)', desc: 'Unit vector', group: 'Vectors' },
  { insert: 'angle(A, B)', desc: 'Angle between two vectors', group: 'Vectors' },
  { insert: 'proj(B, A)', desc: 'Projection of B on A', group: 'Vectors' },
  { insert: 'components(10, 30)', desc: 'Resolve 10 at 30° into components', group: 'Vectors' },
  { insert: 'resultant(5, 5, 120)', desc: 'Resultant of two forces (F1, F2, angle)', group: 'Vectors' },
  { insert: 'equilibrium(A, B)', desc: 'Force needed to balance', group: 'Vectors' },
  { insert: 'torque(<0, 2>, <5, 0>)', desc: 'τ = r × F', group: 'Vectors' },
  { insert: 'work(<10, 0>, <3, 4>)', desc: 'W = F · d', group: 'Vectors' },
  { insert: 'magforce(2, <1, 0, 0>, <0, 0, 1>)', desc: 'F = q(v × B)', group: 'Vectors' },
  { insert: 'Triangle((0,0), (4,0), (0,3))', desc: 'Triangle with live sides and angles', group: 'Geometry' },
  { insert: 'Segment(P, Q)', desc: 'Segment between two points', group: 'Geometry' },
  { insert: 'Line(P, Q)', desc: 'Line through two points', group: 'Geometry' },
  { insert: 'Ray(P, Q)', desc: 'Ray', group: 'Geometry' },
  { insert: 'Circle(P, 3)', desc: 'Circle with centre and radius', group: 'Geometry' },
  { insert: 'Circle(P, Q, S)', desc: 'Circle through three points', group: 'Geometry' },
  { insert: 'Polygon(P, Q, S, T)', desc: 'Polygon', group: 'Geometry' },
  { insert: 'Square(P, Q)', desc: 'Square on a side', group: 'Geometry' },
  { insert: 'RegularPolygon(P, Q, 6)', desc: 'Regular polygon', group: 'Geometry' },
  { insert: 'Midpoint(P, Q)', desc: 'Midpoint', group: 'Geometry' },
  { insert: 'Perpendicular(P, f)', desc: 'Perpendicular line through a point', group: 'Geometry' },
  { insert: 'Parallel(P, f)', desc: 'Parallel line through a point', group: 'Geometry' },
  { insert: 'PerpendicularBisector(P, Q)', desc: 'Perpendicular bisector', group: 'Geometry' },
  { insert: 'AngleBisector(P, Q, S)', desc: 'Angle bisector', group: 'Geometry' },
  { insert: 'Intersect(f, g)', desc: 'Intersection points', group: 'Geometry' },
  { insert: 'Angle(P, Q, S)', desc: 'Angle at Q', group: 'Geometry' },
  { insert: 'Tangent(P, c1)', desc: 'Tangents from a point to a circle', group: 'Geometry' },
  { insert: 'Centroid(poly1)', desc: 'Triangle centres (also Circumcenter, Incenter, Orthocenter)', group: 'Geometry' },
  { insert: 'y = x^2 - 4', desc: 'Graph a function', group: 'Graphing' },
  { insert: 'f(x) = sin(x)', desc: 'Named function', group: 'Graphing' },
  { insert: 'x^2 + y^2 = 9', desc: 'Implicit curve', group: 'Graphing' },
  { insert: 'y > x^2', desc: 'Inequality region', group: 'Graphing' },
  { insert: 'r = 2cos(3θ)', desc: 'Polar curve', group: 'Graphing' },
  { insert: 'curve(cos(t), sin(t), 0, 2π)', desc: 'Parametric curve', group: 'Graphing' },
  { insert: 'z = sin(x)cos(y)', desc: '3D surface', group: 'Graphing' },
  { insert: 'k = 2', desc: 'Slider (use k in any formula)', group: 'Graphing' },
  { insert: 'solve(x^2 - 5x + 6 = 0)', desc: 'Exact solutions', group: 'Algebra' },
  { insert: 'solve(2x + y = 7, x - y = 2)', desc: 'Simultaneous equations', group: 'Algebra' },
  { insert: 'diff(x^3 sin(x))', desc: 'Derivative', group: 'Algebra' },
  { insert: 'integrate(x^2, 0, 3)', desc: 'Definite integral', group: 'Algebra' },
  { insert: 'integrate(x e^x)', desc: 'Indefinite integral', group: 'Algebra' },
  { insert: 'limit(sin(x)/x, 0)', desc: 'Limit', group: 'Algebra' },
  { insert: 'series(e^x, 0, 6)', desc: 'Taylor series', group: 'Algebra' },
  { insert: 'factor(x^3 - 8)', desc: 'Factorise', group: 'Algebra' },
  { insert: 'expand((x + 2)^3)', desc: 'Expand', group: 'Algebra' },
  { insert: 'simplify(sin(x)^2 + cos(x)^2)', desc: 'Simplify', group: 'Algebra' },
  { insert: 'help', desc: 'Show all examples', group: 'App' }
]

export function CommandBar() {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const history = useRef<string[]>([])
  const histIdx = useRef(-1)
  const names = useScene(useShallow((s) => s.order.map((id) => s.objects[id]?.name).filter(Boolean)))
  const casStatus = useCasStatus((s) => s.status)

  useEffect(() => {
    // Search and other panels can prefill the command bar.
    const onFill = (e: Event) => {
      setText((e as CustomEvent<string>).detail)
      setOpen(false)
      setTimeout(() => document.getElementById('command-input')?.focus(), 0)
    }
    window.addEventListener('physlab:command', onFill)
    return () => window.removeEventListener('physlab:command', onFill)
  }, [])

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase()
    if (!q) return CATALOG.slice(0, 14)
    const word = q.split(/[^a-z0-9]+/).pop() ?? q
    return CATALOG.filter((c) => c.insert.toLowerCase().includes(word) || c.desc.toLowerCase().includes(q)).slice(0, 12)
  }, [text])

  const submit = async (value: string) => {
    const v = value.trim()
    if (!v) return
    history.current = [v, ...history.current.filter((h) => h !== v)].slice(0, 100)
    histIdx.current = -1
    setText('')
    setOpen(false)
    await runCommand(v)
  }

  return (
    <div className="cmdbar">
      <TerminalSquare size={16} className="text-zinc-500" />
      <div className="relative flex-1">
        <input
          id="command-input"
          className="cmd-input w-full"
          value={text}
          spellCheck={false}
          placeholder="Type anything:  A = <3, 4>    R = A + B    A × B    Triangle((0,0),(4,0),(0,3))    y = sin(x)    solve(x^2 = 4)    (Enter to run, ↑ for history)"
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (open && text.trim() === '' && suggestions[active]) {
                setText(suggestions[active].insert)
                return
              }
              submit(text)
            } else if (e.key === 'Tab' && open && suggestions[active]) {
              e.preventDefault()
              setText(suggestions[active].insert)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (open && text) setActive((a) => Math.min(a + 1, suggestions.length - 1))
              else if (history.current.length) {
                histIdx.current = Math.max(histIdx.current - 1, -1)
                setText(histIdx.current >= 0 ? history.current[histIdx.current] : '')
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (open && text && active > 0) setActive((a) => a - 1)
              else if (history.current.length) {
                histIdx.current = Math.min(histIdx.current + 1, history.current.length - 1)
                setText(history.current[histIdx.current])
                setOpen(false)
              }
            } else if (e.key === 'Escape') {
              setOpen(false)
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {open && suggestions.length > 0 && (
          <div className="suggest">
            {suggestions.map((s, i) => (
              <button
                key={s.insert}
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setText(s.insert)
                  setActive(i)
                }}
              >
                <code>{s.insert}</code>
                <span className="text-zinc-300">
                  {s.desc} <span className="text-zinc-500">· {s.group}</span>
                </span>
              </button>
            ))}
            {names.length > 0 && <div className="px-3 py-1 text-[11px] text-zinc-500">Objects: {names.join(', ')}</div>}
          </div>
        )}
      </div>
      <button className="btn primary" onClick={() => submit(text)}>
        <CornerDownLeft size={13} /> Run
      </button>
      <span className="badge text-[11px] text-zinc-400" title="Symbolic algebra engine (SymPy, offline)">
        CAS {casStatus === 'ready' ? '● ready' : casStatus === 'loading' ? '◌ loading' : casStatus === 'error' ? '✕ error' : '○ idle'}
      </span>
    </div>
  )
}
