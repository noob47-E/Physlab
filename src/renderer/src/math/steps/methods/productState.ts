// The shared front of the S1c methods (expanding and factorising): a typed product read into factors, and the
// steps and working built from them. A product state is a list of factor texts (check-adapter.ts, productText).
//
// Every step is an ExprEq whose op names what it did and whose data holds the factor lists before and after.
// The sentence and the rule come from the builder (sentences.ts, finishStep): a method never types them.

import type { ExprOp, Step, Working } from '../types'
import { powerBase, productText } from '../check-adapter'
import { finishStep } from '../sentences'

// The reading of a typed product into its factors lives in check-adapter.ts, beside the framework's first-line check
// (startsFromTypedProduct), which must read the typed input the same way the methods do.
export { productFactorsOf } from '../check-adapter'

/** One ExprEq step: it replaces the factors [index, index + width) of the before by the new factors, named by op. */
export function productStep(
  before: string[],
  after: string[],
  index: number,
  width: number,
  op: ExprOp,
  v: string
): Step {
  return finishStep({
    kind: 'ExprEq',
    op,
    before: productText(before),
    after: productText(after),
    sentence: '',
    data: { variable: v, factorsBefore: before, factorsAfter: after, index, width }
  })
}

/** The working of a product method: its steps, with the answer as the last line the steps reach. */
export function productWorking(title: string, input: string, method: string, steps: Step[], v: string): Working {
  const last = steps[steps.length - 1]
  return {
    title,
    input,
    method,
    steps,
    answer: { label: v, tex: String(last.after) }
  }
}

/** True when a factor is a bracket with a power of 2 or more (the power is multiplied out). */
export function isPowerFactor(f: string): boolean {
  return (powerBase(f)?.n ?? 0) >= 2
}

