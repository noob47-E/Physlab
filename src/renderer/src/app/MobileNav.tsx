// Part M: Mobile Bottom Navigation Bar (< 768px)
//
// Provides touch-friendly, ergonomic bottom tabs for switching between the primary
// student modes on phones, plus quick toggling between the Viewport canvas and
// the mode's secondary equations/measurements panel.

import { memo } from 'react'
import {
  Calculator,
  LineChart,
  Shapes,
  MoveUpRight,
  Box,
  BookOpen,
  Layers
} from 'lucide-react'
import { enterMode } from './layout'
import { useApp, type ModeId } from './modes'
import { getDockApi } from './panels'

interface MobileTabItem {
  id: ModeId
  label: string
  icon: typeof Calculator
  colorVar: string
}

const MOBILE_TABS: MobileTabItem[] = [
  { id: 'calculator', label: 'Calc', icon: Calculator, colorVar: '--mode-calculator' },
  { id: 'graphing', label: 'Graph', icon: LineChart, colorVar: '--mode-graphing' },
  { id: 'shapes', label: 'Geometry', icon: Shapes, colorVar: '--mode-geometry' },
  { id: 'vectors', label: 'Vectors', icon: MoveUpRight, colorVar: '--mode-vectors' },
  { id: 'sandbox', label: 'Sandbox', icon: Box, colorVar: '--mode-sandbox' },
  { id: 'problems', label: 'Problems', icon: BookOpen, colorVar: '--mode-problems' }
]

const SECONDARY_PANEL_NAMES: Partial<Record<ModeId, { id: string; label: string; canvasLabel: string }>> = {
  graphing: { id: 'expressions', label: 'Equations', canvasLabel: 'Graph' },
  shapes: { id: 'measure', label: 'Measure', canvasLabel: 'Canvas' },
  vectors: { id: 'vectorcalc', label: 'Calc', canvasLabel: 'Drawing' },
  sandbox: { id: 'sandbox', label: 'Presets', canvasLabel: 'Sim' },
  problems: { id: 'practice', label: 'Question', canvasLabel: 'Drawing' }
}

export const MobileNav = memo(function MobileNav() {
  const currentMode = useApp((a) => a.mode)
  const secondary = SECONDARY_PANEL_NAMES[currentMode]

  const toggleSecondary = () => {
    if (!secondary) return
    const api = getDockApi()
    if (!api) return
    const secPanel = api.getPanel(secondary.id)
    const viewPanel = api.getPanel('viewport')

    if (secPanel?.api.isActive) {
      viewPanel?.api.setActive()
    } else {
      secPanel?.api.setActive()
    }
  }

  return (
    <nav
      data-testid="mobile-nav"
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 h-[52px] bg-[var(--bg-1)] border-t border-[var(--line-2)] z-40 flex items-center justify-around px-1 select-none backdrop-blur-md shadow-md"
    >
      {MOBILE_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = currentMode === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            className="flex-1 flex flex-col items-center justify-center py-1 gap-0.5 active:scale-95 transition-transform cursor-pointer"
            onClick={() => enterMode(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            title={tab.label}
          >
            <Icon
              size={18}
              style={{ color: isActive ? `var(${tab.colorVar})` : 'var(--text-dim)' }}
            />
            <span
              className={`text-fine font-medium tracking-tight ${
                isActive ? 'text-[var(--text-strong)]' : 'text-[var(--text-dim)]'
              }`}
              style={{ color: isActive ? `var(${tab.colorVar})` : undefined }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}

      {secondary && (
        <button
          type="button"
          onClick={toggleSecondary}
          className="flex flex-col items-center justify-center px-2 py-1 gap-0.5 border-l border-[var(--line-2)] text-[var(--accent)] active:scale-95 transition-transform"
          title={`Toggle ${secondary.label}`}
          aria-label={`Toggle ${secondary.label}`}
        >
          <Layers size={17} />
          <span className="text-fine font-semibold whitespace-nowrap">
            View
          </span>
        </button>
      )}
    </nav>
  )
})
