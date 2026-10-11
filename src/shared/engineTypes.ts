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

export interface ChainParamDTO {
  name: string
  labelKey: string
  placeholder?: string
  defaultValue?: string
}

export interface ChainDTO {
  id: string
  title: string
  description: string
  params?: ChainParamDTO[]
  steps: ChainStepDTO[]
}

export interface ModuleParamDTO {
  name: string
  labelKey: string
  placeholder?: string
  defaultValue?: string
}

export interface ModuleDTO {
  id: string
  title: string
  category: string
  description: string
  destructive: boolean
  params: ModuleParamDTO[]
}

export type EngineEvent =
  | { type: 'run:start'; runId: string; chainId: string; target: Target }
  | { type: 'run:end'; runId: string; status: RunStatus; findings: number; error?: string }
  | { type: 'step:start'; runId: string; stepId: string; module: string; title: string }
  | { type: 'step:log'; runId: string; stepId: string; line: string }
  | { type: 'step:end'; runId: string; stepId: string; status: StepStatus; error?: string }
  | { type: 'evidence'; runId: string; stepId: string; key: string; value: unknown }
  | { type: 'finding'; runId: string; stepId: string; finding: Finding }

export interface RunStepRecord {
  id: string
  module: string
  title: string
  status: StepStatus
  logs: string[]
  evidence: { key: string; value: unknown }[]
  error?: string
  startedAt: number
  endedAt?: number
}

export interface RunRecord {
  runId: string
  chainId: string
  chainTitle: string
  chainDescription: string
  target: Target
  params: Record<string, string>
  startedAt: number
  endedAt?: number
  status: RunStatus
  steps: RunStepRecord[]
  findings: Finding[]
  error?: string
}

export interface RunSummary {
  runId: string
  chainId: string
  chainTitle: string
  target: Target
  status: RunStatus
  startedAt: number
  endedAt?: number
  findingsTotal: number
  severityCounts: Partial<Record<Severity, number>>
}
