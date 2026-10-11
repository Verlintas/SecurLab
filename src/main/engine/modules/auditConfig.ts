import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Severity } from '../../../shared/engineTypes'
import type { EngineModule } from '../types'

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const WEAK_RCON = new Set(['', 'rcon', 'password', '123456', 'changeme', 'admin', 'minecraft'])

export const auditConfig: EngineModule = {
  id: 'audit.config',
  title: 'Local config audit',
  async run(ctx) {
    const dir = ctx.params.path
    if (!dir) throw new Error('a server directory is required for the config audit')
    if (!existsSync(dir)) throw new Error(`directory not found: ${dir}`)
    ctx.log(`auditing ${dir}`)

    const found = (
      id: string,
      severity: Severity,
      title: string,
      detail: string,
      evidence: Record<string, unknown>
    ): void => {
      ctx.finding({ id, severity, title, detail, evidence })
    }

    const propsText = readText(join(dir, 'server.properties'))
    if (!propsText) throw new Error(`server.properties not found in ${dir}`)
    const props = parseProperties(propsText)
    ctx.log(`scanned server.properties (${Object.keys(props).length} keys)`)

    if (props['online-mode'] === 'false') {
      found(
        'offline-mode',
        'high',
        'Offline mode (online-mode=false)',
        'Without Mojang authentication any client can claim any username. Combined with name-derived UUIDs this enables admin impersonation plus whitelist and ban bypass. Prefer online-mode=true, or a proxy with properly configured forwarding.',
        { file: 'server.properties', key: 'online-mode' }
      )
    }

    if (props['enable-rcon'] === 'true') {
      const pass = props['rcon.password'] ?? ''
      if (WEAK_RCON.has(pass.toLowerCase()) || pass.length < 8) {
        found(
          'rcon-weak-password',
          'critical',
          'RCON exposed with a weak password',
          'RCON grants full console command execution. The configured password is weak or missing, so remote command execution is effectively open to anyone who can reach the port.',
          { file: 'server.properties', passwordLength: pass.length }
        )
      } else {
        found(
          'rcon-enabled',
          'high',
          'RCON is enabled',
          'RCON grants full console command execution to anyone who can reach the port. Keep it firewalled and protect it with a long random password.',
          { file: 'server.properties' }
        )
      }
    }

    if (props['enable-query'] === 'true') {
      found(
        'query-enabled',
        'medium',
        'GameSpy4 query enabled',
        'Query leaks plugins, world and player data over UDP without authentication. Disable it unless required.',
        { file: 'server.properties' }
      )
    }

    if (props['white-list'] === 'false') {
      found(
        'whitelist-off',
        'low',
        'Whitelist disabled',
        'Anyone can join. On offline-mode servers this also enables impersonation of whitelisted names.',
        { file: 'server.properties' }
      )
    }

    if (props['spawn-protection'] === '0') {
      found(
        'spawn-protection-off',
        'info',
        'Spawn protection disabled',
        'No spawn protection around the world spawn point. Mostly a griefing consideration on public servers.',
        { file: 'server.properties' }
      )
    }

    if (props['enforce-secure-profile'] === 'false') {
      found(
        'secure-profile-off',
        'low',
        'enforce-secure-profile=false',
        'Unsigned chat is accepted, so chat messages cannot be cryptographically attributed to a Mojang account.',
        { file: 'server.properties' }
      )
    }

    const opsText = readText(join(dir, 'ops.json'))
    if (opsText) {
      try {
        const ops = JSON.parse(opsText) as { name?: string; level?: number }[]
        if (ops.length > 0) {
          const names = ops.map((o) => o.name).filter((n): n is string => Boolean(n))
          ctx.log(`ops: ${names.join(', ')}`)
          ctx.evidence('ops', names)
          found(
            'ops-exposed',
            'info',
            `${ops.length} operator account(s) configured`,
            `Operators: ${names.join(', ')}. On offline-mode servers every one of these names can be claimed by anyone unless a login plugin intervenes correctly.`,
            { names }
          )
        }
      } catch {
        ctx.log('ops.json is not valid JSON')
      }
    }

    const pluginsDir = join(dir, 'plugins')
    if (existsSync(pluginsDir)) {
      const jars = readdirSync(pluginsDir).filter((f) => f.toLowerCase().endsWith('.jar'))
      const versions: Record<string, string> = {}
      for (const jar of jars) {
        const match = jar.match(/-?(\d+\.\d+(?:\.\d+)*[A-Za-z0-9._-]*)\.jar$/i)
        versions[jar] = match?.[1] ?? 'unknown'
      }
      ctx.log(`plugins: ${jars.length} jar(s)`)
      ctx.evidence('pluginJars', jars)
      ctx.evidence('pluginVersions', versions)

      const authmeConfig = readText(join(pluginsDir, 'AuthMe', 'config.yml'))
      if (authmeConfig) {
        ctx.log('found AuthMe config')
        const secret = authmeConfig.match(/proxySharedSecret:\s*['"]?([^'"\s#]*)/)?.[1] ?? ''
        const proxyEnabled = /proxyEnabled:\s*true/i.test(authmeConfig)
        if (proxyEnabled && secret === '') {
          found(
            'authme-proxy-secret',
            'high',
            'AuthMe proxySharedSecret is empty',
            'With proxy auto-login enabled and an empty shared secret, the backend accepts unauthenticated perform.login messages — passwordless login as any registered player (fixed in AuthMe 6.0.1).',
            { file: 'plugins/AuthMe/config.yml' }
          )
        }
        const hash = authmeConfig.match(/passwordHash:\s*['"]?([A-Za-z0-9_]+)/)?.[1] ?? ''
        if (hash && /^(MD5|SHA1|SHA256|SHA512|WORDPRESS)/i.test(hash)) {
          found(
            'authme-weak-hash',
            'low',
            `AuthMe password hash: ${hash}`,
            'Fast hashes are cheap to crack offline if the account database leaks. Prefer BCRYPT or ARGON2ID.',
            { hash }
          )
        }
      }
    }

    const paperGlobal = readText(join(dir, 'config', 'paper-global.yml'))
    if (paperGlobal) {
      ctx.log('found paper-global.yml')
      const velocityEnabled = /velocity:[\s\S]{0,120}?enabled:\s*true/.test(paperGlobal)
      const secret = paperGlobal.match(/secret:\s*['"]?([^'"\s#]*)/)?.[1] ?? ''
      ctx.evidence('velocityForwarding', velocityEnabled)
      if (velocityEnabled && secret === '') {
        found(
          'velocity-empty-secret',
          'high',
          'Velocity forwarding enabled with an empty secret',
          'Paper accepts proxy forwarding without verifying a secret, so anyone who can reach this backend can forge player identity, including operator accounts.',
          { file: 'config/paper-global.yml' }
        )
      }
    }

    ctx.log('audit complete')
  }
}
