import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChainDTO, EngineEvent } from '../shared/engineTypes'

const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  lab: {
    list: () => ipcRenderer.invoke('lab:list'),
    start: (id: string) => ipcRenderer.invoke('lab:start', id),
    stop: (id: string) => ipcRenderer.invoke('lab:stop', id),
    reset: (id: string) => ipcRenderer.invoke('lab:reset', id),
    java: () => ipcRenderer.invoke('env:java'),
    onLog: (callback: (payload: { id: string; line: string }) => void) => {
      const listener = (_event: IpcRendererEvent, payload: { id: string; line: string }): void =>
        callback(payload)
      ipcRenderer.on('lab:log', listener)
      return () => {
        ipcRenderer.removeListener('lab:log', listener)
      }
    },
    onState: (
      callback: (payload: { id: string; state: string; error?: string }) => void
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { id: string; state: string; error?: string }
      ): void => callback(payload)
      ipcRenderer.on('lab:state', listener)
      return () => {
        ipcRenderer.removeListener('lab:state', listener)
      }
    }
  },
  engine: {
    chains: (): Promise<ChainDTO[]> => ipcRenderer.invoke('engine:chains'),
    run: (chainId: string, host: string, port: number): Promise<{ runId: string }> =>
      ipcRenderer.invoke('engine:run', chainId, host, port),
    abort: (runId: string): Promise<boolean> => ipcRenderer.invoke('engine:abort', runId),
    onEvent: (callback: (event: EngineEvent) => void) => {
      const listener = (_event: IpcRendererEvent, payload: EngineEvent): void => callback(payload)
      ipcRenderer.on('run:event', listener)
      return () => {
        ipcRenderer.removeListener('run:event', listener)
      }
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch: unknown) => ipcRenderer.invoke('settings:set', patch)
  }
}

contextBridge.exposeInMainWorld('securlab', api)
