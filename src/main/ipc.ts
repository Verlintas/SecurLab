import { BrowserWindow, app, ipcMain } from 'electron'
import { join } from 'node:path'
import { detectJava } from './lab/java'
import { getServer, initLabManager, listServers } from './lab/manager'
import type { LabServer } from './lab/server'
import type { RecipeStatus } from './lab/types'

let initialized = false
const wired = new WeakSet<LabServer>()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

function wire(server: LabServer): LabServer {
  if (wired.has(server)) return server
  wired.add(server)
  server.on('log', (line: string) => broadcast('lab:log', { id: server.recipe.id, line }))
  server.on('state', (state: string, error?: string) =>
    broadcast('lab:state', { id: server.recipe.id, state, error })
  )
  return server
}

function snapshot(server: LabServer): RecipeStatus {
  return { recipe: server.recipe, state: server.state, error: server.error }
}

async function withServer(
  id: string,
  action: (server: LabServer) => Promise<void>
): Promise<RecipeStatus> {
  const server = getServer(id)
  if (!server) throw new Error(`unknown recipe: ${id}`)
  wire(server)
  await action(server)
  return snapshot(server)
}

export function registerIpc(): void {
  if (initialized) return
  initialized = true
  initLabManager(join(app.getPath('userData'), 'lab-data'))

  ipcMain.handle('lab:list', () => listServers().map((s) => snapshot(wire(s))))

  ipcMain.handle('lab:start', (_event, id: string) =>
    withServer(id, async (server) => {
      wire(server)
      await server.start()
    })
  )

  ipcMain.handle('lab:stop', (_event, id: string) =>
    withServer(id, async (server) => {
      await server.stop()
    })
  )

  ipcMain.handle('lab:reset', (_event, id: string) =>
    withServer(id, async (server) => {
      await server.reset()
    })
  )

  ipcMain.handle('env:java', () => detectJava())
}
