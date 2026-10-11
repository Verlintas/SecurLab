import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Circle, Download, FileText, Loader2, Minus, Trash2, X } from 'lucide-react'
import type {
  RunRecord,
  RunStatus,
  RunSummary,
  Severity,
  StepStatus
} from '../../../shared/engineTypes'
import { Chip, PageHeader, Panel, SeverityBadge } from '../components/ui'

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

const statusTone: Record<RunStatus, 'default' | 'red' | 'green' | 'amber'> = {
  passed: 'green',
  failed: 'red',
  aborted: 'amber',
  error: 'red'
}

function severityTone(s: Severity): 'default' | 'red' | 'green' | 'amber' | 'blue' {
  if (s === 'critical' || s === 'high') return 'red'
  if (s === 'medium') return 'amber'
  if (s === 'low') return 'blue'
  return 'default'
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 size={12} className="animate-spin text-accent2" />
  if (status === 'passed') return <Check size={12} className="text-ok" />
  if (status === 'failed') return <X size={12} className="text-accent2" />
  if (status === 'skipped') return <Minus size={12} className="text-muted" />
  return <Circle size={8} className="text-white/25" />
}

export default function Reports() {
  const { t } = useTranslation()
  const [summaries, setSummaries] = useState<RunSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [record, setRecord] = useState<RunRecord | null>(null)
  const [exportMsg, setExportMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const runLabel = (chainId: string, fallback: string): string =>
    chainId.startsWith('module:')
      ? t(`run.moduleNames.${chainId.slice(7).replace(/\./g, '_')}`, { defaultValue: fallback })
      : t(`run.chainNames.${chainId}`, { defaultValue: fallback })

  const refresh = useCallback(async (): Promise<void> => {
    const list = await window.securlab.reports.list()
    setSummaries(list)
    setSelectedId((current) =>
      current && list.some((s) => s.runId === current) ? current : (list[0]?.runId ?? null)
    )
  }, [])

  useEffect(() => {
    void refresh()
    const off = window.securlab.engine.onEvent((event) => {
      if (event.type === 'run:end') void refresh()
    })
    return off
  }, [refresh])

  useEffect(() => {
    if (!selectedId) {
      setRecord(null)
      return
    }
    void window.securlab.reports.get(selectedId).then(setRecord)
  }, [selectedId])

  const removeRun = async (runId: string, event: MouseEvent): Promise<void> => {
    event.stopPropagation()
    if (!window.confirm(t('reports.confirmDelete'))) return
    await window.securlab.reports.delete(runId)
    setExportMsg('')
    await refresh()
  }

  const doExport = async (format: 'html' | 'md'): Promise<void> => {
    if (!selectedId) return
    setBusy(true)
    setExportMsg('')
    try {
      const result = await window.securlab.reports.export(selectedId, format)
      if (result.saved && result.path) setExportMsg(t('reports.exported', { path: result.path }))
    } catch (error) {
      setExportMsg(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const recordFindingSummary = record
    ? record.findings.reduce(
        (acc, finding) => {
          acc[finding.severity]++
          return acc
        },
        { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<Severity, number>
      )
    : null

  return (
    <div>
      <PageHeader index="04" kicker={t('nav.reports')} heading={t('pages.reports.subtitle')} />

      <div className="grid grid-cols-3 gap-4">
        <Panel className="col-span-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <span className="font-mono text-xs text-muted">{t('reports.runs')}</span>
            <Chip>{summaries.length}</Chip>
          </div>
          <div className="max-h-[640px] overflow-y-auto">
            {summaries.length === 0 ? (
              <p className="p-4 text-xs leading-5 text-muted">{t('reports.empty')}</p>
            ) : (
              summaries.map((summary) => (
                <div
                  key={summary.runId}
                  className={`group flex w-full items-stretch border-b border-white/5 transition-colors last:border-0 ${
                    selectedId === summary.runId ? 'bg-white/5' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <button
                    onClick={() => setSelectedId(summary.runId)}
                    className="min-w-0 flex-1 px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-200">
                        {runLabel(summary.chainId, summary.chainTitle)}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">
                        {summary.target.host}:{summary.target.port}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Chip tone={statusTone[summary.status]}>
                        {t(`run.runStatus.${summary.status}`)}
                      </Chip>
                      <span className="font-mono text-[10px] text-muted">
                        {new Date(summary.startedAt).toLocaleString()}
                      </span>
                    </div>
                    {summary.findingsTotal > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {severityOrder
                          .filter((severity) => summary.severityCounts[severity])
                          .map((severity) => (
                            <span key={severity} className="font-mono text-[10px] text-muted">
                              {severity}:{summary.severityCounts[severity]}
                            </span>
                          ))}
                      </div>
                    ) : null}
                  </button>
                  <button
                    onClick={(e) => void removeRun(summary.runId, e)}
                    title={t('reports.delete')}
                    className="flex w-10 shrink-0 items-center justify-center text-muted opacity-0 transition-all group-hover:opacity-100 hover:text-accent2"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel className="col-span-2 p-5">
          {record ? (
            <div>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-white">
                    {runLabel(record.chainId, record.chainTitle)}
                  </h3>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {record.target.host}:{record.target.port} ·{' '}
                    {new Date(record.startedAt).toLocaleString()}
                    {record.endedAt
                      ? ` · ${t('reports.duration')} ${formatDuration(record.endedAt - record.startedAt)}`
                      : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void doExport('html')}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent2 transition-colors hover:bg-accent/20 disabled:opacity-35"
                  >
                    <Download size={12} />
                    HTML
                  </button>
                  <button
                    onClick={() => void doExport('md')}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-white/25 hover:text-white disabled:opacity-35"
                  >
                    <FileText size={12} />
                    Markdown
                  </button>
                  <button
                    onClick={(e) => void removeRun(record.runId, e)}
                    className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-accent/50 hover:text-accent2"
                  >
                    <Trash2 size={12} />
                    {t('reports.delete')}
                  </button>
                </div>
              </div>

              {Object.keys(record.params).length > 0 ? (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[10px] text-muted">{t('reports.params')}:</span>
                  {Object.entries(record.params)
                    .filter(([, value]) => value.length > 0)
                    .map(([key, value]) => (
                      <Chip key={key}>
                        {key}={value}
                      </Chip>
                    ))}
                </div>
              ) : null}

              {exportMsg ? (
                <p className="mb-3 font-mono text-[11px] break-all text-ok">{exportMsg}</p>
              ) : null}

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted uppercase">
                  {t('run.findings')} · {record.findings.length}
                </h4>
                <div className="flex flex-wrap items-center gap-1">
                  {recordFindingSummary
                    ? severityOrder
                        .filter((severity) => recordFindingSummary[severity] > 0)
                        .map((severity) => (
                          <Chip key={severity} tone={severityTone(severity)}>
                            {recordFindingSummary[severity]} {t(`severity.${severity}`)}
                          </Chip>
                        ))
                    : null}
                </div>
              </div>
              {record.findings.length === 0 ? (
                <p className="text-xs text-muted">{t('run.noFindings')}</p>
              ) : (
                <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                  {record.findings.map((finding, index) => (
                    <div key={`${finding.id}-${index}`} className="rounded-lg border border-edge p-3">
                      <div className="mb-1 flex items-start gap-2">
                        <SeverityBadge s={finding.severity} />
                        <span className="text-xs font-medium text-neutral-200">{finding.title}</span>
                      </div>
                      <p className="text-[11px] leading-5 text-muted">{finding.detail}</p>
                      {finding.evidence && Object.keys(finding.evidence).length > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer font-mono text-[10px] text-muted transition-colors hover:text-accent2">
                            {t('run.evidence')}
                          </summary>
                          <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[#070707] p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-neutral-400">
                            {JSON.stringify(finding.evidence, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              <h4 className="mt-5 mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-muted uppercase">
                {t('reports.steps')}
              </h4>
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {record.steps.map((step) => (
                  <details key={step.id} className="rounded-lg border border-edge px-3 py-2">
                    <summary className="flex cursor-pointer items-center gap-2 text-xs text-neutral-200">
                      <StepIcon status={step.status} />
                      <span className="truncate">
                        {t(`run.stepNames.${step.id}`, { defaultValue: step.title })}
                      </span>
                      {step.endedAt ? (
                        <span className="shrink-0 font-mono text-[10px] text-muted">
                          {formatDuration(step.endedAt - step.startedAt)}
                        </span>
                      ) : null}
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                        {step.module}
                      </span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {step.error ? (
                        <p className="font-mono text-[11px] text-accent2">{step.error}</p>
                      ) : null}
                      {step.logs.length > 0 ? (
                        <pre className="max-h-44 overflow-auto rounded-md bg-[#070707] p-3 font-mono text-[10px] leading-5 whitespace-pre-wrap text-neutral-400">
                          {step.logs.join('\n')}
                        </pre>
                      ) : null}
                      {step.evidence.length > 0 ? (
                        <pre className="max-h-44 overflow-auto rounded-md bg-[#070707] p-3 font-mono text-[10px] leading-5 text-neutral-400">
                          {JSON.stringify(
                            Object.fromEntries(step.evidence.map((item) => [item.key, item.value])),
                            null,
                            2
                          )}
                        </pre>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted">{t('reports.empty')}</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
