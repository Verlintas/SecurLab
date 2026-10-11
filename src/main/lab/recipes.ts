import type { LabRecipe, PluginSpec } from './types'

const baseProperties: Record<string, string | number | boolean> = {
  'online-mode': false,
  'enforce-secure-profile': false,
  difficulty: 'peaceful',
  'view-distance': 4,
  'simulation-distance': 3,
  'level-seed': '1337',
  'white-list': false,
  'enable-rcon': false,
  'enable-query': false,
  'max-players': 20,
  'spawn-protection': 0,
  'enable-status': true
}

const authme = (version: string): PluginSpec => ({
  label: `AuthMe ${version}`,
  fileName: `AuthMe-${version}-Paper.jar`,
  source: {
    kind: 'github',
    repo: 'AuthMe/AuthMeReloaded',
    tag: version,
    assetPattern: '-Paper\\.jar$'
  }
})

const luckperms: PluginSpec = {
  label: 'LuckPerms',
  fileName: 'LuckPerms-Bukkit.jar',
  source: {
    kind: 'jenkins',
    jobUrl: 'https://ci.lucko.me/job/LuckPerms/lastSuccessfulBuild',
    artifactPattern: '^LuckPerms-Bukkit-\\d.*\\.jar$'
  }
}

export const recipes: LabRecipe[] = [
  {
    id: 'A',
    label: 'Offline + Weak AuthMe 6.0.0',
    mcVersion: '1.21.11',
    javaMajor: 21,
    port: 25565,
    onlineMode: false,
    notes:
      'Paper 1.21.11 offline-mode with AuthMe 6.0.0 (vulnerable pre-join session handling), seeded ops + whitelist. AuthMe dialogs are disabled on purpose so the classic chat-based /register //login flow is exercised.',
    config: {
      properties: { ...baseProperties, motd: 'SecurLab :: recipe A (offline)' },
      ops: ['Admin'],
      whitelist: ['Admin', 'Moderator'],
      plugins: [authme('6.0.0'), luckperms],
      runtimePatches: [
        {
          file: 'plugins/AuthMe/config.yml',
          patches: [
            { path: ['settings', 'restrictions', 'maxRegPerIp'], value: '10' },
            { path: ['settings', 'security', 'unsafePasswords'], value: '[]' },
            {
              path: ['settings', 'registration', 'dialog', 'preJoin', 'enable'],
              value: 'false'
            },
            {
              path: ['settings', 'registration', 'dialog', 'postJoin', 'enable'],
              value: 'false'
            }
          ]
        }
      ],
      postStartCommands: ['authme reload', 'lp user {uuid:Admin} permission set *']
    }
  },
  {
    id: 'C',
    label: 'Control (Hardened AuthMe 6.0.1)',
    mcVersion: '1.21.11',
    javaMajor: 21,
    port: 25566,
    onlineMode: false,
    notes:
      'Control group: same layout but AuthMe 6.0.1 with the session-takeover and empty-secret fixes. Chain modules must NOT hit here.',
    config: {
      properties: { ...baseProperties, motd: 'SecurLab :: recipe C (control)' },
      ops: ['Admin'],
      whitelist: ['Admin', 'Moderator'],
      plugins: [authme('6.0.1'), luckperms],
      runtimePatches: [
        {
          file: 'plugins/AuthMe/config.yml',
          patches: [
            { path: ['settings', 'restrictions', 'maxRegPerIp'], value: '10' },
            {
              path: ['settings', 'registration', 'dialog', 'preJoin', 'enable'],
              value: 'false'
            },
            {
              path: ['settings', 'registration', 'dialog', 'postJoin', 'enable'],
              value: 'false'
            }
          ]
        }
      ],
      postStartCommands: ['authme reload', 'lp user {uuid:Admin} permission set *']
    }
  },
  {
    id: 'F',
    label: 'Query exposure',
    mcVersion: '1.21.11',
    javaMajor: 21,
    port: 25567,
    onlineMode: false,
    notes:
      'Paper 1.21.11 with enable-query=true — the GameSpy4 query protocol leaks plugins, world and player data over UDP without authentication.',
    config: {
      properties: {
        ...baseProperties,
        motd: 'SecurLab :: recipe F (query)',
        'enable-query': true,
        'query.port': 25567
      },
      ops: ['Admin'],
      whitelist: [],
      plugins: []
    }
  },
  {
    id: 'R0',
    label: 'Pre-join session race (AuthMe 6.0.0)',
    mcVersion: '1.21.11',
    javaMajor: 21,
    port: 25568,
    onlineMode: false,
    notes:
      'AuthMe 6.0.0 with Paper pre-join dialogs enabled — the vulnerable configuration for the pre-join session race (fixed in 6.0.1 by pending-name claims).',
    config: {
      properties: { ...baseProperties, motd: 'SecurLab :: R0 (pre-join race)' },
      ops: ['Admin'],
      whitelist: [],
      plugins: [authme('6.0.0')]
    }
  },
  {
    id: 'R1',
    label: 'Race control (AuthMe 6.0.1)',
    mcVersion: '1.21.11',
    javaMajor: 21,
    port: 25569,
    onlineMode: false,
    notes:
      'Control group: same pre-join dialog configuration but AuthMe 6.0.1 rejects a second same-name connection while one is still authenticating.',
    config: {
      properties: { ...baseProperties, motd: 'SecurLab :: R1 (race control)' },
      ops: ['Admin'],
      whitelist: [],
      plugins: [authme('6.0.1')]
    }
  }
]

export function getRecipe(id: string): LabRecipe | undefined {
  return recipes.find((r) => r.id === id)
}
