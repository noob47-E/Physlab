// Question Author: a teacher writes a question with random numbers, a picture or an experiment
// and the worked steps, and saves the set for a class. The set lives in `questions/authorStore.ts`
// and is saved inside the project, so nothing is lost when "Show it" moves to the Sandbox or the
// app closes; every decision worth trusting (chips, the preview, what a question needs before it
// may leave) is in `questions/authoring.ts`, and this file only lays it out.

import { useState } from 'react'
import { Copy, Download, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useScene } from '../core/store'
import { openQuestionFile, saveTextFile } from '../app/files'
import { loadTeacherFile } from '../questions/bank'
import { broughtInFrom, changeLicence, exportName, joinImported, questionFile, setProblems, writtenHereIds } from '../questions/authoring'
import { currentQuestion, newQuestion, readAuthorName, readWrittenHere, rememberAuthorName, rememberWrittenHere, useAuthor, useAuthorView, type AuthorTab } from '../questions/authorStore'
import { toExam } from '../questions/numbas'
import { blankQuestion, LICENSE_IDS, serializePQFile, type LicenseId } from '../questions/pqjson'
import { AuthorVariables } from './AuthorVariables'
import { AuthorScene } from './AuthorScene'
import { AuthorSolution } from './AuthorSolution'

const TABS: { id: AuthorTab; label: string }[] = [
  { id: 'variables', label: 'Variables' },
  { id: 'scene', label: 'Question & Scene' },
  { id: 'solution', label: 'Solution' }
]

/** What each licence lets a class and other teachers do, in a line. */
const LICENCE_WORDS: Record<LicenseId, string> = {
  'CC BY 4.0': 'Anyone may use and change it, as long as they name you.',
  'CC BY-SA 4.0': 'Anyone may use and change it, naming you, and a changed copy must carry the same licence.',
  'CC0 1.0': 'You give it away: anyone may use it for anything, without naming you.'
}

type Note = { text: string; list?: string[]; error: boolean }

export function Author() {
  const questions = useAuthor((s) => s.questions)
  const current = useAuthor((s) => s.current)
  const q = useAuthor(currentQuestion)
  const { add, addMany, duplicate, remove, select, edit } = useAuthor.getState()
  const tab = useAuthorView((s) => s.tab)
  const setTab = useAuthorView((s) => s.setTab)
  const settings = useScene((s) => s.settings)
  const [name, setName] = useState(readAuthorName)
  const [note, setNote] = useState<Note | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)

  const titleOf = (i: number): string => questions[i]?.title.trim() || `Question ${i + 1} (no title yet)`

  const saveName = (next: string) => {
    const trimmed = next.trim()
    setName(trimmed)
    rememberAuthorName(trimmed)
  }

  const open = async () => {
    const f = await openQuestionFile()
    if (!f) return
    try {
      // The same reader the Practice panel uses: a .exam goes through the Numbas reader and its
      // licence gate, a .pqjson through parsePQFile, which refuses a question with no licence.
      const set = loadTeacherFile(f.content, f.name)
      const incoming = joinImported(useAuthor.getState().questions, set.questions, () => blankQuestion().id, { file: set.title, written: readWrittenHere() })
      addMany(incoming)
      const n = incoming.length
      setNote({ text: `Brought in ${n} ${n === 1 ? 'question' : 'questions'} from ${set.title}.`, list: set.report, error: false })
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  const exportAs = async (ext: 'pqjson' | 'exam') => {
    const all = useAuthor.getState().questions
    const problems = setProblems(all, settings)
    if (problems.length > 0) {
      setNote({ text: 'The set cannot be saved for a class yet:', list: problems, error: true })
      return
    }
    const file = questionFile(all)
    const text = ext === 'pqjson' ? serializePQFile(file) : toExam(file, all[0]?.title.trim() || 'PhysLab questions')
    try {
      const where = await saveTextFile(text, exportName(all, ext), ext === 'pqjson' ? 'PhysLab question set' : 'Numbas exam', ext)
      if (where === null) return
      // Opened again later, these are the teacher's own: their licence stays theirs to change.
      rememberWrittenHere(writtenHereIds(all, ext, text))
      const n = all.length
      const what = `${n} ${n === 1 ? 'question' : 'questions'}`
      const tail = ext === 'pqjson' ? 'Open it in Problem Sets → Question sets to practise it.' : 'It opens in Numbas; pictures, motions and experiments stay behind in PhysLab.'
      setNote({ text: where === 'download' ? `Saved ${what} to your downloads. ${tail}` : `Saved ${what} to ${where}. ${tail}`, error: false })
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  const noteView = note && (
    <div role="status" className={`mx-3 mt-2 rounded-md border px-3 py-2 ${note.error ? 'border-bad/40 bg-bad/5 text-bad' : 'border-line bg-surface-2 text-ink-dim'}`}>
      <div>{note.text}</div>
      {note.list && note.list.length > 0 && (
        <ul className={`mt-1 list-disc space-y-0.5 pl-5 ${note.error ? '' : 'text-warn'}`}>
          {note.list.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
      <button className="btn ghost mt-1 min-h-[44px]" onClick={() => setNote(null)}>
        Close
      </button>
    </div>
  )

  const nameRow = (
    <div className="px-3 pt-1">
      <label className="block text-small text-ink-dim" htmlFor="author-name">
        Your name — every question you start is yours under CC BY 4.0
      </label>
      <input
        id="author-name"
        className="field mt-1 min-h-[44px]"
        defaultValue={name}
        placeholder="e.g. Ms Khan"
        onBlur={(e) => saveName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          e.stopPropagation()
        }}
      />
    </div>
  )

  if (!q) {
    return (
      <div className="panel pb-8">
        <div className="section-title">Question Author</div>
        <div className="px-3 text-ink-dim">
          Write a question once and PhysLab gives every student their own numbers, marks the answer and shows the working. Add a picture, a motion or an experiment to see it,
          and save the set for your class.
        </div>
        {nameRow}
        <div className="mt-3 flex flex-wrap gap-2 px-3">
          <button className="btn primary min-h-[44px]" onClick={() => add(newQuestion(name))}>
            <Plus size={14} /> Write a question
          </button>
          <button className="btn min-h-[44px]" onClick={open}>
            <FolderOpen size={14} /> Open a question file…
          </button>
        </div>
        {noteView}
      </div>
    )
  }

  const imported = broughtInFrom(q)

  return (
    <div className="panel pb-8">
      <div className="section-title">Question Author</div>
      {nameRow}

      <div className="section-title mt-2">This set</div>
      <ol className="space-y-1 px-3" aria-label="Questions in this set">
        {questions.map((item, i) => (
          <li key={item.id} className="flex items-center gap-1">
            <button
              className={`min-h-[44px] flex-1 truncate rounded-md border px-2 text-left ${i === current ? 'border-accent bg-sel text-ink-strong' : 'border-line bg-surface-2 text-ink'}`}
              aria-current={i === current}
              onClick={() => {
                select(i)
                setConfirmRemove(null)
              }}
            >
              {i + 1}. {titleOf(i)}
            </button>
            <button className="icon-btn min-h-[44px] min-w-[44px]" title="Make a copy" aria-label={`Make a copy of ${titleOf(i)}`} onClick={() => duplicate(i)}>
              <Copy size={14} />
            </button>
            <button className="icon-btn min-h-[44px] min-w-[44px]" title="Remove" aria-label={`Remove ${titleOf(i)}`} onClick={() => setConfirmRemove(i)}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ol>
      {confirmRemove !== null && questions[confirmRemove] && (
        <div role="alertdialog" className="mx-3 mt-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-ink">
          Remove “{titleOf(confirmRemove)}” from the set? Files you have already saved do not change.
          <div className="mt-1 flex gap-2">
            <button
              className="btn min-h-[44px]"
              onClick={() => {
                remove(confirmRemove)
                setConfirmRemove(null)
              }}
            >
              Remove it
            </button>
            <button className="btn ghost min-h-[44px]" onClick={() => setConfirmRemove(null)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2 px-3">
        <button className="btn min-h-[44px]" onClick={() => add(newQuestion(name))}>
          <Plus size={14} /> New question
        </button>
        <button className="btn min-h-[44px]" onClick={open}>
          <FolderOpen size={14} /> Open a question file…
        </button>
        <button className="btn primary min-h-[44px]" onClick={() => exportAs('pqjson')}>
          <Download size={14} /> Save the set for Problem Sets
        </button>
        <button className="btn min-h-[44px]" onClick={() => exportAs('exam')}>
          <Download size={14} /> Save as a Numbas exam
        </button>
      </div>
      {noteView}

      <div className="section-title mt-3">Question {current + 1}</div>
      <div className="space-y-2 px-3">
        <label className="block">
          <span className="text-small text-ink-dim">Title</span>
          {/* Controlled, as Credit to is: Ctrl+Z changes the title in the store without changing
              the question, and a box that kept what was typed then saved the old title. */}
          <input
            className="field mt-1 min-h-[44px]"
            value={q.title}
            placeholder="e.g. A braking train"
            onChange={(e) => {
              const title = e.target.value
              edit((d) => {
                d.title = title
              })
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        {imported !== null ? (
          <>
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <span className="text-small text-ink-dim">Licence</span>
              <span className="text-ink">{q.license.id}</span>
              <span className="text-small text-ink-dim">Credit to</span>
              <span className="text-ink">{q.license.holder || 'No name given'}</span>
            </div>
            <div className="text-small text-ink-faint">Brought in from {imported}: it keeps its author’s licence and credit.</div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr] items-center gap-2">
              <label htmlFor={`licence-${q.id}`} className="text-small text-ink-dim">
                Licence
              </label>
              <select
                id={`licence-${q.id}`}
                className="field min-h-[44px]"
                value={q.license.id}
                onChange={(e) => {
                  const id = e.target.value as LicenseId
                  edit((d) => {
                    d.license = changeLicence(d.license, id)
                  })
                }}
              >
                {LICENSE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
              <label htmlFor={`holder-${q.id}`} className="text-small text-ink-dim">
                Credit to
              </label>
              <input
                id={`holder-${q.id}`}
                className="field min-h-[44px]"
                value={q.license.holder}
                placeholder={name || 'Your name'}
                onChange={(e) => {
                  const holder = e.target.value
                  edit((d) => {
                    d.license.holder = holder
                  })
                }}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="text-small text-ink-faint">{LICENCE_WORDS[q.license.id]}</div>
          </>
        )}
      </div>

      <div className="mt-3 px-3">
        <div className="seg flex w-full" role="tablist" aria-label="Parts of the question">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`min-h-[44px] flex-1 ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="mt-2">
        {tab === 'variables' && <AuthorVariables key={q.id} q={q} />}
        {tab === 'scene' && <AuthorScene key={q.id} q={q} />}
        {tab === 'solution' && <AuthorSolution key={q.id} q={q} />}
      </div>
    </div>
  )
}
