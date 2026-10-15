// Graphing's docked keypad: the Calculator's keys, inserting into the line being typed at its caret.
// It sits under the list of lines (not over the graph), and keeps the focus in the line while a key is pressed.

import { useCallback, useEffect, useRef } from 'react'
import { KeyGrid } from '../ui/Keypad'
import { applyGraphKey, GRAPH_KEYPAD, graphKey } from './graphKeypad'
import type { KeyDef } from '../calc/keys'

const KEEP = '[data-graph-line]'

/** The line field last focused in the panel, kept after focus moves to a key. */
function useActiveLine(): () => HTMLInputElement | null {
  const last = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    const on = (e: FocusEvent): void => {
      const t = e.target
      if (t instanceof HTMLInputElement && t.closest(KEEP)) last.current = t
    }
    // A line already focused when the keypad opens has no focusin to come.
    const now = document.activeElement
    if (now instanceof HTMLInputElement && now.closest(KEEP)) last.current = now
    document.addEventListener('focusin', on)
    return () => document.removeEventListener('focusin', on)
  }, [])
  return useCallback(() => (last.current && last.current.isConnected ? last.current : null), [])
}

// A native setter plus an input event: the field is a React-controlled input, which only sees typing.
function setValue(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function pressGraphKey(el: HTMLInputElement, id: string): void {
  const key = graphKey(id)
  if (!key) return
  if (key.move === 'enter') {
    // On a row, Enter commits it (blur) and the next line starts in the new-line box.
    const fresh = document.getElementById('expressions-new') as HTMLInputElement | null
    if (el === fresh) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    else {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      fresh?.focus()
    }
    return
  }
  const edit = applyGraphKey(id, el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length)
  if (!edit) return
  if (edit.value !== el.value) setValue(el, edit.value)
  el.focus()
  el.setSelectionRange(edit.start, edit.end)
}

export function GraphKeypad() {
  const active = useActiveLine()
  const onKey = useCallback(
    (k: KeyDef) => {
      const el = active() ?? (document.getElementById('expressions-new') as HTMLInputElement | null)
      if (el) pressGraphKey(el, k.id)
    },
    [active]
  )
  return (
    <div className="graph-keypad border-t border-[var(--line)] p-2" role="group" aria-label="Keypad" data-keypad-keep onMouseDown={(e) => e.preventDefault()}>
      <KeyGrid group={GRAPH_KEYPAD} mode="COMP" onKey={onKey} moreOf={null} onMore={() => undefined} />
    </div>
  )
}
