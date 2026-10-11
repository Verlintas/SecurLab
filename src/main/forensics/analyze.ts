import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ForensicsEvent, ForensicsPlayer, ForensicsReport } from '../../shared/forensics'

const LINE_RE = /^\[(\d{2}:\d{2}:\d{2})\]\s*(?:\[([^\]]*)\]:\s*)?(.*)$/

const DANGEROUS_COMMAND =
  /^\/(op|deop|gamemode|gm|tp|teleport|give|fill|setblock|clone|execute|kill|ban|ban-ip|kick|whitelist|gamerule|summon|difficulty|weather|time|effect|enchant|damage|data|tag|spreadplayers|forceload|stop|reload|restart|save-off|save-all|\/)/

function toSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

function readAllLines(path: string): string[] {
  const stat = statSync(path)
  if (stat.isDirectory()) {
    const files = readdirSync(path)
      .filter((f) => f.endsWith('.log') || f.endsWith('.txt'))
      .sort()
    return files.flatMap((f) => readFileSync(join(path, f), 'utf8').split(/\r?\n/))
  }
  return readFileSync(path, 'utf8').split(/\r?\n/)
}

export function analyzeLogFile(inputPath: string): ForensicsReport {
  if (!existsSync(inputPath)) throw new Error(`log path not found: ${inputPath}`)

  const players = new Map<string, { name: string; firstSeen: string; lastSeen: string; ips: Set<string>; joins: number }>()
  const opEvents: ForensicsEvent[] = []
  const authEvents: ForensicsEvent[] = []
  const commandEvents: ForensicsEvent[] = []
  const connections: ForensicsEvent[] = []

  const touch = (
    name: string,
    time: string,
    ip?: string
  ): { name: string; firstSeen: string; lastSeen: string; ips: Set<string>; joins: number } => {
    const existing = players.get(name)
    if (existing) {
      existing.lastSeen = time
      if (ip) existing.ips.add(ip)
      return existing
    }
    const info = { name, firstSeen: time, lastSeen: time, ips: new Set<string>(), joins: 0 }
    if (ip) info.ips.add(ip)
    players.set(name, info)
    return info
  }

  for (const raw of readAllLines(inputPath)) {
    const match = raw.match(LINE_RE)
    if (!match) continue
    const [, time, , message] = match
    let m: RegExpMatchArray | null

    if ((m = message.match(/^UUID of player (\S+) is ([0-9a-f-]{36})$/))) {
      touch(m[1], time)
      connections.push({ time, kind: 'uuid', detail: `${m[1]} uuid=${m[2]}` })
      continue
    }
    if ((m = message.match(/^(\S+) joined the game$/))) {
      touch(m[1], time).joins++
      continue
    }
    if ((m = message.match(/^(\S+)\[\/([0-9.]+):\d+\] logged in with entity id/))) {
      touch(m[1], time, m[2])
      continue
    }
    if ((m = message.match(/^(\S+) left the game$/)) || (m = message.match(/^(\S+) lost connection: (.+)$/))) {
      connections.push({ time, kind: 'leave', detail: `${m[1]}${m[2] ? ` — ${m[2]}` : ''}` })
      continue
    }
    if (/kicked|Disconnecting/i.test(message)) {
      connections.push({ time, kind: 'kick', detail: message.slice(0, 140) })
      continue
    }
    if ((m = message.match(/^Made (\S+) a server operator$/))) {
      touch(m[1], time)
      opEvents.push({ time, kind: 'op', detail: `OP granted to ${m[1]}` })
      continue
    }
    if ((m = message.match(/^Made (\S+) no longer a server operator$/))) {
      opEvents.push({ time, kind: 'deop', detail: `OP revoked from ${m[1]}` })
      continue
    }
    if ((m = message.match(/\[AuthMe\] (\S+) registered (\S+)/))) {
      authEvents.push({ time, kind: 'register', detail: `${m[1]} from ${m[2]}` })
      touch(m[1], time, m[2])
      continue
    }
    if ((m = message.match(/\[AuthMe\] (\S+) logged in (\S+)/))) {
      authEvents.push({ time, kind: 'login', detail: `${m[1]} from ${m[2]}` })
      continue
    }
    if (/wrong password|密码错误/i.test(message)) {
      authEvents.push({ time, kind: 'wrong-password', detail: message.slice(0, 120) })
      continue
    }
    if ((m = message.match(/^(\S+) issued server command: (.+)$/))) {
      touch(m[1], time)
      commandEvents.push({ time, kind: 'command', detail: `${m[1]}: ${m[2]}` })
      const opMatch = m[2].match(/^\/op (\S+)$/)
      if (opMatch) {
        touch(opMatch[1], time)
        opEvents.push({ time, kind: 'op', detail: `OP granted to ${opMatch[1]} by ${m[1]}` })
      }
      const deopMatch = m[2].match(/^\/deop (\S+)$/)
      if (deopMatch) {
        opEvents.push({ time, kind: 'deop', detail: `OP revoked from ${deopMatch[1]} by ${m[1]}` })
      }
      continue
    }
  }

  const flags: string[] = []
  for (const [name, info] of players) {
    const registerEvent = authEvents.find(
      (e) => e.kind === 'register' && e.detail.startsWith(`${name} `)
    )
    if (registerEvent) {
      const delta = toSeconds(registerEvent.time) - toSeconds(info.firstSeen)
      if (delta >= 0 && delta <= 300 && info.joins <= 5) {
        flags.push(`[注册劫持迹象] "${name}" 首次出现并于 ${delta} 秒后注册（无历史记录）— 与抢注接管行为一致`)
      }
    }
  }
  const recentOp = opEvents.filter((e) => {
    const name = e.detail.match(/to (\S+)/)?.[1] ?? ''
    const info = players.get(name)
    return Boolean(info && info.joins <= 2)
  })
  if (recentOp.length > 0) {
    flags.push(`[权限接管迹象] ${recentOp.length} 次 OP 授予了新出现账号：${recentOp.map((e) => e.detail).join('; ')}`)
  }

  const dangerousCommands = commandEvents.filter((e) =>
    DANGEROUS_COMMAND.test(e.detail.split(': ').slice(1).join(': '))
  )
  const destructiveTimes = new Map<string, number[]>()
  for (const e of dangerousCommands) {
    const name = e.detail.split(':')[0]
    const list = destructiveTimes.get(name) ?? []
    list.push(toSeconds(e.time))
    destructiveTimes.set(name, list)
  }
  for (const [name, times] of destructiveTimes) {
    if (times.length >= 5) {
      const span = Math.max(...times) - Math.min(...times)
      if (span <= 120) {
        flags.push(`[破坏爆发迹象] "${name}" 在 ${span} 秒内执行了 ${times.length} 条破坏性指令`)
      }
    }
  }

  const playerList: ForensicsPlayer[] = [...players.values()]
    .sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))
    .map((info) => ({
      name: info.name,
      firstSeen: info.firstSeen,
      lastSeen: info.lastSeen,
      joins: info.joins,
      ips: [...info.ips]
    }))

  return {
    source: inputPath,
    players: playerList,
    opEvents,
    authEvents,
    dangerousCommands,
    connections: connections.slice(-200),
    flags
  }
}

export function renderForensicsMarkdown(report: ForensicsReport): string {
  const lines: string[] = []
  lines.push('# Server log forensics report', '')
  lines.push(`- Source: \`${report.source}\``)
  lines.push(`- Players seen: ${report.players.length}`)
  lines.push(`- Dangerous commands: ${report.dangerousCommands.length}`, '')

  lines.push('## Player timeline (first seen × IP)', '')
  lines.push('| Player | First seen | Last seen | Joins | IPs |', '| --- | --- | --- | --- | --- |')
  for (const info of report.players) {
    lines.push(
      `| ${info.name} | ${info.firstSeen} | ${info.lastSeen} | ${info.joins} | ${info.ips.join(', ') || '—'} |`
    )
  }
  lines.push('')

  if (report.opEvents.length > 0) {
    lines.push('## OP events', '')
    for (const e of report.opEvents) lines.push(`- \`${e.time}\` ${e.detail}`)
    lines.push('')
  }
  if (report.authEvents.length > 0) {
    lines.push('## Auth (AuthMe) events', '')
    for (const e of report.authEvents.slice(0, 80)) lines.push(`- \`${e.time}\` [${e.kind}] ${e.detail}`)
    lines.push('')
  }
  if (report.dangerousCommands.length > 0) {
    lines.push('## Dangerous commands', '')
    for (const e of report.dangerousCommands.slice(0, 120)) lines.push(`- \`${e.time}\` ${e.detail}`)
    lines.push('')
  }
  if (report.flags.length > 0) {
    lines.push('## Flags', '')
    for (const flag of report.flags) lines.push(`- ${flag}`)
    lines.push('')
  }
  lines.push('---', '')
  lines.push('Generated by SecurLab · https://github.com/Verlintas/SecurLab', '')
  return lines.join('\n')
}
