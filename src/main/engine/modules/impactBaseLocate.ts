import type { EngineModule } from '../types'
import { McSession, sleep } from './lib/mcSession'
import { openOperatorSession, resolvePassword } from './lib/operator'

export const impactBaseLocate: EngineModule = {
  id: 'impact.base-locate',
  title: 'Precise location extraction',
  async run(ctx) {
    const username = ctx.params.username?.trim() || 'Admin'
    const password = resolvePassword(ctx, username)
    if (!password) {
      throw new Error('no credentials for the operator identity — pass password or run after a takeover step')
    }
    const guestName = ctx.params.guest?.trim() || 'ImpactGuest1'

    let guest: McSession | null = null
    try {
      guest = await McSession.open(ctx.target, guestName, 12000)
      ctx.log(`guest "${guestName}" is online`)
    } catch (error) {
      ctx.log(`guest join failed (${error instanceof Error ? error.message : String(error)}) — locating the operator itself`)
    }

    const locateTarget = guest ? guestName : username
    const operator = await openOperatorSession(ctx, username, password)
    try {
      await sleep(1000)
      const out = (await operator.sendAndCollect(`/data get entity ${locateTarget} Pos`, 1200, 6000)).trim()
      ctx.log(`/data get → ${out.slice(0, 160) || '(no response)'}`)
      const match = out.match(/\[\s*([-\d.]+)d?,\s*([-\d.]+)d?,\s*([-\d.]+)d?\s*\]/)
      if (match) {
        const coordinates: [number, number, number] = [
          Number(match[1]),
          Number(match[2]),
          Number(match[3])
        ]
        ctx.evidence('locatedPlayer', { target: locateTarget, coordinates, raw: out.slice(0, 200) })
        ctx.finding({
          id: 'player-location-extraction',
          severity: 'high',
          title: `Exact coordinates of "${locateTarget}" extracted with operator access`,
          detail:
            'With operator rights any online player position is readable via /data get entity … Pos. On production servers attackers achieve the same precision through CoreProtect lookup logs, dynmap rendering or teleport commands — this is how "targeted demolition" of player bases is carried out.',
          evidence: { target: locateTarget, coordinates }
        })
      } else {
        ctx.finding({
          id: 'player-location-extraction',
          severity: 'info',
          title: `Location probe returned no coordinates for "${locateTarget}"`,
          detail: 'The /data command executed but no coordinate array was parsed from the response.',
          evidence: { raw: out.slice(0, 200) }
        })
      }
    } finally {
      operator.close()
      guest?.close()
    }
  }
}
