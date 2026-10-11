import type { EngineModule } from '../types'

export const assessFingerprint: EngineModule = {
  id: 'assess.fingerprint',
  title: 'Fingerprint assessment',
  async run(ctx) {
    const version = ctx.state.evidence.version
    if (version === undefined) {
      ctx.log('no version evidence from earlier steps — skipping')
      return
    }
    const label = String(version)
    ctx.log(`server identifies as: ${label}`)
    ctx.finding({
      id: `fingerprint-${label}`,
      severity: 'info',
      title: `Version disclosure: ${label}`,
      detail:
        'The server advertises its exact software version over server list ping. Attackers use this for precise exploit selection. Consider hiding the version string for hardening.',
      evidence: { version: label }
    })
  }
}
