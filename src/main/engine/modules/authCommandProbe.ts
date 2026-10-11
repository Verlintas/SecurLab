import type { EngineModule } from '../types'
import { JoinFailure, McSession, detectAuthPrompt } from './lib/mcSession'

export const authCommandProbe: EngineModule = {
  id: 'auth.command-probe',
  title: 'Auth enforcement probe',
  async run(ctx) {
    const username = ctx.params.username?.trim() || 'SecurLabProbe'
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
          detail: 'Mojang authentication is required, so offline sign-in probes do not apply.',
          evidence: { reason: message }
        })
        return
      }
      if (/whitelist/i.test(message)) {
        ctx.finding({
          id: 'whitelist-enforced',
          severity: 'info',
          title: 'Whitelist enforced',
          detail: 'The join was rejected by the whitelist, which also shields the login plugin.',
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
      ctx.evidence('offlineMode', true)
      ctx.log(`joined as "${username}"`)

      const prompt = await detectAuthPrompt(session, 4000)
      if (prompt) {
        ctx.evidence('authPrompt', prompt)
        ctx.finding({
          id: 'auth-prompt-active',
          severity: 'info',
          title: `Login plugin prompt detected (${prompt})`,
          detail:
            'The login plugin prompts on join and is enforcing authentication. No silent-bypass behavior observed.',
          evidence: { prompt }
        })
        return
      }

      ctx.log('no prompt on join — sending side-effect-free usage probes (/login, /register, /list)')
      const loginOut = (await session.sendAndCollect('/login', 1500, 6000)).trim()
      const registerOut = (await session.sendAndCollect('/register', 1500, 6000)).trim()
      const listOut = (await session.sendAndCollect('/list', 1500, 6000)).trim()
      ctx.evidence('loginProbe', loginOut)
      ctx.evidence('registerProbe', registerOut)
      ctx.evidence('listProbe', listOut)

      const combined = `${loginOut}\n${registerOut}`
      const brigadierUnknown = /unknown or incomplete command|see below for error/i.test(combined)
      const pluginResponds = combined.trim().length > 0 && !brigadierUnknown
      const listBrigadier = /unknown or incomplete command|see below for error/i.test(listOut)
      const listWorked = /在线|players online|of a max|are \d+ of/i.test(listOut)
      const commandsUnblocked = listWorked && !listBrigadier

      if (pluginResponds) {
        ctx.finding({
          id: 'auth-not-prompting',
          severity: commandsUnblocked ? 'high' : 'medium',
          title: 'Login plugin active but does not prompt on join',
          detail: commandsUnblocked
            ? 'The login plugin intercepts its own commands, but joining with an arbitrary name produced no registration or login prompt AND a general command (/list) still worked while unauthenticated. Players appear to retain normal command access without ever authenticating — a silent enforcement gap. Fix the plugin configuration (dialog options can swallow the join prompt on server versions without the dialog API) and verify the chat prompt flow.'
            : 'The login plugin intercepts and blocks commands (a non-auth command such as /list is refused while unauthenticated), but joining with an arbitrary name produced no registration or login prompt. Enforcement is intact — this is a usability/visibility gap: legitimate players receive no guidance to /register or /login. Enable the chat prompt flow (disable preJoin/postJoin dialogs on server versions without the dialog API) or update the plugin/server.',
          evidence: {
            loginProbe: loginOut,
            registerProbe: registerOut,
            listProbe: listOut,
            commandsUnblocked
          }
        })
      } else {
        ctx.finding({
          id: 'no-auth-enforcement',
          severity: 'high',
          title: 'No authentication enforcement observed',
          detail:
            'Joins were accepted with no prompt and login-plugin usage probes produced no plugin-style response — the sign-in gate is not intercepting players.',
          evidence: { loginProbe: loginOut, registerProbe: registerOut, listProbe: listOut }
        })
      }
    } finally {
      session.close()
    }
  }
}
