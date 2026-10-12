// G4: which engine answers each scoreboard class. A request belongs to a class when it is the kind of question the
// scoreboard measured (tests/engine/scoreboard: one letter, rational coefficients; linear systems in several). A class
// given to Giac has every answer proved by verify.ts before it is shown; an answer short of a proof, an error or a
// hang falls back to SymPy, so a wrong answer never reaches the screen. A class goes to Giac only with the
// scoreboard's evidence (GATE, checked by tests/engine/switch.test.ts against results/giac.json and the external
// holdout's results/giac-external.json). docs/knowledge/scoreboard.md.

import { plainVars, readExact, type Exact } from '../check/parse'
import type { EngineJob, EngineRequest, EngineResult, MathEngine } from './types'
import { verifyAnswer, type EngineClass } from './verify'

export type { EngineClass } from './verify'

/** G4's rule: a class switches with at least 92 % right and no WRONG, on gating and on the external holdout. */
export const GATE = { minRight: 0.92, maxWrong: 0 }

/**
 * The engine for each class. All SymPy until the external holdout is scored (G3c): Giac meets the rule on the gating
 * corpus in six classes, but the rule asks for both halves.
 */
export const ENGINE_FOR_CLASS: Record<EngineClass, 'sympy' | 'giac'> = {
  expand: 'sympy',
  'factor over Q': 'sympy',
  'polynomial equations': 'sympy',
  'linear systems': 'sympy',
  'rational simplification': 'sympy',
  derivatives: 'sympy',
  'partial fractions': 'sympy'
}

/** The expression read exactly, or null: π, sin, √2, |x| and anything else not a quotient of polynomials over ℚ. */
function exact(text: string | undefined): Exact | null {
  if (!text) return null
  try {
    const e = readExact(text)
    return e.atoms.length ? null : e
  } catch {
    return null
  }
}
const lettersOf = (e: Exact): string[] => [...new Set([...plainVars(e.rf.num), ...plainVars(e.rf.den)])]
const isPolynomial = (e: Exact): boolean => plainVars(e.rf.den).length === 0
/** Highest total degree of a polynomial's top. */
const degreeOf = (e: Exact): number => e.rf.num.reduce((m, t) => Math.max(m, Object.values(t.v).reduce((a, b) => a + b, 0)), 0)

/** "lhs = rhs" as lhs − (rhs). */
const oneSide = (eq: string): string => {
  const [l, r] = eq.split(/(?<![<>=!])=(?!=)/)
  return r === undefined ? l : `${l} - (${r})`
}

/** The scoreboard class a request is, or null when it is not one the scoreboard measured. */
export function classOf(job: EngineJob, req: EngineRequest): EngineClass | null {
  switch (job) {
    case 'expand': {
      const e = exact(req.expr)
      return e && isPolynomial(e) && lettersOf(e).length === 1 ? 'expand' : null
    }
    case 'factor': {
      const e = exact(req.expr)
      return e && isPolynomial(e) && lettersOf(e).length === 1 ? 'factor over Q' : null
    }
    case 'simplify': {
      const e = exact(req.expr)
      return e && !isPolynomial(e) && lettersOf(e).length === 1 ? 'rational simplification' : null
    }
    case 'apart': {
      const e = exact(req.expr)
      return e && !isPolynomial(e) && lettersOf(e).length === 1 ? 'partial fractions' : null
    }
    case 'diff':
      return req.var && (req.order ?? 1) === 1 && req.at === undefined && exact(req.expr) !== null ? 'derivatives' : null
    case 'solve': {
      const eqs = (req.eqs ?? []).map((q) => exact(oneSide(q)))
      if (!eqs.length || eqs.some((e) => !e || !isPolynomial(e))) return null
      const all = eqs as Exact[]
      if (all.length === 1) {
        const letters = lettersOf(all[0])
        const wanted = req.vars?.length ? req.vars : letters
        return letters.length === 1 && wanted.length === 1 && wanted[0] === letters[0] && degreeOf(all[0]) >= 1 ? 'polynomial equations' : null
      }
      // The evidence: 2 or 3 equations in 2 or 3 letters, every one linear.
      const letters = new Set(all.flatMap(lettersOf)).size
      return all.length <= 3 && letters >= 2 && letters <= 3 && all.every((e) => degreeOf(e) <= 1) && !req.vars?.length ? 'linear systems' : null
    }
  }
  return null
}

type Askable = Exclude<EngineJob, 'integralSteps' | 'diffSteps'>

/** How long the switch waits for Giac before SymPy answers instead. */
const GIAC_LIMIT_MS = 20_000

/**
 * ask, routed: a request in a class given to Giac is asked of Giac and shown only when verify.ts proves it; anything
 * else from Giac falls back to SymPy. Every other request goes to `forJob[job]` (math/engine/index.ts ENGINE_FOR).
 */
export function routedAsk(
  engines: { sympy: MathEngine; giac: MathEngine },
  forClass: Partial<Record<EngineClass, 'sympy' | 'giac'>> = ENGINE_FOR_CLASS,
  forJob: Partial<Record<EngineJob, 'sympy' | 'giac'>> = {},
  giacLimitMs = GIAC_LIMIT_MS
): (job: Askable, req: EngineRequest) => Promise<EngineResult> {
  return async (job, req) => {
    const cls = classOf(job, req)
    if (cls && forClass[cls] === 'giac') {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        // Giac's own client stops a long run; this limit is the switch's own, so a reply that never comes cannot hang.
        const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), giacLimitMs)))
        const answer = await Promise.race([engines.giac.ask(job, req), late])
        if (answer && !answer.error && verifyAnswer(cls, req, answer).mark === 'right') return answer
      } catch {
        // A thrown or stopped Giac answers nothing; SymPy does.
      } finally {
        clearTimeout(timer)
      }
      return engines.sympy.ask(job, req)
    }
    return engines[forJob[job] ?? 'sympy'].ask(job, req)
  }
}
