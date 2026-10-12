// The Sandbox HUD's bottom-centre slot: the hint (moved word for word from render/Viewport.tsx, SB2). Like every
// .tool-hint it lets the pointer through (styles.css), so a drag over it still reaches the drawing.

export function Hint() {
  return (
    <div className="tool-hint">
      <span>Drag an object to place it. Press Play, then drag to push or lift it and let go to throw. Right-drag turns the view, scroll zooms.</span>
    </div>
  )
}
