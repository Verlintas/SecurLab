import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Circle, Loader2, Minus, Play, Square, X } from 'lucide-react'
import type {
  ChainDTO,
  EngineEvent,
  Finding,
  RunStatus,
  StepStatus
} from '../../../shared/engineTypes'
import { Chip, PageHeader, Panel, SeverityBadge } from '../components/ui'
import Terminal from '../components/Terminal'

type ServerStatus = Awaited<ReturnType<typeof window.securlab.lab.list>>[number]

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

export default function Run() {
  const { t } = useTranslation()
  const [chains, setChains] = useState<ChainDTO[]>([])
  const [chainId, setChainId] = useState('')
  const [host, setHost] = useState('127.0.0.1')
  const [port, setPort] = useState('25565')
  const [runId, setRunId] = useState<string | null>(null)
  const [stepStates, setStepStates] = useState<Record<string, StepStatus>>({})
  const [findings, setFindings] = useState<Finding[]>([])
  const [lastStatus, setLastStatus] = useState<RunStatus | null>(null)
  const [controlError, setControlError] = useState('')
  const [labStatuses, setLabStatuses] = useState<ServerStatus[]>([])
  const engineBuffer = useRef<string[]>([])
  const consoleBuffers = useRef(new Map<string, string[]>())
  const attachedRef = useRef<string | null>(null)

  const selectedChain = useMemo(
    () => chains.find((c) => c.id === chainId) ?? null,
    [chains, chainId]
  )
  const targetPort = Number(port) || 0

  const attached = useMemo(
    () =>
      labStatuses.find((s) => s.state === 'running' && s.recipe.port === targetPort) ?? null,
    [labStatuses, targetPort]
  )

  useEffect(() => {
    void window.securlab.engine.chains().then((list) => {
      setChains(list)
      setChainId((current) =>
        list.some((c) => c.id === current) ? current : (list[0]?.id ?? '')
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
          setRunId(event.runId)
          setFindings([])
          setLastStatus(null)
          setStepStates({})
          break
        case 'step:start':
          setStepStates((prev) => ({ ...prev, [event.stepId]: 'running' }))
          break
        case 'step:end':
          setStepStates((prev) => ({ ...prev, [event.stepId]: event.status }))
          break
        case 'finding':
          setFindings((prev) => [...prev, event.finding])
          break
        case 'run:end':
          setRunId(null)
          setLastStatus(event.status)
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
      const result = await window.securlab.engine.run(chainId, host.trim(), targetPort)
      setRunId(result.runId)
    } catch (error) {
      setControlError(error instanceof Error ? error.message : String(error))
    }
  }

  const abort = async (): Promise<void> => {
    if (runId) await window.securlab.engine.abort(runId)
  }

  return (
    <div>
      <PageHeader
        index="03"
        kicker={t('nav.run')}
        heading={t('pages.run.subtitle')}
        action={
          lastStatus ? (
            <Chip tone={runStatusTone[lastStatus]}>{t(`run.runStatus.${lastStatus}`)}</Chip>
          ) : runId ? (
            <Chip tone="amber">{t('run.running')}</Chip>
          ) : undefined
        }
      />

      <Panel className="mb-6 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="mb-1 block text-xs text-muted">{t('run.selectChain')}</label>
            <select
              value={chainId}
              onChange={(e) => setChainId(e.target.value)}
              className="w-full rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
            >
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{t('run.host')}</label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-44 rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">{t('run.port')}</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))}
              className="w-24 rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-200 focus:border-accent/50 focus:outline-none"
            />
          </div>
          <button
            onClick={() => void execute()}
            disabled={runId !== null || !selectedChain}
            className="glow-red flex items-center gap-1.5 rounded-md border border-accent/60 bg-accent/15 px-4 py-2 font-mono text-xs text-accent2 transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-35 disabled:shadow-none"
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
          <p className="mt-3 font-mono text-xs text-accent2">{controlError}</p>
        ) : null}
        <p className="mt-3 font-mono text-[11px] text-muted">{t('run.safetyNote')}</p>
      </Panel>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <Panel className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('run.pipeline')}</h3>
          <div className="space-y-2">
            {(selectedChain?.steps ?? []).map((step) => {
              const status = stepStates[step.id] ?? 'pending'
              return (
                <div
                  key={step.id}
                  className="flex items-center gap-3 rounded-lg border border-edge px-3 py-2"
                >
                  <StepIcon status={status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-neutral-200">{step.title}</div>
                    <div className="font-mono text-[10px] text-muted">{step.module}</div>
                  </div>
                  <Chip tone={status === 'passed' ? 'green' : status === 'failed' ? 'red' : status === 'running' ? 'amber' : 'default'}>
                    {t(`run.status.${status}`)}
                  </Chip>
                </div>
              )
            })}
            {selectedChain && selectedChain.steps.length === 0 ? (
              <p className="text-xs text-muted">{t('run.noSteps')}</p>
            ) : null}
          </div>
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('run.findings')}</h3>
          {findings.length === 0 ? (
            <p className="text-xs text-muted">{t('run.noFindings')}</p>
          ) : (
            <div className="space-y-3">
              {findings.map((f, i) => (
                <div key={`${f.id}-${i}`} className="rounded-lg border border-edge p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <SeverityBadge s={f.severity} />
                    <span className="text-xs font-medium text-neutral-200">{f.title}</span>
                  </div>
                  <p className="text-[11px] leading-5 text-muted">{f.detail}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Panel className="overflow-hidden">
          <div className="border-b border-edge px-4 py-2.5 font-mono text-xs text-muted">
            {t('pages.run.engine')}
          </div>
          <div className="h-72">
            <Terminal
              attach={(write) => {
                const unsubscribe = subscribeEngine(write)
                for (const line of engineBuffer.current) write(line)
                return unsubscribe
              }}
            />
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
            <span className="font-mono text-xs text-muted">
              {t('pages.run.console')}
              {attached ? ` — ${attached.recipe.id}` : ''}
            </span>
            <Chip tone={attached ? 'green' : 'default'}>
              {attached ? attached.recipe.label : t('run.consoleIdle')}
            </Chip>
          </div>
          <div className="h-72">
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
  )
}
