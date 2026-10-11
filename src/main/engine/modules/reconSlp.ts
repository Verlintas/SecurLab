import mc from 'minecraft-protocol'
import type { EngineModule } from '../types'

interface StatusJson {
  version?: { name?: string; protocol?: number }
  players?: { online?: number; max?: number; sample?: { name: string }[] }
  description?: unknown
  favicon?: string
}

const ping = mc.ping as unknown as (options: {
  host: string
  port: number
  closeTimeout?: number
}) => Promise<StatusJson>

export const reconSlp: EngineModule = {
  id: 'recon.slp',
  title: 'Server list ping (SLP)',
  async run(ctx) {
    const { host, port } = ctx.target
    ctx.log(`ping ${host}:${port}`)
    const started = Date.now()
    const status = await ping({ host, port, closeTimeout: 8000 })
    const latency = Date.now() - started

    const version = status.version?.name ?? 'unknown'
    const protocol = status.version?.protocol ?? null
    const online = status.players?.online ?? null
    const max = status.players?.max ?? null
    const motd =
      typeof status.description === 'string'
        ? status.description
        : status.description
          ? JSON.stringify(status.description)
          : ''

    ctx.log(`pong in ${latency}ms`)
    ctx.log(`version: ${version} (protocol ${protocol ?? '?'})`)
    ctx.log(`players: ${online ?? '?'}/${max ?? '?'}`)
    if (motd) ctx.log(`motd: ${motd}`)

    ctx.evidence('latencyMs', latency)
    ctx.evidence('version', version)
    ctx.evidence('protocol', protocol)
    ctx.evidence('playersOnline', online)
    ctx.evidence('playersMax', max)
    if (motd) ctx.evidence('motd', motd)
    if (status.players?.sample?.length) {
      ctx.evidence(
        'playerSample',
        status.players.sample.map((p) => p.name)
      )
      ctx.log(`player sample: ${status.players.sample.map((p) => p.name).join(', ')}`)
    }
  }
}
