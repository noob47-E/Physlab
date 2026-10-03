import { scene } from '../core/store'
import { parseSceneFile } from '../core/migrate'
import { openFailureText, saveFailureText } from '../core/fileErrors'
import { RESULT_FORMAT } from '../questions/results'
import { HIDDEN_MODES, type ModeId } from './modes'

type Bridge = {
  isDesktop: boolean
  openFile: (filters?: { name: string; extensions: string[] }[], title?: string) => Promise<{ path: string; content: string } | null>
  saveFile: (content: string, path: string | null) => Promise<string | null>
}

const bridge = (window as unknown as { physlab?: Bridge }).physlab

const QUESTION_FILE_FILTERS = [{ name: 'Question file', extensions: ['pqjson', 'exam'] }]

export async function openProject() {
  if (scene().dirty && !confirm('Discard unsaved changes?')) return
  if (bridge) {
    const r = await bridge.openFile()
    if (!r) return
    loadProjectText(r.content, r.path)
    return
  }
  // Browser fallback.
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.phys,application/json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (f) loadProjectText(await f.text(), f.name)
  }
  input.click()
}

/**
 * Picks a question file — a PhysLab `.pqjson` or a Numbas `.exam` — and hands back its name and
 * text for the Practice panel to read; the open scene is never touched, so nothing unsaved is at
 * risk and there is nothing to confirm. Same two branches as openProject: the desktop bridge, or a
 * file input in the browser build. Null when the student cancels.
 */
export async function openQuestionFile(): Promise<{ name: string; content: string } | null> {
  if (bridge) {
    // Its own filters: with none the dialog is the .phys project one, and a .pqjson or .exam
    // could not even be seen in it.
    const r = await bridge.openFile(QUESTION_FILE_FILTERS, 'Open a question file')
    return r ? { name: r.path, content: r.content } : null
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pqjson,.exam,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      resolve(f ? { name: f.name, content: await f.text() } : null)
    }
    // A cancelled picker fires no change in every browser; `cancel` is the one that says so.
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

const CLASS_RESULTS_NOT_HERE = 'Class results are not in this version of PhysLab.'

// The two marks of a result file, looked for in its text rather than parsed out of it: this file
// keeps its own JSON parsing out (tests/persistence.test.ts), so no parser message can reach the
// console, and a look at the text cannot throw. A project or a question file never has both as
// keys: a quote inside one of its strings is escaped, so the same words typed in a label do not match.
const RESULT_APP = /"app"\s*:\s*"PhysLab"/
const RESULT_MARK = new RegExp(`"format"\\s*:\\s*"${RESULT_FORMAT}"`)

/**
 * A sentence for a file that belongs to a mode this build keeps out of reach, or null when the file
 * is fine to open. Class Results is the only such mode with a file of its own that a student can be
 * handed (a `.pqresult`, saved from Problem Sets). Opened without this it was only "This is not a
 * PhysLab project" (or "…question file"), which sends a student looking for what they did wrong. A
 * renamed result file is still one, so what is inside counts as well as the name.
 */
export function hiddenModeFileText(name: string, content: string, hidden: ReadonlySet<ModeId> = HIDDEN_MODES): string | null {
  if (!hidden.has('results')) return null
  if (/\.pqresult$/i.test(name) || (RESULT_APP.test(content) && RESULT_MARK.test(content))) return CLASS_RESULTS_NOT_HERE
  return null
}

/**
 * Opens the text of a project file. Both ways of picking one end here, and a file that belongs to a
 * hidden mode is refused first, in a sentence, with nothing loaded and the mode left as it was.
 * Exported so a test can cross this boundary without a dialog.
 */
export function loadProjectText(content: string, path: string) {
  const refused = hiddenModeFileText(path, content)
  if (refused) {
    scene().pushLog({ input: 'open', kind: 'error', text: refused })
    return
  }
  try {
    // parseSceneFile says in a sentence what is wrong with a half-copied or foreign file; parsing
    // the text here used to put "SyntaxError: Unexpected end of JSON input" in the console.
    scene().loadScene(parseSceneFile(content), path)
    scene().pushLog({ input: 'open', kind: 'info', text: `Opened ${path}` })
  } catch (e) {
    scene().pushLog({ input: 'open', kind: 'error', text: openFailureText(path, e) })
  }
}

export async function saveProject(saveAs = false) {
  const s = scene()
  const content = JSON.stringify(s.serialize(), null, 1)
  if (bridge) {
    let path: string | null
    try {
      path = await bridge.saveFile(content, saveAs ? null : s.filePath)
    } catch (e) {
      s.pushLog({ input: 'save', kind: 'error', text: saveFailureText(e) })
      return
    }
    if (path) {
      s.markSaved(path)
      s.pushLog({ input: 'save', kind: 'info', text: `Saved ${path}` })
    }
    return
  }
  const blob = new Blob([content], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'scene.phys'
  a.click()
  s.markSaved('scene.phys')
}

export function newProject() {
  if (scene().dirty && !confirm('Discard unsaved changes?')) return
  scene().newScene()
}

type TextBridge = { saveText?: (content: string, defaultName: string, filterName: string, ext: string) => Promise<string | null> }

/**
 * Saves a piece of text the app has made — readings as CSV today, more later. On the desktop the
 * user picks where it goes; in the browser build it comes down as an ordinary download, which is
 * the same two branches saveViewportImage uses.
 */
export async function saveTextFile(content: string, defaultName: string, filterName = 'CSV file', ext = 'csv'): Promise<string | null> {
  const api = (window as unknown as { physlab?: TextBridge }).physlab
  if (api?.saveText) return api.saveText(content, defaultName, filterName, ext)
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = defaultName
  a.click()
  // The browser hands the file to the download folder, so there is no path to report back.
  URL.revokeObjectURL(a.href)
  return 'download'
}
