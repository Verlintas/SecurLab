import { accessNameScan } from './modules/accessNameScan'
import { accessOfflineOp } from './modules/accessOfflineOp'
import { accessVerifyIdentity } from './modules/accessVerifyIdentity'
import { assessFingerprint } from './modules/assessFingerprint'
import { auditConfig } from './modules/auditConfig'
import { authCommandProbe } from './modules/authCommandProbe'
import { authPrejoinRace } from './modules/authPrejoinRace'
import { authProxyForge } from './modules/authProxyForge'
import { authSpray } from './modules/authSpray'
import { chatFilterTest } from './modules/chatFilterTest'
import { impactBaseLocate } from './modules/impactBaseLocate'
import { impactOpSpread } from './modules/impactOpSpread'
import { reconCommandSurface } from './modules/reconCommandSurface'
import { reconLegacyPing } from './modules/reconLegacyPing'
import { reconPlayers } from './modules/reconPlayers'
import { reconQuery } from './modules/reconQuery'
import { reconSlp } from './modules/reconSlp'
import type { ChainDefinition, EngineModule } from './types'

export const modules: EngineModule[] = [
  reconSlp,
  reconLegacyPing,
  reconQuery,
  reconPlayers,
  assessFingerprint,
  auditConfig,
  accessNameScan,
  accessOfflineOp,
  accessVerifyIdentity,
  authSpray,
  authPrejoinRace,
  authCommandProbe,
  authProxyForge,
  reconCommandSurface,
  chatFilterTest,
  impactOpSpread,
  impactBaseLocate
]

const hasFingerprint = (state: { evidence: Record<string, unknown> }): boolean =>
  state.evidence.version !== undefined

const hasClaimableNames = (state: { evidence: Record<string, unknown> }): boolean =>
  Array.isArray(state.evidence.claimableNames) &&
  (state.evidence.claimableNames as string[]).length > 0

export const chains: ChainDefinition[] = [
  {
    id: 'C0',
    title: 'C0 · Recon sweep (read-only)',
    description:
      'Read-only reconnaissance: server list ping, legacy ping plugin-leak probe, GameSpy4 query, player enumeration and fingerprint assessment. Sends no attack traffic.',
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      {
        id: 'legacy',
        module: 'recon.legacy',
        title: 'Legacy ping probe',
        when: hasFingerprint,
        continueOnError: true
      },
      {
        id: 'query',
        module: 'recon.query',
        title: 'Query probe',
        when: hasFingerprint,
        continueOnError: true
      },
      {
        id: 'players',
        module: 'recon.players',
        title: 'Player enumeration',
        when: hasFingerprint
      },
      {
        id: 'assess',
        module: 'assess.fingerprint',
        title: 'Fingerprint assessment',
        when: hasFingerprint
      }
    ]
  },
  {
    id: 'C0A',
    title: 'C0A · Local config audit (read-only)',
    description:
      'Static audit of a server directory: server.properties, ops.json, plugin jars, AuthMe config and paper-global.yml. Reads local files only — zero network traffic.',
    params: [{ name: 'path', labelKey: 'run.params.path' }],
    steps: [{ id: 'audit', module: 'audit.config', title: 'Config audit' }]
  },
  {
    id: 'C1',
    title: 'C1 · Offline OP takeover',
    description:
      'Join as a privileged name on the target and attempt to claim operator status — including the registration-hijack path when a login plugin is present. Active testing: sends join and chat traffic.',
    params: [
      { name: 'names', labelKey: 'run.params.names', defaultValue: 'Admin,Owner,Moderator' },
      { name: 'cleanup', labelKey: 'run.params.cleanup', defaultValue: 'false' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'takeover', module: 'access.offline-op', title: 'Identity takeover attempt' }
    ]
  },
  {
    id: 'C5',
    title: 'C5 · Auth password spray',
    description:
      'Join as a registered account and try a short common-password list against the login plugin with throttling. Active testing: rate-limited and abortable.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'maxAttempts', labelKey: 'run.params.maxAttempts', defaultValue: '8' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'spray', module: 'auth.spray', title: 'Password spray' }
    ]
  },
  {
    id: 'C2',
    title: 'C2 · Pre-join session race',
    description:
      'Hold a connection in the pre-join/authentication phase and open a second connection with the same name. Vulnerable AuthMe builds (< 6.0.1) accept the racing connection and share the pending session state; patched builds claim the name and refuse it.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'race', module: 'auth.prejoin-race', title: 'Same-name race probe' }
    ]
  },
  {
    id: 'C1V',
    title: 'C1V · Verify claimed identities',
    description:
      'Log in with known credentials for previously claimed accounts and check their real privileges (/list, /seed). Turns a registration hijack into a proven or disproven privilege escalation.',
    params: [{ name: 'accounts', labelKey: 'run.params.accounts' }],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'verify', module: 'access.verify-identity', title: 'Verify identities' }
    ]
  },
  {
    id: 'C4',
    title: 'C4 · Proxy auto-login forgery (perform.login)',
    description:
      'AuthMe proxy auto-login messages (authme:main / perform.login) are HMAC-signed with Hooks.proxySharedSecret. With an empty secret (default, AuthMe <= 6.0.0) the HMAC is computable by anyone: a direct connection can force-login as any account in one message — indistinguishable from a legitimate proxy login. AuthMe 6.0.1 rejects empty-secret messages.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'secret', labelKey: 'run.params.secret', defaultValue: '' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'forge', module: 'auth.proxy-forge', title: 'Forge perform.login' }
    ]
  },
  {
    id: 'C14',
    title: 'C14 · Post-exploitation escalation (lab only)',
    description:
      'Reproduce the post-takeover escalation chain in a disposable lab: mass-grant op to connected accounts and extract any player\'s exact coordinates. Terrain destruction is intentionally NOT automated — the impact is evidenced from escalation primitives alone.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'password', labelKey: 'run.params.password' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'takeover', module: 'access.offline-op', title: 'Gain operator identity' },
      { id: 'op-spread', module: 'impact.op-spread', title: 'Mass operator grant' },
      { id: 'locate', module: 'impact.base-locate', title: 'Precise location extraction' }
    ]
  },
  {
    id: 'C1C',
    title: 'C1C · Post-auth command surface',
    description:
      'Authenticate with claimed identities, request the permission-filtered command tree via tab-complete, then run read-only probes (/plugins, /banlist, /whitelist list, /seed) to map exactly what the account can do — smart enumeration instead of blind guessing.',
    params: [{ name: 'accounts', labelKey: 'run.params.accounts' }],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'surface', module: 'recon.command-surface', title: 'Command surface scan' }
    ]
  },
  {
    id: 'C7P',
    title: 'C7P · Chat & ad filter probe',
    description:
      'Send a benign, clearly labelled ad-style test message (customizable) before and after authentication to check whether the server filters advertising, mutes, or blocks chat for unauthenticated players.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'SecurLabProbe' },
      { name: 'password', labelKey: 'run.params.password' },
      { name: 'message', labelKey: 'run.params.message' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'chat', module: 'chat.filter-test', title: 'Chat filter test' }
    ]
  },
  {
    id: 'C6P',
    title: 'C6P · Auth enforcement probe',
    description:
      'Join with a probe name, capture any login prompt, then send side-effect-free usage probes (/login and /register with no arguments) to establish whether a login plugin is enforcing authentication. Never registers, never logs in.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'SecurLabProbe' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'probe', module: 'auth.command-probe', title: 'Auth enforcement probe' }
    ]
  },
  {
    id: 'C6S',
    title: 'C6S · Sign-in surface scan (no changes)',
    description:
      'Join briefly with candidate names to learn whether the server is offline-mode and whether a login plugin prompts for registration (unregistered/claimable) or login. Registers nothing — non-destructive sign-in probing, ideal as a first active step against production servers.',
    params: [
      { name: 'names', labelKey: 'run.params.names', defaultValue: 'SecurLabProbe' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'scan', module: 'access.name-scan', title: 'Sign-in surface scan' }
    ]
  },
  {
    id: 'C6',
    title: 'C6 · Registration hijack sweep',
    description:
      'Scan common privileged names for unregistered ones, then register a claimable name and check whether it inherits operator rights. Active testing.',
    params: [
      { name: 'names', labelKey: 'run.params.names', defaultValue: 'Admin,Owner,Moderator' }
    ],
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      { id: 'scan', module: 'access.name-scan', title: 'Privileged name scan' },
      {
        id: 'claim',
        module: 'access.offline-op',
        title: 'Claim and privilege check',
        when: hasClaimableNames
      }
    ]
  }
]

export function getChain(id: string): ChainDefinition | undefined {
  return chains.find((c) => c.id === id)
}

export function singleModuleChain(moduleId: string): ChainDefinition | undefined {
  const module = modules.find((m) => m.id === moduleId)
  if (!module) return undefined
  return {
    id: `module:${module.id}`,
    title: module.title,
    description: `Manual single-module run (${module.id}).`,
    steps: [{ id: module.id, module: module.id, title: module.title }]
  }
}
