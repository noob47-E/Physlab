import { useEffect, useRef, useCallback, useId } from 'react'
import {
  Calculator,
  LineChart,
  Shapes,
  MoveUpRight,
  Boxes,
  GraduationCap,
  Table
} from 'lucide-react'
import { useModeWheel, wheelKeyDown } from './modeWheelStore'
import { useApp, type ModeId } from './modes'
import {
  WHEEL_MODES,
  getSegmentAngles,
  describeAnnularSector,
  polarToCartesian,
  segmentAt
} from './modeWheelData'

const ICONS: Record<ModeId, React.ComponentType<{ size?: number; className?: string }>> = {
  calculator: Calculator,
  graphing: LineChart,
  shapes: Shapes,
  vectors: MoveUpRight,
  sandbox: Boxes,
  problems: GraduationCap,
  lab: Table,
  gpu: Boxes,
  proofs: Boxes,
  mechanics: Boxes,
  instruments: Boxes,
  electricity: Boxes,
  optics: Boxes,
  waves: Boxes,
  heat: Boxes,
  nuclear: Boxes
}

const WHEEL_SIZE = 520
const HALF_SIZE = WHEEL_SIZE / 2
const OUTER_R = 230
const INNER_R = 120
const ICON_TEXT_R = 175

export function ModeWheel() {
  const open = useModeWheel((s) => s.open)
  const highlightedIndex = useModeWheel((s) => s.highlightedIndex)
  const setHighlightedIndex = useModeWheel((s) => s.setHighlightedIndex)
  const selectIndex = useModeWheel((s) => s.selectIndex)
  const close = useModeWheel((s) => s.close)
  const currentMode = useApp((s) => s.mode)

  const containerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Radial angle tracking for mouseover: the segment in the pointer's direction lights up (segmentAt, in drawing units).
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const index = segmentAt(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2), rect.width, WHEEL_SIZE, INNER_R, OUTER_R)
      if (index !== null) setHighlightedIndex(index)
    },
    [setHighlightedIndex]
  )

  // Focus trap inside the open modal
  useEffect(() => {
    if (!open) return
    const prevActive = document.activeElement as HTMLElement | null
    containerRef.current?.focus()
    return () => {
      prevActive?.focus()
    }
  }, [open])

  if (!open) return null

  const activeItem = WHEEL_MODES[highlightedIndex] ?? WHEEL_MODES[0]
  const isCurrentActive = activeItem.id === currentMode

  return (
    <div
      className="mode-wheel-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        backgroundColor: 'var(--scrim)',
        animation: 'mode-wheel-fade-in 150ms ease-out forwards'
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false)
      }}
      ref={containerRef}
      tabIndex={-1}
      onKeyDown={wheelKeyDown}
    >
      <div
        className="mode-wheel-container relative flex items-center justify-center select-none"
        style={{
          width: 'min(520px, 85vmin)',
          height: 'min(520px, 85vmin)',
          maxWidth: '520px',
          maxHeight: '520px',
          animation: 'mode-wheel-pop-in 150ms cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        <svg
          viewBox={`-${HALF_SIZE} -${HALF_SIZE} ${WHEEL_SIZE} ${WHEEL_SIZE}`}
          className="w-full h-full overflow-visible"
          onMouseMove={handleMouseMove}
        >
          <defs>
            <filter id="segment-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Central background hub */}
          <circle
            cx={0}
            cy={0}
            r={INNER_R - 4}
            className="fill-[var(--bg-1)] stroke-[var(--line-2)] stroke-[1.5px]"
          />

          {/* Annular segments */}
          {WHEEL_MODES.map((mode, idx) => {
            const { startAngle, endAngle, midAngle } = getSegmentAngles(idx)
            const pathD = describeAnnularSector(0, 0, INNER_R, OUTER_R, startAngle, endAngle)
            const isHighlighted = idx === highlightedIndex
            const isCurrent = mode.id === currentMode
            const Icon = ICONS[mode.id] ?? Boxes

            const textPos = polarToCartesian(0, 0, ICON_TEXT_R, midAngle)

            return (
              <g
                key={mode.id}
                role="button"
                tabIndex={0}
                aria-label={`${mode.index}: ${mode.label}${isCurrent ? ' (current mode)' : ''}`}
                className="cursor-pointer outline-none focus-visible:outline-none"
                onClick={() => selectIndex(idx)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onFocus={() => setHighlightedIndex(idx)}
                style={{
                  transformOrigin: '0 0',
                  transition: 'transform 180ms cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              >
                {/* Sector Path */}
                <path
                  d={pathD}
                  style={{
                    fill: isHighlighted
                      ? `color-mix(in srgb, ${mode.colorToken} 24%, var(--bg-2))`
                      : 'var(--bg-2)',
                    stroke: isHighlighted ? mode.colorToken : 'var(--line)',
                    strokeWidth: isHighlighted ? 2.5 : 1,
                    filter: isHighlighted ? 'url(#segment-glow)' : 'none',
                    transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                    transformOrigin: '0 0',
                    transition: 'transform 180ms ease-out, fill 150ms ease-out, stroke 150ms ease-out'
                  }}
                  className={isHighlighted ? 'mode-wheel-active-segment' : ''}
                />

                {/* Content group at slice center */}
                <g
                  transform={`translate(${textPos.x}, ${textPos.y})`}
                  className="pointer-events-none"
                  style={{
                    transform: `translate(${textPos.x}px, ${textPos.y}px) ${isHighlighted ? 'scale(1.05)' : 'scale(1)'}`,
                    transition: 'transform 180ms ease-out'
                  }}
                >
                  {/* The key that picks it, in the same place in every segment, just above the icon: placed out towards the
                      rim it ran into the longer names ("6Problem Sets", "Geometry3"). */}
                  <text
                    x={0}
                    y={-30}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="text-fine font-semibold tracking-wider pointer-events-none"
                    fill={isHighlighted ? mode.colorToken : 'var(--text-faint)'}
                  >
                    {mode.index}
                  </text>

                  {/* Icon, in the mode's own colour at rest as well: "a circle of glowing coloured modes" (owner). */}
                  <g transform="translate(-10, -18)" style={{ color: mode.colorToken }}>
                    <Icon size={20} />
                  </g>

                  {/* Mode name */}
                  <text
                    x={0}
                    y={12}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="font-medium text-body tracking-tight pointer-events-none"
                    fill={isHighlighted ? 'var(--text-strong)' : 'var(--text)'}
                  >
                    {mode.label}
                  </text>

                  {/* Current mode indicator dot */}
                  {isCurrent && (
                    <circle
                      cx={0}
                      cy={25}
                      r={3}
                      fill={mode.colorToken}
                    />
                  )}
                </g>
              </g>
            )
          })}
        </svg>

        {/* Center info display */}
        <div
          className="absolute flex flex-col items-center justify-center text-center p-3 pointer-events-none"
          style={{
            width: INNER_R * 2 - 8,
            height: INNER_R * 2 - 8,
            borderRadius: '50%'
          }}
        >
          {isCurrentActive && (
            <div className="flex items-center gap-1 text-fine font-medium text-[var(--accent)] mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              <span>You are here</span>
            </div>
          )}

          <h2
            id={titleId}
            className="text-display font-bold tracking-tight text-[var(--text-strong)] leading-tight"
            style={{ color: activeItem.colorToken }}
          >
            {activeItem.label}
          </h2>

          <p className="text-small text-[var(--text-dim)] mt-1.5 leading-snug line-clamp-3 max-w-[190px]">
            {activeItem.shortDesc}
          </p>

          <span className="text-fine text-[var(--text-faint)] mt-2 font-mono">
            Key {activeItem.index} or Enter
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Floating 44px round button on the left edge for touch screens, which have no Esc key. Accessible name: "Modes (Esc)".
 * Shown only where the pointer is coarse (styles.css .modes-fab): on a laptop it sat on the Examples panel's text, and a mouse
 * has Esc and the mode pill at the top left.
 */
export function ModesFloatingButton() {
  const toggle = useModeWheel((s) => s.toggle)
  const mode = useApp((s) => s.mode)
  const current = WHEEL_MODES.find((m) => m.id === mode) ?? WHEEL_MODES[0]

  return (
    <button
      type="button"
      className="modes-fab fixed left-2 top-1/2 -translate-y-1/2 z-40 items-center justify-center w-11 h-11 rounded-full bg-[var(--bg-2)] border border-[var(--line-2)] text-[var(--text)] shadow-lg hover:bg-[var(--bg-3)] hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] transition-all cursor-pointer"
      onClick={toggle}
      title="Modes (Esc)"
      aria-label="Modes (Esc)"
    >
      <span
        className="w-4 h-4 rounded-full border-2 border-[var(--bg-1)] shadow-sm"
        style={{ backgroundColor: current.colorToken }}
      />
    </button>
  )
}
