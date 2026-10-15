// Graphing's keypad as data: what each key puts into the focused line, and how it lands at the caret.
// The keys are plain text (the lines are typed text, `y = x^2`), laid out in the Calculator's KeyGrid.

import type { KeyDef, KeyGroup } from '../calc/keys'

/** `text` goes in at the caret; `|` marks where the caret ends up (end of the text when absent) and
 *  `@` stands for the selection (nothing, when none). */
interface GraphKey extends KeyDef {
  text?: string
  act?: undefined
  move?: 'left' | 'right' | 'del' | 'enter'
}

const k = (id: string, label: string, text: string, hint: string, extra: Partial<GraphKey> = {}): GraphKey => ({ id, label, text, hint, ...extra })
const m = (id: string, label: string, move: GraphKey['move'], hint: string, extra: Partial<GraphKey> = {}): GraphKey => ({ id, label, move, hint, ...extra })

const KEYS: GraphKey[] = [
  k('x', 'x', 'x', 'The variable x'),
  k('y', 'y', 'y', 'The variable y'),
  k('z', 'z', 'z', 'The variable z (3-D graphs)'),
  m('left', '←', 'left', 'Move the caret left'),
  m('right', '→', 'right', 'Move the caret right'),
  k('7', '7', '7', 'Seven'),
  k('8', '8', '8', 'Eight'),
  k('9', '9', '9', 'Nine'),
  k('div', '÷', '/', 'Divide'),
  m('del', '⌫', 'del', 'Delete the character before the caret'),
  k('4', '4', '4', 'Four'),
  k('5', '5', '5', 'Five'),
  k('6', '6', '6', 'Six'),
  k('times', '×', '*', 'Multiply'),
  k('pow', 'xⁿ', '^(|)', 'A power'),
  k('1', '1', '1', 'One'),
  k('2', '2', '2', 'Two'),
  k('3', '3', '3', 'Three'),
  k('minus', '−', '-', 'Subtract'),
  k('sqrt', '√', 'sqrt(@|)', 'Square root'),
  k('0', '0', '0', 'Zero'),
  k('dot', '.', '.', 'Decimal point'),
  k('eq', '=', ' = ', 'Equals'),
  k('plus', '+', '+', 'Add'),
  k('frac', 'a/b', '(@|)/()', 'A fraction'),
  k('pi', 'π', 'pi', 'Pi'),
  k('e', 'e', 'e', "Euler's number"),
  k('sin', 'sin', 'sin(@|)', 'Sine'),
  k('cos', 'cos', 'cos(@|)', 'Cosine'),
  k('tan', 'tan', 'tan(@|)', 'Tangent'),
  k('open', '(', '(', 'Open bracket'),
  k('close', ')', ')', 'Close bracket'),
  k('comma', ',', ', ', 'Comma, between the parts of a point or a curve'),
  k('abs', '|a|', 'abs(@|)', 'Absolute value'),
  m('enter', 'Enter', 'enter', 'Finish this line and start a new one', { primary: true })
]

export const GRAPH_KEYPAD: KeyGroup = { id: 'numbers', label: 'Graph keys', cols: 5, keys: KEYS }

const byId = new Map(KEYS.map((x) => [x.id, x]))
export const graphKey = (id: string): GraphKey | undefined => byId.get(id)

interface Edit {
  value: string
  start: number
  end: number
}

/** The line after key `id` is pressed with the selection start..end; null for Enter (the caller acts). */
export function applyGraphKey(id: string, value: string, start: number, end: number): Edit | null {
  const key = byId.get(id)
  if (!key) return null
  const a = Math.max(0, Math.min(start, end, value.length))
  const b = Math.max(a, Math.min(Math.max(start, end), value.length))
  if (key.move === 'enter') return null
  if (key.move === 'left') {
    const at = a !== b ? a : Math.max(0, a - 1)
    return { value, start: at, end: at }
  }
  if (key.move === 'right') {
    const at = a !== b ? b : Math.min(value.length, b + 1)
    return { value, start: at, end: at }
  }
  if (key.move === 'del') {
    if (a !== b) return { value: value.slice(0, a) + value.slice(b), start: a, end: a }
    if (a === 0) return { value, start: 0, end: 0 }
    return { value: value.slice(0, a - 1) + value.slice(a), start: a - 1, end: a - 1 }
  }
  const sel = value.slice(a, b)
  const raw = (key.text ?? '').replace('@', sel)
  const caret = raw.indexOf('|')
  const text = raw.replace('|', '')
  const at = a + (caret < 0 ? text.length : caret)
  return { value: value.slice(0, a) + text + value.slice(b), start: at, end: at }
}

const KEYPAD_KEY = 'physlab.graphing.keypad'

export function readKeypadOn(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEYPAD_KEY) === '1'
  } catch {
    return false
  }
}

export function writeKeypadOn(on: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEYPAD_KEY, on ? '1' : '0')
  } catch {
    /* private mode: the toggle just is not remembered */
  }
}
