import type { EngineModule } from '../types'
import { JoinFailure, McSession, detectAuthPrompt, sleep } from './lib/mcSession'

const DEFAULT_NAMES = [
  'Admin',
  'Owner',
  'Moderator',
  'Mod',
  'Administrator',
  'admin',
  'owner',
  'moderator'
]

export const accessNameScan: EngineModule = {
  id: 'access.name-scan',
  title: 'Privileged name scan',
  async run(ctx) {
    const names = (ctx.params.names && ctx.params.names.trim().length > 0
      ? ctx.params.names.split(',')
      : DEFAULT_NAMES
    )
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, 8)

    const claimable: string[] = []
    const existing: string[] = []
    const noAuth: string[] = []

    for (const name of names) {
      if (ctx.signal.aborted) return
      ctx.log(`checking "${name}"`)
      let session: McSession
      try {
        session = await McSession.open(ctx.target, name, 12000)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/online.?mode|encrypt|verify|authenticate/i.test(message)) {
          ctx.finding({
            id: 'online-mode-enforced',
            severity: 'info',
            title: 'Server enforces online-mode',
            detail: 'Joins require Mojang sessions; privileged-name registration is not applicable.',
            evidence: { reason: message }
          })
          return
        }
        if (/whitelist/i.test(message)) {
          ctx.log('  join rejected by whitelist — stop scanning')
          break
        }
        if (error instanceof JoinFailure) {
          ctx.log(`  join failed: ${message}`)
          continue
        }
        throw error
      }
      try {
        const prompt = await detectAuthPrompt(session, 3000)
        if (prompt === 'register') {
          claimable.push(name)
          ctx.log('  → unregistered (claimable)')
        } else if (prompt === 'login') {
          existing.push(name)
          ctx.log('  → registered')
        } else {
          noAuth.push(name)
          ctx.log('  → no login prompt (no auth plugin?)')
        }
      } finally {
        session.close()
      }
      await sleep(500)
    }

    ctx.evidence('claimableNames', claimable)
    ctx.evidence('existingNames', existing)

    if (claimable.length === 0 && existing.length === 0 && noAuth.length > 0) {
      ctx.finding({
        id: 'no-auth-plugin',
        severity: 'medium',
        title: 'No login plugin prompts observed',
        detail:
          'Joins were accepted without any registration or login prompt — the server likely has no authentication plugin at all.',
        evidence: { names: noAuth }
      })
      return
    }
    if (claimable.length > 0) {
      ctx.finding({
        id: 'claimable-names',
        severity: 'medium',
        title: `${claimable.length} privileged name(s) unregistered`,
        detail: `Anyone can register these names on an offline-mode server: ${claimable.join(', ')}. If any carries operator or staff rights this becomes full takeover — the next chain step tests that.`,
        evidence: { claimable }
      })
    } else {
      ctx.log('no claimable privileged names found')
    }
    if (existing.length > 0) ctx.log(`registered names: ${existing.join(', ')}`)
  }
}
