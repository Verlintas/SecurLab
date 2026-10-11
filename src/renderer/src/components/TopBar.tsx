import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { useUi } from '../store/ui'
import { Chip } from './ui'

export default function TopBar() {
  const { t } = useTranslation()
  const page = useUi((s) => s.page)
  const toggleLang = useUi((s) => s.toggleLang)
  const electronVersion = window.securlab?.versions?.electron ?? '-'

  return (
    <div className="drag flex h-12 shrink-0 items-center justify-between border-b border-edge px-6">
      <div className="font-mono text-xs text-muted">
        securlab <span className="text-accent">//</span> {t(`nav.${page}`)}
      </div>
      <div className="no-drag flex items-center gap-2">
        <Chip>electron {electronVersion}</Chip>
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 rounded-md border border-edge px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-accent2"
        >
          <Languages size={12} />
          {t('app.langSwitch')}
        </button>
      </div>
    </div>
  )
}
