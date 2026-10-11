import { createHash } from 'node:crypto'

/**
 * Deterministic offline-mode UUID (same as Java UUID.nameUUIDFromBytes
 * over "OfflinePlayer:<name>"), i.e. the UUID a server with
 * online-mode=false assigns to a username.
 */
export function offlineUuid(name: string): string {
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  bytes[6] = (bytes[6] & 0x0f) | 0x30
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
