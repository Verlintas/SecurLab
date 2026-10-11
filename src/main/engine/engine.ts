import type { ChainDefinition, Emit, RunContext, RunState, Target } from './types'
import type { Finding, RunStatus } from '../../shared/engineTypes'
import { isLocalHost } from '../../shared/net'
import { modules } from './chains'

export interface RunSummary {
  status: RunStatus
  findings: Finding[]
  error?: string
}

export async function executeChain(
  chain: ChainDefinition,
  target: Target,
  params: Record<string, string>,
  emit: Emit,
  signal: AbortSignal,
  runId: string
): Promise<RunSummary> {
  const findings: Finding[] = []
  const state: RunState = { evidence: {}, lastStatus: 'skipped' }
  let status: RunStatus = 'passed'
  let error: string | undefined

  emit({ type: 'run:start', runId, chainId: chain.id, target })

  for (const step of chain.steps) {
    if (signal.aborted) break

    const module = modules.find((m) => m.id === step.module)
    const title = step.title ?? module?.title ?? step.module
    emit({ type: 'step:start', runId, stepId: step.id, module: step.module, title })

    if (step.when && !step.when(state, params)) {
      state.lastStatus = 'skipped'
      emit({ type: 'step:end', runId, stepId: step.id, status: 'skipped' })
      continue
    }

    if (!module) {
      state.lastStatus = 'failed'
      status = 'failed'
      error = `unknown module: ${step.module}`
      emit({ type: 'step:end', runId, stepId: step.id, status: 'failed', error })
      break
    }

    if (module.destructive && !isLocalHost(target.host)) {
      state.lastStatus = 'failed'
      status = 'failed'
      error = `refusing destructive module "${step.module}" on non-local target ${target.host} — destructive impact modules are lab-only`
      emit({ type: 'step:end', runId, stepId: step.id, status: 'failed', error })
      break
    }

    const ctx: RunContext = {
      runId,
      target,
      params,
      signal,
      state,
      log: (line) => emit({ type: 'step:log', runId, stepId: step.id, line }),
      evidence: (key, value) => {
        state.evidence[key] = value
        emit({ type: 'evidence', runId, stepId: step.id, key, value })
      },
      finding: (finding) => {
        findings.push(finding)
        emit({ type: 'finding', runId, stepId: step.id, finding })
      }
    }

    try {
      await module.run(ctx)
      state.lastStatus = 'passed'
      emit({ type: 'step:end', runId, stepId: step.id, status: 'passed' })
    } catch (err) {
      state.lastStatus = 'failed'
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
      emit({ type: 'step:end', runId, stepId: step.id, status: 'failed', error })
      if (!step.continueOnError) break
    }
  }

  if (signal.aborted && status !== 'failed') status = 'aborted'

  emit({ type: 'run:end', runId, status, findings: findings.length, error })
  return { status, findings, error }
}
