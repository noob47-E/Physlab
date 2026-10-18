// The Sandbox HUD: one layer over the canvas with a slot for each piece the later parts put on the drawing (SB2). The
// layer lets the pointer through (pointer-events-none), so a drag on empty canvas still reaches the drag handler;
// each slot takes the pointer back on its own controls only.
//   HudTop: top left (the clock and Home)       CardsDock: top right
//   Rail:   left edge, under HudTop             GraphDock: under CardsDock
//   TapeStrip: along the bottom, above the hint Hint: bottom centre

import { useEffect, useState } from 'react'
import { CardsDock } from './CardsDock'
import { GraphDock } from './GraphDock'
import { Hint } from './Hint'
import { HudTop } from './HudTop'
import { LabPanel } from './LabPanel'
import { Rail } from './Rail'
import { TapeStrip } from './TapeStrip'
import { useTapeBar } from '../../sim/tapeBar'
import { SandboxPhoneControls } from './SandboxPhoneControls'

export function SandboxHud() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  // The column stops above the replay bar (one slim row in both views since S5), or only the pill and the hint.
  const barShown = useTapeBar((s) => s.shown)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (isMobile) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <HudTop />
        <SandboxPhoneControls />
      </div>
    )
  }
  // Both views' replay bars are one slim row since S5 (All tools' extras open upward from More, over the drawing).
  const bottom = !barShown ? 'bottom-[60px]' : 'bottom-[124px]'
  return (
    <div className="pointer-events-none absolute inset-0">
      <HudTop />
      {/* SB51: the Collision Lab's sliders, under the clock, while a lab experiment is loaded. */}
      <LabPanel />
      <Rail />
      {/* Top right, one column: the formula cards above the graph (SB19's lead), so neither covers the other. The
          column stops above the tape strip, and the cards scroll inside it when they are long. */}
      <div className={`absolute right-3 top-3 ${bottom} flex flex-col items-end gap-2`}>
        <CardsDock />
        <GraphDock />
      </div>
      <TapeStrip />
      <Hint />
    </div>
  )
}
