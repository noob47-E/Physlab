import { scene } from '../core/store'
import type { SceneFile } from '../core/types'

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
    const file = JSON.parse(content) as SceneFile
    if (file.app !== 'PhysLab') throw new Error('Not a PhysLab project')
    scene().loadScene(file, path)
    scene().pushLog({ input: 'open', kind: 'info', text: `Opened ${path}` })
  } catch (e) {
    scene().pushLog({ input: 'open', kind: 'error', text: `Could not open: ${String(e)}` })
  }
}

export async function saveProject(saveAs = false) {
  const s = scene()
  const content = JSON.stringify(s.serialize(), null, 1)
  if (bridge) {
    const path = await bridge.saveFile(content, saveAs ? null : s.filePath)
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
