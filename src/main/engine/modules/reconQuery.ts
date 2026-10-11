import { createSocket } from 'node:dgram'
import type { EngineModule } from '../types'

interface QueryResult {
  fields: Record<string, string>
  players: string[]
}

const SPLIT_NUM_SIZE = 11 // "splitnum" + 0x00 + 0x80 + 0x00
const IDENT = Buffer.from('SLAB', 'ascii')

/**
 * GameSpy4 query protocol (vanilla QueryThreadGs4 + Paper extensions):
 *  1. FE FD 09 + ident(4)                  -> reply: 09 + ident + challenge(decimal ascii) + 00
 *  2. FE FD 00 + ident(4) + challenge(i32) + padding(4)  (exactly 15 bytes)
 *                                          -> reply: 00 + ident + splitnum + key\0value\0...
 * Paper only sends the classic full-stat response when the request is exactly
 * 15 bytes long; other lengths fall through to its GS4QueryEvent path.
 */
function queryServer(host: string, port: number, timeoutMs = 3000): Promise<QueryResult | null> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    let challenge: number | null = null
    let done = false

    const finish = (result: QueryResult | null): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.close()
      resolve(result)
    }

    const timer = setTimeout(() => finish(null), timeoutMs)

    socket.on('message', (msg) => {
      if (msg[0] === 0x09 && challenge === null) {
        const match = msg.subarray(1).toString('latin1').match(/(\d+)\u0000?$/)
        if (!match) return
        challenge = Number.parseInt(match[1], 10)
        const req = Buffer.alloc(15)
        req[0] = 0xfe
        req[1] = 0xfd
        req[2] = 0x00
        IDENT.copy(req, 3)
        req.writeInt32BE(challenge, 7)
        socket.send(req, port, host)
        return
      }
      if (msg[0] === 0x00 && msg.length >= 16) {
        const payload = msg.subarray(1 + 4 + SPLIT_NUM_SIZE).toString('latin1')
        const chunks = payload
          .split('\u0000')
          .filter((chunk) => chunk.length > 0 && chunk !== '\u0001')
        const fields: Record<string, string> = {}
        for (let i = 0; i + 1 < chunks.length; i += 2) {
          fields[chunks[i]] = chunks[i + 1]
        }
        const players = (fields.players ?? '').split(';').filter(Boolean)
        finish({ fields, players })
      }
    })

    socket.on('error', () => finish(null))

    socket.send(Buffer.concat([Buffer.from([0xfe, 0xfd, 0x09]), IDENT]), port, host)
  })
}

export const reconQuery: EngineModule = {
  id: 'recon.query',
  title: 'GameSpy4 query probe',
  async run(ctx) {
    const { host, port } = ctx.target
    ctx.log(`udp query ${host}:${port}`)
    const result = await queryServer(host, port)

    if (!result) {
      ctx.log('no query response (query disabled or filtered)')
      ctx.evidence('queryEnabled', false)
      return
    }

    const { fields, players } = result
    ctx.evidence('queryEnabled', true)
    if (fields.hostname) ctx.log(`hostname: ${fields.hostname}`)
    if (fields.version) ctx.log(`version: ${fields.version}`)
    if (fields.map) ctx.log(`world: ${fields.map}`)
    if (fields.plugins) {
      ctx.log(`plugins: ${fields.plugins}`)
      ctx.evidence(
        'queryPlugins',
        fields.plugins.split(';').filter((p) => p.length > 0)
      )
    }
    if (players.length > 0) {
      ctx.log(`players online: ${players.join(', ')}`)
      ctx.evidence('queryPlayers', players)
    }
    ctx.evidence('queryWorld', fields.map ?? null)
    ctx.evidence('queryHostPort', fields.hostport ?? null)

    ctx.finding({
      id: 'query-enabled',
      severity: 'medium',
      title: 'GameSpy4 query protocol exposed',
      detail:
        'With enable-query=true anyone can read the plugin inventory, world name and player list over UDP, without authentication and without joining the server. Disable the query protocol unless a tool genuinely depends on it.',
      evidence: { plugins: fields.plugins ?? '', map: fields.map ?? '' }
    })
  }
}
