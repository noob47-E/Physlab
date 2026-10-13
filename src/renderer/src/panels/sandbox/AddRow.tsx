// The Sandbox panel's AddRow section (moved word for word from panels/Sandbox.tsx, SB2).

import { useEffect, useRef, useState } from 'react'
import { Box, Circle, CircleDot, Cone, Cylinder, ChevronDown, Link2, Minus, Pill, Plus, RectangleHorizontal, Square, Triangle } from 'lucide-react'
import { useSandbox } from '../../sim/store'
import { type ShapeKind } from '../../sim/types'
import { useToolCard } from '../../ui/useToolCard'

// All shapes: 4 main (Ball, Crate, Ramp, Plank), 5 in More menu (Cylinder, Capsule, Cone, Wall, Pulley)
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

const MAIN_SHAPES = ADD.slice(0, 2).concat(ADD.slice(5, 7))
const MORE_SHAPES = ADD.slice(2, 5).concat(ADD.slice(7))

/**
 * One ADD button. Resting on it opens its card (ui/ToolCard.tsx) — a looping picture of the shape
 * and one sentence — the same way a tool on the shelf does; the card replaces the title tooltip.
 */
function AddButton({ shape, label, icon, big = false, onClick }: { shape: ShapeKind; label: string; icon: React.ReactNode; big?: boolean; onClick: () => void }) {
  const card = useToolCard(`add:${shape}`)
  // `big`: the simple panel's row, three buttons sharing the width at a 44 px touch height (min-h-[44px], not h-11: the
  // root font is 13 px, so h-11 is 36 px here).
  return (
    <button className={big ? 'btn min-h-[44px] flex-1 justify-center' : 'btn h-11'} data-add={shape} onClick={onClick} {...card}>
      <Plus size={11} />
      {icon} {label}
    </button>
  )
}

/** The simple panel's three (SB63): a ball, a box (the crate, by the plainer word a first-timer knows) and a ramp. */
export const SIMPLE_SHAPES: { shape: ShapeKind; label: string }[] = [
  { shape: 'sphere', label: 'Ball' },
  { shape: 'box', label: 'Box' },
  { shape: 'ramp', label: 'Ramp' }
]

/** The simple panel's ADD row: the three shapes in one row, each with its card; everything else is in All tools. */
export function SimpleAddRow() {
  const add = useSandbox((s) => s.addBody)
  return (
    <div className="flex gap-1.5 px-2 pb-2">
      {SIMPLE_SHAPES.map((a) => (
        <AddButton key={a.shape} shape={a.shape} label={a.label} icon={ADD.find((d) => d.shape === a.shape)?.icon} big onClick={() => add(a.shape)} />
      ))}
    </div>
  )
}

/** Menu item with tool card. */
function MoreMenuItem({ shape, label, icon, onClick }: { shape: ShapeKind; label: string; icon: React.ReactNode; onClick: () => void }) {
  const card = useToolCard(`add:${shape}`)
  return (
    <button
      role="menuitem"
      className="btn h-11"
      onClick={onClick}
      {...card}
    >
      <Plus size={11} />
      {icon} {label}
    </button>
  )
}

/** More menu with additional shapes. */
function MoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const add = useSandbox((s) => s.addBody)
  const menuRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev + 1) % MORE_SHAPES.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex((prev) => (prev - 1 + MORE_SHAPES.length) % MORE_SHAPES.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const shape = MORE_SHAPES[focusedIndex]
        add(shape.shape)
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, focusedIndex, add, onClose])

  if (!open) return null

  return (
    <div className="menu" role="menu" ref={menuRef}>
      {MORE_SHAPES.map((shape) => (
        <MoreMenuItem
          key={shape.shape}
          shape={shape.shape}
          label={shape.label}
          icon={shape.icon}
          onClick={() => {
            add(shape.shape)
            onClose()
          }}
        />
      ))}
    </div>
  )
}

/** The ADD row: four main shapes, More menu, and Connect two objects. */
export function AddRow() {
  const bodies = useSandbox((s) => s.bodies)
  const add = useSandbox((s) => s.addBody)
  const joinMode = useSandbox((s) => s.joinMode)
  const startJoin = useSandbox((s) => s.startJoin)
  const hasFloor = bodies.some((b) => b.shape === 'ground')
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!moreOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (moreButtonRef.current?.contains(e.target as Node)) return
      if (moreMenuRef.current?.contains(e.target as Node)) return
      setMoreOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [moreOpen])

  return (
    <div className="flex flex-wrap gap-1.5 px-2 pb-2">
      {MAIN_SHAPES.map((a) => (
        <AddButton key={a.shape} shape={a.shape} label={a.label} icon={a.icon} onClick={() => add(a.shape)} />
      ))}

      <div className="relative">
        <button
          ref={moreButtonRef}
          className="btn h-11"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(!moreOpen)}
        >
          <Plus size={11} />
          More <ChevronDown size={13} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
        </button>
        {moreOpen && (
          <div ref={moreMenuRef} className="absolute top-full left-0 mt-1 z-50">
            <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
          </div>
        )}
      </div>

      {/* Deleting the floor used to be final. */}
      {!hasFloor && (
        <button className="btn h-11" onClick={() => add('ground')} title="Put a floor back">
          <Plus size={11} />
          <Square size={13} /> Floor
        </button>
      )}
      {/* The guided way to a rope, a spring or a pulley. Joining used to need a selection, a
          Shift+click and a fold nobody had opened: "there are no ropes" was the report. */}
      <button className="btn h-11" data-tour="connect" onClick={startJoin} disabled={!!joinMode} title="Click one object, then another, then pick a string, rod, spring, rope, pulley, hinge or weld">
        <Link2 size={13} /> Connect two objects
      </button>
    </div>
  )
}
