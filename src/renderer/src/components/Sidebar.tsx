import type { ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, FileSearch, FileText, FlaskConical, LayoutDashboard, Settings2, ShieldAlert } from 'lucide-react'
import logo from '../assets/logo.png'
import { useUi, type Page } from '../store/ui'

const items: { page: Page; num: string; icon: ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { page: 'dashboard', num: '01', icon: LayoutDashboard },
  { page: 'lab', num: '02', icon: FlaskConical },
  { page: 'run', num: '03', icon: Crosshair },
  { page: 'reports', num: '04', icon: FileText },
  { page: 'forensics', num: '05', icon: FileSearch },
  { page: 'settings', num: '06', icon: Settings2 }
]

export default function Sidebar() {
  const { t } = useTranslation()
  const page = useUi((s) => s.page)
  const setPage = useUi((s) => s.setPage)

  return (
    <aside className="drag flex h-full w-60 shrink-0 flex-col border-r border-edge bg-panel">
      <div className="h-10 shrink-0" />
      <div className="flex items-center gap-3 px-5 pb-5">
        <img src={logo} alt="SecurLab" className="h-9 w-9 rounded-lg" />
        <div className="min-w-0">
          <div className="text-sm font-bold tracking-tight text-white">{t('app.name')}</div>
          <div className="truncate font-mono text-[11px] text-muted">v{window.securlab.version}</div>
        </div>
      </div>

      <nav className="no-drag flex-1 space-y-1 px-3">
        {items.map(({ page: p, num, icon: Icon }) => {
          const active = p === page
          return (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? 'bg-white/5 text-white' : 'text-muted hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className={`h-1 w-1 rounded-full ${active ? 'glow-dot bg-accent' : 'bg-white/15'}`} />
              <span className="w-5 font-mono text-[11px]">{num}</span>
              <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1 text-left">{t(`nav.${p}`)}</span>
            </button>
          )
        })}
      </nav>

      <div className="no-drag p-4">
        <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
          <ShieldAlert size={13} className="shrink-0 text-accent" />
          <span className="font-mono text-[11px] leading-tight text-accent2">{t('app.safetyChip')}</span>
        </div>
        <a
          href="https://github.com/Verlintas/SecurLab"
          target="_blank"
          rel="noreferrer"
          className="mt-3 block text-center font-mono text-[10px] text-muted transition-colors hover:text-accent2"
        >
          github.com/Verlintas/SecurLab
        </a>
      </div>
    </aside>
  )
}
