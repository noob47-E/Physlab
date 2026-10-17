// What the Maths screen says when the engine cannot answer.
//
// The engine throws whatever mathjs or the converter threw ("Unexpected end of expression",
// "Undefined symbol y"), and the tests pin those. A student reads a sentence instead: what went
// wrong, in words, and where to look. "Syntax ERROR" was a handheld's message and said neither.

export interface ErrorSentence {
  /** The headline: one plain sentence. */
  sentence: string
  /** The engine's own words, for a student who wants them. */
  detail?: string
}

/** The letters the calculator holds a value for: what the Variables drawer offers. */
export const OWN_LETTERS = /^[A-FMxy]$/

/** What to say of an unknown function name (without a trailing period, for embedders like cannotDraw). */
export function unknownFunctionReason(name: string): string {
  return `PhysLab does not know a function called "${name}"`
}

/** What to say of an unknown function name as a standalone sentence. */
export function unknownFunctionSentence(name: string): string {
  return `${unknownFunctionReason(name)}.`
}

/**
 * What to say of a name that has no value. x, y and z are a graph's letters, never a name (the graph
 * routes keep them, and `y = (1, 2)` is refused), so "create it first, e.g. y = (1, 2)" is no advice.
 */
export function unknownNameSentence(name: string, freeLetter = 'a'): string {
  if (name === 'x' || name === 'y' || name === 'z') {
    return `${name} is the letter graphs use, so it has no value of its own here. Use another letter for a number, e.g. ${freeLetter} = 2.`
  }
  return `I don't know "${name}". Create it first, e.g. ${name} = (1, 2).`
}

/** The sentence for a name nothing gives a value to, in a vector card or in the expression box. */
export function unknownVectorNameSentence(name: string, scope: Record<string, unknown>, below: string[] = [], unreadable: string[] = []): string {
  if (below.includes(name)) return `${name} is a card further down. A card can only use the vectors above it, so type ${name}'s value here or use a card higher up.`
  if (unreadable.includes(name)) return `Card ${name} cannot be read yet, so it cannot be used here. Put card ${name} right first.`
  const parts = name.split('')
  if (name.length > 1 && parts.every((p) => p in scope)) {
    return `“${name}” is not one name. Put a sign between ${parts.join(' and ')}: ${parts.join(' × ')} for the cross product, ${parts.join(' · ')} for the dot product.`
  }
  return `There is no vector called ${name}. Use a card's name (the letter on its left), or the unit vectors i, j and k.`
}

/**
 * Whether the engine's words are worth showing under the sentence. "Undefined symbol k" tells a
 * student something; "Unexpected type of argument in function addScalar (expected: Unit, actual:
 * number, index: 1)" is code, and Rule 2 applies to the small print too.
 */
const readable = (msg: string): boolean => !/function\b|\(char |index:|expected:/.test(msg)

export function errorSentence(raw: unknown): ErrorSentence {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '')
  // The engine's words are kept underneath for a student who wants them, except the Bases
  // engine's two handheld-style messages, which say nothing the sentence does not.
  const detail = /^(Syntax|Math) ERROR$/.test(msg.trim()) || !readable(msg) ? undefined : msg.trim() || undefined
  // The converter's own refusals, the integral's (calc/engine.ts integrate), the sum's and product's
  // ("That sum has too many terms…", calc/engine.ts series) and the line that tries to store a letter
  // ("Typing A = … does not store a value", calc/engine.ts refuseStoring) are already sentences written
  // for the student; the generic fallback below would bury them as small print.
  if (/^Choose \+ or −|^The area cannot be worked out|^That (sum|product) |^Typing .+ does not store a value\./.test(msg)) return { sentence: msg }
  if (/Empty/.test(msg)) return { sentence: 'Type something first.' }
  if (/No solution/i.test(msg)) return { sentence: 'No solution I can find near 0. Try giving x a value close to the answer first.', detail }
  // The Bases engine's one "Math ERROR" is a division by zero; everything else it refuses is syntax.
  if (/divi(de|sion) by zero|Infinity|^Math ERROR$/i.test(msg)) return { sentence: 'That divides by zero.', detail }
  // mathjs knows t as a tonne, m as a metre and s as a second, so 2t + 1 adds a number to a unit.
  // "Check the brackets" sent the student to the wrong place for it.
  if (/expected: Unit/.test(msg)) {
    return { sentence: 'A letter here was read as a unit (2t is two tonnes, 3m three metres, 2A two amperes), and a unit cannot be added to a plain number. To use a value of your own, give a letter a value under Variables.' }
  }
  if (/Undefined symbol\s+(\S+)/.test(msg)) {
    const name = /Undefined symbol\s+(\S+)/.exec(msg)![1]
    // The Variables drawer holds A–F, M, x and y and nothing else, so "give it a value there"
    // is only true of those.
    const advice = OWN_LETTERS.test(name) ? 'Give it a value under Variables' : 'Use one of the letters A to F, M, x or y for a value'
    return { sentence: `I don't know what ${name} is. ${advice}, or check the spelling.`, detail }
  }
  // "Undefined function re" from mathjs, or "'re' is not a function; its value is…" when a name
  // in the constants list (r_e, the electron radius) shadows one.
  if (/Undefined function\s+(\S+)|'(\S+)' is not a function/.test(msg)) {
    const m = /Undefined function\s+(\S+)|'(\S+)' is not a function/.exec(msg)!
    return { sentence: `There is no function called ${m[1] ?? m[2]}. Check the spelling, or pick one from the keypad.`, detail }
  }
  // An = reaches mathjs only from the Complex field; Numbers mode solves it before mathjs sees it.
  if (/assignment operator|left hand side/i.test(msg)) return { sentence: 'Equations are solved in Numbers mode: type both sides with = and press x = ?' }
  if (/Parenthesis|paren|bracket/i.test(msg)) return { sentence: "I can't read that — check the brackets.", detail }
  // A complex number where a whole number was wanted (nCr), a matrix where a number was: the
  // brackets are fine.
  if (/Unexpected type of argument/.test(msg)) return { sentence: 'Those numbers do not fit this function.' }
  if (/Unexpected end|Value expected|Unexpected|Syntax|Cannot convert/i.test(msg)) {
    return { sentence: "I can't read that — check the brackets, and that every operator has a number on each side.", detail }
  }
  if (/doesn't apply to matrices/i.test(msg)) return { sentence: 'That function takes a number, not a matrix.', detail }
  if (/must be|out of range|not (a )?(valid|supported)|expected/i.test(msg)) return { sentence: 'Those numbers do not fit this function.', detail }
  if (/too large|Maximum|overflow|stack/i.test(msg)) return { sentence: 'That is too big for me to work out.', detail }
  return { sentence: "I can't work that out.", detail }
}

/** True when the linear source visibly divides by a zero: 1/0, 5 / (0), ((1)/(0)). */
const dividesByZero = (src: string): boolean => /\/\s*\(*\s*0+(\.0*)?\s*\)*(\s*$|[^.\d])/.test(src)

/**
 * A number that came back with no value in it: 1 ÷ 0, √−1 in real mode, 0 ÷ 0, ln 0. The source
 * decides between "divides by zero" and "runs off to infinity": ln(0) is −∞ and divides by
 * nothing, and telling a student it did sent them looking for a fraction that was not there.
 */
export function nonFiniteSentence(v: number, src = ''): ErrorSentence {
  if (Number.isNaN(v)) return { sentence: 'That has no value here — perhaps a root of a negative number, or 0 ÷ 0.' }
  if (dividesByZero(src)) return { sentence: 'That divides by zero.' }
  return { sentence: 'That runs off to infinity — like 1 ÷ 0 or ln 0 does — so there is no number to show.' }
}

/** The characters a base allows, in the words a student reads. */
const BASE_DIGITS: Record<number, { re: RegExp; words: string }> = {
  2: { re: /[01]/, words: '0 and 1 in binary' },
  8: { re: /[0-7]/, words: '0 to 7 in octal' },
  10: { re: /[0-9]/, words: '0 to 9 in decimal' },
  16: { re: /[0-9A-Fa-f]/, words: '0 to 9 and A to F in hexadecimal' }
}

/**
 * The sentence for a digit that does not belong to the base — `12` typed in binary — or null
 * when every character is a digit of the base, an operator, a bracket or one of the bitwise
 * words. The Bases engine refuses such a line as a syntax error, and "check the brackets" was
 * the wrong advice for it.
 */
export function outsideBaseSentence(src: string, base: number): ErrorSentence | null {
  const digits = BASE_DIGITS[base]
  if (!digits) return null
  const rest = src.replace(/\b(and|or|xor|xnor|not|neg)\b/gi, ' ').replace(/[\s+\-*/()&|^~]/g, '')
  const bad = [...rest].find((ch) => !digits.re.test(ch))
  if (bad === undefined) return null
  return { sentence: `Only the digits of this base are allowed here: ${digits.words}. "${bad}" is not one of them.` }
}
