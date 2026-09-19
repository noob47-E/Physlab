// Which element a keypress landed on, and therefore who owns the key.
//
// This lives on its own, with no imports, for two reasons: every global keyboard listener in the
// app needs the same answer, and a test can load it without dragging in three.js or React.
//
// Getting this wrong is how keys go missing. A maths field is a `<math-field>` custom element, not
// an `<input>`, so a guard that only checks INPUT/TEXTAREA silently lets a global shortcut eat the
// student's Backspace.

/** The parts of an element these checks look at. Loose, so a test can pass a plain object. */
export interface KeyTarget {
  tagName?: string
  isContentEditable?: boolean
  getAttribute?: (name: string) => string | null
  hasAttribute?: (name: string) => boolean
}

const tag = (t: KeyTarget | null | undefined): string => (t?.tagName ?? '').toUpperCase()

/**
 * True when the key belongs to whatever the person is typing in, so no global shortcut may act.
 *
 * MATH-FIELD matters: MathLive keeps its real keyboard handling inside a shadow root, and an event
 * from in there is retargeted to the host by the time it reaches window, so this is the name it
 * arrives under.
 */
export function isTyping(t: KeyTarget | null | undefined): boolean {
  const name = tag(t)
  return name === 'INPUT' || name === 'TEXTAREA' || name === 'SELECT' || name === 'MATH-FIELD' || t?.isContentEditable === true
}

/** Controls that already turn Enter or Space into a click, so a shortcut must not steal the key. */
export function isActivatable(t: KeyTarget | null | undefined): boolean {
  const name = tag(t)
  if (name === 'BUTTON' || name === 'SUMMARY') return true
  if (name === 'A' && t?.hasAttribute?.('href')) return true
  const role = t?.getAttribute?.('role') ?? ''
  return ['button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'switch'].includes(role)
}
