import type { EngineModule } from '../types'
import { JoinFailure, McSession, detectAuthPrompt, sleep } from './lib/mcSession'

interface AccountEntry {
  username: string
  password: string
}

function parseAccounts(raw: string | undefined): AccountEntry[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(':')
      if (idx <= 0) return null
      return { username: entry.slice(0, idx).trim(), password: entry.slice(idx + 1).trim() }
    })
    .filter((entry): entry is AccountEntry => entry !== null)
}

export const accessVerifyIdentity: EngineModule = {
  id: 'access.verify-identity',
  title: 'Verify claimed identities',
  async run(ctx) {
    const accounts = parseAccounts(ctx.params.accounts)
    if (accounts.length === 0) {
      throw new Error('accounts parameter is required, format: name:password,name2:password2')
    }

    for (const account of accounts) {
      if (ctx.signal.aborted) return
      ctx.log(`─ verifying identity "${account.username}"`)

      let session: McSession
      try {
        session = await McSession.open(ctx.target, account.username)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(`join failed: ${message}`)
        if (/online.?mode|encrypt|verify|authenticate/i.test(message)) {
          ctx.finding({
            id: 'online-mode-enforced',
            severity: 'info',
            title: 'Server enforces online-mode',
            detail: 'Offline identity verification does not apply on an online-mode server.',
            evidence: { reason: message }
          })
          return
        }
        if (error instanceof JoinFailure) continue
        throw error
      }

      try {
        await detectAuthPrompt(session, 3000)
        ctx.log('sending /login with the known credential')
        const loginOut = (await session.sendAndCollect(`/login ${account.password}`, 1500, 6000)).trim()
        const loginOk = /已成功登录|登录成功|successful login|successfully logged|logged in/i.test(loginOut)
        const loginFail = /密码错误|wrong password|incorrect/i.test(loginOut)
        ctx.evidence(`login_${account.username}`, loginOut.slice(0, 200))

        if (!loginOk && loginFail) {
          ctx.finding({
            id: 'identity-login-failed',
            severity: 'info',
            title: `Login failed for "${account.username}"`,
            detail: 'The known credential was rejected (wrong password or account state changed).',
            evidence: { username: account.username, output: loginOut.slice(0, 200) }
          })
          continue
        }

        ctx.log('verifying authentication state via /list')
        const listOut = (await session.sendAndCollect('/list', 1200, 5000)).trim()
        ctx.evidence(`list_${account.username}`, listOut.slice(0, 200))
        const listBlocked = /您需要先通过验证|need.*(verify|login)|must.*login|请先登录/i.test(listOut)
        const listUnknown = /unknown or incomplete command|see below for error/i.test(listOut)
        const authenticated = loginOk || (!listBlocked && !listUnknown && listOut.length > 0)

        if (!authenticated) {
          ctx.finding({
            id: 'identity-not-authenticated',
            severity: 'info',
            title: `Could not authenticate "${account.username}"`,
            detail:
              'Login did not produce a confirmation and subsequent commands still appear to be held back by the login plugin.',
            evidence: {
              username: account.username,
              loginOutput: loginOut.slice(0, 200),
              listOutput: listOut.slice(0, 200)
            }
          })
          continue
        }
        ctx.log('authenticated — checking operator status via /seed')

        const seedOut = (await session.sendAndCollect('/seed', 1500, 6000)).trim()
        const isOperator = /seed\s*[:：]|种子\s*[:：]/i.test(seedOut)
        ctx.log(isOperator ? '/seed allowed → operator status' : '/seed denied → no operator rights')

        if (isOperator) {
          ctx.evidence('opGainedAs', account.username)
          ctx.finding({
            id: 'offline-op-gained',
            severity: 'high',
            title: `Operator access gained as "${account.username}"`,
            detail:
              'A freshly claimed identity authenticates and inherits operator status — full server takeover from an unauthenticated registration.',
            evidence: { name: account.username, proofCommand: '/seed', output: seedOut.slice(0, 200) }
          })
          return
        }

        ctx.finding({
          id: 'authenticated-no-op',
          severity: 'info',
          title: `"${account.username}" authenticates without operator rights`,
          detail:
            'The claimed identity logs in successfully but does not carry operator status. It remains usable for impersonation of a staff-looking name.',
          evidence: { username: account.username, seedOutput: seedOut.slice(0, 200) }
        })
      } finally {
        session.close()
      }
      await sleep(600)
    }
  }
}
