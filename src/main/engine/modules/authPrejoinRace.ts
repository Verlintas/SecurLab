import { Socket } from 'node:net'
import mc from 'minecraft-protocol'
import { offlineUuid } from '../../util/offlineUuid'
import type { EngineModule } from '../types'

function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0
  for (;;) {
    if ((v & ~0x7f) === 0) {
      bytes.push(v)
      break
    }
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  return Buffer.from(bytes)
}

function writeString(value: string): Buffer {
  const data = Buffer.from(value, 'utf8')
  return Buffer.concat([writeVarInt(data.length), data])
}

function frame(payload: Buffer): Buffer {
  return Buffer.concat([writeVarInt(payload.length), payload])
}

function handshakePacket(host: string, port: number, protocol: number): Buffer {
  return frame(
    Buffer.concat([
      writeVarInt(0x00),
      writeVarInt(protocol),
      writeString(host),
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
      writeVarInt(2) // next state: login
    ])
  )
}

function loginStartPacket(name: string): Buffer {
  const uuid = Buffer.from(offlineUuid(name).replace(/-/g, ''), 'hex')
  return frame(Buffer.concat([writeVarInt(0x00), writeString(name), uuid]))
}

function extractPrintable(data: Buffer): string[] {
  const text = data.toString('latin1')
  const matches = text.match(/[ -~]{6,}/g) ?? []
  return [...new Set(matches.map((m) => m.trim()).filter((m) => /[A-Za-z]{3}/.test(m)))].slice(0, 6)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** A raw protocol connection that performs handshake + offline login start and stays open. */
class RawLogin {
  readonly socket = new Socket()
  readonly startedAt = Date.now()
  opened = false
  closedAt: number | null = null
  connectError?: string
  private buffer = Buffer.alloc(0)

  constructor() {
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([
        this.buffer,
        Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      ])
    })
    this.socket.on('close', () => {
      if (this.closedAt === null) this.closedAt = Date.now() - this.startedAt
    })
    this.socket.on('error', (error) => {
      this.connectError = error.message
      if (this.closedAt === null) this.closedAt = Date.now() - this.startedAt
    })
  }

  get readable(): string[] {
    return extractPrintable(this.buffer)
  }

  close(): void {
    this.socket.destroy()
  }
}

function openRawLogin(
  host: string,
  port: number,
  protocol: number,
  name: string
): Promise<RawLogin> {
  const conn = new RawLogin()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.close()
      reject(new Error('connection attempt timed out'))
    }, 8000)
    conn.socket.once('connect', () => {
      clearTimeout(timer)
      conn.opened = true
      conn.socket.write(handshakePacket(host, port, protocol))
      conn.socket.write(loginStartPacket(name))
      resolve(conn)
    })
    conn.socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    conn.socket.connect(port, host)
  })
}

const ping = mc.ping as unknown as (options: {
  host: string
  port: number
  closeTimeout?: number
}) => Promise<{ version?: { protocol?: number } }>

export const authPrejoinRace: EngineModule = {
  id: 'auth.prejoin-race',
  title: 'Pre-join session race',
  async run(ctx) {
    const { host, port } = ctx.target
    const name = ctx.params.username?.trim() || 'Admin'

    let protocol = (ctx.state.evidence.protocol as number | undefined) ?? undefined
    if (protocol === undefined) {
      const status = await ping({ host, port, closeTimeout: 8000 })
      protocol = status.version?.protocol ?? undefined
    }
    if (protocol === undefined) throw new Error('could not determine the server protocol version')
    ctx.log(`protocol ${protocol}; holding the first connection as "${name}"`)

    const first = await openRawLogin(host, port, protocol, name)
    await sleep(2500)
    if (first.closedAt !== null) {
      ctx.log(
        `first connection was closed after ${first.closedAt}ms: ${first.readable.join(' | ') || first.connectError || '(no message)'}`
      )
      first.close()
      ctx.finding({
        id: 'race-inconclusive',
        severity: 'info',
        title: 'Race probe could not hold a pre-join connection',
        detail:
          'The first connection was closed by the server before it could hold the pending pre-join state, so the same-name race could not be tested. This happens on servers without a pre-join dialog framework or when the probe is filtered.',
        evidence: { messages: first.readable, error: first.connectError ?? null }
      })
      return
    }
    ctx.log('first connection is holding the name (still pending) — opening the racing connection')

    const second = await openRawLogin(host, port, protocol, name)
    await sleep(6000)
    const firstClosed = first.closedAt !== null
    const secondClosed = second.closedAt !== null

    if (secondClosed) {
      ctx.log(
        `racing connection was refused after ${second.closedAt}ms: ${second.readable.join(' | ') || '(no message)'}`
      )
      ctx.finding({
        id: 'race-blocked',
        severity: 'info',
        title: 'Second same-name connection refused while first pending',
        detail:
          'A connection that is still authenticating refused a second connection with the same name. This matches AuthMe 6.0.1+ pending-name claims and blocks pre-join session races.',
        evidence: {
          refusedAfterMs: second.closedAt,
          messages: second.readable,
          firstClosedDuringRace: firstClosed
        }
      })
    } else {
      ctx.log('racing connection was accepted while the first is still pending')
      ctx.finding({
        id: 'prejoin-race',
        severity: 'high',
        title: 'Pre-join session race: same-name connection accepted while pending',
        detail:
          'A second connection with the same name was accepted while the first was still in the pre-join phase. On AuthMe builds before 6.0.1 the pending state is keyed by the (offline) UUID, so a racing connection can read or wipe the state of a login that is still in progress. Patched builds claim the pending name and refuse the second connection. Note: this finding is significant when a login plugin uses the pre-join dialog framework — confirm with a sign-in surface scan (C6S) to establish the authentication context.',
        evidence: {
          messages: second.readable,
          firstClosedDuringRace: firstClosed,
          note: firstClosed
            ? 'the first pending connection was dropped when the racing connection arrived (takeover)'
            : 'both connections were held open simultaneously'
        }
      })
    }

    second.close()
    first.close()
  }
}
