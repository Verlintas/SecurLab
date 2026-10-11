import { assessFingerprint } from './modules/assessFingerprint'
import { reconSlp } from './modules/reconSlp'
import type { ChainDefinition, EngineModule } from './types'

export const modules: EngineModule[] = [reconSlp, assessFingerprint]

export const chains: ChainDefinition[] = [
  {
    id: 'C0',
    title: 'C0 · Engine smoke (read-only recon)',
    description:
      'Read-only server list ping plus fingerprint assessment. Proves the chain engine, evidence flow and reporting pipeline without sending any attack traffic.',
    steps: [
      { id: 'slp', module: 'recon.slp', title: 'Server list ping' },
      {
        id: 'assess',
        module: 'assess.fingerprint',
        title: 'Fingerprint assessment',
        when: (state) => state.lastStatus === 'passed'
      }
    ]
  }
]

export function getChain(id: string): ChainDefinition | undefined {
  return chains.find((c) => c.id === id)
}
