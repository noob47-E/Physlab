// G3b: the scoreboard's judge. An engine's answer is proved or refused by the app's own verification
// (src/renderer/src/math/engine/verify.ts, G2's checkers and each class's form) — the same code that decides, in the
// app, whether a Giac answer may be shown (G4). 'right' is a proof, 'wrong' a proof or a clear numeric witness, and
// anything the checkers cannot decide is 'unverified', counted apart and never as right. The key is used once more
// after a 'right': if the answer disagrees with it, the checker and the key cannot both be right, and the item is
// marked wrong for a person to look at (docs/knowledge/scoreboard.md).

import { expressionEqual } from '../../../src/renderer/src/math/check/checkers'
import { exactDigits, verifyAnswer, ENGINE_CLASSES, type EngineClass, type Judgement } from '../../../src/renderer/src/math/engine/verify'
import type { EngineJob, EngineRequest, EngineResult } from '../../../src/renderer/src/math/engine/types'

export { exactDigits } from '../../../src/renderer/src/math/engine/verify'
export type { Judgement, Mark } from '../../../src/renderer/src/math/engine/verify'

interface JudgeItem {
  class: string
  question: string
  answer: string
}

/** The engine job for each scoreboard class. */
export const JOB_FOR: Record<EngineClass, EngineJob> = {
  expand: 'expand',
  'factor over Q': 'factor',
  'polynomial equations': 'solve',
  'linear systems': 'solve',
  'rational simplification': 'simplify',
  derivatives: 'diff',
  'partial fractions': 'apart'
}

/** The request the app would send for a corpus question. */
export function requestFor(item: { class: string; question: string }): EngineRequest {
  if (item.class === 'linear systems') return { eqs: item.question.split(',').map((s) => s.trim()), vars: [], deg: false }
  if (item.class === 'polynomial equations') return { eqs: [item.question], vars: ['x'], deg: false }
  if (item.class === 'derivatives') return { expr: item.question, var: 'x', order: 1, deg: false }
  return { expr: item.question, deg: false }
}

/** The key's expression, without "; excluded: …". */
const keyExpression = (key: string): string => key.split(';')[0].trim()

const KEYED: readonly string[] = ['expand', 'factor over Q', 'rational simplification', 'derivatives', 'partial fractions']

export function judgeAnswer(item: JudgeItem, result: EngineResult): Judgement {
  if (!(ENGINE_CLASSES as readonly string[]).includes(item.class)) return { mark: 'unverified', why: `no judge for the class ${item.class}` }
  const j = verifyAnswer(item.class as EngineClass, requestFor(item), result)
  // After a right, the key must agree; if it does not, the checker or the key is wrong and a person must look.
  if (j.mark === 'right' && item.answer && KEYED.includes(item.class)) {
    if (expressionEqual(exactDigits(result.text ?? ''), exactDigits(keyExpression(item.answer))) === 'different') {
      return { mark: 'wrong', why: `${j.why}, but the key differs: checker or key is wrong` }
    }
  }
  return j
}
