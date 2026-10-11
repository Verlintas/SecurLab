import type { EngineModule } from '../types'

export const reconPlayers: EngineModule = {
  id: 'recon.players',
  title: 'Player enumeration',
  async run(ctx) {
    const sample = ctx.state.evidence.playerSample as string[] | undefined
    const queryPlayers = ctx.state.evidence.queryPlayers as string[] | undefined
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
