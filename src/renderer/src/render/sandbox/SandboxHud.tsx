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
      <CardsDock />
      <GraphDock />
      <TapeStrip />
      <Hint />
    </div>
  )
}
