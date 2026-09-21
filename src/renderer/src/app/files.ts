import { scene } from '../core/store'
import { parseSceneFile } from '../core/migrate'
import { openFailureText, saveFailureText } from '../core/fileErrors'

type Bridge = {
  isDesktop: boolean
  openFile: () => Promise<{ path: string; content: string } | null>
  saveFile: (content: string, path: string | null) => Promise<string | null>
}

const bridge = (window as unknown as { physlab?: Bridge }).physlab

export async function openProject() {
  if (scene().dirty && !confirm('Discard unsaved changes?')) return
  if (bridge) {
    const r = await bridge.openFile()
    if (!r) return
    load(r.content, r.path)
    return
  }
  // Browser fallback.
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.phys,application/json'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (f) load(await f.text(), f.name)
  }
  input.click()
}

function load(content: string, path: string) {
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
