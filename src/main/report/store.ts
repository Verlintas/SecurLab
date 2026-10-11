import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { RunRecord, RunSummary, Severity } from '../../shared/engineTypes'

const RUN_ID_PATTERN = /^[0-9a-f-]{36}$/

function reportsDir(): string {
  return join(app.getPath('userData'), 'reports')
}

export function saveRunRecord(record: RunRecord): void {
  const dir = reportsDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${record.runId}.json`), `${JSON.stringify(record, null, 2)}\n`)
}

function summarize(record: RunRecord): RunSummary {
  const severityCounts: Partial<Record<Severity, number>> = {}
  for (const finding of record.findings) {
    severityCounts[finding.severity] = (severityCounts[finding.severity] ?? 0) + 1
  }
  return {
    runId: record.runId,
    chainId: record.chainId,
    chainTitle: record.chainTitle,
    target: record.target,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    findingsTotal: record.findings.length,
    severityCounts
  }
}

export function listRunRecords(): RunSummary[] {
  const dir = reportsDir()
  if (!existsSync(dir)) return []
  const items: RunSummary[] = []
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue
    try {
      const record = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RunRecord
      items.push(summarize(record))
    } catch {
      // skip corrupt records
    }
  }
  return items.sort((a, b) => b.startedAt - a.startedAt)
}

export function getRunRecord(runId: string): RunRecord | null {
  if (!RUN_ID_PATTERN.test(runId)) return null
  try {
    return JSON.parse(readFileSync(join(reportsDir(), `${runId}.json`), 'utf8')) as RunRecord
  } catch {
    return null
  }
}
