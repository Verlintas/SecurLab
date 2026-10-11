import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import logo from '../assets/logo.png'
import { useUi, type Lang } from '../store/ui'
import { Chip, PageHeader, Panel } from '../components/ui'

export default function Settings() {
  const { t } = useTranslation()
  const lang = useUi((s) => s.lang)

  const [allowlist, setAllowlist] = useState('')
  const [rateLimit, setRateLimit] = useState('5')
  const [authorized, setAuthorized] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.securlab.settings.get().then((s) => {
      setAllowlist(s.allowlist.join('\n'))
      setRateLimit(String(s.rateLimit))
      setAuthorized(s.authorized)
    })
  }, [])

  const save = async (): Promise<void> => {
    await window.securlab.settings.set({
      allowlist: allowlist
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      rateLimit: Number(rateLimit) || 5,
      authorized
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const setLanguage = (l: Lang): void => {
    void i18n.changeLanguage(l)
    useUi.setState({ lang: l })
  }

  const env: [string, string][] = [
    ['platform', window.securlab?.platform ?? '-'],
    ['electron', window.securlab?.versions?.electron ?? '-'],
    ['chrome', window.securlab?.versions?.chrome ?? '-'],
    ['node', window.securlab?.versions?.node ?? '-']
  ]

  const langButton = (l: Lang, label: string): ReactNode => (
    <button
      key={l}
      onClick={() => setLanguage(l)}
      className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-colors ${
        lang === l
          ? 'border-accent/60 bg-accent/10 text-accent2'
          : 'border-edge text-muted hover:border-white/25 hover:text-white'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <PageHeader index="05" kicker={t('nav.settings')} heading={t('pages.settings.subtitle')} />

      <div className="grid grid-cols-2 gap-4">
        <Panel className="col-span-2 p-5">
          <h3 className="mb-1 text-sm font-semibold text-white">{t('pages.settings.safety')}</h3>
          <p className="mb-4 font-mono text-xs text-muted">{t('pages.settings.safetyDesc')}</p>
          <label className="mb-1 block text-xs text-muted">{t('pages.settings.allowlist')}</label>
          <textarea
            rows={3}
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
            placeholder={t('pages.settings.allowlistPlaceholder')}
            className="mb-4 w-full resize-none rounded-lg border border-edge bg-base px-3 py-2 font-mono text-xs text-neutral-300 placeholder:text-white/25 focus:border-accent/50 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <label className="mb-1 block text-xs text-muted">{t('pages.settings.rateLimit')}</label>
              <input
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value.replace(/\D/g, ''))}
                className="w-24 rounded-lg border border-edge bg-base px-3 py-1.5 font-mono text-xs text-neutral-300 focus:border-accent/50 focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2 pt-4 text-xs text-muted">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                className="accent-[#ff0000]"
              />
              {t('pages.settings.authorized')}
            </label>
            <button
              onClick={() => void save()}
              className="mt-4 rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 font-mono text-xs text-accent2 transition-colors hover:bg-accent/20"
            >
              {t('pages.settings.save')}
            </button>
            {saved ? <span className="mt-4 font-mono text-xs text-ok">{t('pages.settings.saved')}</span> : null}
          </div>
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('pages.settings.language')}</h3>
          <div className="flex gap-2">{langButton('zh-CN', '中文')}{langButton('en', 'English')}</div>
        </Panel>

        <Panel className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">{t('pages.settings.environment')}</h3>
          <div className="space-y-1.5">
            {env.map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 font-mono text-xs">
                <span className="w-20 text-muted">{k}</span>
                <span className="text-neutral-300">{v}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="col-span-2 p-5">
          <div className="flex items-center gap-4">
            <img src={logo} alt="SecurLab" className="h-12 w-12 rounded-xl" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{t('app.name')}</span>
                <Chip>v0.1.0 · M0</Chip>
                <Chip>MIT</Chip>
              </div>
              <p className="mt-1 text-xs text-muted">{t('pages.settings.aboutDesc')}</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
