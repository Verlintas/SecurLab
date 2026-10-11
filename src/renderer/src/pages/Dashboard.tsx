import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Crosshair,
  FileText,
  FlaskConical,
  Settings2,
  type LucideIcon
} from 'lucide-react'
import { chains, recipes } from '../data/lab'
import { Chip, PageHeader, Panel, PriorityBadge } from '../components/ui'
import { useUi, type Page } from '../store/ui'

type RunSummary = Awaited<ReturnType<typeof window.securlab.reports.list>>[number]
type JavaInstall = Awaited<ReturnType<typeof window.securlab.lab.java>>[number]
type SettingsDTO = Awaited<ReturnType<typeof window.securlab.settings.get>>
type ServerStatus = Awaited<ReturnType<typeof window.securlab.lab.list>>[number]

const statusTone: Record<string, 'default' | 'red' | 'green' | 'amber'> = {
  passed: 'green',
  failed: 'red',
  aborted: 'amber',
  error: 'red'
}

export default function Dashboard() {
  const { t } = useTranslation()
  const setPage = useUi((s) => s.setPage)
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [java, setJava] = useState<JavaInstall[]>([])
  const [settings, setSettings] = useState<SettingsDTO | null>(null)
  const [labs, setLabs] = useState<ServerStatus[]>([])
  const [moduleCount, setModuleCount] = useState(0)
  const [labData, setLabData] = useState('')

  useEffect(() => {
    void window.securlab.reports.list().then(setRuns)
    void window.securlab.lab.java().then(setJava)
    void window.securlab.settings.get().then(setSettings)
    void window.securlab.lab.list().then(setLabs)
    void window.securlab.engine.modules().then((list) => setModuleCount(list.length))
    void window.securlab.env.paths().then((paths) => setLabData(paths.labData))
  }, [])

  const runningLabs = labs.filter(
    (s) => s.state === 'running' || s.state === 'starting' || s.state === 'preparing'
  )

  const stats = [
    { label: t('dashboard.stats.chains'), value: chains.length },
    { label: t('dashboard.stats.modules'), value: moduleCount },
    { label: t('dashboard.stats.recipes'), value: recipes.length },
    { label: t('dashboard.stats.runs'), value: runs.length }
  ]

  const quickActions: { page: Page; icon: LucideIcon; title: string; desc: string }[] = [
    {
      page: 'lab',
      icon: FlaskConical,
      title: t('dashboard.quick.lab.title'),
      desc: t('dashboard.quick.lab.desc')
    },
    {
      page: 'run',
      icon: Crosshair,
      title: t('dashboard.quick.run.title'),
      desc: t('dashboard.quick.run.desc')
    },
    {
      page: 'reports',
      icon: FileText,
      title: t('dashboard.quick.reports.title'),
      desc: t('dashboard.quick.reports.desc')
    },
    {
      page: 'settings',
      icon: Settings2,
      title: t('dashboard.quick.settings.title'),
      desc: t('dashboard.quick.settings.desc')
    }
  ]

  return (
    <div>
      <PageHeader index="01" kicker={t('nav.dashboard')} heading={t('dashboard.subtitle')} />

      <div className="mb-6 grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <Panel key={s.label} className="p-4">
            <div className="font-mono text-2xl font-bold text-white">{s.value}</div>
            <div className="mt-1 font-mono text-[11px] tracking-wider text-muted uppercase">
              {s.label}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4">
        <Panel className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('dashboard.quickStart')}</h3>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.page}
                onClick={() => setPage(action.page)}
                className="rounded-lg border border-edge p-3 text-left transition-colors hover:border-accent/50 hover:bg-accent/5"
              >
                <div className="mb-1 flex items-center gap-2 text-neutral-200">
                  <action.icon size={14} className="text-accent2" />
                  <span className="text-xs font-medium">{action.title}</span>
                </div>
                <p className="text-[11px] leading-4 text-muted">{action.desc}</p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('dashboard.environment')}</h3>
          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted">{t('dashboard.javaLabel')}</span>
              <span className="truncate text-neutral-300">
                {java.length > 0 ? java.map((j) => `jdk${j.major}`).join(' · ') : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted">{t('dashboard.allowlist')}</span>
              <span className="flex items-center gap-2 text-neutral-300">
                {settings?.allowlist.length ?? 0}
                {settings?.authorized ? (
                  <Chip tone="green">{t('dashboard.authorized')}</Chip>
                ) : (
                  <Chip tone="amber">{t('dashboard.notAuthorized')}</Chip>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted">{t('dashboard.runningLabs')}</span>
              <span className="truncate text-neutral-300">
                {runningLabs.length > 0
                  ? runningLabs.map((lab) => lab.recipe.id).join(', ')
                  : t('dashboard.none')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-muted">{t('dashboard.labData')}</span>
              <span className="truncate text-neutral-400" title={labData}>
                {labData || '—'}
              </span>
            </div>
          </div>
        </Panel>
      </div>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-widest text-white uppercase">
        <span className="h-3 w-0.5 bg-accent" />
        {t('dashboard.recentRuns')}
        <button
          onClick={() => setPage('reports')}
          className="ml-auto font-mono text-[11px] font-normal tracking-normal text-muted normal-case transition-colors hover:text-accent2"
        >
          {t('dashboard.viewAll')}
        </button>
      </h2>
      <Panel className="mb-8 overflow-hidden">
        {runs.length === 0 ? (
          <p className="p-4 text-xs text-muted">{t('dashboard.noRuns')}</p>
        ) : (
          <div>
            {runs.slice(0, 5).map((run) => (
              <button
                key={run.runId}
                onClick={() => setPage('reports')}
                className="flex w-full items-center gap-3 border-b border-white/5 px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-neutral-200">
                  {t(`run.chainNames.${run.chainId}`, { defaultValue: run.chainTitle })}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {run.target.host}:{run.target.port}
                </span>
                <Chip tone={statusTone[run.status] ?? 'default'}>
                  {t(`run.runStatus.${run.status}`)}
                </Chip>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[10px] text-muted">
                  {run.findingsTotal} find.
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-widest text-white uppercase">
        <span className="h-3 w-0.5 bg-accent" />
        {t('dashboard.chainMatrix')}
      </h2>
      <Panel className="mb-8 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] tracking-wider text-muted uppercase">
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.id')}</th>
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.name')}</th>
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.phase')}</th>
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.priority')}</th>
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.milestone')}</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr
                key={c.id}
                className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-2.5 font-mono text-xs text-accent">{c.id}</td>
                <td className="px-4 py-2.5 text-neutral-200">{t(`chains.${c.id}`)}</td>
                <td className="px-4 py-2.5">
                  <Chip>{t(`phases.${c.phase}`)}</Chip>
                </td>
                <td className="px-4 py-2.5">
                  <PriorityBadge p={c.priority} />
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{c.milestone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-widest text-white uppercase">
        <span className="h-3 w-0.5 bg-accent" />
        {t('dashboard.recipeShelf')}
      </h2>
      <div className="grid grid-cols-4 gap-3">
        {recipes.map((r) => (
          <Panel key={r.id} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-lg font-bold text-accent">{r.id}</span>
              <Chip>{r.milestone}</Chip>
            </div>
            <div className="text-sm font-medium text-neutral-200">{t(`recipes.${r.id}.name`)}</div>
            <div className="mt-1 text-xs leading-5 text-muted">{t(`recipes.${r.id}.desc`)}</div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
