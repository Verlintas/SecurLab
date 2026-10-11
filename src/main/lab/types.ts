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
  | { kind: 'jenkins'; jobUrl: string; artifactPattern: string }
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
  /** Files written into the server directory before each start (e.g. partial plugin configs). */
  configFiles?: { path: string; content: string }[]
  /**
   * Patches applied after the server has started (so plugin config migrations have
   * already run), optionally followed by console commands such as `authme reload`.
   */
  runtimePatches?: { file: string; patches: { path: string[]; value: string }[] }[]
  postStartCommands?: string[]
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
