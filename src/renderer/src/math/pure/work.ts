// The shape of a piece of worked-out maths.
//
// Every Pure Math tool returns one of these and the Working panel knows how to show it, so adding
// a new tool never means touching the UI. The wording rules matter as much as the maths:
//
//   head  one line, plain English, past tense — what just happened, not what to do next
//   rule  the formula that licenced the move, shown beside it ("as we know, i² = −1")
//   tex   the maths of the move itself
//
// A student who reads only the heads should still follow the whole argument.

export interface Move {
  /** One plain sentence: what was just done. */
  head: string
  /** The formula or law used, as LaTeX. Shown as a small chip beside the step. */
  rule?: string
  /** The maths of this step, as LaTeX display maths. */
  tex?: string
  /** A quieter aside — a warning, or why this choice and not another. */
  note?: string
}

export interface Answer {
  label: string
  tex: string
}

export interface Working {
  /** What was asked, in words: "Factorise 6x² + 7x − 3". */
  title: string
  /** What was asked, as LaTeX. */
  input: string
  /** The name of the method used, when there is a choice: "Splitting the middle term". */
  method?: string
  moves: Move[]
  answers: Answer[]
  /** A line that proves the answer, by multiplying back out or substituting. */
  check?: string
  /** Set instead of the rest when the input could not be handled; always a readable sentence. */
  error?: string
  /**
   * Set when the answer is right but PhysLab could not show the working — the answer still comes
   * first, which is the rule this whole project is built on.
   */
  noWorking?: boolean
}


/**
 * Turn the LaTeX used in a check sentence into ordinary characters.
 *
 * `check` is read as a plain sentence next to a tick, so "6x^{2} + 7x - 3" has to arrive as
 * "6x² + 7x - 3". Only the handful of constructs the generators actually produce are handled.
 */
export function texToPlain(s: string): string {
  const sup: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
  return s
    .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√$1')
    .replace(/\\text\{([^}]*)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\^\{([0-9]+)\}/g, (_m, d: string) => [...d].map((c) => sup[c] ?? c).join(''))
    .replace(/\^([0-9])/g, (_m, d: string) => sup[d] ?? d)
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\(?:quad|;|,)/g, ' ')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const failed = (title: string, input: string, error: string): Working => ({
  title,
  input,
  moves: [],
  answers: [],
  error
})

/** Small helper so step generators read like the steps they produce. */
export class Steps {
  readonly moves: Move[] = []

  add(head: string, tex?: string, rule?: string, note?: string): this {
    this.moves.push({ head, tex, rule, note })
    return this
  }

  /** Attach a note to the step just added — for a caveat noticed after the fact. */
  note(text: string): this {
    const last = this.moves[this.moves.length - 1]
    if (last) last.note = last.note ? `${last.note} ${text}` : text
    return this
  }
}
