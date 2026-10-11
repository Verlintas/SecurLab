import type { ChainParamDTO, EngineEvent, Finding, Target } from '../../shared/engineTypes'

export type { ChainDTO, EngineEvent, Finding, RunStatus, Severity, Target } from '../../shared/engineTypes'

export interface RunState {
  evidence: Record<string, unknown>
  lastStatus: 'passed' | 'failed' | 'skipped'
}

export interface RunContext {
  runId: string
  target: Target
  params: Record<string, string>
  signal: AbortSignal
  state: RunState
  log: (line: string) => void
  evidence: (key: string, value: unknown) => void
  finding: (finding: Finding) => void
}

export interface EngineModule {
  id: string
  title: string
  /** Destructive modules mutate the target (lava, mass-op); the engine only runs them on local/lab targets. */
  destructive?: boolean
  run: (ctx: RunContext) => Promise<void>
}

export interface ChainStep {
  id: string
  module: string
  title?: string
  when?: (state: RunState) => boolean
  continueOnError?: boolean
}

export interface ChainDefinition {
  id: string
  title: string
  description: string
  params?: ChainParamDTO[]
  steps: ChainStep[]
}

export type Emit = (event: EngineEvent) => void
