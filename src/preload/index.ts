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
  saveImage: (dataUrl: string): Promise<string | null> => ipcRenderer.invoke('file:saveImage', dataUrl),
  /** Any text file the renderer makes: a CSV of readings, and whatever is exported next. */
  saveText: (content: string, defaultName: string, filterName: string, ext: string): Promise<string | null> =>
    ipcRenderer.invoke('file:saveText', content, defaultName, filterName, ext)
}

contextBridge.exposeInMainWorld('physlab', api)

export type PhysLabBridge = typeof api
