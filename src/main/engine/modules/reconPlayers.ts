import mc from 'minecraft-protocol'
import type { EngineModule } from '../types'

interface StatusJson {
  players?: { sample?: { name: string }[] }
}

const ping = mc.ping as unknown as (options: {
  host: string
  port: number
  closeTimeout?: number
}) => Promise<StatusJson>

export const reconPlayers: EngineModule = {
  id: 'recon.players',
  title: 'Player enumeration',
  async run(ctx) {
    let sample = ctx.state.evidence.playerSample as string[] | undefined
    const queryPlayers = ctx.state.evidence.queryPlayers as string[] | undefined

    if (sample === undefined && queryPlayers === undefined) {
      ctx.log('no prior recon evidence — performing a direct status ping')
      const status = await ping({
        host: ctx.target.host,
        port: ctx.target.port,
        closeTimeout: 8000
      })
      sample = status.players?.sample?.map((p) => p.name) ?? []
      ctx.evidence('playerSample', sample)
    }

    const players = [...new Set([...(sample ?? []), ...(queryPlayers ?? [])])]

    if (players.length === 0) {
      ctx.log('no player names exposed via status or query')
      return
    }

    ctx.log(`players visible: ${players.join(', ')}`)
    ctx.evidence('visiblePlayers', players)
    ctx.finding({
      id: 'player-names-leaked',
      severity: 'low',
      title: `${players.length} player name(s) exposed`,
      detail:
        'Online player names — often including staff accounts — are visible through server status or query responses. Attackers collect these for targeted password spraying and admin-name impersonation.',
      evidence: { players }
    })
  }
}
