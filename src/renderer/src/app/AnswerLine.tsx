// One line under the command bar: the bar's newest answer or message, and the buttons the Console
// gives it. The Console stays in the View menu for every earlier line.

import { Eye, ListOrdered } from 'lucide-react'
import { useScene } from '../core/store'
import { Tex } from '../ui/Tex'
import { ANSWER_COLOUR, answerLineOf } from './answerLineOf'
import { showBeside, showPanel } from './panels'
import { useApp } from './modes'

/** Bring the drawing into view after a Visualize: beside the Maths screen in the Calculator. */
const showDrawing = (): void => (useApp.getState().mode === 'calculator' ? showBeside('viewport', 'maths') : showPanel('viewport'))

// 44 px on a touch screen, the app's usual compact height with a mouse.
const BTN = 'btn h-6 shrink-0 px-2 text-fine pointer-coarse:min-h-[44px]'

/** `editedSince`: the newest Console entry when the student last changed the bar (see answerLineOf). */
export function AnswerLine({ editedSince = null }: { editedSince?: number | null }) {
  const log = useScene((s) => s.log)
  const showSolution = useScene((s) => s.showSolution)
  const line = answerLineOf(log, editedSince)
  if (!line) return null
  const last = log[log.length - 1]
  return (
    <div className="flex min-h-7 items-center gap-2 border-b border-[var(--line)] bg-[var(--bg-1)] px-3 py-0.5" role="status" aria-live="polite">
      <div className="min-w-0 flex-1 truncate text-small" style={{ color: ANSWER_COLOUR[line.kind] }} title={line.text}>
        {line.tex ? <Tex tex={line.tex} /> : line.text}
      </div>
      {line.steps && (
        <button className={BTN} onClick={() => showSolution(last.solution!)}>
          <ListOrdered size={12} /> Steps
        </button>
      )}
      {line.working && (
        <button className={BTN} onClick={last.working} title="Open the step-by-step working for this line in the Maths screen">
          <ListOrdered size={12} /> Show the working
        </button>
      )}
      {line.visualize && (
        <button
          className={BTN}
          onClick={() => {
            last.visualize!()
            showDrawing()
          }}
        >
          <Eye size={12} /> Visualize
        </button>
      )}
      <button className={`${BTN} ghost`} title="Every answer so far, in the Console" onClick={() => showPanel('console')}>
        Console
      </button>
    </div>
  )
}
