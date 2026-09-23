import { useEffect, useRef } from 'react'
import { Eye, ListOrdered, Trash2 } from 'lucide-react'
import { useScene } from '../core/store'
import { Tex } from '../ui/Tex'

export function Console() {
  const log = useScene((s) => s.log)
  const clear = useScene((s) => s.clearLog)
  const showSolution = useScene((s) => s.showSolution)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [log])

  return (
    <div className="panel flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-1 text-fine text-ink-faint">
        Results of everything you type in the command bar
        <div className="flex-1" />
        <button className="btn ghost h-6" onClick={clear}>
          <Trash2 size={12} /> Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {log.length === 0 && <div className="p-4 text-ink-faint">Nothing yet. Try typing <code className="text-warn">A = &lt;3, 4&gt;</code> in the command bar and press Enter.</div>}
        {log.map((e) => (
          <div key={e.id} className="log-entry">
            {/* A line from a button (Break apart, Fuse) has nothing typed: a "› break apart" here
                read as a command the bar would then refuse. */}
            {e.input && <div className="log-in">› {e.input}</div>}
            <div className={`log-out ${e.kind === 'error' ? 'err' : e.kind === 'info' ? 'info' : ''}`}>
              {e.tex ? <Tex tex={e.tex} /> : e.text}
            </div>
            {(e.solution || e.visualize || e.working) && (
              <div className="mt-1 flex gap-1.5 pl-3.5">
                {e.solution && (
                  <button className="btn h-6" onClick={() => showSolution(e.solution!)}>
                    <ListOrdered size={12} /> Steps
                  </button>
                )}
                {e.working && (
                  <button className="btn h-6" onClick={e.working}>
                    <ListOrdered size={12} /> Working
                  </button>
                )}
                {e.visualize && (
                  <button className="btn h-6" onClick={e.visualize}>
                    <Eye size={12} /> Visualize
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
