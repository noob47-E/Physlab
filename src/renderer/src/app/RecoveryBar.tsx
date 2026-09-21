import { RotateCcw, X } from 'lucide-react'
import { clearAutosave, useRecovery } from './autosave'
import { scene, useScene } from '../core/store'

/** "Restore your last work" strip, shown when the app finds unsaved work from a previous run. */
export function RecoveryBar() {
  const found = useRecovery((s) => s.found)
  const set = useRecovery((s) => s.set)
  if (!found) return null
  const when = new Date(found.savedAt)
  const name = found.path ? found.path.split(/[\\/]/).pop() : 'untitled'
  return (
    <div className="flex items-center gap-3 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-ink">
      <RotateCcw size={14} />
      <span className="flex-1">
        PhysLab closed with unsaved work in <b>{name}</b> ({found.file.objects.length} objects
        {found.file.sandbox ? `, a sandbox with ${found.file.sandbox.bodies.length} things` : ''}, {when.toLocaleString()}).
      </span>
      <button
        className="btn h-6 primary"
        onClick={() => {
          scene().loadScene(found.file, found.path ?? null)
          // Restored work is still unsaved work: keep protecting it until the student saves.
          useScene.setState({ dirty: true })
          set(null)
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
