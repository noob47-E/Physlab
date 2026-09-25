// Class Results — a teacher's own mode. It reads the .pqresult files a class saved from Problem
// Sets ("Save my results for my teacher") and shows what questions/results.ts works out from
// them: how many attempted each part, its facility, its corrected point-biserial and its D27, with
// a plain flag where one is worth a teacher's attention. Nothing here reads or writes anything but
// the files a teacher explicitly opens and, if they press it, the CSV they explicitly save —
// itemStats() runs entirely on this computer (results.ts imports nothing; tests/results.test.ts
// checks that itself), and the panel says so.

import { useMemo, useState, type ReactNode } from 'react'
import { Download, Upload, X } from 'lucide-react'
import { itemStats, parseResultFile, serializeResultFile, type ItemStat, type PQResultFile } from '../questions/results'
import { fmt } from '../math/format'
import { loadBundled } from '../questions/bank'
import { useAuthor } from '../questions/authorStore'
import type { PQQuestion } from '../questions/pqjson'

/** Only the one call this panel needs from the desktop bridge; declared locally (as app/files.ts
 *  does for the same bridge) rather than reaching into src/preload, which is outside this track. */
type Bridge = { openFile: (filters?: { name: string; extensions: string[] }[], title?: string) => Promise<{ path: string; content: string } | null> }

const RESULT_FILTERS = [{ name: 'PhysLab result file', extensions: ['pqresult'] }]

export interface OpenedFile {
  /**
   * What the file *is*: its parsed content written back out in PhysLab's own canonical form. Two
   * files are the same exactly when this matches — never by path or name, because Practice saves
   * every student's file under the set's title (a whole class's files share one name), while the
   * same student's file downloaded twice sits at two paths and must not count as two students.
   */
  id: string
  /** The path on the desktop, or the file's name in a browser: only ever shown, never compared. */
  name: string
  file: PQResultFile
}

/**
 * Adds one picked file to those already open, or says in one sentence why it cannot be — text
 * that is not a result file (parseResultFile's own sentence), a file already open (the same
 * content, whatever its name or path), or a file from a different question set. Question ids are
 * shared between sets, so two sets' files would pool one part's answers against totals from two
 * different tests, and its r_pb and D27 would mean nothing; one set at a time keeps them honest.
 */
export function addResultFile(opened: readonly OpenedFile[], name: string, text: string): { files: OpenedFile[] } | { error: string } {
  let file: PQResultFile
  try {
    file = parseResultFile(text)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'That is not a PhysLab result file.' }
  }
  const id = serializeResultFile(file)
  if (opened.some((f) => f.id === id)) return { error: 'This result file is already open.' }
  if (opened.length > 0 && opened[0].file.setId !== file.setId) {
    return { error: `"${file.setTitle}" is from a different question set from the files already open — close them to look at that set.` }
  }
  return { files: [...opened, { id, name, file }] }
}

/**
 * Picks `.pqresult` files: the desktop Open dialog, filtered to this one extension, or a browser
 * file input (several files at once) where there is no `window.physlab` bridge — the same
 * two-branch shape as `openQuestionFile` in app/files.ts. The desktop bridge's file:open returns a
 * single path, so there a class is opened one file per press until main gains a multi-select open.
 */
async function pickResultFiles(): Promise<{ name: string; content: string }[]> {
  const bridge = (window as unknown as { physlab?: Bridge }).physlab
  if (bridge) {
    const r = await bridge.openFile(RESULT_FILTERS, 'Open result files')
    return r ? [{ name: r.path, content: r.content }] : []
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = '.pqresult,application/json'
    input.onchange = async () => {
      const list = Array.from(input.files ?? [])
      resolve(await Promise.all(list.map(async (f) => ({ name: f.name, content: await f.text() }))))
    }
    // A cancelled picker fires no change in every browser; `cancel` is the one that says so
    // (the same reason app/files.ts's openQuestionFile listens for it).
    input.addEventListener('cancel', () => resolve([]))
    input.click()
  })
}

/** Facility as a whole-number percentage, through math/format.ts like every other number here. */
const pct = (v: number): string => `${fmt(v * 100, 0)}%`
/** r_pb and D27 to 2 dp. Rounded first, so a value too small to matter reads 0 rather than fmt's
 *  scientific form (which it keeps for |x| < 10⁻⁴); null means itemStats has nothing to report
 *  (too few files, or no spread to correlate) and is shown as "—" rather than a misleading number. */
const corr = (v: number | null): string => (v === null ? '—' : fmt(Math.round(v * 100) / 100, 2))

/**
 * One row per question part, the parts a class struggled with most at the top — worst facility
 * first, since that is what a teacher opens this panel to find — and the author's own order
 * breaking any tie, so the table never reorders itself between two files that tie by chance.
 */
export function sortedStats(files: readonly PQResultFile[]): ItemStat[] {
  return [...itemStats(files)].sort(
    (a, b) => a.facility - b.facility || a.questionId.localeCompare(b.questionId) || a.partIndex - b.partIndex
  )
}

/**
 * What a teacher calls each question: its title, looked up by id among the questions this
 * computer has (the bundled banks, the Question Author's set), in that order of preference —
 * never the internal id "physlab-fields-centripetal-acceleration", which wrapped over three lines
 * of the side panel. An id nothing here knows (a set from another computer) stays as it is.
 */
export function questionTitles(ids: readonly string[], sources: readonly (readonly PQQuestion[])[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const id of ids) {
    const q = sources.flatMap((qs) => qs.filter((x) => x.id === id))[0]
    const title = q?.title.trim()
    out.set(id, title ? title : id)
  }
  return out
}

/** The questions this computer knows by id: the bundled banks and the Question Author's set. */
function knownQuestions(): PQQuestion[][] {
  let bundled: PQQuestion[] = []
  try {
    bundled = loadBundled().questions
  } catch {
    // A damaged bundled bank is Practice's to report; here the ids simply stay ids.
  }
  return [bundled, useAuthor.getState().questions]
}

const csvField = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
/** A number a spreadsheet can sort and average: fmt's digits, but an ASCII minus (fmt writes
 *  U+2212, which Excel reads as text) and an empty cell, not "—", where there is no number. */
const csvNum = (v: number | null): string => (v === null ? '' : corr(v).replace('−', '-'))

/** Headings written out in words, since a spreadsheet has no key under its table. */
export const CSV_HEADER = [
  'Question',
  'Question id',
  'Part',
  'Attempted',
  'Facility (share right first time)',
  'Point-biserial correlation (corrected)',
  'Discrimination D27 (top 27% minus bottom 27%)',
  'Flag'
]

/**
 * The table as shown, as a CSV a teacher can open in a spreadsheet. It starts with a byte-order
 * mark: without one, Excel on Windows reads UTF-8 as the local code page and the flag's em dash
 * turns into "â€”".
 */
export function statsToCsv(rows: readonly ItemStat[], titles: ReadonlyMap<string, string> = new Map()): string {
  const lines = rows.map((r) =>
    [titles.get(r.questionId) ?? r.questionId, r.questionId, String(r.partIndex + 1), String(r.attempted), pct(r.facility), csvNum(r.rpb), csvNum(r.d27), r.flag ?? '']
      .map(csvField)
      .join(',')
  )
  return String.fromCharCode(0xfeff) + [CSV_HEADER.map(csvField).join(','), ...lines].join('\r\n')
}

export function ClassResults() {
  const [files, setFiles] = useState<OpenedFile[]>([])
  const [errors, setErrors] = useState<{ name: string; text: string }[]>([])

  const rows = useMemo(() => sortedStats(files.map((f) => f.file)), [files])
  const titles = useMemo(() => questionTitles([...new Set(rows.map((r) => r.questionId))], knownQuestions()), [rows])

  const open = async () => {
    setErrors([])
    const picked = await pickResultFiles()
    if (picked.length === 0) return
    // Each file is added to the ones before it, so two copies picked together are caught too.
    let next = files
    const refused: { name: string; text: string }[] = []
    for (const p of picked) {
      const r = addResultFile(next, p.name, p.content)
      if ('error' in r) refused.push({ name: p.name, text: r.error })
      else next = r.files
    }
    setFiles(next)
    setErrors(refused)
  }

  const remove = (id: string) => setFiles((fs) => fs.filter((f) => f.id !== id))

  // app/files.ts reads `window.physlab` at module scope (a shared file this track does not own),
  // so a plain top-level import would crash the moment a test imports this panel for its pure
  // functions (AGENTS.md's "dev-only global" trap); a dynamic import only ever runs from a click.
  const exportCsv = () => {
    void import('../app/files').then(({ saveTextFile }) => saveTextFile(statsToCsv(rows, titles), 'class-results.csv', 'CSV file', 'csv'))
  }

  return (
    <div className="panel pb-8">
      <div className="section-title">Class results</div>
      <div className="px-3 text-ink-dim">
        Open the result files your class saved from Problem Sets (each ends in .pqresult). Everything here is worked out on
        this computer from the files you open — PhysLab never sends a result file, or anything it works out from one,
        anywhere.
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 px-3">
        <button className="btn min-h-[44px]" onClick={() => void open()}>
          <Upload size={13} /> Open result files
        </button>
        {rows.length > 0 && (
          <button className="btn min-h-[44px]" onClick={exportCsv} title="Save this table as a .csv file">
            <Download size={13} /> Save as CSV
          </button>
        )}
      </div>

      {errors.length > 0 && (
        <div className="mx-3 mt-2 flex flex-col gap-1 text-bad">
          {errors.map((e, i) => (
            <div key={i} className="[overflow-wrap:anywhere]">
              {errors.length > 1 && <span className="font-semibold">{e.name}: </span>}
              {e.text}
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 px-3">
          {files.map((f) => (
            <span key={f.id} className="badge flex items-center gap-1">
              <span className="max-w-48 truncate" title={f.name}>
                {f.file.student ?? f.name}
              </span>
              <button className="icon-btn min-h-[44px] min-w-[44px]" title="Close this file" onClick={() => remove(f.id)}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      {files.length > 0 && <div className="mx-3 mt-2 text-ink-dim">Question set: {files[0].file.setTitle}</div>}

      {files.length === 0 ? (
        <div className="px-3 py-6 text-ink-faint">Open a result file to see how your class did, part by part.</div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-6 text-ink-faint">Nobody attempted a part in {files.length === 1 ? 'this file' : 'these files'} yet.</div>
      ) : (
        <div className="mt-3 overflow-x-auto px-3">
          {/* Sized to the side panel (about 390 px at 1366 px wide): the question's title takes
              what is left and wraps, the numbers take their own width, and a flag gets a line of
              its own under its row across the full width — nothing a teacher needs is off to the
              side. The title keeps 88 px so it never collapses to nothing; only a panel dragged
              narrower than the table scrolls sideways. */}
          <div className="grid gap-1" style={{ gridTemplateColumns: 'minmax(88px, 1fr) repeat(5, auto)' }}>
            <HeadCell>Question</HeadCell>
            <HeadCell num>Part</HeadCell>
            <HeadCell num>Attempted</HeadCell>
            <HeadCell num>Facility</HeadCell>
            <HeadCell num>
              r<sub>pb</sub>
            </HeadCell>
            <HeadCell num>D27</HeadCell>
            {rows.map((r) => (
              <Row key={`${r.questionId}\u0000${r.partIndex}`} row={r} title={titles.get(r.questionId) ?? r.questionId} />
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1 text-fine text-ink-dim">
            <div>Facility — the share of the class who got the part right first time.</div>
            <div>
              r<sub>pb</sub> — how well the part agrees with the rest of the test: 0.2 or more is good, below 0.2 is weak.
            </div>
            <div>D27 — the top 27 % of the class’s share right first time, minus the bottom 27 %’s: 0.2 or more is good.</div>
            <div>“—” means there are too few files, or everyone did the same, to work it out.</div>
          </div>
        </div>
      )}
    </div>
  )
}

function HeadCell({ children, num }: { children: ReactNode; num?: boolean }) {
  return <div className={`px-2 py-1 text-fine font-semibold text-ink-faint ${num ? 'text-right' : ''}`}>{children}</div>
}

/** A read-only cell: bordered like a field but free to grow, so wrapped text stays inside it
 *  (.field fixes its height at 24 px, and a long id or flag ran over the next row). */
const CELL = 'min-h-[24px] rounded border border-line bg-input px-2 py-1'
const NUM = `${CELL} num text-right whitespace-nowrap`

function Row({ row, title }: { row: ItemStat; title: string }) {
  return (
    <>
      <div className={`${CELL} min-w-0 break-words`}>{title}</div>
      <div className={NUM}>{row.partIndex + 1}</div>
      <div className={NUM}>{row.attempted}</div>
      <div className={NUM}>{pct(row.facility)}</div>
      <div className={NUM}>{corr(row.rpb)}</div>
      <div className={NUM}>{corr(row.d27)}</div>
      {row.flag && <div className={`${CELL} col-span-full mb-1 text-warn`}>{row.flag}</div>}
    </>
  )
}
