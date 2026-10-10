import { scene } from '../core/store'
import { parseProjectText } from '../core/migrate'
import { openFailureText, saveFailureText } from '../core/fileErrors'
import { isResultFileText } from '../questions/results'
import { pickFile, saveBlob } from './download'

const bridge = window.physlab

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
  const f = await pickFile('.phys,application/json')
  if (f) loadProjectText(await f.text(), f.name)
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
  const f = await pickFile('.pqjson,.exam,application/json')
  return f ? { name: f.name, content: await f.text() } : null
}

const CLASS_RESULTS_NOT_HERE = 'Class results are not part of PhysLab.'

/**
 * A sentence for a class-results file (a `.pqresult`, which builds before 0.9 saved from Problem
 * Sets), or null when the file is fine to open. Opened without this it was only "This is not a
 * PhysLab project" (or "…question file"), which sends a student looking for what they did wrong. A
 * renamed result file is still one, so what is inside counts as well as the name.
 */
export function classResultsFileText(name: string, content: string): string | null {
  return isResultFileText(name, content) ? CLASS_RESULTS_NOT_HERE : null
}

/**
 * Opens the text of a project file. Both ways of picking one end here, and a file that belongs to a
 * hidden mode is refused first, in a sentence, with nothing loaded and the mode left as it was.
 * Exported so a test can cross this boundary without a dialog.
 */
export function loadProjectText(content: string, path: string) {
  const refused = classResultsFileText(path, content)
  if (refused) {
    scene().pushLog({ input: 'open', kind: 'error', text: refused })
    return
  }
  try {
    // parseProjectText says in a sentence what is wrong with a half-copied file and loadScene's own
    // migrate with a foreign one; parsing the text here used to put "SyntaxError: Unexpected end of
    // JSON input" in the console. The raw object is handed over, not the migrated scene: loadScene
    // checks raw.questions for a Question Author set, which migrate leaves out (F2).
    scene().loadScene(parseProjectText(content), path)
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
  saveBlob(new Blob([content], { type: 'application/json' }), 'scene.phys')
  s.markSaved('scene.phys')
}

export function newProject() {
  if (scene().dirty && !confirm('Discard unsaved changes?')) return
  scene().newScene()
}

/**
 * Saves a piece of text the app has made — readings as CSV today, more later. On the desktop the
 * user picks where it goes; in the browser build it comes down as an ordinary download, which is
 * the same two branches saveViewportImage uses.
 */
export async function saveTextFile(content: string, defaultName: string, filterName = 'CSV file', ext = 'csv'): Promise<string | null> {
  const api = window.physlab
  if (api?.saveText) return api.saveText(content, defaultName, filterName, ext)
  saveBlob(new Blob([content], { type: 'text/plain;charset=utf-8' }), defaultName)
  // The browser hands the file to the download folder, so there is no path to report back.
  return 'download'
}
