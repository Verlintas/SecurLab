import { useTranslation } from 'react-i18next'
import { chains, recipes } from '../data/lab'
import { Chip, PageHeader, Panel, PriorityBadge } from '../components/ui'

export default function Dashboard() {
  const { t } = useTranslation()

  const stats = [
    { label: t('dashboard.stats.chains'), value: chains.length },
    { label: t('dashboard.stats.recipes'), value: recipes.length },
    { label: t('dashboard.stats.reports'), value: 0 },
    { label: t('dashboard.stats.targets'), value: 0 }
  ]

  return (
    <div>
      <PageHeader index="01" kicker={t('nav.dashboard')} heading={t('dashboard.subtitle')} />

      <div className="relative mb-6 overflow-hidden rounded-xl border border-edge bg-panel p-6">
        <div className="pointer-events-none absolute -top-24 right-0 h-56 w-56 rounded-full bg-accent/15 blur-[90px]" />
        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <span className="pulse-dot glow-ok h-2 w-2 rounded-full bg-ok" />
            <span className="text-sm font-semibold text-white">{t('dashboard.banner.line1')}</span>
          </div>
          <p className="mb-4 font-mono text-xs text-muted">{t('dashboard.banner.line2')}</p>
          <div className="caret font-mono text-xs text-neutral-300">securlab@local:~$ securlab --list-chains</div>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-4 gap-3">
        {stats.map((s) => (
          <Panel key={s.label} className="p-4">
            <div className="font-mono text-2xl font-bold text-white">{s.value}</div>
            <div className="mt-1 font-mono text-[11px] tracking-wider text-muted uppercase">{s.label}</div>
          </Panel>
        ))}
      </div>

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
              <tr key={c.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
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
