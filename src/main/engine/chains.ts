import { assessFingerprint } from './modules/assessFingerprint'
import { auditConfig } from './modules/auditConfig'
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
  auditConfig
]

const hasFingerprint = (state: { evidence: Record<string, unknown> }): boolean =>
  state.evidence.version !== undefined

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
  }
]

export function getChain(id: string): ChainDefinition | undefined {
  return chains.find((c) => c.id === id)
}
