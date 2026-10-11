import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { ChainDTO, EngineEvent, ModuleDTO } from '../shared/engineTypes'
import type { ForensicsReport } from '../shared/forensics'

const versionArg = process.argv.find((arg) => arg.startsWith('--securlab-version='))
const appVersion = versionArg ? versionArg.split('=')[1] : 'dev'

const api = {
  platform: process.platform,
  version: appVersion,
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
    openDir: (id = ''): Promise<{ opened: boolean; error: string }> =>
      ipcRenderer.invoke('lab:open-dir', id),
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
    modules: (): Promise<ModuleDTO[]> => ipcRenderer.invoke('engine:modules'),
    run: (
      chainId: string,
      host: string,
      port: number,
      params: Record<string, string>
    ): Promise<{ runId: string }> => ipcRenderer.invoke('engine:run', chainId, host, port, params),
    runModule: (
      moduleId: string,
      host: string,
      port: number,
      params: Record<string, string>
    ): Promise<{ runId: string }> =>
      ipcRenderer.invoke('engine:run-module', moduleId, host, port, params),
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
  },
  env: {
    paths: (): Promise<{ userData: string; labData: string }> =>
      ipcRenderer.invoke('env:paths')
  },
  reports: {
    list: () => ipcRenderer.invoke('reports:list'),
    get: (runId: string) => ipcRenderer.invoke('reports:get', runId),
    delete: (runId: string): Promise<boolean> => ipcRenderer.invoke('reports:delete', runId),
    export: (runId: string, format: 'html' | 'md') =>
      ipcRenderer.invoke('reports:export', runId, format)
  },
  forensics: {
    pick: (): Promise<string | null> => ipcRenderer.invoke('forensics:pick'),
    analyze: (path: string): Promise<ForensicsReport> =>
      ipcRenderer.invoke('forensics:analyze', path),
    exportMd: (
      report: ForensicsReport,
      defaultName: string
    ): Promise<{ saved: boolean; path?: string }> =>
      ipcRenderer.invoke('forensics:export', report, defaultName)
  }
}

contextBridge.exposeInMainWorld('securlab', api)
