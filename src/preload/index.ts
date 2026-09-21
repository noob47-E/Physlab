import { contextBridge, ipcRenderer } from 'electron'

const api = {
  isDesktop: true,
  openFile: (): Promise<{ path: string; content: string } | null> => ipcRenderer.invoke('file:open'),
  saveFile: (content: string, path: string | null): Promise<string | null> =>
    ipcRenderer.invoke('file:save', content, path),
  // Crash recovery: the renderer keeps a copy of unsaved work in the user's data folder.
  autosaveWrite: (content: string): Promise<boolean> => ipcRenderer.invoke('autosave:write', content),
  autosaveRead: (): Promise<string | null> => ipcRenderer.invoke('autosave:read'),
  autosaveClear: (): Promise<boolean> => ipcRenderer.invoke('autosave:clear'),
  /** The copy written as the window closes; a promise would never come back. */
  autosaveWriteSync: (content: string): boolean => ipcRenderer.sendSync('autosave:writeSync', content) as boolean,
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
  }
}

contextBridge.exposeInMainWorld('physlab', api)

export type PhysLabBridge = typeof api
