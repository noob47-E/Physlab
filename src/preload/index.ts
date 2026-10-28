import { contextBridge, ipcRenderer } from 'electron'

const api = {
  isDesktop: true,
  isRehearsal: Boolean(
    process.env['PHYSLAB_SMOKE_USERDATA'] ||
    process.env['PHYSLAB_REHEARSE'] ||
    process.argv?.includes('--rehearse')
  ),
  /** No filters: the .phys project dialog. A question file passes its own (.pqjson, .exam) and a title. */
  openFile: (filters?: { name: string; extensions: string[] }[], title?: string): Promise<{ path: string; content: string } | null> =>
    ipcRenderer.invoke('file:open', filters, title),
  saveFile: (content: string, path: string | null): Promise<string | null> =>
    ipcRenderer.invoke('file:save', content, path),
  // Crash recovery: the renderer keeps a copy of unsaved work in the user's data folder.
  autosaveWrite: (content: string): Promise<boolean> => ipcRenderer.invoke('autosave:write', content),
  autosaveRead: (): Promise<string | null> => ipcRenderer.invoke('autosave:read'),
  autosaveClear: (): Promise<boolean> => ipcRenderer.invoke('autosave:clear'),
  /** The copy written as the window closes; a promise would never come back. */
  autosaveWriteSync: (content: string): boolean => ipcRenderer.sendSync('autosave:writeSync', content) as boolean,
  /** Clear recovery copy synchronously on clean exit. */
  autosaveClearSync: (): boolean => ipcRenderer.sendSync('autosave:clearSync') as boolean,
  /** So the window can ask before closing on unsaved work. */
  setDirty: (dirty: boolean): void => ipcRenderer.send('app:dirty', dirty),
  /** The theme's page colour, so the window paints it on the next launch before the page does. */
  setThemeBackground: (hex: string): void => ipcRenderer.send('app:theme', hex),
  saveImage: (dataUrl: string): Promise<string | null> => ipcRenderer.invoke('file:saveImage', dataUrl),
  /** Any text file the renderer makes: a CSV of readings, and whatever is exported next. */
  saveText: (content: string, defaultName: string, filterName: string, ext: string): Promise<string | null> =>
    ipcRenderer.invoke('file:saveText', content, defaultName, filterName, ext),
  /** The window's zoom (Chromium levels: 0 is normal, each step ×1.2). Ctrl+= / Ctrl+- / Ctrl+0 change it too. */
  getZoom: (): Promise<number> => ipcRenderer.invoke('zoom:get'),
  setZoom: (level: number): Promise<number> => ipcRenderer.invoke('zoom:set', level),
  onZoom: (cb: (level: number) => void): (() => void) => {
    const handler = (_e: unknown, level: number) => cb(level)
    ipcRenderer.on('app:zoom', handler)
    return () => ipcRenderer.removeListener('app:zoom', handler)
  },
  aiListModels: (
    modelsDir?: string
  ): Promise<{ filename: string; fullPath: string; sizeBytes: number; sizeFormatted: string }[]> =>
    ipcRenderer.invoke('ai:listModels', modelsDir),
  aiStartServer: (
    modelPath: string,
    port?: number
  ): Promise<{ success: boolean; port: number; error?: string }> =>
    ipcRenderer.invoke('ai:startServer', modelPath, port),
  aiStopServer: (): Promise<boolean> => ipcRenderer.invoke('ai:stopServer'),
  aiGetStatus: (): Promise<{ running: boolean; port: number; modelPath: string | null; defaultDir: string }> =>
    ipcRenderer.invoke('ai:getStatus'),
  aiSelectFolder: (): Promise<string | null> => ipcRenderer.invoke('ai:selectFolder'),
  aiOpenFolder: (folderPath?: string): Promise<void> => ipcRenderer.invoke('ai:openFolder', folderPath),
  ai: {
    chat: async (
      messages: unknown[],
      tools?: unknown[]
    ): Promise<{ ok: boolean; message?: any; model?: string; error?: string }> => {
      const res = (await ipcRenderer.invoke('ai:chat', messages, tools)) as any
      return {
        ok: Boolean(res && res.message && !res.error),
        message: res?.message,
        model: res?.model,
        error: res?.error
      }
    },
    hasKey: (provider?: string): Promise<boolean> => ipcRenderer.invoke('ai:hasKey', provider),
    getConfig: (): Promise<{
      hasAzure: boolean
      hasGemini: boolean
      defaultProvider: 'azure' | 'gemini'
      azureDeployment: string
      mainProvider?: string
      fallbackProvider?: string
      thinking?: 'fast' | 'balanced' | 'deep'
      presets?: Array<{
        id: string
        label: string
        kind: 'openai-compatible' | 'azure' | 'anthropic'
        baseUrl: string
        model: string
        suggestedModels: string[]
        docUrl: string
        supportsTools: boolean
        enabledByDefault: boolean
        requiresKey: boolean
        hasKey: boolean
        note?: string
      }>
      configs?: Record<string, { baseUrl?: string; model?: string; apiVersion?: string }>
    }> => ipcRenderer.invoke('ai:getConfig'),
    setKey: (keyOrProvider: string, maybeKey?: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:setKey', keyOrProvider, maybeKey),
    removeKey: (provider: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:removeKey', provider),
    setProviderConfig: (
      provider: string,
      config: { baseUrl?: string; model?: string; apiVersion?: string }
    ): Promise<boolean> => ipcRenderer.invoke('ai:setProviderConfig', provider, config),
    setActiveProviders: (main: string, fallback?: string): Promise<boolean> =>
      ipcRenderer.invoke('ai:setActiveProviders', main, fallback),
    setThinking: (thinking: 'fast' | 'balanced' | 'deep'): Promise<boolean> =>
      ipcRenderer.invoke('ai:setThinking', thinking),
    testConnection: (
      provider?: string
    ): Promise<{ ok: boolean; message?: string; error?: string }> =>
      ipcRenderer.invoke('ai:testConnection', provider),
    listRemoteModels: (
      provider?: string
    ): Promise<{ ok: boolean; models: string[]; error?: string }> =>
      ipcRenderer.invoke('ai:listRemoteModels', provider),
    transcribe: async (
      dataUrl: string
    ): Promise<{ ok: boolean; text?: string; error?: string }> => {
      const res = (await ipcRenderer.invoke('ai:transcribe', dataUrl)) as any
      return {
        ok: Boolean(res && res.text && !res.error),
        text: res?.text,
        error: res?.error
      }
    }
  }
}

contextBridge.exposeInMainWorld('physlab', api)

export type PhysLabBridge = typeof api
