import { useTranslation } from 'react-i18next'
import { PageHeader, PlannedCard } from '../components/ui'

interface Line {
  tag: string
  text: string
  tone?: 'red' | 'ok'
}

const engineLines: Line[] = [
  { tag: 'boot', text: 'securlab engine v0.1.0', tone: 'red' },
  { tag: 'chain', text: 'C1 offline-op-takeover' },
  { tag: 'step', text: 'recon.slp → probe localhost:25565' },
  { tag: 'info', text: 'offline-mode detected · ops.json reachable' },
  { tag: 'step', text: 'access.offline-op → join as "Admin"' },
  { tag: 'pass', text: 'op gained — /list executed', tone: 'ok' },
  { tag: 'done', text: '1 finding (high) · report #1', tone: 'red' }
]

const consoleLines: Line[] = [
  { tag: 'Server', text: 'Loading properties...' },
  { tag: 'Server', text: 'This server is running Paper 1.20.4' },
  { tag: 'Server', text: 'Done (2.1s)! For help, type "help"' },
  { tag: 'AuthMe', text: 'Player Admin[/127.0.0.1] logged in', tone: 'ok' },
  { tag: 'Server', text: 'Admin issued server command: /list', tone: 'red' }
]

function Terminal({ title, lines, prompt }: { title: string; lines: Line[]; prompt: string }) {
  const toneClass = (tone?: Line['tone']): string =>
    tone === 'red' ? 'text-accent2' : tone === 'ok' ? 'text-ok' : 'text-neutral-300'

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-[#070707]">
      <div className="flex items-center gap-1.5 border-b border-edge px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-accent/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11px] text-muted">{title}</span>
      </div>
      <div className="p-4 font-mono text-xs leading-6">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 text-white/25">[{String(i).padStart(2, '0')}:00]</span>
            <span className="w-12 shrink-0 text-muted">{l.tag}</span>
            <span className={toneClass(l.tone)}>{l.text}</span>
          </div>
        ))}
        <div className="caret text-muted">{prompt}</div>
      </div>
    </div>
  )
}

export default function Run() {
  const { t } = useTranslation()
  const points = t('pages.run.points', { returnObjects: true }) as unknown as string[]

  return (
    <div>
      <PageHeader index="03" kicker={t('nav.run')} heading={t('pages.run.subtitle')} />

      <div className="mb-6">
        <PlannedCard milestone="M2" desc={t('pages.run.desc')} points={points} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Terminal title={t('pages.run.engine')} lines={engineLines} prompt="securlab$" />
        <Terminal title={t('pages.run.console')} lines={consoleLines} prompt=">" />
      </div>
    </div>
  )
}
