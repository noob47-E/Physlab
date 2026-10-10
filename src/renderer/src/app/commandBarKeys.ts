// What a key press does in the command bar, as a pure function so it can be tested without a DOM.
// Why: the bar's list opens on focus, so the old rules (Enter ignored the highlight, arrows walked the history,
// Tab was swallowed) trapped keyboard users. Now a suggestion is only taken once the student has moved the
// highlight with the arrows (`chosen`); otherwise Enter runs the typed line and Tab moves focus on.

export interface KeyState {
  key: string
  open: boolean
  text: string
  /** How many suggestions are showing. */
  suggestions: number
  active: number
  /** True once the arrows have moved the highlight since the text last changed. */
  chosen: boolean
  historyLength: number
  histIdx: number
}

type KeyAction =
  | { kind: 'run' }
  | { kind: 'take'; index: number }
  | { kind: 'move'; active: number }
  | { kind: 'history'; histIdx: number }
  | { kind: 'close' }
  | { kind: 'none' } // swallow the key, change nothing
  | { kind: 'default' } // let the browser handle it (Tab moves focus)

export function decideKey(s: KeyState): KeyAction {
  const listing = s.open && s.suggestions > 0
  // A row picked before the list changed (a prefill, a shorter list) may no longer exist.
  const picked = listing && s.chosen && s.active >= 0 && s.active < s.suggestions
  switch (s.key) {
    case 'Enter':
      if (picked) return { kind: 'take', index: s.active }
      return s.text.trim() === '' ? { kind: 'none' } : { kind: 'run' }
    case 'Tab':
      return picked ? { kind: 'take', index: s.active } : { kind: 'default' }
    case 'ArrowDown':
      if (listing) return { kind: 'move', active: Math.min(s.active + 1, s.suggestions - 1) }
      return s.historyLength ? { kind: 'history', histIdx: Math.max(s.histIdx - 1, -1) } : { kind: 'none' }
    case 'ArrowUp':
      if (listing) return { kind: 'move', active: Math.max(s.active - 1, 0) }
      return s.historyLength
        ? { kind: 'history', histIdx: Math.min(s.histIdx + 1, s.historyLength - 1) }
        : { kind: 'none' }
    case 'Escape':
      return { kind: 'close' }
    default:
      return { kind: 'default' }
  }
}

/**
 * The text a history step shows, and the draft kept beside it. Leaving the typed line (from -1)
 * keeps it as the draft; coming back past the newest entry (to -1) shows the draft again. The old
 * walk emptied the bar there, so `abc`, ArrowUp, ArrowDown lost a line that was never run.
 */
export function recall(history: string[], from: number, to: number, text: string, draft: string): { text: string; draft: string } {
  const kept = from === -1 ? text : draft
  return { text: to >= 0 ? (history[to] ?? kept) : kept, draft: kept }
}
