// The popup keypad's keys, as data: what each one inserts, what it does, and what it says on hover.
//
// A key inserts LaTeX into the maths field (#0 is the selection or the caret, #? a box to fill)
// or runs an action. A key with `more` hides its relatives behind a chevron or a long press —
// sin keeps sin⁻¹ and sinh — instead of a SHIFT key that changed what every key meant. Nothing
// here is shaped like a handheld: the names are the names a textbook uses.
//
// tests/keys.test.ts runs every template through latexToMath and the engine, so a key that
// inserts something the calculator cannot read is caught before a student presses it.

import { CONSTANTS } from './constants'
import type { CalcMode } from './calcStore'

export type KeyAction = 'eq' | 'del' | 'clear' | 'left' | 'right' | 'solve' | 'calc' | `mode:${CalcMode}`

export interface KeyDef {
  id: string
  label: string
  /** LaTeX to insert: #0 is the selection (or nothing), #? a box the student fills. */
  tex?: string
  /** What to insert instead of `tex` while the angle unit is degrees (the polar-form key). */
  texDeg?: string
  act?: KeyAction
  /** One plain sentence, shown on hover. Every key has one. */
  hint: string
  /** Relatives behind the chevron: the inverse, the hyperbolic, the cube root. */
  more?: KeyDef[]
  /** Drawn as the primary key (=). */
  primary?: boolean
  /** Spans two columns. */
  wide?: boolean
  /** Shown only in these modes (the Bases field has no cursor boxes and no decimal point). */
  modes?: CalcMode[]
}

export type KeyGroupId = 'numbers' | 'functions' | 'calculus' | 'constants' | 'templates' | 'complex' | 'bases'

export interface KeyGroup {
  id: KeyGroupId
  label: string
  cols: number
  keys: KeyDef[]
  /** Shown only while one of these modes is on; every mode when absent. */
  modes?: CalcMode[]
}

const fn = (name: string, args = 1): string => `\\${name}\\left(#0${',#?'.repeat(args - 1)}\\right)`
const op = (name: string, args = 1): string => `\\operatorname{${name}}\\left(#0${',#?'.repeat(args - 1)}\\right)`

const NUMBERS: KeyDef[] = [
  { id: '7', label: '7', tex: '7', hint: 'Seven' },
  { id: '8', label: '8', tex: '8', hint: 'Eight' },
  { id: '9', label: '9', tex: '9', hint: 'Nine' },
  { id: 'del', label: '⌫', act: 'del', hint: 'Delete the character before the cursor' },
  { id: 'clear', label: 'Clear', act: 'clear', hint: 'Clear the field and the answer' },
  { id: '4', label: '4', tex: '4', hint: 'Four' },
  { id: '5', label: '5', tex: '5', hint: 'Five' },
  { id: '6', label: '6', tex: '6', hint: 'Six' },
  { id: 'times', label: '×', tex: '\\times', hint: 'Multiply' },
  { id: 'div', label: '÷', tex: '\\div', hint: 'Divide' },
  { id: '1', label: '1', tex: '1', hint: 'One' },
  { id: '2', label: '2', tex: '2', hint: 'Two' },
  { id: '3', label: '3', tex: '3', hint: 'Three' },
  { id: 'plus', label: '+', tex: '+', hint: 'Add' },
  { id: 'minus', label: '−', tex: '-', hint: 'Subtract, or a negative number' },
  { id: '0', label: '0', tex: '0', hint: 'Zero' },
  { id: 'dot', label: '.', tex: '.', hint: 'Decimal point', modes: ['COMP', 'CMPLX'] },
  { id: 'ans', label: 'Ans', tex: '\\operatorname{Ans}', hint: 'The last answer', modes: ['COMP', 'CMPLX'] },
  { id: 'open', label: '(', tex: '(', hint: 'Open a bracket' },
  { id: 'close', label: ')', tex: ')', hint: 'Close a bracket' },
  { id: 'left', label: '◀', act: 'left', hint: 'Move the cursor left, or back to the previous box', modes: ['COMP', 'CMPLX'] },
  { id: 'right', label: '▶', act: 'right', hint: 'Move the cursor right, or on to the next box', modes: ['COMP', 'CMPLX'] },
  { id: 'comma', label: ',', tex: ',', hint: 'Separates the parts of a function, as in nCr(5, 2)', modes: ['COMP', 'CMPLX'] },
  { id: 'eq', label: '=', act: 'eq', hint: 'Work out the answer (Enter does the same)', primary: true, wide: true }
]

const FUNCTIONS: KeyDef[] = [
  {
    id: 'sin',
    label: 'sin',
    tex: fn('sin'),
    hint: 'Sine of an angle, in the angle unit shown beside the field',
    more: [
      { id: 'asin', label: 'sin⁻¹', tex: '\\sin^{-1}\\left(#0\\right)', hint: 'Inverse sine: the angle whose sine is this' },
      { id: 'sinh', label: 'sinh', tex: fn('sinh'), hint: 'Hyperbolic sine' }
    ]
  },
  {
    id: 'cos',
    label: 'cos',
    tex: fn('cos'),
    hint: 'Cosine of an angle',
    more: [
      { id: 'acos', label: 'cos⁻¹', tex: '\\cos^{-1}\\left(#0\\right)', hint: 'Inverse cosine: the angle whose cosine is this' },
      { id: 'cosh', label: 'cosh', tex: fn('cosh'), hint: 'Hyperbolic cosine' }
    ]
  },
  {
    id: 'tan',
    label: 'tan',
    tex: fn('tan'),
    hint: 'Tangent of an angle',
    more: [
      { id: 'atan', label: 'tan⁻¹', tex: '\\tan^{-1}\\left(#0\\right)', hint: 'Inverse tangent: the angle whose tangent is this' },
      { id: 'tanh', label: 'tanh', tex: fn('tanh'), hint: 'Hyperbolic tangent' }
    ]
  },
  {
    id: 'ln',
    label: 'ln',
    tex: fn('ln'),
    hint: 'Natural logarithm, base e',
    more: [{ id: 'exp', label: 'eˣ', tex: 'e^{#0}', hint: 'e to a power' }]
  },
  {
    id: 'log',
    label: 'log',
    tex: fn('log'),
    hint: 'Logarithm, base 10',
    more: [
      { id: 'pow10', label: '10ˣ', tex: '10^{#0}', hint: 'Ten to a power' },
      { id: 'logbase', label: 'logₐ', tex: '\\log_{#?}\\left(#0\\right)', hint: 'Logarithm to any base: fill in the base first' }
    ]
  },
  { id: 'sqrt', label: '√', tex: '\\sqrt{#0}', hint: 'Square root' },
  {
    id: 'cbrt',
    label: '∛',
    tex: '\\sqrt[3]{#0}',
    hint: 'Cube root',
    more: [{ id: 'nthroot', label: 'ⁿ√', tex: '\\sqrt[#?]{#0}', hint: 'Any root: fill in which one' }]
  },
  {
    id: 'pow',
    label: 'xʸ',
    tex: '#0^{#?}',
    hint: 'Raise to a power',
    more: [
      { id: 'sq', label: 'x²', tex: '#0^2', hint: 'Square' },
      { id: 'cube', label: 'x³', tex: '#0^3', hint: 'Cube' },
      { id: 'inv', label: 'x⁻¹', tex: '#0^{-1}', hint: 'One over: the reciprocal' }
    ]
  },
  {
    id: 'abs',
    label: '|x|',
    tex: '\\left|#0\\right|',
    hint: 'Absolute value: the size, ignoring the sign',
    more: [{ id: 'whole', label: 'whole', tex: op('Int'), hint: 'The whole-number part, with the decimals dropped' }]
  },
  {
    id: 'fact',
    label: 'n!',
    tex: '#0!',
    hint: 'Factorial: 5! = 5 × 4 × 3 × 2 × 1',
    more: [
      { id: 'gcd', label: 'HCF', tex: op('GCD', 2), hint: 'Highest common factor of two numbers' },
      { id: 'lcm', label: 'LCM', tex: op('LCM', 2), hint: 'Lowest common multiple of two numbers' }
    ]
  },
  { id: 'ncr', label: 'nCr', tex: op('nCr', 2), hint: 'Combinations: ways to choose r things from n' },
  { id: 'npr', label: 'nPr', tex: op('nPr', 2), hint: 'Permutations: ways to arrange r things chosen from n' },
  { id: 'percent', label: '%', tex: '#0\\%', hint: 'Per cent: 25% is 0.25' },
  { id: 'degree', label: '°', tex: '#0^{\\circ}', hint: 'Degrees, whatever the angle unit is set to' },
  {
    id: 'pol',
    label: 'polar',
    tex: op('Pol', 2),
    hint: 'Polar form of a point: distance r and angle θ from (x, y)',
    more: [{ id: 'rec', label: 'x, y', tex: op('Rec', 2), hint: 'Back to (x, y) from a distance r and an angle θ' }]
  },
  {
    id: 'random',
    label: 'random',
    tex: op('RanInt', 2),
    hint: 'A random whole number between the two you give',
    more: [{ id: 'random01', label: 'random 0–1', tex: '\\operatorname{Ran}()', hint: 'A random number between 0 and 1' }]
  }
]

const CALCULUS: KeyDef[] = [
  { id: 'ddx', label: 'd/dx', tex: op('ddx', 2), hint: 'The gradient of an expression at a point: d/dx(x², 3) is 6' },
  // The boxes are walked the way MathLive orders them — top limit, bottom limit, then the
  // expression — so ▶ goes top to bottom and never back into a limit already filled.
  { id: 'integral', label: '∫', tex: '\\int_{#?}^{#?}#0\\,dx', hint: 'The area under a curve between two limits: fill the top limit, ▶ for the bottom one, ▶ for the expression' },
  { id: 'sum', label: 'Σ', tex: '\\sum_{x=#?}^{#?}#0', hint: 'Add up an expression for x from one number to another: fill the top number, ▶ for the bottom one, ▶ for the expression' },
  { id: 'prod', label: 'Π', tex: '\\prod_{x=#?}^{#?}#0', hint: 'Multiply an expression for x from one number to another: fill the top number, ▶ for the bottom one, ▶ for the expression' },
  { id: 'solve', label: 'x = ?', act: 'solve', hint: 'Solve the equation for x: type both sides with an = between them, then press this' },
  { id: 'calc', label: 'with values…', act: 'calc', hint: 'Work out an expression with letters by giving each letter a value' }
]

const CONSTANTS_KEYS: KeyDef[] = [
  { id: 'pi', label: 'π', tex: '\\pi', hint: 'Pi, about 3.14159' },
  { id: 'e', label: 'e', tex: 'e', hint: "Euler's number, about 2.71828" },
  { id: 'i', label: 'i', tex: 'i', hint: 'The imaginary unit, √−1' },
  { id: 'inf', label: '∞', tex: '\\infty', hint: 'Infinity' },
  ...CONSTANTS.map((c) => ({ id: `const:${c.id}`, label: c.symbol, tex: c.id, hint: c.unit ? `${c.name}, in ${c.unit}` : c.name }))
]

const TEMPLATES: KeyDef[] = [
  { id: 'frac', label: '▭⁄▭', tex: '\\frac{#0}{#?}', hint: 'A fraction: top over bottom' },
  { id: 'tpow', label: '▭ʸ', tex: '#0^{#?}', hint: 'A power' },
  { id: 'troot', label: 'ⁿ√▭', tex: '\\sqrt[#?]{#0}', hint: 'A root of any order' },
  { id: 'matrix', label: '[▭]', tex: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}', hint: 'A 2 × 2 matrix; use ▶ to move between the boxes' },
  { id: 'e10', label: '×10ˣ', tex: '#0\\times10^{#?}', hint: 'Standard form: 3 × 10⁸' }
]

const COMPLEX: KeyDef[] = [
  { id: 'ci', label: 'i', tex: 'i', hint: 'The imaginary unit, √−1' },
  {
    id: 'polar',
    label: 'r∠θ',
    tex: '#0\\times e^{i\\times#?}',
    // e^{iθ} wants radians whatever the switch says, and a ° inside the power is a unit the
    // engine cannot raise e to; in degrees the angle is turned into radians on the way in.
    texDeg: '#0\\times e^{i\\times\\frac{#?\\times\\pi}{180}}',
    hint: 'Polar form: a size times e to the iθ, with θ in the angle unit shown beside the field'
  },
  { id: 'arg', label: 'arg', tex: op('arg'), hint: 'The argument: the angle of a complex number' },
  { id: 'conj', label: 'conj', tex: op('conj'), hint: 'The conjugate: the same number with the sign of i flipped' },
  { id: 're', label: 'Re', tex: op('Re'), hint: 'The real part' },
  { id: 'im', label: 'Im', tex: op('Im'), hint: 'The imaginary part' }
]

const BASES: KeyDef[] = [
  ...(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((l) => ({ id: `hex${l}`, label: l, tex: l, hint: `The hexadecimal digit ${l}` })),
  { id: 'and', label: 'and', tex: ' and ', hint: 'Bitwise and' },
  { id: 'or', label: 'or', tex: ' or ', hint: 'Bitwise or' },
  { id: 'xor', label: 'xor', tex: ' xor ', hint: 'Bitwise exclusive or' },
  { id: 'xnor', label: 'xnor', tex: ' xnor ', hint: 'Bitwise exclusive nor' },
  { id: 'not', label: 'not', tex: 'not(', hint: 'Flip every bit' },
  { id: 'neg', label: 'neg', tex: 'neg(', hint: 'Negative, in two’s complement' }
]

export const KEY_GROUPS: KeyGroup[] = [
  { id: 'numbers', label: 'Numbers', cols: 5, keys: NUMBERS },
  { id: 'functions', label: 'Functions', cols: 4, keys: FUNCTIONS, modes: ['COMP', 'CMPLX'] },
  { id: 'calculus', label: 'Calculus & sums', cols: 3, keys: CALCULUS, modes: ['COMP'] },
  { id: 'constants', label: 'Constants', cols: 6, keys: CONSTANTS_KEYS, modes: ['COMP', 'CMPLX'] },
  { id: 'templates', label: 'Templates', cols: 3, keys: TEMPLATES, modes: ['COMP', 'CMPLX'] },
  { id: 'complex', label: 'Complex', cols: 3, keys: COMPLEX, modes: ['CMPLX'] },
  { id: 'bases', label: 'Bases', cols: 6, keys: BASES, modes: ['BASE-N'] }
]

/** The groups the keypad shows in a mode; the digits are always among them. */
export const groupsForMode = (mode: CalcMode): KeyGroup[] => KEY_GROUPS.filter((g) => !g.modes || g.modes.includes(mode))

/** Every key, with its relatives, flattened: what the tests walk. */
export const allKeys = (): KeyDef[] => KEY_GROUPS.flatMap((g) => g.keys.flatMap((k) => [k, ...(k.more ?? [])]))
