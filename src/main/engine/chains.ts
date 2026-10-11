import { accessNameScan } from './modules/accessNameScan'
import { accessOfflineOp } from './modules/accessOfflineOp'
import { assessFingerprint } from './modules/assessFingerprint'
import { auditConfig } from './modules/auditConfig'
import { authPrejoinRace } from './modules/authPrejoinRace'
import { authSpray } from './modules/authSpray'
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
  authSpray,
  authPrejoinRace
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
      { name: 'names', labelKey: 'run.params.names', defaultValue: 'Admin,Owner,Moderator' }
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
