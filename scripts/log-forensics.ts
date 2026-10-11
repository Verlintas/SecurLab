import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const inputPath = process.env.LOG ?? process.argv[2] ?? ''
if (!inputPath || !existsSync(inputPath)) {
  console.error('usage: LOG=/path/to/latest.log npm run log:forensics')
  process.exit(1)
}

interface PlayerInfo {
  name: string
  firstSeen: string
  lastSeen: string
  ips: Set<string>
  joins: number
}

interface Event {
  time: string
  kind: string
  detail: string
}

const players = new Map<string, PlayerInfo>()
const events: Event[] = []
const authEvents: Event[] = []
const opEvents: Event[] = []
const commandEvents: Event[] = []
const connectionEvents: Event[] = []

const DANGEROUS_COMMAND =
  /^\/(op|deop|gamemode|gm|tp|teleport|give|fill|setblock|clone|execute|kill|ban|ban-ip|kick|whitelist|gamerule|summon|difficulty|weather|time|effect|enchant|damage|data|tag|spreadplayers|forceload|stop|reload|restart|save-off|save-all|\/)/

function touchPlayer(name: string, time: string, ip?: string): PlayerInfo {
  const existing = players.get(name)
  if (existing) {
    existing.lastSeen = time
    if (ip) existing.ips.add(ip)
    return existing
  }
  const info: PlayerInfo = { name, firstSeen: time, lastSeen: time, ips: new Set(), joins: 0 }
  if (ip) info.ips.add(ip)
  players.set(name, info)
  return info
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

function toSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

const LINE_RE = /^\[(\d{2}:\d{2}:\d{2})\]\s*(?:\[([^\]]*)\]:\s*)?(.*)$/

for (const raw of readAllLines(inputPath)) {
  const match = raw.match(LINE_RE)
  if (!match) continue
  const [, time, , message] = match

  let m: RegExpMatchArray | null

  if ((m = message.match(/^UUID of player (\S+) is ([0-9a-f-]{36})$/))) {
    touchPlayer(m[1], time)
    connectionEvents.push({ time, kind: 'uuid', detail: `${m[1]} uuid=${m[2]}` })
    continue
  }
  if ((m = message.match(/^(\S+) joined the game$/))) {
    const info = touchPlayer(m[1], time)
    info.joins++
    events.push({ time, kind: 'join', detail: m[1] })
    continue
  }
  if ((m = message.match(/^(\S+)\[\/([0-9.]+):\d+\] logged in with entity id/))) {
    touchPlayer(m[1], time, m[2])
    continue
  }
  if ((m = message.match(/^(\S+) left the game$/)) || (m = message.match(/^(\S+) lost connection: (.+)$/))) {
    events.push({ time, kind: 'leave', detail: `${m[1]}${m[2] ? ` — ${m[2]}` : ''}` })
    continue
  }
  if ((m = message.match(/<-> InitialHandler has connected/))) {
    const ipMatch = raw.match(/\[(\d{1,3}(?:\.\d{1,3}){3}):\d+\]/)
    const nameMatch = raw.match(/\[([A-Za-z0-9_]{3,16})\]/)
    if (nameMatch) touchPlayer(nameMatch[1], time, ipMatch?.[1])
    connectionEvents.push({ time, kind: 'bungee-connect', detail: raw.replace(/^\[[^\]]*\]\s*/, '').slice(0, 140) })
    continue
  }
  if ((m = message.match(/^Made (\S+) a server operator$/))) {
    touchPlayer(m[1], time)
    opEvents.push({ time, kind: 'op', detail: `OP granted to ${m[1]}` })
    continue
  }
  if ((m = message.match(/^Made (\S+) no longer a server operator$/))) {
    opEvents.push({ time, kind: 'deop', detail: `OP revoked from ${m[1]}` })
    continue
  }
  if ((m = message.match(/\[AuthMe\] (\S+) registered (\S+)/))) {
    authEvents.push({ time, kind: 'register', detail: `${m[1]} from ${m[2]}` })
    touchPlayer(m[1], time, m[2])
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
    touchPlayer(m[1], time)
    commandEvents.push({ time, kind: 'command', detail: `${m[1]}: ${m[2]}` })
    const opMatch = m[2].match(/^\/op (\S+)$/)
    if (opMatch) {
      touchPlayer(opMatch[1], time)
      opEvents.push({ time, kind: 'op', detail: `OP granted to ${opMatch[1]} by ${m[1]}` })
    }
    const deopMatch = m[2].match(/^\/deop (\S+)$/)
    if (deopMatch) {
      opEvents.push({ time, kind: 'deop', detail: `OP revoked from ${deopMatch[1]} by ${m[1]}` })
    }
    continue
  }
  if (/kicked|Disconnecting|Kicked/i.test(message)) {
    connectionEvents.push({ time, kind: 'kick', detail: message.slice(0, 140) })
    continue
  }
}

// heuristics
const flags: string[] = []
for (const [name, info] of players) {
  const registerEvent = authEvents.find(
    (e) => e.kind === 'register' && e.detail.startsWith(`${name} `)
  )
  if (registerEvent) {
    const delta = toSeconds(registerEvent.time) - toSeconds(info.firstSeen)
    if (delta >= 0 && delta <= 300 && info.joins <= 5) {
      flags.push(
        `[注册劫持迹象] "${name}" 首次出现并于 ${delta} 秒后注册（无历史记录）— 与抢注接管行为一致`
      )
    }
  }
}
const opWithRecentJoin = opEvents.filter((e) => {
  const name = e.detail.match(/to (\S+)/)?.[1] ?? ''
  const info = players.get(name)
  return Boolean(info && info.joins <= 2)
})
if (opWithRecentJoin.length > 0) {
  flags.push(
    `[权限接管迹象] ${opWithRecentJoin.length} 次 OP 授予了新出现账号：${opWithRecentJoin.map((e) => e.detail).join('; ')}`
  )
}
const destructive = commandEvents.filter((e) => DANGEROUS_COMMAND.test(e.detail.split(': ').slice(1).join(': ')))
const destructiveByPlayer = new Map<string, number>()
const destructiveTimes = new Map<string, number[]>()
for (const e of destructive) {
  const name = e.detail.split(':')[0]
  destructiveByPlayer.set(name, (destructiveByPlayer.get(name) ?? 0) + 1)
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

const lines: string[] = []
lines.push('# Server log forensics report', '')
lines.push(`- Source: \`${inputPath}\``, `- Players seen: ${players.size}`, `- Commands logged: ${commandEvents.length}`, '')

lines.push('## Player timeline (first seen × IP)', '')
lines.push('| Player | First seen | Last seen | Joins | IPs |', '| --- | --- | --- | --- | --- |')
for (const info of [...players.values()].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))) {
  lines.push(`| ${info.name} | ${info.firstSeen} | ${info.lastSeen} | ${info.joins} | ${[...info.ips].join(', ') || '—'} |`)
}
lines.push('')

if (opEvents.length > 0) {
  lines.push('## OP events', '')
  for (const e of opEvents) lines.push(`- \`${e.time}\` ${e.detail}`)
  lines.push('')
}
if (authEvents.length > 0) {
  lines.push('## Auth (AuthMe) events', '')
  for (const e of authEvents.slice(0, 80)) lines.push(`- \`${e.time}\` [${e.kind}] ${e.detail}`)
  lines.push('')
}
if (destructive.length > 0) {
  lines.push('## Dangerous commands', '')
  for (const e of destructive.slice(0, 120)) lines.push(`- \`${e.time}\` ${e.detail}`)
  lines.push('')
  lines.push('### Command counts per player', '')
  for (const [name, count] of [...destructiveByPlayer.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${name}: ${count}`)
  }
  lines.push('')
}
if (flags.length > 0) {
  lines.push('## Flags', '')
  for (const flag of flags) lines.push(`- ${flag}`)
  lines.push('')
}

const report = lines.join('\n')
const outputPath = join(process.cwd(), 'out', `forensics-${Date.now()}.md`)
writeFileSync(outputPath, `${report}\n`)
console.log(report)
console.log(`\n[forensics] report written to ${outputPath}`)
