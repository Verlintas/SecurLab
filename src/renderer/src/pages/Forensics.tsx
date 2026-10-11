import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileSearch, Loader2 } from 'lucide-react'
import type { ForensicsEvent, ForensicsReport } from '../../../shared/forensics'
import { Chip, PageHeader, Panel } from '../components/ui'

function EventList({ title, events }: { title: string; events: ForensicsEvent[] }) {
  const { t } = useTranslation()
  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-edge px-4 py-2.5 font-mono text-xs text-muted">
        {title} · {events.length}
      </div>
      <div className="max-h-64 overflow-y-auto p-3">
        {events.length === 0 ? (
          <p className="text-xs text-muted">{t('forensics.noEvents')}</p>
        ) : (
          <ul className="space-y-1">
            {events.slice(-200).map((event, index) => (
              <li key={index} className="flex gap-2 font-mono text-[11px] leading-5">
                <span className="shrink-0 text-muted">{event.time}</span>
                <span className="shrink-0 text-accent2">{event.kind}</span>
                <span className="min-w-0 break-all text-neutral-300">{event.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

export default function Forensics() {
  const { t } = useTranslation()
  const [report, setReport] = useState<ForensicsReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [exportMsg, setExportMsg] = useState('')

  const pickAndAnalyze = async (): Promise<void> => {
    setError('')
    setExportMsg('')
    try {
      const path = await window.securlab.forensics.pick()
      if (!path) return
      setBusy(true)
      setReport(await window.securlab.forensics.analyze(path))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const doExport = async (): Promise<void> => {
    if (!report) return
    setExportMsg('')
    try {
      const result = await window.securlab.forensics.exportMd(report, 'forensics-report.md')
      if (result.saved && result.path) setExportMsg(t('reports.exported', { path: result.path }))
    } catch (err) {
      setExportMsg(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div>
      <PageHeader
        index="05"
        kicker={t('nav.forensics')}
        heading={t('pages.forensics.subtitle')}
        action={
          <div className="flex items-center gap-2">
            {report ? (
              <button
                onClick={() => void doExport()}
                className="flex items-center gap-1.5 rounded-md border border-edge px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-white/25 hover:text-white"
              >
                <Download size={12} />
                {t('forensics.export')}
              </button>
            ) : null}
            <button
              onClick={() => void pickAndAnalyze()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md border border-accent/60 bg-accent/15 px-3 py-1.5 font-mono text-xs text-accent2 transition-colors hover:bg-accent/25 disabled:opacity-35"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <FileSearch size={12} />}
              {t('forensics.pick')}
            </button>
          </div>
        }
      />

      {exportMsg ? <p className="mb-3 font-mono text-[11px] break-all text-ok">{exportMsg}</p> : null}
      {error ? <p className="mb-3 font-mono text-xs text-accent2">{error}</p> : null}

      {!report ? (
        <Panel className="p-6">
          <p className="mb-3 max-w-3xl text-sm leading-6 text-neutral-300">
            {t('pages.forensics.desc')}
          </p>
          <p className="font-mono text-xs text-muted">{t('forensics.empty')}</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="red">{t('forensics.source')}</Chip>
            <span
              className="min-w-0 truncate font-mono text-xs text-neutral-300"
              title={report.source}
            >
              {report.source}
            </span>
            <Chip>
              {report.players.length} {t('forensics.table.player')}
            </Chip>
            <Chip>
              {report.dangerousCommands.length} {t('forensics.commands')}
            </Chip>
          </div>

          {report.flags.length > 0 ? (
            <Panel className="border-accent/40 p-4">
              <h3 className="mb-2 text-sm font-semibold text-accent2">{t('forensics.flags')}</h3>
              <ul className="space-y-1.5">
                {report.flags.map((flag, index) => (
                  <li key={index} className="font-mono text-xs leading-5 text-neutral-200">
                    ▸ {flag}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel className="overflow-hidden">
            <div className="border-b border-edge px-4 py-2.5 font-mono text-xs text-muted">
              {t('forensics.players')}
            </div>
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-edge text-left font-mono text-[10px] tracking-wider text-muted uppercase">
                    <th className="px-4 py-2 font-normal">{t('forensics.table.player')}</th>
                    <th className="px-4 py-2 font-normal">{t('forensics.table.first')}</th>
                    <th className="px-4 py-2 font-normal">{t('forensics.table.last')}</th>
                    <th className="px-4 py-2 font-normal">{t('forensics.table.joins')}</th>
                    <th className="px-4 py-2 font-normal">{t('forensics.table.ips')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.players.map((player) => (
                    <tr key={player.name} className="border-b border-white/5 last:border-0">
                      <td className="px-4 py-1.5 text-neutral-200">{player.name}</td>
                      <td className="px-4 py-1.5 font-mono text-muted">{player.firstSeen}</td>
                      <td className="px-4 py-1.5 font-mono text-muted">{player.lastSeen}</td>
                      <td className="px-4 py-1.5 font-mono text-muted">{player.joins}</td>
                      <td className="px-4 py-1.5 font-mono text-muted">
                        {player.ips.join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid grid-cols-2 gap-4">
            <EventList title={t('forensics.opEvents')} events={report.opEvents} />
            <EventList title={t('forensics.authEvents')} events={report.authEvents} />
          </div>
          <EventList title={t('forensics.commands')} events={report.dangerousCommands} />
          <EventList title={t('forensics.connections')} events={report.connections} />
        </div>
      )}
    </div>
  )
}
