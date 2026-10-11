import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2, Minus, Play, Square, X } from 'lucide-react'
import type {
  ChainDTO,
  EngineEvent,
  Finding,
  ModuleDTO,
  RunStatus,
  Severity,
  StepStatus
} from '../../../shared/engineTypes'
import { Chip, PageHeader, Panel, SeverityBadge } from '../components/ui'
import Terminal from '../components/Terminal'

type ServerStatus = Awaited<ReturnType<typeof window.securlab.lab.list>>[number]
type RunMode = 'chain' | 'single'

const engineListeners = new Set<(line: string) => void>()

function engineWrite(line: string): void {
  engineListeners.forEach((listener) => listener(line))
}

function subscribeEngine(callback: (line: string) => void): () => void {
  engineListeners.add(callback)
  return () => {
    engineListeners.delete(callback)
  }
}

const consoleListeners = new Set<(line: string) => void>()

function consoleWrite(line: string): void {
  consoleListeners.forEach((listener) => listener(line))
}

function subscribeConsole(callback: (line: string) => void): () => void {
  consoleListeners.add(callback)
  return () => {
    consoleListeners.delete(callback)
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${Math.round(seconds % 60)}s`
}

function eventToLines(event: EngineEvent): string[] {
  switch (event.type) {
    case 'run:start':
      return [`[run] ▶ ${event.chainId} → ${event.target.host}:${event.target.port}`]
    case 'step:start':
      return [`[step] → ${event.title} (${event.module})`]
    case 'step:log':
      return [`[step]   ${event.line}`]
    case 'step:end': {
      const marker = event.status === 'passed' ? '✓' : event.status === 'skipped' ? '↷' : '✗'
      return [`[step] ${marker} ${event.stepId}${event.error ? ` — ${event.error}` : ''}`]
    }
    case 'evidence':
      return [`[data]   ${event.key} = ${formatValue(event.value)}`]
    case 'finding':
      return [`[find] ! ${event.finding.severity.toUpperCase()} ${event.finding.title}`]
    case 'run:end':
      return [
        `[run] ${event.status.toUpperCase()} · findings: ${event.findings}${event.error ? ` · ${event.error}` : ''}`
      ]
    default:
      return []
  }
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'running') return <Loader2 size={13} className="animate-spin text-accent2" />
  if (status === 'passed') return <Check size={13} className="text-ok" />
  if (status === 'failed') return <X size={13} className="text-accent2" />
  if (status === 'skipped') return <Minus size={13} className="text-muted" />
  return <Circle size={9} className="text-white/25" />
}

const runStatusTone: Record<RunStatus, 'default' | 'red' | 'green' | 'amber'> = {
  passed: 'green',
  failed: 'red',
  aborted: 'amber',
  error: 'red'
}

const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

function severityTone(s: Severity): 'default' | 'red' | 'green' | 'amber' | 'blue' {
  if (s === 'critical' || s === 'high') return 'red'
  if (s === 'medium') return 'amber'
  if (s === 'low') return 'blue'
  return 'default'
}

export default function Run() {
  const { t } = useTranslation()
  const [mode, setMode] = useState<RunMode>('chain')
  const [chains, setChains] = useState<ChainDTO[]>([])
  const [chainId, setChainId] = useState('')
  const [modules, setModules] = useState<ModuleDTO[]>([])
  const [moduleId, setModuleId] = useState('')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('25565')
  const [runId, setRunId] = useState<string | null>(null)
  const [stepStates, setStepStates] = useState<Record<string, StepStatus>>({})
  const [stepDurations, setStepDurations] = useState<Record<string, number>>({})
  const [evidenceCounts, setEvidenceCounts] = useState<Record<string, number>>({})
  const [findings, setFindings] = useState<Finding[]>([])
  const [lastStatus, setLastStatus] = useState<RunStatus | null>(null)
  const [lastDuration, setLastDuration] = useState<number | null>(null)
  const [controlError, setControlError] = useState('')
  const [params, setParams] = useState<Record<string, string>>({})
  const [labStatuses, setLabStatuses] = useState<ServerStatus[]>([])
  const engineBuffer = useRef<string[]>([])
  const consoleBuffers = useRef(new Map<string, string[]>())
  const attachedRef = useRef<string | null>(null)
  const runStartedRef = useRef(0)
  const stepStartedRef = useRef<Record<string, number>>({})

  const selectedChain = useMemo(
    () => chains.find((c) => c.id === chainId) ?? null,
    [chains, chainId]
  )
  const selectedModule = useMemo(
    () => modules.find((m) => m.id === moduleId) ?? null,
    [modules, moduleId]
  )
  const targetPort = Number(port) || 0

  const moduleKey = (id: string): string => id.replace(/\./g, '_')
  const chainLabel = (c: ChainDTO): string => t(`run.chainNames.${c.id}`, { defaultValue: c.title })
  const moduleLabel = (m: ModuleDTO): string =>
    t(`run.moduleNames.${moduleKey(m.id)}`, { defaultValue: m.title })
  const moduleDesc = (m: ModuleDTO): string =>
    t(`run.moduleDescs.${moduleKey(m.id)}`, { defaultValue: m.description })
  const stepLabel = (step: { id: string; title: string }): string =>
    t(`run.stepNames.${step.id}`, { defaultValue: step.title })

  const moduleGroups = useMemo(() => {
    const order = ['recon', 'audit', 'access', 'auth', 'impact']
    return order
      .map((category) => ({
        category,
        items: modules.filter((m) => m.category === category)
      }))
      .filter((group) => group.items.length > 0)
  }, [modules])

  const activeParams = useMemo(
    () => (mode === 'chain' ? (selectedChain?.params ?? []) : (selectedModule?.params ?? [])),
    [mode, selectedChain, selectedModule]
  )

  const pipelineSteps = useMemo(
    () =>
      mode === 'chain'
        ? (selectedChain?.steps ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            module: s.module
          }))
        : selectedModule
          ? [{ id: selectedModule.id, title: selectedModule.title, module: selectedModule.id }]
          : [],
    [mode, selectedChain, selectedModule]
  )

  const findingSummary = useMemo(() => {
    const summary: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const finding of findings) summary[finding.severity]++
    return summary
  }, [findings])

  useEffect(() => {
    if (activeParams.length === 0) return
    setParams((prev) => {
      const next = { ...prev }
      for (const p of activeParams) {
        if (next[p.name] === undefined && p.defaultValue !== undefined) next[p.name] = p.defaultValue
      }
      return next
    })
  }, [activeParams])

  const attached = useMemo(
    () => labStatuses.find((s) => s.state === 'running' && s.recipe.port === targetPort) ?? null,
    [labStatuses, targetPort]
  )

  useEffect(() => {
    void window.securlab.engine.chains().then((list) => {
      setChains(list)
      setChainId((current) => (list.some((c) => c.id === current) ? current : (list[0]?.id ?? '')))
    })
    void window.securlab.engine.modules().then((list) => {
      setModules(list)
      setModuleId((current) =>
        list.some((m) => m.id === current) ? current : (list[0]?.id ?? '')
      )
    })
  }, [])

  useEffect(() => {
    const off = window.securlab.engine.onEvent((event) => {
      const lines = eventToLines(event)
      for (const line of lines) {
        engineBuffer.current.push(line)
        engineWrite(line)
      }
      if (engineBuffer.current.length > 3000) {
        engineBuffer.current.splice(0, engineBuffer.current.length - 3000)
      }
      switch (event.type) {
        case 'run:start':
          runStartedRef.current = Date.now()
          stepStartedRef.current = {}
          setRunId(event.runId)
          setFindings([])
          setLastStatus(null)
          setLastDuration(null)
          setStepStates({})
          setStepDurations({})
          setEvidenceCounts({})
          break
        case 'step:start':
          stepStartedRef.current[event.stepId] = Date.now()
          setStepStates((prev) => ({ ...prev, [event.stepId]: 'running' }))
          break
        case 'step:end': {
          const startedAt = stepStartedRef.current[event.stepId]
          if (startedAt) {
            setStepDurations((prev) => ({ ...prev, [event.stepId]: Date.now() - startedAt }))
          }
          setStepStates((prev) => ({ ...prev, [event.stepId]: event.status }))
          break
        }
        case 'evidence':
          setEvidenceCounts((prev) => ({
            ...prev,
            [event.stepId]: (prev[event.stepId] ?? 0) + 1
          }))
          break
        case 'finding':
          setFindings((prev) => [...prev, event.finding])
          break
        case 'run:end':
          setRunId(null)
          setLastStatus(event.status)
          if (runStartedRef.current > 0) setLastDuration(Date.now() - runStartedRef.current)
          break
      }
    })
    return off
  }, [])

  useEffect(() => {
    void window.securlab.lab.list().then(setLabStatuses)
    const offLog = window.securlab.lab.onLog(({ id, line }) => {
      if (id !== attachedRef.current) return
      const buffer = consoleBuffers.current.get(id) ?? []
      buffer.push(line)
      if (buffer.length > 3000) buffer.splice(0, buffer.length - 3000)
      consoleBuffers.current.set(id, buffer)
      consoleWrite(line)
    })
    const offState = window.securlab.lab.onState(() => {
      void window.securlab.lab.list().then(setLabStatuses)
    })
    return () => {
      offLog()
      offState()
    }
  }, [])

  useEffect(() => {
    attachedRef.current = attached?.recipe.id ?? null
  }, [attached])

  const execute = async (): Promise<void> => {
    setControlError('')
    try {
      const result =
        mode === 'chain'
          ? await window.securlab.engine.run(chainId, host.trim(), targetPort, params)
          : await window.securlab.engine.runModule(moduleId, host.trim(), targetPort, params)
      setRunId(result.runId)
    } catch (error) {
      setControlError(error instanceof Error ? error.message : String(error))
    }
  }

  const abort = async (): Promise<void> => {
    if (runId) await window.securlab.engine.abort(runId)
  }

  const canExecute = mode === 'chain' ? selectedChain !== null : selectedModule !== null

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-6">
      <PageHeader
        index="03"
        kicker={t('nav.run')}
        heading={t('pages.run.subtitle')}
        action={
          <div className="flex items-center gap-2">
            {lastDuration !== null ? (
              <Chip>
                {t('run.duration')} {formatDuration(lastDuration)}
              </Chip>
            ) : null}
            {lastStatus ? (
              <Chip tone={runStatusTone[lastStatus]}>{t(`run.runStatus.${lastStatus}`)}</Chip>
            ) : runId ? (
              <Chip tone="amber">{t('run.running')}</Chip>
            ) : null}
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex w-[400px] shrink-0 flex-col gap-4 overflow-y-auto pr-1">
          <Panel className="p-4">
            <div className="mb-3 flex w-fit items-center gap-1 rounded-lg border border-edge bg-base p-1">
              {(['chain', 'single'] as RunMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1 font-mono text-xs transition-colors ${
                    mode === m ? 'bg-accent/15 text-accent2' : 'text-muted hover:text-white'
                  }`}
                >
                  {t(`run.mode.${m}`)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {mode === 'chain' ? (
                <div>
                  <label className="mb-1 block text-xs text-muted">{t('run.selectChain')}</label>
                  <select
                    value={chainId}
                    onChange={(e) => setChainId(e.target.value)}
                    className="w-full rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
                  >
                    {chains.map((c) => (
                      <option key={c.id} value={c.id}>
                        {chainLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-muted">{t('run.selectModule')}</label>
                  <select
                    value={moduleId}
                    onChange={(e) => setModuleId(e.target.value)}
                    className="w-full rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
                  >
                    {moduleGroups.map((group) => (
                      <optgroup key={group.category} label={t(`run.categories.${group.category}`)}>
                        {group.items.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.destructive ? '⚠ ' : ''}
                            {moduleLabel(m)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <label className="mb-1 block text-xs text-muted">{t('run.host')}</label>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="w-full rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
                  />
                </div>
                <div className="w-24 shrink-0">
                  <label className="mb-1 block text-xs text-muted">{t('run.port')}</label>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
                  />
                </div>
              </div>

              {activeParams.map((p) => (
                <div key={p.name}>
                  <label className="mb-1 block text-xs text-muted">{t(p.labelKey)}</label>
                  <input
                    value={params[p.name] ?? ''}
                    onChange={(e) => setParams((prev) => ({ ...prev, [p.name]: e.target.value }))}
                    placeholder={p.placeholder}
                    className="w-full rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 placeholder:text-white/25 focus:border-accent/50 focus:outline-none"
                  />
                </div>
              ))}

              {mode === 'single' && selectedModule ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>{t(`run.categories.${selectedModule.category}`)}</Chip>
                  {selectedModule.destructive ? <Chip tone="red">{t('run.labOnly')}</Chip> : null}
                  <span className="font-mono text-[11px] leading-4 text-muted">
                    {moduleDesc(selectedModule)}
                  </span>
                </div>
              ) : null}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void execute()}
                  disabled={runId !== null || !canExecute}
                  className="glow-red flex flex-1 items-center justify-center gap-1.5 rounded-md border border-accent/60 bg-accent/15 px-4 py-2 font-mono text-xs text-accent2 transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
                >
                  <Play size={12} />
                  {t('run.execute')}
                </button>
                <button
                  onClick={() => void abort()}
                  disabled={runId === null}
                  className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-2 font-mono text-xs text-muted transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Square size={12} />
                  {t('run.abort')}
                </button>
              </div>

              {controlError ? (
                <p className="font-mono text-xs break-all text-accent2">{controlError}</p>
              ) : null}
              <p className="font-mono text-[11px] leading-4 text-muted">{t('run.safetyNote')}</p>
            </div>
          </Panel>

          <Panel className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">{t('run.pipeline')}</h3>
            <div className="space-y-2">
              {pipelineSteps.map((step) => {
                const status = stepStates[step.id] ?? 'pending'
                return (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 rounded-lg border border-edge px-3 py-2"
                  >
                    <StepIcon status={status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-neutral-200">{stepLabel(step)}</div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted">
                        <span>{step.module}</span>
                        {stepDurations[step.id] !== undefined ? (
                          <span>· {formatDuration(stepDurations[step.id])}</span>
                        ) : null}
                        {(evidenceCounts[step.id] ?? 0) > 0 ? (
                          <span>· {evidenceCounts[step.id]} evidence</span>
                        ) : null}
                      </div>
                    </div>
                    <Chip
                      tone={
                        status === 'passed'
                          ? 'green'
                          : status === 'failed'
                            ? 'red'
                            : status === 'running'
                              ? 'amber'
                              : 'default'
                      }
                    >
                      {t(`run.status.${status}`)}
                    </Chip>
                  </div>
                )
              })}
              {pipelineSteps.length === 0 ? (
                <p className="text-xs text-muted">{t('run.noSteps')}</p>
              ) : null}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">{t('run.findings')}</h3>
              <div className="flex flex-wrap items-center gap-1">
                {severityOrder
                  .filter((s) => findingSummary[s] > 0)
                  .map((s) => (
                    <Chip key={s} tone={severityTone(s)}>
                      {findingSummary[s]} {t(`severity.${s}`)}
                    </Chip>
                  ))}
              </div>
            </div>
            {findings.length === 0 ? (
              <p className="text-xs text-muted">{t('run.noFindings')}</p>
            ) : (
              <div className="space-y-3">
                {findings.map((f, i) => (
                  <div key={`${f.id}-${i}`} className="rounded-lg border border-edge p-3">
                    <div className="mb-1 flex items-start gap-2">
                      <SeverityBadge s={f.severity} />
                      <span className="text-xs font-medium text-neutral-200">{f.title}</span>
                    </div>
                    <p className="text-[11px] leading-5 text-muted">{f.detail}</p>
                    {f.evidence && Object.keys(f.evidence).length > 0 ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-mono text-[10px] text-muted transition-colors hover:text-accent2">
                          {t('run.evidence')}
                        </summary>
                        <pre className="mt-1 max-h-44 overflow-auto rounded-md bg-[#070707] p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap text-neutral-400">
                          {JSON.stringify(f.evidence, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
          <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-edge px-4 py-2">
              <span className="font-mono text-xs text-muted">{t('pages.run.engine')}</span>
              {mode === 'single' && selectedModule ? (
                <span className="font-mono text-[11px] text-muted">{selectedModule.id}</span>
              ) : selectedChain ? (
                <span className="font-mono text-[11px] text-muted">{selectedChain.id}</span>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              <Terminal
                attach={(write) => {
                  const unsubscribe = subscribeEngine(write)
                  for (const line of engineBuffer.current) write(line)
                  return unsubscribe
                }}
              />
            </div>
          </Panel>

          <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-edge px-4 py-2">
              <span className="font-mono text-xs text-muted">
                {t('pages.run.console')}
                {attached ? ` — ${attached.recipe.id}` : ''}
              </span>
              <Chip tone={attached ? 'green' : 'default'}>
                {attached ? attached.recipe.label : t('run.consoleIdle')}
              </Chip>
            </div>
            <div className="min-h-0 flex-1">
              <Terminal
                key={attached?.recipe.id ?? 'none'}
                attach={(write) => {
                  const id = attached?.recipe.id ?? 'none'
                  const unsubscribe = subscribeConsole(write)
                  for (const line of consoleBuffers.current.get(id) ?? []) write(line)
                  return unsubscribe
                }}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  )
}
