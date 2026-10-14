// The Sandbox HUD: one layer over the canvas with a slot for each piece the later parts put on the drawing (SB2). The
// layer lets the pointer through (pointer-events-none), so a drag on empty canvas still reaches the drag handler;
// each slot takes the pointer back on its own controls only.
//   HudTop: top left (the clock and Home)       CardsDock: top right
//   Rail:   left edge, under HudTop             GraphDock: under CardsDock
//   TapeStrip: along the bottom, above the hint Hint: bottom centre

import { CardsDock } from './CardsDock'
import { GraphDock } from './GraphDock'
import { Hint } from './Hint'
import { HudTop } from './HudTop'
import { Rail } from './Rail'
import { TapeStrip } from './TapeStrip'

export function SandboxHud() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <HudTop />
      <Rail />
      {/* Top right, one column: the formula cards above the graph (SB19's lead), so neither covers the other. The
          column stops above the tape strip, and the cards scroll inside it when they are long. */}
      <div className="absolute right-3 top-3 bottom-[260px] flex flex-col items-end gap-2">
        <CardsDock />
        <GraphDock />
      </div>
      <TapeStrip />
      <Hint />
    </div>
  )
}
