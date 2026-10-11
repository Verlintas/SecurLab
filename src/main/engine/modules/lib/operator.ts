import type { RunContext } from '../../types'
import { loginWithCredentials } from './authFlow'
import { McSession } from './mcSession'

/** Resolve an operator password from chain params or earlier takeover evidence. */
export function resolvePassword(ctx: RunContext, username: string): string | null {
  const fromParams = ctx.params.password?.trim()
  if (fromParams) return fromParams
  const map = ctx.state.evidence.registeredAccountPasswords as
    | Record<string, string>
    | undefined
  return map?.[username] ?? null
}

/** Join as the operator identity, log in and prove operator access via /seed. */
export async function openOperatorSession(
  ctx: RunContext,
  username: string,
  password: string
): Promise<McSession> {
  const session = await McSession.open(ctx.target, username)
  const login = await loginWithCredentials(session, password)
  ctx.log(`operator login (${username}): ${login.state}`)
  if (login.state !== 'ok') {
    ctx.log(`login output: ${login.loginOutput.slice(0, 160) || '(none)'}`)
    session.close()
    throw new Error(`operator login failed (${login.state})`)
  }
  const seed = await session.sendAndCollect('/seed', 1200, 5000)
  ctx.log(`operator /seed: ${seed.trim().slice(0, 140) || '(no response)'}`)
  if (!/seed\s*[:：]|种子\s*[:：]/i.test(seed)) {
    session.close()
    throw new Error('operator session could not execute /seed — account does not hold operator rights')
  }
  return session
}
