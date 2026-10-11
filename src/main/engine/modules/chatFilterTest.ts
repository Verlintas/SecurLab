import type { EngineModule } from '../types'
import { loginWithCredentials } from './lib/authFlow'
import { JoinFailure, McSession, sleep } from './lib/mcSession'

const DEFAULT_MESSAGE = 'SecurLab广告测试:加群88888888 网站 example.com'

async function chatRound(
  session: McSession,
  message: string
): Promise<{ delivered: boolean; responses: string[] }> {
  const before = session.recentMessages.length
  session.chat(message)
  await sleep(3000)
  const responses = session.recentMessages.slice(before)
  const delivered = responses.some((line) => line.includes(message))
  return { delivered, responses: responses.slice(0, 8) }
}

export const chatFilterTest: EngineModule = {
  id: 'chat.filter-test',
  title: 'Chat & ad filter test',
  async run(ctx) {
    const username = ctx.params.username?.trim() || 'SecurLabProbe'
    const password = ctx.params.password?.trim() ?? ''
    const message = ctx.params.message?.trim() || DEFAULT_MESSAGE

    let session: McSession
    try {
      session = await McSession.open(ctx.target, username)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (/online.?mode|encrypt|verify|authenticate/i.test(reason)) {
        ctx.finding({
          id: 'online-mode-enforced',
          severity: 'info',
          title: 'Server enforces online-mode',
          detail: 'Chat filter probes do not apply to the Mojang login flow.',
          evidence: { reason }
        })
        return
      }
      if (/whitelist/i.test(reason)) {
        ctx.finding({
          id: 'whitelist-enforced',
          severity: 'info',
          title: 'Whitelist enforced',
          detail: 'The join was rejected by the whitelist.',
          evidence: { reason }
        })
        return
      }
      if (error instanceof JoinFailure) {
        ctx.log(`join failed: ${reason}`)
        return
      }
      throw error
    }

    try {
      ctx.log(`sending an ad-style test message while unauthenticated: "${message}"`)
      const unauthenticated = await chatRound(session, message)
      ctx.evidence('chat_unauth', {
        delivered: unauthenticated.delivered,
        responses: unauthenticated.responses
      })
      if (unauthenticated.delivered) {
        ctx.finding({
          id: 'chat-before-login-allowed',
          severity: 'medium',
          title: 'Chat accepted before authentication',
          detail:
            'An unauthenticated player could post a chat message with ad-like content. Login plugins normally mute chat until the player logs in.',
          evidence: { message, responses: unauthenticated.responses }
        })
      } else {
        ctx.finding({
          id: 'chat-before-login-blocked',
          severity: 'info',
          title: 'Chat blocked before authentication',
          detail: 'The server filtered or muted chat for the unauthenticated player.',
          evidence: { responses: unauthenticated.responses }
        })
      }

      if (!password) return
      const login = await loginWithCredentials(session, password)
      ctx.evidence('loginOutput', login.loginOutput.slice(0, 200))
      if (login.state !== 'ok') {
        ctx.finding({
          id: 'identity-login-failed',
          severity: 'info',
          title: `Could not authenticate "${username}"`,
          detail: 'Skipping the authenticated chat round.',
          evidence: { state: login.state, loginOutput: login.loginOutput.slice(0, 200) }
        })
        return
      }

      const authedMessage = `${message} (authed)`
      ctx.log(`sending the ad-style test message while authenticated: "${authedMessage}"`)
      const authenticated = await chatRound(session, authedMessage)
      ctx.evidence('chat_auth', {
        delivered: authenticated.delivered,
        responses: authenticated.responses
      })
      if (authenticated.delivered) {
        ctx.finding({
          id: 'chat-unfiltered',
          severity: 'low',
          title: 'Ad-like chat delivered with no visible filtering',
          detail:
            'The authenticated message was broadcast unchanged; no anti-ad/anti-spam layer reacted to a URL + group-number pattern.',
          evidence: { message: authedMessage }
        })
      } else if (authenticated.responses.length > 0) {
        ctx.finding({
          id: 'chat-filter-active',
          severity: 'info',
          title: 'Chat filter or moderation triggered',
          detail:
            'The message did not appear in chat and the server emitted a response — an anti-spam/anti-ad layer reacted.',
          evidence: { responses: authenticated.responses }
        })
      } else {
        ctx.finding({
          id: 'chat-muted',
          severity: 'info',
          title: 'Chat message was not delivered',
          detail: 'The authenticated message did not appear in chat; chat may be muted or hidden for this identity.',
          evidence: { message: authedMessage }
        })
      }
    } finally {
      session.close()
    }
  }
}
