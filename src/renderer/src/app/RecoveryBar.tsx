import { RotateCcw, X } from 'lucide-react'
import { clearAutosave, useRecovery } from './autosave'
import { scene } from '../core/store'

/** "Restore your last work" strip, shown when the app finds unsaved work from a previous run. */
export function RecoveryBar() {
  const found = useRecovery((s) => s.found)
  const set = useRecovery((s) => s.set)
  if (!found) return null
  const when = new Date(found.savedAt)
  const name = found.path ? found.path.split(/[\\/]/).pop() : 'untitled'
  return (
    <div className="flex items-center gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-100">
      <RotateCcw size={14} />
      <span className="flex-1">
        PhysLab closed with unsaved work in <b>{name}</b> ({found.file.objects.length} objects, {when.toLocaleString()}).
      </span>
      <button
        className="btn h-6 primary"
        onClick={() => {
          scene().loadScene(found.file, found.path ?? null)
          set(null)
          void clearAutosave()
        }}
      >
        Restore it
      </button>
      <button
        className="btn h-6"
        onClick={() => {
          set(null)
          void clearAutosave()
        }}
        title="Throw the recovered copy away"
      >
        <X size={12} /> Discard
      </button>
    </div>
  )
}
