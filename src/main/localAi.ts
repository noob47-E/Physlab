import { app, dialog, ipcMain, shell } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface ModelInfo {
  filename: string
  fullPath: string
  sizeBytes: number
  sizeFormatted: string
}

let activeProcess: ChildProcess | null = null
let currentModelPath: string | null = null
let currentPort = 8080

const defaultModelsDir = (): string => join(homedir(), 'PhysLab', 'models')
const defaultBinDir = (): string => join(homedir(), 'PhysLab', 'bin')

async function listGgufModels(dir?: string): Promise<ModelInfo[]> {
  const targetDir = dir || defaultModelsDir()
  if (!existsSync(targetDir)) return []
  try {
    const files = await readdir(targetDir)
    const models: ModelInfo[] = []
    for (const file of files) {
      if (file.toLowerCase().endsWith('.gguf')) {
        const fullPath = join(targetDir, file)
        const s = await stat(fullPath)
        const sizeGb = Math.round((s.size / (1024 * 1024 * 1024)) * 100) / 100
        models.push({
          filename: file,
          fullPath,
          sizeBytes: s.size,
          sizeFormatted: `${sizeGb} GB`
        })
      }
    }
    return models
  } catch {
    return []
  }
}

function stopLocalAiServer(): boolean {
  if (activeProcess) {
    try {
      activeProcess.kill('SIGTERM')
      setTimeout(() => {
        if (activeProcess && !activeProcess.killed) {
          activeProcess.kill('SIGKILL')
        }
      }, 1000)
    } catch {
      // ignore
    }
    activeProcess = null
    currentModelPath = null
    return true
  }
  return false
}

function startLocalAiServer(
  modelPath: string,
  port = 8080
): Promise<{ success: boolean; port: number; error?: string }> {
  stopLocalAiServer()

  return new Promise((resolve) => {
    const binDir = defaultBinDir()
    const serverExe = join(binDir, 'llama-server.exe')

    if (!existsSync(serverExe)) {
      resolve({
        success: false,
        port,
        error: `Engine runner not found at: ${serverExe}`
      })
      return
    }

    if (!existsSync(modelPath)) {
      resolve({ success: false, port, error: `Model file not found: ${modelPath}` })
      return
    }

    try {
      const proc = spawn(
        serverExe,
        ['-m', modelPath, '-c', '4096', '-ngl', '99', '--port', String(port), '--host', '127.0.0.1'],
        {
          windowsHide: true,
          detached: false
        }
      )

      activeProcess = proc
      currentModelPath = modelPath
      currentPort = port

      proc.on('error', (err) => {
        activeProcess = null
        currentModelPath = null
        resolve({ success: false, port, error: err.message })
      })

      // Give server 1.5s to initialize and verify process is alive
      setTimeout(() => {
        if (activeProcess && !activeProcess.killed) {
          resolve({ success: true, port })
        } else {
          resolve({ success: false, port, error: 'Local model engine stopped unexpectedly' })
        }
      }, 1500)
    } catch (err) {
      resolve({ success: false, port, error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export function registerLocalAiIpc(electronApp: typeof app): void {
  ipcMain.handle('ai:listModels', async (_e, dir?: string) => {
    return await listGgufModels(dir)
  })

  ipcMain.handle('ai:startServer', async (_e, modelPath: string, port?: number) => {
    return await startLocalAiServer(modelPath, port ?? 8080)
  })

  ipcMain.handle('ai:stopServer', () => {
    return stopLocalAiServer()
  })

  ipcMain.handle('ai:getStatus', () => {
    return {
      running: activeProcess !== null && !activeProcess.killed,
      port: currentPort,
      modelPath: currentModelPath,
      defaultDir: defaultModelsDir()
    }
  })

  ipcMain.handle('ai:selectFolder', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Select Folder Containing .gguf Models',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths.length) return null
    return res.filePaths[0]
  })

  ipcMain.handle('ai:openFolder', async (_e, folderPath?: string) => {
    const p = folderPath || defaultModelsDir()
    await shell.openPath(p)
  })

  electronApp.on('before-quit', () => {
    stopLocalAiServer()
  })
}
