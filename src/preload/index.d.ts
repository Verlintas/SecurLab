import type { ChainDTO, EngineEvent } from '../shared/engineTypes'

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
        onLog: (callback: (payload: { id: string; line: string }) => void) => () => void
        onState: (
          callback: (payload: { id: string; state: string; error?: string }) => void
        ) => () => void
      }
      engine: {
        chains: () => Promise<ChainDTO[]>
        run: (chainId: string, host: string, port: number) => Promise<{ runId: string }>
        abort: (runId: string) => Promise<boolean>
        onEvent: (callback: (event: EngineEvent) => void) => () => void
      }
      settings: {
        get: () => Promise<SettingsDTO>
        set: (patch: Partial<SettingsDTO>) => Promise<SettingsDTO>
      }
    }
  }
}
