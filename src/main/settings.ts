import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { LOCAL_HOSTS } from '../shared/net'

export interface Settings {
  allowlist: string[]
  rateLimit: number
  authorized: boolean
}

const defaults: Settings = { allowlist: [], rateLimit: 5, authorized: false }

function settingsFile(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): Settings {
  try {
    const raw = readFileSync(settingsFile(), 'utf8')
    return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...defaults }
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  const file = settingsFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

const LOCAL_HOSTS_SET = LOCAL_HOSTS

export function isTargetAllowed(host: string): boolean {
  const h = host.trim().toLowerCase()
  if (LOCAL_HOSTS_SET.has(h)) return true
  return getSettings().allowlist.some((entry) => {
    const entryHost = entry.trim().toLowerCase().split(':')[0]
    return entryHost === h
  })
}

export function assertTargetAllowed(host: string): void {
  const h = host.trim().toLowerCase()
  if (LOCAL_HOSTS_SET.has(h)) return
  const settings = getSettings()
  const allowlisted = settings.allowlist.some((entry) => {
    const entryHost = entry.trim().toLowerCase().split(':')[0]
    return entryHost === h
  })
  if (!allowlisted) {
    throw new Error(`target "${host}" is not allowlisted — add it in Settings first`)
  }
  if (!settings.authorized) {
    throw new Error(
      `confirm "I am authorized to test the listed targets" in Settings before testing non-local hosts`
    )
  }
}
