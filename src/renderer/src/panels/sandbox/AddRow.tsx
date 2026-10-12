// The Sandbox panel’s AddRow section (moved word for word from panels/Sandbox.tsx, SB2).

import { Box, Circle, CircleDot, Cone, Cylinder, Link2, Minus, Pill, Plus, RectangleHorizontal, Square, Triangle } from 'lucide-react'
import { useSandbox } from '../../sim/store'
import { type ShapeKind } from '../../sim/types'
import { useToolCard } from '../../ui/useToolCard'

// Crate, plank and wall all used the same square icon, so the row read as three identical
// buttons. Every shape the engine can build is offered — capsule and cone were only ever missing
// from this list, not from the physics.
const ADD: { shape: ShapeKind; label: string; icon: React.ReactNode }[] = [
  { shape: 'sphere', label: 'Ball', icon: <Circle size={13} /> },
  { shape: 'box', label: 'Crate', icon: <Box size={13} /> },
  { shape: 'cylinder', label: 'Cylinder', icon: <Cylinder size={13} /> },
  { shape: 'capsule', label: 'Capsule', icon: <Pill size={13} /> },
  { shape: 'cone', label: 'Cone', icon: <Cone size={13} /> },
  { shape: 'ramp', label: 'Ramp', icon: <Triangle size={13} /> },
  { shape: 'plank', label: 'Plank', icon: <Minus size={13} /> },
  { shape: 'wall', label: 'Wall', icon: <RectangleHorizontal size={13} className="rotate-90" /> },
  { shape: 'pulley', label: 'Pulley', icon: <CircleDot size={13} /> }
]

/**
 * One ADD button. Resting on it opens its card (ui/ToolCard.tsx) — a looping picture of the shape
 * and one sentence — the same way a tool on the shelf does; the card replaces the title tooltip.
 */
function AddButton({ shape, label, icon, onClick }: { shape: ShapeKind; label: string; icon: React.ReactNode; onClick: () => void }) {
  const card = useToolCard(`add:${shape}`)
  return (
    <button className="btn h-7" onClick={onClick} {...card}>
      <Plus size={11} />
      {icon} {label}
    </button>
  )
}

/** The ADD row: one button per shape, the Floor button when the floor is gone, and Connect two objects. */
export function AddRow() {
  const bodies = useSandbox((s) => s.bodies)
  const add = useSandbox((s) => s.addBody)
  const joinMode = useSandbox((s) => s.joinMode)
  const startJoin = useSandbox((s) => s.startJoin)
  const hasFloor = bodies.some((b) => b.shape === 'ground')
  return (
    <div className="flex flex-wrap gap-1.5 px-2 pb-2">
      {ADD.map((a) => (
        <AddButton key={a.shape} shape={a.shape} label={a.label} icon={a.icon} onClick={() => add(a.shape)} />
      ))}
      {/* Deleting the floor used to be final. */}
      {!hasFloor && (
        <button className="btn h-7" onClick={() => add('ground')} title="Put a floor back">
          <Plus size={11} />
          <Square size={13} /> Floor
        </button>
      )}
      {/* The guided way to a rope, a spring or a pulley. Joining used to need a selection, a
          Shift+click and a fold nobody had opened: "there are no ropes" was the report. */}
      {!joinMode && (
        <button className="btn h-7" data-tour="connect" onClick={startJoin} title="Click one object, then another, then pick a string, rod, spring, rope, pulley, hinge or weld">
          <Link2 size={13} /> Connect two objects
        </button>
      )}
    </div>
  )
}
