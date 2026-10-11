import type { ChainDTO, EngineEvent, ModuleDTO, RunRecord, RunSummary } from '../shared/engineTypes'
import type { ForensicsReport } from '../shared/forensics'

export {}

export interface LabRecipeDTO {
  id: string
  label: string
  mcVersion: string
  javaMajor: number
  port: number
  onlineMode: boolean
  notes: string
}

export interface RecipeStatusDTO {
  recipe: LabRecipeDTO
  state: string
  error?: string
}

export interface JavaInstallDTO {
  path: string
  major: number
  version: string
}

export interface SettingsDTO {
  allowlist: string[]
  rateLimit: number
  authorized: boolean
}

declare global {
  interface Window {
    securlab: {
      platform: string
      version: string
      versions: {
        electron: string
        chrome: string
        node: string
      }
      lab: {
        list: () => Promise<RecipeStatusDTO[]>
        start: (id: string) => Promise<RecipeStatusDTO>
        stop: (id: string) => Promise<RecipeStatusDTO>
        reset: (id: string) => Promise<RecipeStatusDTO>
        java: () => Promise<JavaInstallDTO[]>
        openDir: (id?: string) => Promise<{ opened: boolean; error: string }>
        onLog: (callback: (payload: { id: string; line: string }) => void) => () => void
        onState: (
          callback: (payload: { id: string; state: string; error?: string }) => void
        ) => () => void
      }
      engine: {
        chains: () => Promise<ChainDTO[]>
        modules: () => Promise<ModuleDTO[]>
        run: (
          chainId: string,
          host: string,
          port: number,
          params?: Record<string, string>
        ) => Promise<{ runId: string }>
        runModule: (
          moduleId: string,
          host: string,
          port: number,
          params?: Record<string, string>
        ) => Promise<{ runId: string }>
        abort: (runId: string) => Promise<boolean>
        onEvent: (callback: (event: EngineEvent) => void) => () => void
      }
      settings: {
        get: () => Promise<SettingsDTO>
        set: (patch: Partial<SettingsDTO>) => Promise<SettingsDTO>
      }
      env: {
        paths: () => Promise<{ userData: string; labData: string }>
      }
      reports: {
        list: () => Promise<RunSummary[]>
        get: (runId: string) => Promise<RunRecord | null>
        delete: (runId: string) => Promise<boolean>
        export: (
          runId: string,
          format: 'html' | 'md'
        ) => Promise<{ saved: boolean; path?: string }>
      }
      forensics: {
        pick: () => Promise<string | null>
        analyze: (path: string) => Promise<ForensicsReport>
        exportMd: (
          report: ForensicsReport,
          defaultName: string
        ) => Promise<{ saved: boolean; path?: string }>
      }
    }
  }
}
