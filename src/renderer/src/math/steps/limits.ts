// The limits on a typed line that the step engine reads, shared by the router and the inequality reader.
//
// A line longer than this, or with more open brackets than this, is refused before any method reads it: every method rereads
// the text, and a long run of brackets took seconds (P-FIX-S1SOUND2 SHOULD 1). The inequality reader uses the same limits, so
// a line the router refuses is never read as an inequality either.

/** The longest typed input the methods read. */
const MAX_INPUT_LENGTH = 400

/** The most open brackets a typed input may have. */
const MAX_BRACKETS = 60

/** True when a typed line is too long, or has too many open brackets, to be read in time. */
export function tooLongToRead(text: string): boolean {
  if (text.length > MAX_INPUT_LENGTH) return true
  let open = 0
  for (const c of text) {
    if (c !== '(') continue
    open++
    if (open > MAX_BRACKETS) return true
  }
  return false
}
