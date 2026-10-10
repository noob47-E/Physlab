// "Treat as" under the Maths working, and the working's own offers ("Factorise it instead?"): which
// line they work on. Out of panels/Maths.tsx so a test can drive it without the maths field.

import { useCalc } from '../calc/calcStore'
import { tryLatexToMath } from '../math/latexToMath'
import { fieldHasText } from '../math/pure/reveal'
import { usePure } from '../math/pure/store'
import type { JobId } from '../math/pure/run'

/**
 * Works `job` on the line in the field now, converted the way Work it out converts it (the store
 * does it, so a line it cannot read comes back as a sentence). It used to re-run the last line
 * worked out: a student who typed a new line and pressed = got the old line's working again under
 * the new job. With nothing in the field the shown line is worked again, and so it is in BASE-N,
 * whose field holds plain text Work it out does not take.
 */
export function treatAs(job: JobId): void {
  const { input: latex, mode } = useCalc.getState()
  const pure = usePure.getState()
  if (mode !== 'BASE-N' && fieldHasText(latex)) pure.runLatex(latex, job)
  else pure.run(job, pure.input, pure.inputLatex)
}

/**
 * Whether the working on screen is for the line in the field. An empty field, and BASE-N (whose
 * field is not maths), take the working's line; the same maths written with other spacing is the
 * same line.
 */
export function workingIsFor(fieldLatex: string, workingLatex: string, workingInput: string, mode: string): boolean {
  if (mode === 'BASE-N' || !fieldHasText(fieldLatex) || fieldLatex.trim() === workingLatex.trim()) return true
  const bare = (t: string): string => t.replace(/\s+/g, '')
  const src = bare(tryLatexToMath(fieldLatex).src)
  return src !== '' && src === bare(workingInput)
}
