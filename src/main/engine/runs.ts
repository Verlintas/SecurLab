import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { EngineEvent, RunRecord, Target } from '../../shared/engineTypes'
import { saveRunRecord } from '../report/store'
import { assertTargetAllowed } from '../settings'
import { chains, singleModuleChain } from './chains'
import { executeChain, type RunSummary } from './engine'
import type { ChainDefinition } from './types'

interface ActiveRun {
  controller: AbortController
  summary?: RunSummary
}

const active = new Map<string, ActiveRun>()

function broadcast(event: EngineEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('run:event', event)
  }
}

function recordEvent(record: RunRecord, event: EngineEvent): void {
  switch (event.type) {
    case 'step:start':
      record.steps.push({
        id: event.stepId,
        module: event.module,
        title: event.title,
        status: 'running',
        logs: [],
        evidence: [],
        startedAt: Date.now()
      })
      break
    case 'step:log': {
      const step = record.steps.find((s) => s.id === event.stepId)
      if (step) step.logs.push(event.line)
      break
    }
    case 'step:end': {
      const step = record.steps.find((s) => s.id === event.stepId)
      if (step) {
        step.status = event.status
        step.error = event.error
        step.endedAt = Date.now()
      }
      break
    }
    case 'evidence': {
      const step = record.steps.find((s) => s.id === event.stepId)
      if (step) step.evidence.push({ key: event.key, value: event.value })
      break
    }
    case 'finding':
      record.findings.push(event.finding)
      break
    case 'run:end':
      record.status = event.status
      record.endedAt = Date.now()
      record.error = event.error
      break
    case 'run:start':
      break
  }
}

export function startRun(
  chainId: string,
  target: Target,
  params: Record<string, string>
): { runId: string } {
  const chain = chains.find((c) => c.id === chainId)
  if (!chain) throw new Error(`unknown chain: ${chainId}`)
  return beginRun(chain, target, params)
}

export function startModuleRun(
  moduleId: string,
  target: Target,
  params: Record<string, string>
): { runId: string } {
  const chain = singleModuleChain(moduleId)
  if (!chain) throw new Error(`unknown module: ${moduleId}`)
  return beginRun(chain, target, params)
}

function beginRun(
  chain: ChainDefinition,
  target: Target,
  params: Record<string, string>
): { runId: string } {
  assertTargetAllowed(target.host)
  if (active.size > 0) throw new Error('another run is already in progress')

  const runId = randomUUID()
  const controller = new AbortController()
  const entry: ActiveRun = { controller }
  active.set(runId, entry)

  const record: RunRecord = {
    runId,
    chainId: chain.id,
    chainTitle: chain.title,
    chainDescription: chain.description,
    target,
    params,
    startedAt: Date.now(),
    status: 'error',
    steps: [],
    findings: []
  }

  const onEvent = (event: EngineEvent): void => {
    if (event.runId !== runId) return
    recordEvent(record, event)
    broadcast(event)
  }

  void executeChain(chain, target, params, onEvent, controller.signal, runId)
    .then((summary) => {
      entry.summary = summary
    })
    .finally(() => {
      try {
        saveRunRecord(record)
      } catch {
        // report persistence is best-effort
      }
      active.delete(runId)
    })

  return { runId }
}

export function abortRun(runId: string): boolean {
  const entry = active.get(runId)
  if (!entry) return false
  entry.controller.abort()
  return true
}
