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

export const recipes: LabRecipe[] = [
  {
    id: 'A',
    label: 'Offline + Weak AuthMe 6.0.0',
    mcVersion: '1.21.11',
    javaMajor: 21,
    port: 25565,
    onlineMode: false,
    notes:
      'Paper 1.21.11 offline-mode with AuthMe 6.0.0 (vulnerable pre-join session handling), seeded ops + whitelist.',
    config: {
      properties: { ...baseProperties, motd: 'SecurLab :: recipe A (offline)' },
      ops: ['Admin'],
      whitelist: ['Admin', 'Moderator'],
      plugins: [authme('6.0.0')]
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
      plugins: [authme('6.0.1')]
    }
  }
]

export function getRecipe(id: string): LabRecipe | undefined {
  return recipes.find((r) => r.id === id)
}
