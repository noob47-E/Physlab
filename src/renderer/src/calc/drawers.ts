// What is open under the Calculator's field: the keypad, the Variables drawer and the History drawer.
//
// The keypad is a popover that hangs under the field and over whatever is below it, and the History drawer is below it: opened
// together, the keypad sat on the History it was opened beside (AG-FULLTEST-16 finding 2.7). Nothing may be covered, so
// opening the keypad closes the drawers and opening a drawer closes the keypad. The two drawers stack, as they always have.

export interface Panes {
  keypad: boolean
  vars: boolean
  history: boolean
}

/** The panes after `which` is opened. */
export function openPane(panes: Panes, which: keyof Panes): Panes {
  return which === 'keypad' ? { keypad: true, vars: false, history: false } : { ...panes, [which]: true, keypad: false }
}
