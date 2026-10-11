import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCcw, Square, Terminal as TerminalIcon } from 'lucide-react'
import { Chip, PageHeader, Panel } from '../components/ui'
import Terminal from '../components/Terminal'
import { recipes as recipeMeta } from '../data/lab'

type LabState = 'idle' | 'preparing' | 'starting' | 'running' | 'stopping' | 'exited' | 'error'
type ServerStatus = Awaited<ReturnType<typeof window.securlab.lab.list>>[number]

const lineListeners = new Map<string, Set<(line: string) => void>>()

function subscribeLines(id: string, callback: (line: string) => void): () => void {
  const set = lineListeners.get(id) ?? new Set<(line: string) => void>()
  set.add(callback)
  lineListeners.set(id, set)
  return () => {
    set.delete(callback)
    if (set.size === 0) lineListeners.delete(id)
  }
}

function emitLine(id: string, line: string): void {
  lineListeners.get(id)?.forEach((callback) => callback(line))
}

const stateTone: Record<LabState, 'default' | 'red' | 'green' | 'amber'> = {
  idle: 'default',
  preparing: 'amber',
  starting: 'amber',
  running: 'green',
  stopping: 'amber',
  exited: 'default',
  error: 'red'
}

export default function Lab() {
  const { t } = useTranslation()
  const [servers, setServers] = useState<ServerStatus[]>([])
  const [javaLabel, setJavaLabel] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const buffers = useRef(new Map<string, string[]>())

  const refresh = useCallback(async (): Promise<void> => {
    const list = await window.securlab.lab.list()
    setServers(list)
    setSelected((current) => current ?? list[0]?.recipe.id ?? null)
  }, [])

  useEffect(() => {
    void refresh()
    void window.securlab.lab.java().then((installs) => {
      setJavaLabel(installs.map((i) => `${i.version} (jdk${i.major})`).join(' · '))
    })
    const offLog = window.securlab.lab.onLog(({ id, line }) => {
      const buffer = buffers.current.get(id) ?? []
      buffer.push(line)
      if (buffer.length > 3000) buffer.splice(0, buffer.length - 3000)
      buffers.current.set(id, buffer)
      emitLine(id, line)
    })
    const offState = window.securlab.lab.onState(() => {
      void refresh()
    })
    return () => {
      offLog()
      offState()
    }
  }, [refresh])

  const act = async (id: string, fn: (recipeId: string) => Promise<unknown>): Promise<void> => {
    setBusy(id)
    setSelected(id)
    try {
      await fn(id)
    } catch {
      // errors surface through state broadcasts
    } finally {
      setBusy(null)
      void refresh()
    }
  }

  const selectedStatus = servers.find((s) => s.recipe.id === selected) ?? null

  return (
    <div>
      <PageHeader
        index="02"
        kicker={t('nav.lab')}
        heading={t('pages.lab.subtitle')}
        action={
          <Chip tone={javaLabel ? 'green' : 'red'}>
            {javaLabel ? t('lab.javaReady', { java: javaLabel }) : t('lab.javaMissing')}
          </Chip>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4">
        {recipeMeta.map((meta) => {
          const status = servers.find((s) => s.recipe.id === meta.id)
          if (!status) {
            return (
              <Panel key={meta.id} className="border-dashed p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-white/30">{meta.id}</span>
                  <Chip>{meta.milestone}</Chip>
                </div>
                <div className="text-sm font-medium text-neutral-400">
                  {t(`recipes.${meta.id}.name`)}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted">
                  {t(`recipes.${meta.id}.desc`)}
                </div>
              </Panel>
            )
          }

          const state = status.state as LabState
          const running = state === 'running'
          const transitional = state === 'preparing' || state === 'starting' || state === 'stopping'

          return (
            <Panel key={meta.id} className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-lg font-bold text-accent">{meta.id}</span>
                <Chip tone={stateTone[state]}>{t(`lab.states.${state}`)}</Chip>
              </div>
              <div className="text-sm font-medium text-neutral-200">
                {t(`recipes.${meta.id}.name`)}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>Paper {status.recipe.mcVersion}</Chip>
                <Chip>
                  {t('lab.port')} {status.recipe.port}
                </Chip>
                <Chip>{status.recipe.onlineMode ? t('lab.online') : t('lab.offline')}</Chip>
                <Chip>java {status.recipe.javaMajor}+</Chip>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted">{status.recipe.notes}</div>
              {status.error ? <div className="mt-2 text-xs text-accent2">{status.error}</div> : null}
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => void act(meta.id, window.securlab.lab.start)}
                  disabled={busy !== null || running || transitional}
                  className="flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent2 transition-colors hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Play size={12} />
                  {t('lab.start')}
                </button>
                <button
                  onClick={() => void act(meta.id, window.securlab.lab.stop)}
                  disabled={busy !== null || !running}
                  className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Square size={12} />
                  {t('lab.stop')}
                </button>
                <button
                  onClick={() => void act(meta.id, window.securlab.lab.reset)}
                  disabled={busy !== null || running || transitional}
                  className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <RotateCcw size={12} />
                  {t('lab.reset')}
                </button>
                <button
                  onClick={() => setSelected(meta.id)}
                  className={`ml-auto flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
                    selected === meta.id
                      ? 'border-accent/50 text-accent2'
                      : 'border-edge text-muted hover:border-white/25 hover:text-white'
                  }`}
                >
                  <TerminalIcon size={12} />
                  {t('lab.console')}
                </button>
              </div>
            </Panel>
          )
        })}
      </div>

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
          <span className="font-mono text-xs text-muted">
            {t('lab.consoleTitle')}
            {selectedStatus ? ` — ${selectedStatus.recipe.id} · ${selectedStatus.recipe.label}` : ''}
          </span>
          <Chip>{selectedStatus ? t(`lab.states.${selectedStatus.state as LabState}`) : '—'}</Chip>
        </div>
        {selected ? (
          <div className="h-80">
            <Terminal
              key={selected}
              attach={(write) => {
                const unsubscribe = subscribeLines(selected, write)
                for (const line of buffers.current.get(selected) ?? []) write(line)
                return unsubscribe
              }}
            />
          </div>
        ) : (
          <div className="flex h-80 items-center justify-center font-mono text-xs text-muted">
            {t('lab.consoleHint')}
          </div>
        )}
      </Panel>
    </div>
  )
}
