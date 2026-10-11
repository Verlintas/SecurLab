import type { McSession } from './mcSession'

export interface LoginResult {
  state: 'ok' | 'denied' | 'unknown'
  loginOutput: string
  listOutput: string
}

export const LOGIN_OK = /已成功登录|登录成功|successful login|successfully logged|logged in/i
export const LOGIN_FAIL = /密码错误|wrong password|incorrect/i
export const LIST_BLOCKED = /您需要先通过验证|need.*(verify|login)|must.*login|请先登录/i
export const BRIGADIER_UNKNOWN = /unknown or incomplete command|see below for error/i

/** Log in with a known credential and verify the resulting command access state. */
export async function loginWithCredentials(
  session: McSession,
  password: string
): Promise<LoginResult> {
  const loginOutput = (await session.sendAndCollect(`/login ${password}`, 1500, 6000)).trim()
  if (LOGIN_OK.test(loginOutput)) return { state: 'ok', loginOutput, listOutput: '' }
  if (LOGIN_FAIL.test(loginOutput)) return { state: 'denied', loginOutput, listOutput: '' }

  const listOutput = (await session.sendAndCollect('/list', 1200, 5000)).trim()
  if (LIST_BLOCKED.test(listOutput)) return { state: 'denied', loginOutput, listOutput }
  if (listOutput.length > 0 && !BRIGADIER_UNKNOWN.test(listOutput)) {
    return { state: 'ok', loginOutput, listOutput }
  }
  return { state: 'unknown', loginOutput, listOutput }
}
