import type { ModuleParamDTO } from '../../shared/engineTypes'

export type ModuleCategory = 'recon' | 'audit' | 'access' | 'auth' | 'impact'

export interface ModuleCatalogEntry {
  id: string
  category: ModuleCategory
  description: string
  params: ModuleParamDTO[]
}

export const moduleCatalog: ModuleCatalogEntry[] = [
  {
    id: 'recon.slp',
    category: 'recon',
    description: 'Server list ping — version, MOTD, player sample, latency.',
    params: []
  },
  {
    id: 'recon.legacy',
    category: 'recon',
    description: 'Legacy ping probe — old-format reply and plugin-list leak check.',
    params: []
  },
  {
    id: 'recon.query',
    category: 'recon',
    description: 'GameSpy4 query probe — plugin, world and player data over UDP.',
    params: []
  },
  {
    id: 'recon.players',
    category: 'recon',
    description: 'Player enumeration — names exposed via status or query.',
    params: []
  },
  {
    id: 'assess.fingerprint',
    category: 'recon',
    description: 'Fingerprint assessment — version disclosure finding.',
    params: []
  },
  {
    id: 'recon.command-surface',
    category: 'recon',
    description: 'Post-auth command surface — tab-complete tree and read-only probes.',
    params: [{ name: 'accounts', labelKey: 'run.params.accounts' }]
  },
  {
    id: 'recon.bases',
    category: 'recon',
    description: 'Structure/base scanner — joins and sweeps loaded terrain for player-made block clusters.',
    params: [
      { name: 'radius', labelKey: 'run.params.radius', defaultValue: '96' },
      { name: 'step', labelKey: 'run.params.step', defaultValue: '2' }
    ]
  },
  {
    id: 'rcon.brute',
    category: 'auth',
    description: 'RCON probe & weak-password list — proves console access with a harmless command.',
    params: [
      { name: 'rconPort', labelKey: 'run.params.rconPort', defaultValue: '25575' },
      {
        name: 'wordlist',
        labelKey: 'run.params.wordlist',
        defaultValue: '123456,rcon,password,admin,minecraft,changeme'
      }
    ]
  },
  {
    id: 'assess.cve',
    category: 'audit',
    description: 'Known-vulnerability matching — version/plugin fingerprints against a curated list.',
    params: []
  },
  {
    id: 'audit.config',
    category: 'audit',
    description: 'Local config audit — server.properties, ops.json, plugin configs.',
    params: [{ name: 'path', labelKey: 'run.params.path' }]
  },
  {
    id: 'access.name-scan',
    category: 'access',
    description: 'Privileged name scan — registered vs claimable accounts.',
    params: [{ name: 'names', labelKey: 'run.params.names', defaultValue: 'Admin,Owner,Moderator' }]
  },
  {
    id: 'access.offline-op',
    category: 'access',
    description: 'Offline identity takeover — claim a name and check operator rights.',
    params: [
      { name: 'names', labelKey: 'run.params.names', defaultValue: 'Admin' },
      { name: 'cleanup', labelKey: 'run.params.cleanup', defaultValue: 'false' }
    ]
  },
  {
    id: 'access.verify-identity',
    category: 'access',
    description: 'Verify claimed identities — login with known credentials and check /seed.',
    params: [{ name: 'accounts', labelKey: 'run.params.accounts' }]
  },
  {
    id: 'auth.spray',
    category: 'auth',
    description: 'Password spray — throttled common-password attempts against a login plugin.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'maxAttempts', labelKey: 'run.params.maxAttempts', defaultValue: '8' },
      { name: 'wordlist', labelKey: 'run.params.wordlist' }
    ]
  },
  {
    id: 'auth.prejoin-race',
    category: 'auth',
    description: 'Pre-join session race — same-name pending connection probe.',
    params: [{ name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' }]
  },
  {
    id: 'auth.command-probe',
    category: 'auth',
    description: 'Auth enforcement probe — join prompt and command interception check.',
    params: [{ name: 'username', labelKey: 'run.params.username', defaultValue: 'SecurLabProbe' }]
  },
  {
    id: 'auth.proxy-forge',
    category: 'auth',
    description: 'Proxy auto-login forgery — perform.login with an empty shared secret.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'secret', labelKey: 'run.params.secret' }
    ]
  },
  {
    id: 'chat.filter-test',
    category: 'auth',
    description: 'Chat & ad filter probe — ad-style message before and after login.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'SecurLabProbe' },
      { name: 'password', labelKey: 'run.params.password' },
      { name: 'message', labelKey: 'run.params.message' }
    ]
  },
  {
    id: 'impact.op-spread',
    category: 'impact',
    description: 'Mass operator grant — destructive, engine-gated to lab targets.',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'password', labelKey: 'run.params.password' }
    ]
  },
  {
    id: 'impact.base-locate',
    category: 'impact',
    description: 'Precise location extraction via operator access (read-only).',
    params: [
      { name: 'username', labelKey: 'run.params.username', defaultValue: 'Admin' },
      { name: 'password', labelKey: 'run.params.password' },
      { name: 'guest', labelKey: 'run.params.guest', defaultValue: 'ImpactGuest1' }
    ]
  }
]
