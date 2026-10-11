export type LabState =
  | 'idle'
  | 'preparing'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exited'
  | 'error'

export type PluginSource =
  | { kind: 'github'; repo: string; tag: string; assetPattern: string }
  | { kind: 'static'; url: string; sha256?: string }

export interface PluginSpec {
  label: string
  fileName: string
  source: PluginSource
}

export interface RecipeConfig {
  properties: Record<string, string | number | boolean>
  ops: string[]
  whitelist: string[]
  plugins: PluginSpec[]
}

export interface LabRecipe {
  id: string
  label: string
  mcVersion: string
  javaMajor: number
  port: number
  onlineMode: boolean
  notes: string
  config: RecipeConfig
}

export interface RecipeStatus {
  recipe: LabRecipe
  state: LabState
  error?: string
}
