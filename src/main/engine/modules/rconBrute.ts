import { Socket } from 'node:net'
import type { EngineModule } from '../types'

const DEFAULT_WORDS = ['123456', 'rcon', 'password', 'admin', 'minecraft', 'changeme']

const AUTH_REQUEST = 3
const AUTH_RESPONSE = 2
const EXEC_COMMAND = 2

function packet(id: number, type: number, body: string): Buffer {
  const bodyBuffer = Buffer.from(body, 'utf8')
  const payload = Buffer.alloc(8 + bodyBuffer.length + 2)
  payload.writeInt32LE(id, 0)
  payload.writeInt32LE(type, 4)
  bodyBuffer.copy(payload, 8)
  const frame = Buffer.alloc(4 + payload.length)
  frame.writeInt32LE(payload.length, 0)
  payload.copy(frame, 4)
  return frame
}

interface RconResponse {
  id: number
  type: number
  body: string
}

function request(
  host: string,
  port: number,
  id: number,
  type: number,
  body: string,
  timeoutMs: number
): Promise<RconResponse> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let buffer = Buffer.alloc(0)
    let settled = false
    let idle: ReturnType<typeof setTimeout> | null = null
    const bodies: string[] = []

    const finish = (response: RconResponse): void => {
      if (settled) return
      settled = true
      if (idle) clearTimeout(idle)
      clearTimeout(timer)
      socket.destroy()
      resolve(response)
    }

    const timer = setTimeout(() => {
      if (settled) return
      if (bodies.length > 0) {
        finish({ id, type: 0, body: bodies.join('') })
        return
      }
      settled = true
      if (idle) clearTimeout(idle)
      socket.destroy()
      reject(new Error('timeout'))
    }, timeoutMs)

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0)
        if (size < 10 || size > 4096) {
          settled = true
          clearTimeout(timer)
          socket.destroy()
          reject(new Error('malformed RCON frame'))
          return
        }
        if (buffer.length < 4 + size) return
        const payload = buffer.subarray(4, 4 + size)
        buffer = buffer.subarray(4 + size)
        const responseId = payload.readInt32LE(0)
        const responseType = payload.readInt32LE(4)
        const responseBody = payload.subarray(8, payload.length - 2).toString('utf8')
        if (responseType === AUTH_RESPONSE) {
          finish({ id: responseId, type: responseType, body: responseBody })
          return
        }
        bodies.push(responseBody)
        if (idle) clearTimeout(idle)
        idle = setTimeout(
          () => finish({ id: responseId, type: responseType, body: bodies.join('') }),
          150
        )
      }
    })
    socket.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (idle) clearTimeout(idle)
      reject(error)
    })
    socket.connect(port, host, () => {
      socket.write(packet(id, type, body))
    })
  })
}

function authAndExec(
  host: string,
  port: number,
  password: string,
  command: string,
  timeoutMs: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket()
    let buffer = Buffer.alloc(0)
    let settled = false
    let authed = false
    let idle: ReturnType<typeof setTimeout> | null = null
    const bodies: string[] = []

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      if (idle) clearTimeout(idle)
      socket.destroy()
      reject(new Error('timeout during exec'))
    }, timeoutMs)

    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (idle) clearTimeout(idle)
      socket.destroy()
      reject(error)
    }

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 4) {
        const size = buffer.readInt32LE(0)
        if (size < 10 || size > 4096) {
          fail(new Error('malformed RCON frame'))
          return
        }
        if (buffer.length < 4 + size) return
        const payload = buffer.subarray(4, 4 + size)
        buffer = buffer.subarray(4 + size)
        const responseId = payload.readInt32LE(0)
        const responseType = payload.readInt32LE(4)
        const responseBody = payload.subarray(8, payload.length - 2).toString('utf8')

        if (!authed) {
          if (responseType !== AUTH_RESPONSE) return
          if (responseId === -1) {
            fail(new Error('auth rejected during exec'))
            return
          }
          authed = true
          socket.write(packet(2, EXEC_COMMAND, command))
          continue
        }

        bodies.push(responseBody)
        if (idle) clearTimeout(idle)
        idle = setTimeout(() => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          socket.destroy()
          resolve(bodies.join(''))
        }, 150)
      }
    })
    socket.on('error', (error) => fail(error))
    socket.connect(port, host, () => {
      socket.write(packet(1, AUTH_REQUEST, password))
    })
  })
}

export const rconBrute: EngineModule = {
  id: 'rcon.brute',
  title: 'RCON exposure & weak password',
  async run(ctx) {
    const port = Math.max(1, Math.min(65535, Number(ctx.params.rconPort) || 25575))
    const custom = (ctx.params.wordlist ?? '')
      .split(',')
      .map((word) => word.trim())
      .filter(Boolean)
    const words = custom.length > 0 ? custom : DEFAULT_WORDS

    ctx.log(`probing RCON at ${ctx.target.host}:${port} (${words.length} password(s))`)

    let reachable = false
    let cracked: string | null = null

    for (const [index, password] of words.entries()) {
      if (ctx.signal.aborted) return
      try {
        const auth = await request(ctx.target.host, port, 1, AUTH_REQUEST, password, 4000)
        reachable = true
        if (auth.id === 1 && auth.type === AUTH_RESPONSE) {
          cracked = password
          ctx.log(`password accepted: "${password}"`)
          break
        }
        ctx.log(`attempt ${index + 1}/${words.length}: "${password}" rejected`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        ctx.log(`RCON connection failed: ${message}`)
        break
      }
    }

    if (!reachable) {
      ctx.evidence('rconReachable', false)
      ctx.finding({
        id: 'rcon-disabled',
        severity: 'info',
        title: 'RCON not reachable',
        detail:
          'No RCON service answered on the probed port — nothing to attack (this is the safe configuration).',
        evidence: { port }
      })
      return
    }

    ctx.evidence('rconReachable', true)

    if (!cracked) {
      ctx.finding({
        id: 'rcon-strong-password',
        severity: 'low',
        title: 'RCON is exposed but resisted the wordlist',
        detail:
          'The RCON service answered but none of the tried passwords matched. Keep it firewalled and never expose RCON to the internet.',
        evidence: { port, attempts: words.length }
      })
      return
    }

    ctx.log('executing proof command via RCON (list)')
    let proof = ''
    try {
      proof = (await authAndExec(ctx.target.host, port, cracked, 'list', 4000)).trim()
    } catch {
      // proof is best-effort
    }

    ctx.evidence('rconPassword', cracked)
    ctx.evidence('rconProof', proof.slice(0, 200))
    ctx.finding({
      id: 'rcon-weak-password',
      severity: 'critical',
      title: `RCON takeover — weak password "${cracked}"`,
      detail:
        'The RCON console accepted a weak password and the proof command "list" executed with full console privileges. Anyone who can reach this port gets complete server control (op, stop, world edits). Firewall RCON, use a long random password and rotate it.',
      evidence: { port, password: cracked, proof: proof.slice(0, 200) || '(no output)' }
    })
  }
}
