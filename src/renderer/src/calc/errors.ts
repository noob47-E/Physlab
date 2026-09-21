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

export function errorSentence(raw: unknown): ErrorSentence {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '')
  // The engine's words are kept underneath for a student who wants them, except the Bases
  // engine's two handheld-style messages, which say nothing the sentence does not.
  const detail = /^(Syntax|Math) ERROR$/.test(msg.trim()) ? undefined : msg.trim() || undefined
  // The converter's own refusals are already sentences written for the student.
  if (/^Choose \+ or −/.test(msg)) return { sentence: msg }
  if (/Empty/.test(msg)) return { sentence: 'Type something first.' }
  if (/No solution/i.test(msg)) return { sentence: 'No solution I can find near 0. Try giving x a value close to the answer first.', detail }
  // The Bases engine's one "Math ERROR" is a division by zero; everything else it refuses is syntax.
  if (/divi(de|sion) by zero|Infinity|^Math ERROR$/i.test(msg)) return { sentence: 'That divides by zero.', detail }
  if (/Undefined symbol\s+(\S+)/.test(msg)) {
    const name = /Undefined symbol\s+(\S+)/.exec(msg)![1]
    return { sentence: `I don't know what ${name} is. Give it a value under Variables, or check the spelling.`, detail }
  }
  if (/Undefined function\s+(\S+)/.test(msg)) {
    const name = /Undefined function\s+(\S+)/.exec(msg)![1]
    return { sentence: `There is no function called ${name}. Check the spelling, or pick one from the keypad.`, detail }
  }
  if (/Parenthesis|paren|bracket/i.test(msg)) return { sentence: "I can't read that — check the brackets.", detail }
  if (/Unexpected end|Value expected|Unexpected|Syntax|Unexpected type|Cannot convert/i.test(msg)) {
    return { sentence: "I can't read that — check the brackets, and that every operator has a number on each side.", detail }
  }
  if (/must be|out of range|not (a )?(valid|supported)|expected/i.test(msg)) return { sentence: 'Those numbers do not fit this function.', detail }
  if (/too large|Maximum|overflow|stack/i.test(msg)) return { sentence: 'That is too big for me to work out.', detail }
  return { sentence: "I can't work that out.", detail }
}

/** A number that came back with no value in it: 1 ÷ 0, √−1 in real mode, 0 ÷ 0. */
export function nonFiniteSentence(v: number): ErrorSentence {
  if (Number.isNaN(v)) return { sentence: 'That has no value here — perhaps a root of a negative number, or 0 ÷ 0.' }
  return { sentence: 'That divides by zero, or is too big to hold.' }
}
