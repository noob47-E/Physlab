// Display safety (P-FIX-S1SOUND2 MUST 6): a displayed line is refused unless KaTeX draws it the way the validator reads it.
// A line the page would draw differently is never shown, so what is drawn is what was checked. The rules are kept
// conservative: a line that breaks one of them is hidden, never guessed at.

/**
 * The text the page draws, from the text the steps hold (P-FIX-S1SOUND2 MUST 6): a power that takes more than one
 * character is braced, so x^18 is drawn x^{18} and 10^(-18) is drawn 10^{(-18)}. The same converter serves the check
 * (displaySafe of the drawn text) and the page, so what is checked is what is drawn; the number is the same.
 */
export function drawnTex(text: string): string {
  return text
    .replace(/\^\((-?[^()]*)\)/g, '^{($1)}')
    .replace(/\^(-?\d{2,})/g, '^{$1}')
    .replace(/\^(-\d)/g, '^{$1}')
}

/** LaTeX commands and \text{...} are the only words a line may hold: a bare run of letters is refused. */
function withoutCommands(text: string): string {
  return text.replace(/\\text\{[^{}]*\}/g, ' ').replace(/\\[A-Za-z]+/g, ' ')
}

/** A brace must belong to a command, a power, a subscript or a previous group: a bare { draws nothing in KaTeX. */
function bracesBelong(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    if (i === 0) return false
    const prev = text[i - 1]
    if (prev === '^' || prev === '_' || prev === '}') continue
    if (prev === '\\') continue // an escaped brace, as in a set \{2, 3\}
    if (/\\[A-Za-z]+$/.test(text.slice(0, i))) continue
    return false
  }
  return true
}

/** A power must take one character alone (x^2, x^{10}): x^10 draws as x¹0, x^-5 as x⁻5, x^(2) as x^(2. */
function powersTakeOneCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '^' && text[i] !== '_') continue
    const next = text[i + 1]
    if (next === '{') continue
    if (next === undefined || !/[A-Za-z0-9]/.test(next)) return false
    const after = text[i + 2]
    if (after !== undefined && /[A-Za-z0-9]/.test(after)) return false
  }
  return true
}

/**
 * True when KaTeX draws the line as the validator reads it. Refused: a percent sign, a comment or other character LaTeX
 * treats specially, a double star (a programming power), a hexadecimal or binary prefix, e-notation (1e-5, 2E3), a power
 * that takes more than one character without braces, a bare brace, a letter touching a digit (x2, which the validator
 * reads as one name), a run of letters that is not a command or a \text{} word, and two signs in a row (+ −3).
 */
export function displaySafe(text: string): boolean {
  if (typeof text !== 'string') return false
  if (/[%#&$~`"@_]/.test(text)) return false
  if (text.includes('**')) return false
  if (/0[xXbBoO][0-9A-Fa-f]/.test(text)) return false
  if (/\d[eE][+-]?\d/.test(text)) return false
  if (!powersTakeOneCharacter(text)) return false
  if (!bracesBelong(text)) return false
  const bare = withoutCommands(text)
  if (/[A-Za-z]\d/.test(bare)) return false
  if (/[A-Za-z]{2,}/.test(bare)) return false
  if (/[+−-]\s*[+−-]/.test(bare)) return false
  return true
}
