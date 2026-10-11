import type { EngineModule } from '../types'
import { BRIGADIER_UNKNOWN, LIST_BLOCKED, loginWithCredentials } from './lib/authFlow'
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

const ADMIN_COMMANDS = [
  'op',
  'deop',
  'stop',
  'reload',
  'restart',
  'ban',
  'ban-ip',
  'pardon',
  'kick',
  'whitelist',
  'plugins',
  'pl',
  'lp',
  'luckperms',
  'authme',
  'gm',
  'gamemode',
  'give',
  'tp',
  'mv',
  'pex',
  'cmi'
]

const PLUGIN_HINTS: [string, string][] = [
  ['lp', 'LuckPerms'],
  ['luckperms', 'LuckPerms'],
  ['authme', 'AuthMe'],
  ['ess', 'EssentialsX'],
  ['mv', 'Multiverse'],
  ['cmi', 'CMI'],
  ['viaversion', 'ViaVersion']
]

export const reconCommandSurface: EngineModule = {
  id: 'recon.command-surface',
  title: 'Post-auth command surface',
  async run(ctx) {
    const accounts = parseAccounts(ctx.params.accounts)
    if (accounts.length === 0) {
      throw new Error('accounts parameter is required, format: name:password,name2:password2')
    }

    for (const account of accounts) {
      if (ctx.signal.aborted) return
      ctx.log(`─ scanning command surface as "${account.username}"`)

      let session: McSession
      try {
        session = await McSession.open(ctx.target, account.username)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/online.?mode|encrypt|verify|authenticate/i.test(message)) {
          ctx.finding({
            id: 'online-mode-enforced',
            severity: 'info',
            title: 'Server enforces online-mode',
            detail: 'Command surface scanning does not apply to the Mojang login flow.',
            evidence: { reason: message }
          })
          return
        }
        if (error instanceof JoinFailure) {
          ctx.log(`join failed: ${message}`)
          continue
        }
        throw error
      }

      try {
        await detectAuthPrompt(session, 3000)
        const login = await loginWithCredentials(session, account.password)
        ctx.evidence(`login_${account.username}`, login.loginOutput.slice(0, 200))
        if (login.listOutput) ctx.evidence(`list_${account.username}`, login.listOutput.slice(0, 200))

        if (login.state === 'denied') {
          ctx.log('login denied — skipping command surface for this identity')
          ctx.finding({
            id: 'identity-login-failed',
            severity: 'info',
            title: `Login failed for "${account.username}"`,
            detail: 'The known credential was rejected; the account state may have changed.',
            evidence: { username: account.username }
          })
          continue
        }
        if (login.state === 'unknown') {
          ctx.log('authentication state ambiguous — scanning the command surface anyway')
        }

        ctx.log('requesting the permission-filtered command tree (tab-complete "/")')
        let commands: string[] = []
        try {
          const raw = await Promise.race([
            session.bot.tabComplete('/') as Promise<unknown[]>,
            new Promise<unknown[]>((resolve) => setTimeout(() => resolve([]), 6000))
          ])
          commands = raw
            .map((entry) => {
              if (typeof entry === 'string') return entry
              const obj = entry as { match?: string; text?: string }
              return obj.match ?? obj.text ?? ''
            })
            .map((entry) => entry.replace(/^\//, ''))
            .filter((entry) => entry.length > 0 && !entry.includes('[object'))
        } catch (error) {
          ctx.log(`tab-complete failed: ${error instanceof Error ? error.message : String(error)}`)
        }

        if (commands.length === 0) {
          ctx.log('no commands visible (tab-complete blocked or empty)')
          ctx.finding({
            id: 'command-surface-blocked',
            severity: 'info',
            title: 'Command tree not visible via tab-complete',
            detail:
              'Tab-complete returned no commands — the identity is probably still unauthenticated (many login plugins deny tab-complete before login) or the command tree is hidden.',
            evidence: { username: account.username }
          })
          continue
        }

        ctx.log(
          `visible commands (${commands.length}): ${commands.slice(0, 40).join(', ')}${
            commands.length > 40 ? ', …' : ''
          }`
        )
        ctx.evidence(`commands_${account.username}`, commands.slice(0, 200))

        const notable = commands.filter((command) =>
          ADMIN_COMMANDS.includes(command.toLowerCase())
        )
        const worldeditSurface = commands.filter((command) =>
          [
            'wand',
            'pos1',
            'pos2',
            'set',
            'replace',
            'copy',
            'paste',
            'undo',
            'redo',
            'fill',
            'sphere',
            'cyl',
            'schematic',
            'brush',
            'tool',
            'eval',
            'generate',
            'regen'
          ].includes(command.toLowerCase())
        )
        if (worldeditSurface.length > 0) {
          ctx.finding({
            id: 'worldedit-surface',
            severity: 'medium',
            title: `WorldEdit command surface visible for "${account.username}"`,
            detail: `The claimable identity can see WorldEdit commands: ${worldeditSurface.join(', ')}. WorldEdit permissions on non-staff accounts allow mass world modification, resource exhaustion and (in old versions) arbitrary code execution via expressions.`,
            evidence: { commands: worldeditSurface }
          })
        }
        const pluginHints = [
          ...new Set(
            PLUGIN_HINTS.filter(([prefix]) =>
              commands.some((command) => command.toLowerCase() === prefix)
            ).map(([, name]) => name)
          )
        ]
        if (pluginHints.length > 0) ctx.evidence(`pluginHints_${account.username}`, pluginHints)
        if (notable.length > 0) {
          ctx.finding({
            id: 'elevated-command-surface',
            severity: 'medium',
            title: `Administrative commands visible for "${account.username}"`,
            detail: `The permission-filtered command tree includes administrative commands: ${notable.join(', ')}. A freshly claimed identity should not be able to see these.`,
            evidence: { commands: notable, total: commands.length, pluginHints }
          })
        }

        const probes: [string, string][] = [
          ['/plugins', 'plugins'],
          ['/we version', 'worldedit_version'],
          ['/co lookup t:7d', 'coreprotect_lookup'],
          ['/banlist', 'banlist'],
          ['/whitelist list', 'whitelist'],
          ['/seed', 'seed']
        ]
        const permissionDenied = /do not have permission|don't have permission|没有权限|无权限/i
        const granted: string[] = []
        for (const [command, id] of probes) {
          if (ctx.signal.aborted) return
          const out = (await session.sendAndCollect(command, 1000, 5000)).trim()
          const executed =
            out.length > 0 &&
            !BRIGADIER_UNKNOWN.test(out) &&
            !LIST_BLOCKED.test(out) &&
            !permissionDenied.test(out)
          ctx.evidence(`probe_${account.username}_${id}`, out.slice(0, 200) || '(no output)')
          ctx.log(`probe ${command}: ${executed ? 'executed' : 'denied'}`)
          if (executed) granted.push(command)
          if (out.includes('Server Plugins') || /插件/i.test(out)) {
            ctx.evidence(`pluginInventory_${account.username}`, out.slice(0, 400))
          }
        }

        if (granted.length > 0) {
          const opProof = granted.includes('/seed')
          ctx.evidence('opGainedAs', account.username)
          ctx.finding({
            id: opProof ? 'offline-op-gained' : 'permission-exposure',
            severity: 'high',
            title: opProof
              ? `Operator access gained as "${account.username}"`
              : `Administrative probes executed as "${account.username}"`,
            detail: `After claiming the identity "${account.username}", read-only administrative probes executed successfully on the server: ${granted.join(', ')}. Investigate which permission source grants these rights to the claimed UUID.`,
            evidence: { name: account.username, granted }
          })
          if (opProof) return
          continue
        }

        ctx.finding({
          id: 'no-elevated-permissions',
          severity: 'info',
          title: `"${account.username}" authenticates without elevated permissions`,
          detail:
            'The identity logs in and its command tree is visible, but administrative probes were denied. It remains usable for impersonation only.',
          evidence: { username: account.username, commandCount: commands.length }
        })
      } finally {
        session.close()
      }
      await sleep(600)
    }
  }
}
