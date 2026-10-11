import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Severity } from '../../../shared/engineTypes'
import type { Priority } from '../data/lab'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-edge bg-panel ${className}`}>{children}</section>
}

type Tone = 'default' | 'red' | 'green' | 'amber' | 'blue'

export function Chip({
  children,
  tone = 'default',
  className = ''
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  const tones: Record<Tone, string> = {
    default: 'border-edge text-muted',
    red: 'border-accent/50 bg-accent/10 text-accent2',
    green: 'border-ok/40 bg-ok/10 text-ok',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    blue: 'border-sky-500/40 bg-sky-500/10 text-sky-400'
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function PriorityBadge({ p }: { p: Priority }) {
  const tone: Tone = p === 'P0' ? 'red' : p === 'P1' ? 'amber' : 'default'
  return (
    <Chip tone={tone} className={p === 'P0' ? 'glow-red' : ''}>
      {p}
    </Chip>
  )
}

export function SeverityBadge({ s }: { s: Severity }) {
  const tone: Tone =
    s === 'critical' || s === 'high'
      ? 'red'
      : s === 'medium'
        ? 'amber'
        : s === 'low'
          ? 'blue'
          : 'default'
  return <Chip tone={tone}>{s}</Chip>
}

export function PageHeader({
  index,
  kicker,
  heading,
  action
}: {
  index: string
  kicker: string
  heading: string
  action?: ReactNode
}) {
  return (
    <header className="mb-6 flex items-end justify-between gap-4">
      <div>
        <div className="mb-2 font-mono text-xs tracking-widest text-muted uppercase">
          <span className="text-accent">{index}</span> / {kicker}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{heading}</h1>
      </div>
      {action}
    </header>
  )
}

export function PlannedCard({
  milestone,
  desc,
  points
}: {
  milestone: string
  desc: string
  points: string[]
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-panel/40 p-6">
      <div className="mb-3 flex items-center gap-2">
        <Chip tone="red">{milestone}</Chip>
        <span className="font-mono text-xs text-muted">{t('common.planned')}</span>
      </div>
      <p className="mb-4 max-w-3xl text-sm leading-6 text-neutral-300">{desc}</p>
      <ul className="space-y-2">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 text-sm text-muted">
            <span className="mt-0.5 font-mono text-accent">▸</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  )
}
