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
  /**
   * A 2–5 word label of what this group of steps is for — "Find the common factor", "Split the
   * fraction" — set on the first move of a new stage by `Steps.goal`. A plain sentence like `head`,
   * never LaTeX: the panel shows it as a small heading above the move that carries it, so a student
   * reads "what we are doing now" before "how".
   */
  subgoal?: string
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
  /**
   * Whether the check actually passed. The panel used to decide by searching `check` for the
   * word "suspicion", which is a sentence doing a boolean's job; a reworded sentence would have
   * turned a failed check green. Left unset when there was nothing to verify.
   */
  checked?: 'ok' | 'failed'
  /** Set instead of the rest when the input could not be handled; always a readable sentence. */
  error?: string
  /**
   * Set when the answer is right but PhysLab could not show the working — the answer still comes
   * first, which is the rule this whole project is built on.
   */
  noWorking?: boolean
  /** Why the step engine gave up, when `noWorking` is set: the student deserves the reason. */
  reason?: string
  /**
   * A follow-up the panel can offer with one button — "Allow i" after a real factorisation stops
   * at x² + 4. `job` is a JobId; it is a string here only because this file sits below run.ts.
   */
  offer?: { job: string; label: string; hint: string }
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

  /** Set by `goal`, consumed by the next `add`: see `goal` below. */
  private pendingGoal?: string
  /** The label most recently stamped on a move, so the same stage named twice is not headed twice. */
  private lastGoal?: string

  /**
   * Name the stage the following moves belong to — "Find the common factor", "Split the middle
   * term". The label lands on the very next move added and then clears itself, so a stage that
   * takes several moves still gets one heading, not one per step. Naming the stage that is already
   * running does nothing: a helper called once per factor (splitting each quadratic of x⁴ + 1)
   * would otherwise head every call with the same words, and a heading that repeats verbatim
   * stops reading as "what we are doing now".
   */
  goal(label: string): this {
    this.pendingGoal = label === this.lastGoal ? undefined : label
    return this
  }

  add(head: string, tex?: string, rule?: string, note?: string): this {
    const move: Move = { head, tex, rule, note }
    if (this.pendingGoal !== undefined) {
      move.subgoal = this.pendingGoal
      this.lastGoal = this.pendingGoal
      this.pendingGoal = undefined
    }
    this.moves.push(move)
    return this
  }

  /** Attach a note to the step just added — for a caveat noticed after the fact. */
  note(text: string): this {
    const last = this.moves[this.moves.length - 1]
    if (last) last.note = last.note ? `${last.note} ${text}` : text
    return this
  }
}
