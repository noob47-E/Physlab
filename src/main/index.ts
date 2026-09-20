import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import { extname, join, normalize, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { copyFile, mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'

// Custom scheme so the production renderer gets fetch/WASM/worker support and
// cross-origin isolation headers (file:// cannot provide either).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

// Always render on the discrete GPU (RTX).
app.commandLine.appendSwitch('force_high_performance_gpu')
if (process.env['PHYSLAB_SWIFTSHADER']) {
  // Worst-case test: software rendering, like a PC with no usable graphics driver.
  app.commandLine.appendSwitch('use-angle', 'swiftshader')
  app.commandLine.appendSwitch('enable-unsafe-swiftshader')
  app.commandLine.appendSwitch('disable-features', 'Vulkan')
}
if (process.env['PHYSLAB_BENCH'] || process.env['PHYSLAB_SANDBOX']) {
  // Keep full frame rate even when another window covers PhysLab during a benchmark.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.whl': 'application/zip',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

function registerAppProtocol(): void {
  const root = normalize(join(__dirname, '../renderer'))
  protocol.handle('app', async (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const file = normalize(join(root, pathname))
    // relative() handles Windows drive-letter case, where startsWith can wrongly refuse every file.
    const rel = relative(root, file)
    if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) return new Response('Forbidden', { status: 403 })
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    headers.set('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream')
    for (const [k, v] of Object.entries(ISOLATION_HEADERS)) headers.set(k, v)
    return new Response(res.body, { status: res.status, headers })
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1680,
    height: 1020,
    minWidth: 1100,
    minHeight: 700,
    title: 'PhysLab',
    // Packaged builds use the icon embedded in the .exe.
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    backgroundColor: '#161618',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      // Benchmarks must keep rendering even when the window is covered by other windows.
      backgroundThrottling: !process.env['PHYSLAB_BENCH'] && !process.env['PHYSLAB_SANDBOX']
    }
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  // The X button used to discard unsaved work without a word. The renderer says when there is
  // any; the autosave copy is written on the way out either way.
  win.on('close', (e) => {
    if (!dirty) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Close anyway', 'Keep working'],
      defaultId: 1,
      cancelId: 1,
      message: 'PhysLab has unsaved work.',
      detail: 'It will be offered back next time you open PhysLab, but it is not saved in a file. Press Ctrl+S first to keep it.'
    })
    if (choice !== 0) e.preventDefault()
  })

  // PHYSLAB_LOG=1 mirrors renderer warnings/errors to the terminal (useful for diagnosing GPU issues).
  if (process.env['PHYSLAB_LOG']) {
    win.webContents.on('console-message', (details) => {
      const d = details as unknown as { level: string | number; message: string }
      if (d.level === 'warning' || d.level === 'error' || (typeof d.level === 'number' && d.level >= 2)) {
        console.log(`[renderer ${d.level}] ${d.message.slice(0, 400)}`)
      } else if (/PHYSLAB_CHECK|Loaded mpmath/.test(d.message)) {
        console.log(`[renderer] ${d.message}`)
      }
    })
  }

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12') {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen())
      event.preventDefault()
    }
  })

  // PHYSLAB_BENCH=1000000 opens straight into the GPU particle benchmark.
  // PHYSLAB_FORCE_WEBGL=1 tests the path used by computers without WebGPU.
  const hash = process.env['PHYSLAB_BENCH']
    ? `#bench=${process.env['PHYSLAB_BENCH']}`
    : process.env['PHYSLAB_SANDBOX']
      ? '#sandbox=1'
      : ''
  const query = process.env['PHYSLAB_FORCE_WEBGL'] ? '?webgl=1' : ''
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl + query + hash)
  } else {
    win.loadURL(`app://physlab/index.html${query}${hash}`)
  }
}

let dirty = false
ipcMain.on('app:dirty', (_e, value: boolean) => {
  dirty = !!value
})

ipcMain.handle('file:open', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open PhysLab project',
    filters: [{ name: 'PhysLab project', extensions: ['phys'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  return { path, content: await readFile(path, 'utf8') }
})

ipcMain.handle('file:save', async (_e, content: string, path: string | null) => {
  let target = path
  if (!target) {
    const result = await dialog.showSaveDialog({
      title: 'Save PhysLab project',
      defaultPath: 'untitled.phys',
      filters: [{ name: 'PhysLab project', extensions: ['phys'] }]
    })
    if (result.canceled || !result.filePath) return null
    target = result.filePath
  }
  // Write beside the file first, then swap it in, so a crash cannot leave a half-written project.
  const tmp = `${target}.saving`
  await writeFile(tmp, content, 'utf8')
  try {
    await rename(tmp, target)
  } catch {
    // Windows refuses the swap while a backup tool or virus scanner holds the file open.
    // Copying over it is not atomic, but losing the student's work would be worse.
    await copyFile(tmp, target)
    await unlink(tmp).catch(() => {})
  }
  return target
})

ipcMain.handle('file:saveImage', async (_e, dataUrl: string) => {
  const result = await dialog.showSaveDialog({
    title: 'Save the drawing as an image',
    defaultPath: 'physlab.png',
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'))
  return result.filePath
})

/**
 * Saving any piece of text the renderer has made — a CSV of lab readings today, a worksheet or a
 * LaTeX snippet tomorrow. The other save handlers each hardcode one extension, which is why there
 * was no way to write a file that is not a project or a picture.
 */
ipcMain.handle('file:saveText', async (_e, content: string, defaultName: string, filterName: string, ext: string) => {
  const result = await dialog.showSaveDialog({
    title: 'Save as',
    defaultPath: defaultName,
    filters: [
      { name: filterName, extensions: [ext] },
      { name: 'All files', extensions: ['*'] }
    ]
  })
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
})

// ---------------------------------------------------------------------------
// Crash recovery: one rolling copy of unsaved work
// ---------------------------------------------------------------------------

const autosaveDir = () => join(app.getPath('userData'), 'autosave')
const autosaveFile = () => join(autosaveDir(), 'latest.phys')

ipcMain.handle('autosave:write', async (_e, content: string) => {
  try {
    await mkdir(autosaveDir(), { recursive: true })
    const tmp = `${autosaveFile()}.saving`
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, autosaveFile())
    return true
  } catch {
    return false
  }
})

ipcMain.on('autosave:writeSync', (e, content: string) => {
  try {
    mkdirSync(autosaveDir(), { recursive: true })
    const tmp = `${autosaveFile()}.saving`
    writeFileSync(tmp, content, 'utf8')
    renameSync(tmp, autosaveFile())
    e.returnValue = true
  } catch {
    e.returnValue = false
  }
})

ipcMain.handle('autosave:read', async () => {
  try {
    return await readFile(autosaveFile(), 'utf8')
  } catch {
    return null
  }
})

ipcMain.handle('autosave:clear', async () => {
  try {
    await rm(autosaveFile(), { force: true })
    return true
  } catch {
    return false
  }
})

app.whenReady().then(() => {
  registerAppProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
