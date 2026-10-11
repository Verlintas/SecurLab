import { Socket } from 'node:net'
import type { EngineModule } from '../types'

interface LegacyResult {
  fields: string[]
  plugins: string[]
}

function legacyPing(host: string, port: number, timeoutMs = 3000): Promise<LegacyResult> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let data = Buffer.alloc(0)
    let settled = false

    const finish = (): void => {
      if (settled) return
      settled = true
      socket.destroy()
      if (data.length === 0) {
        reject(new Error('no response to legacy ping'))
        return
      }
      try {
        let text = ''
        if (data[0] === 0xff && data.length >= 3) {
          const length = data.readUInt16BE(1)
          text = new TextDecoder('utf-16be').decode(data.subarray(3, 3 + length * 2))
        } else {
          text = data.toString('utf8')
        }
        const fields = text.split('\u0000')
        const plugins = fields.length > 6 ? fields.slice(6).filter(Boolean) : []
        resolve({ fields, plugins })
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }

    const timer = setTimeout(finish, timeoutMs)
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
    })
    socket.on('close', () => {
      clearTimeout(timer)
      finish()
    })
    socket.on('error', (error) => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(error)
      }
    })
    socket.connect(port, host, () => {
      socket.write(Buffer.from([0xfe, 0x01]))
    })
  })
}

export const reconLegacyPing: EngineModule = {
  id: 'recon.legacy',
  title: 'Legacy ping (plugin leak probe)',
  async run(ctx) {
    const { host, port } = ctx.target
    ctx.log(`legacy ping ${host}:${port}`)
    const result = await legacyPing(host, port)
    const [marker, protocol, version, motd, players, max] = result.fields

    ctx.log(`reply marker: ${JSON.stringify(marker ?? '')}`)
    if (version) ctx.log(`version: ${version}`)
    if (players !== undefined) ctx.log(`players: ${players}/${max ?? '?'}`)

    ctx.evidence('legacyProtocol', protocol ?? null)
    ctx.evidence('legacyVersion', version ?? null)
    if (motd) ctx.evidence('legacyMotd', motd)

    if (result.plugins.length > 0) {
      ctx.log(`PLUGIN LIST LEAKED: ${result.plugins.join(', ')}`)
      ctx.evidence('legacyPlugins', result.plugins)
      ctx.finding({
        id: 'legacy-plugin-leak',
        severity: 'medium',
        title: 'Plugin list leaked via legacy ping',
        detail:
          'The server answers pre-1.7 legacy pings and discloses its full plugin list, handing attackers a precise target inventory for version-specific exploits.',
        evidence: { plugins: result.plugins }
      })
    } else {
      ctx.log('no plugin list in legacy reply')
    }
  }
}
