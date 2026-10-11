import { useTranslation } from 'react-i18next'
import { recipes } from '../data/lab'
import { Chip, PageHeader, Panel, PlannedCard } from '../components/ui'

export default function Lab() {
  const { t } = useTranslation()
  const points = t('pages.lab.points', { returnObjects: true }) as unknown as string[]

  return (
    <div>
      <PageHeader index="02" kicker={t('nav.lab')} heading={t('pages.lab.subtitle')} />

      <div className="mb-6">
        <PlannedCard milestone="M1" desc={t('pages.lab.desc')} points={points} />
      </div>

      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-widest text-white uppercase">
        <span className="h-3 w-0.5 bg-accent" />
        {t('dashboard.recipeShelf')}
      </h2>
      <Panel className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-edge text-left font-mono text-[11px] tracking-wider text-muted uppercase">
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.id')}</th>
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.name')}</th>
              <th className="px-4 py-2.5 font-normal">{t('dashboard.table.milestone')}</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id} className="border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-2.5 font-mono text-xs text-accent">{r.id}</td>
                <td className="px-4 py-2.5">
                  <div className="text-neutral-200">{t(`recipes.${r.id}.name`)}</div>
                  <div className="mt-0.5 text-xs text-muted">{t(`recipes.${r.id}.desc`)}</div>
                </td>
                <td className="px-4 py-2.5">
                  <Chip>{r.milestone}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
