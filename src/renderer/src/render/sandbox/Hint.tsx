// The Sandbox HUD's bottom-centre slot: the hint (moved word for word from render/Viewport.tsx, SB2). Like every
// .tool-hint it lets the pointer through (styles.css), so a drag over it still reaches the drawing. In the simple view
// (SB63) it is one short sentence chosen by the state (sim/simpleHint.ts); in All tools it is today's.

import { useScene } from '../../core/store'
import { useSandbox } from '../../sim/store'
import { useSandboxView } from '../../sim/sandboxView'
import { simpleHint } from '../../sim/simpleHint'

export function Hint() {
  const view = useSandboxView((s) => s.view)
  const playing = useScene((s) => s.playing)
  const presetId = useSandbox((s) => s.presetId)
  // A change the student made by hand is in the undo history; the starting scene alone is not.
  const edited = useSandbox((s) => s.past.length > 0)
  // In simple view, subscribe only to coarse engineTime (has it run?), not the exact value.
  const engineTime = useSandbox((s) => (view === 'simple' ? (s.engineTime > 0 ? 1 : 0) : s.engineTime))
  return (
    <div className="tool-hint">
      <span>{view === 'simple' ? simpleHint({ playing, engineTime, presetId, edited }) : 'Drag an object to place it. Press Play, then drag to push or lift it and let go to throw. Right-drag turns the view, scroll zooms.'}</span>
    </div>
  )
}
