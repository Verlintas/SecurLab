import mc from 'minecraft-protocol'
import type { EngineModule } from '../types'

interface StatusJson {
  version?: { name?: string }
}

const ping = mc.ping as unknown as (options: {
  host: string
  port: number
  closeTimeout?: number
}) => Promise<StatusJson>

export const assessFingerprint: EngineModule = {
  id: 'assess.fingerprint',
  title: 'Fingerprint assessment',
  async run(ctx) {
    let version = ctx.state.evidence.version
    if (version === undefined) {
      ctx.log('no version evidence from earlier steps — performing a direct status ping')
      const status = await ping({
        host: ctx.target.host,
        port: ctx.target.port,
        closeTimeout: 8000
      })
      version = status.version?.name
      if (version !== undefined) ctx.evidence('version', version)
    }
    if (version === undefined) {
      ctx.log('server version could not be determined')
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
