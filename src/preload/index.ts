import { contextBridge, ipcRenderer } from 'electron'

const api = {
  isDesktop: true,
  openFile: (): Promise<{ path: string; content: string } | null> => ipcRenderer.invoke('file:open'),
  saveFile: (content: string, path: string | null): Promise<string | null> =>
    ipcRenderer.invoke('file:save', content, path)
}

contextBridge.exposeInMainWorld('physlab', api)

export type PhysLabBridge = typeof api
