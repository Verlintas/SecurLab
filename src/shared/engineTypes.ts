export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type StepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped'

export type RunStatus = 'passed' | 'failed' | 'aborted' | 'error'

export interface Target {
  host: string
  port: number
}

export interface Finding {
  id: string
  severity: Severity
  title: string
  detail: string
  evidence?: Record<string, unknown>
}

export interface ChainStepDTO {
  id: string
  module: string
  title: string
}

export interface ChainDTO {
  id: string
  title: string
  description: string
  steps: ChainStepDTO[]
}

export type EngineEvent =
  | { type: 'run:start'; runId: string; chainId: string; target: Target }
  | { type: 'run:end'; runId: string; status: RunStatus; findings: number; error?: string }
  | { type: 'step:start'; runId: string; stepId: string; module: string; title: string }
  | { type: 'step:log'; runId: string; stepId: string; line: string }
  | { type: 'step:end'; runId: string; stepId: string; status: StepStatus; error?: string }
  | { type: 'evidence'; runId: string; stepId: string; key: string; value: unknown }
  | { type: 'finding'; runId: string; stepId: string; finding: Finding }
