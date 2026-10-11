import { createBot, type Bot } from 'mineflayer'
import type { Target } from '../../types'

export class JoinFailure extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JoinFailure'
  }
}

export function reasonToText(reason: unknown): string {
  if (typeof reason === 'string') return reason
  if (reason && typeof reason === 'object') {
    const record = reason as { toString?: () => string; text?: string }
    if (typeof record.text === 'string') return record.text
    if (typeof record.toString === 'function') {
      try {
        return record.toString()
      } catch {
        return 'unknown'
      }
    }
  }
  return String(reason)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * A thin wrapper over a mineflayer bot for short-lived probe sessions:
 * join with offline auth, collect chat, send commands, quit cleanly.
 */
export class McSession {
  readonly bot: Bot
  readonly username: string
  private messages: string[] = []
  private lastKick: string | null = null
  private chatListeners = new Set<(line: string) => void>()

  private constructor(bot: Bot, username: string) {
    this.bot = bot
    this.username = username
    bot.on('error', () => {
      // swallow late errors; join failures are surfaced via waitForJoin
    })
    bot.on('message', (message: { toString: () => string }) => {
      const line = message.toString()
      this.messages.push(line)
      if (this.messages.length > 300) this.messages.shift()
      for (const listener of [...this.chatListeners]) listener(line)
    })
    bot.on('kicked', (reason: unknown) => {
      this.lastKick = reasonToText(reason)
    })
  }

  get lastKickReason(): string | null {
    return this.lastKick
  }

  static async open(target: Target, username: string, waitMs = 15000): Promise<McSession> {
    const bot = createBot({
      host: target.host,
      port: target.port,
      username,
      auth: 'offline',
      hideErrors: true,
      respawn: false
    })
    const session = new McSession(bot, username)
    await session.waitForJoin(waitMs)
    return session
  }

  private waitForJoin(waitMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.bot.entity) {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new JoinFailure('join timed out'))
      }, waitMs)
      const onSpawn = (): void => {
        cleanup()
        resolve()
      }
      const onKick = (reason: unknown): void => {
        cleanup()
        reject(new JoinFailure(`kicked: ${reasonToText(reason)}`))
      }
      const onError = (error: Error): void => {
        cleanup()
        reject(new JoinFailure(error.message))
      }
      const onEnd = (reason: string): void => {
        cleanup()
        reject(new JoinFailure(`connection ended: ${reason}`))
      }
      const cleanup = (): void => {
        clearTimeout(timer)
        this.bot.removeListener('spawn', onSpawn)
        this.bot.removeListener('kicked', onKick)
        this.bot.removeListener('error', onError)
        this.bot.removeListener('end', onEnd)
      }
      this.bot.once('spawn', onSpawn)
      this.bot.once('kicked', onKick)
      this.bot.once('error', onError)
      this.bot.once('end', onEnd)
    })
  }

  get recentMessages(): string[] {
    return [...this.messages]
  }

  chat(line: string): void {
    try {
      this.bot.chat(line)
    } catch {
      // bot already disconnected
    }
  }

  /** Wait for a chat line matching pattern (checks recent history too). */
  waitForChat(pattern: RegExp, timeoutMs = 5000): Promise<string | null> {
    for (const line of this.messages) {
      if (pattern.test(line)) return Promise.resolve(line)
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.chatListeners.delete(listener)
        resolve(null)
      }, timeoutMs)
      const listener = (line: string): void => {
        if (pattern.test(line)) {
          clearTimeout(timer)
          this.chatListeners.delete(listener)
          resolve(line)
        }
      }
      this.chatListeners.add(listener)
    })
  }

  /** Send a command and collect the chat output for a quiet window. */
  async sendAndCollect(command: string, quietMs = 1200, timeoutMs = 5000): Promise<string> {
    const start = this.messages.length
    this.chat(command)
    const begin = Date.now()
    let lastCount = start
    let lastChange = Date.now()
    while (Date.now() - begin < timeoutMs) {
      await sleep(200)
      if (this.messages.length !== lastCount) {
        lastCount = this.messages.length
        lastChange = Date.now()
      } else if (lastCount > start && Date.now() - lastChange >= quietMs) {
        break
      }
    }
    return this.messages.slice(start).join('\n')
  }

  close(): void {
    try {
      this.bot.quit('securlab disconnect')
    } catch {
      // already gone
    }
  }
}

/** Detect a login-plugin registration/login prompt in the session chat. */
export async function detectAuthPrompt(
  session: McSession,
  timeoutMs = 4000
): Promise<'register' | 'login' | null> {
  const line = await session.waitForChat(/\/register\b|\/login\b/i, timeoutMs)
  if (!line) return null
  if (/\/register\b/i.test(line)) return 'register'
  if (/\/login\b/i.test(line)) return 'login'
  return null
}
