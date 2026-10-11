import type { EngineEvent, Finding, Target } from '../../shared/engineTypes'

export type { ChainDTO, EngineEvent, Finding, RunStatus, Severity, Target } from '../../shared/engineTypes'

export interface RunState {
  evidence: Record<string, unknown>
  lastStatus: 'passed' | 'failed' | 'skipped'
}

export interface RunContext {
  runId: string
  target: Target
  signal: AbortSignal
  state: RunState
  log: (line: string) => void
  evidence: (key: string, value: unknown) => void
  finding: (finding: Finding) => void
}

export interface EngineModule {
  id: string
  title: string
  run: (ctx: RunContext) => Promise<void>
}

export interface ChainStep {
  id: string
  module: string
  title?: string
  when?: (state: RunState) => boolean
}

export interface ChainDefinition {
  id: string
  title: string
  description: string
  steps: ChainStep[]
}

export type Emit = (event: EngineEvent) => void
