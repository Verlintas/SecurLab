import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { EngineEvent, Target } from '../../shared/engineTypes'
import { assertTargetAllowed } from '../settings'
import { chains } from './chains'
import { executeChain, type RunSummary } from './engine'

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

export function startRun(
  chainId: string,
  target: Target,
  params: Record<string, string>
): { runId: string } {
  const chain = chains.find((c) => c.id === chainId)
  if (!chain) throw new Error(`unknown chain: ${chainId}`)
  assertTargetAllowed(target.host)
  if (active.size > 0) throw new Error('another run is already in progress')

  const runId = randomUUID()
  const controller = new AbortController()
  const entry: ActiveRun = { controller }
  active.set(runId, entry)

  void executeChain(chain, target, params, broadcast, controller.signal, runId)
    .then((summary) => {
      entry.summary = summary
    })
    .finally(() => {
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
