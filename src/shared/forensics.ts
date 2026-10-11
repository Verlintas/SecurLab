export interface ForensicsEvent {
  time: string
  kind: string
  detail: string
}

export interface ForensicsPlayer {
  name: string
  firstSeen: string
  lastSeen: string
  joins: number
  ips: string[]
}

export interface ForensicsReport {
  source: string
  players: ForensicsPlayer[]
  opEvents: ForensicsEvent[]
  authEvents: ForensicsEvent[]
  dangerousCommands: ForensicsEvent[]
  connections: ForensicsEvent[]
  flags: string[]
}
