import { recipes } from './recipes'
import { LabServer } from './server'

const servers = new Map<string, LabServer>()
let baseDir = ''

export function initLabManager(dir: string): void {
  baseDir = dir
}

export function getServer(id: string): LabServer | undefined {
  const existing = servers.get(id)
  if (existing) return existing
  const recipe = recipes.find((r) => r.id === id)
  if (!recipe) return undefined
  const server = new LabServer(recipe, baseDir)
  servers.set(id, server)
  return server
}

export function listServers(): LabServer[] {
  return recipes.map((r) => getServer(r.id)).filter((s): s is LabServer => Boolean(s))
}
