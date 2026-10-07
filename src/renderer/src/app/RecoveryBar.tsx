import { RotateCcw, X } from 'lucide-react'
import { MAX_COPIES, describeWork, discardRecovery, restoreRecovery, useRecovery } from './autosave'
import { blankSceneFile, useScene } from '../core/store'

/** "Restore your last work" strip, shown while a copy of unsaved work is waiting. */
export function RecoveryBar() {
  const found = useRecovery((s) => s.found)
  const waiting = useRecovery((s) => s.waiting.length)
  const dirty = useScene((s) => s.dirty)
  if (!found) return null
  const when = new Date(found.savedAt)
  const name = found.path ? found.path.split(/[\\/]/).pop() : 'untitled'
  // Only what differs from a new file is named; a title typed into an empty table, say, has
  // nothing to count, and then the time alone has to do.
  const what = describeWork(found.file, blankSceneFile())
  const details = `(${what ? `${what}, ` : ''}${when.toLocaleString()})`
  return (
    <div className="flex items-center gap-3 border-b border-warn/40 bg-warn/10 px-3 py-1.5 text-ink">
      <RotateCcw size={14} />
      <span className="flex-1">
        {found.setAside ? (
          <>
            Your work from before the restore, in <b>{name}</b> {details}, is kept here.
          </>
        ) : (
          <>
            PhysLab closed with unsaved work in <b>{name}</b> {details}.
          </>
        )}
        {' '}It stays until you restore or discard it (PhysLab keeps the newest {MAX_COPIES} copies)
        {dirty ? '; restoring keeps what you have done since as another copy' : ''}.
        {waiting ? ` ${waiting} more ${waiting === 1 ? 'copy' : 'copies'} after this one.` : ''}
      </span>
      <button className="btn h-6 primary" onClick={restoreRecovery}>
        Restore it
      </button>
      <button className="btn h-6" onClick={discardRecovery} title="Throw this copy away">
        <X size={12} /> Discard
      </button>
    </div>
  )
}
