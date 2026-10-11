import { useTranslation } from 'react-i18next'
import { Chip, PageHeader, PlannedCard } from '../components/ui'

export default function Reports() {
  const { t } = useTranslation()
  const points = t('pages.reports.points', { returnObjects: true }) as unknown as string[]

  return (
    <div>
      <PageHeader
        index="04"
        kicker={t('nav.reports')}
        heading={t('pages.reports.subtitle')}
        action={
          <div className="flex gap-2">
            <Chip tone="red">HTML</Chip>
            <Chip>Markdown</Chip>
          </div>
        }
      />

      <PlannedCard milestone="M5" desc={t('pages.reports.desc')} points={points} />
    </div>
  )
}
