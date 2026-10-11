import { BrowserWindow, app, dialog, ipcMain } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ModuleDTO } from '../shared/engineTypes'
import { moduleCatalog } from './engine/catalog'
import { chains, modules } from './engine/chains'
import { abortRun, startModuleRun, startRun } from './engine/runs'
import { detectJava } from './lab/java'
import { getServer, initLabManager, listServers } from './lab/manager'
import type { LabServer } from './lab/server'
import type { RecipeStatus } from './lab/types'
import { generateHtml, generateMarkdown } from './report/generate'
import { getRunRecord, listRunRecords } from './report/store'
import { getSettings, setSettings, type Settings } from './settings'

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

  ipcMain.handle('engine:chains', () => {
    const labData = join(app.getPath('userData'), 'lab-data')
    return chains.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      params: c.params?.map((p) => ({
        ...p,
        placeholder: p.name === 'path' ? join(labData, 'servers', 'A') : p.placeholder
      })),
      steps: c.steps.map((s) => ({ id: s.id, module: s.module, title: s.title ?? s.module }))
    }))
  })

  ipcMain.handle('engine:modules', () => {
    const labData = join(app.getPath('userData'), 'lab-data')
    const entries: ModuleDTO[] = []
    for (const entry of moduleCatalog) {
      const module = modules.find((m) => m.id === entry.id)
      if (!module) continue
      entries.push({
        id: module.id,
        title: module.title,
        category: entry.category,
        description: entry.description,
        destructive: module.destructive === true,
        params: entry.params.map((p) => ({
          ...p,
          placeholder: p.name === 'path' ? join(labData, 'servers', 'A') : p.placeholder
        }))
      })
    }
    return entries
  })

  ipcMain.handle(
    'engine:run',
    (_event, chainId: string, host: string, port: number, params: Record<string, string>) =>
      startRun(chainId, { host, port }, params ?? {})
  )

  ipcMain.handle(
    'engine:run-module',
    (_event, moduleId: string, host: string, port: number, params: Record<string, string>) =>
      startModuleRun(moduleId, { host, port }, params ?? {})
  )

  ipcMain.handle('engine:abort', (_event, runId: string) => abortRun(runId))

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_event, patch: Partial<Settings>) => setSettings(patch))

  ipcMain.handle('reports:list', () => listRunRecords())
  ipcMain.handle('reports:get', (_event, runId: string) => getRunRecord(runId))
  ipcMain.handle('reports:export', async (_event, runId: string, format: 'html' | 'md') => {
    const record = getRunRecord(runId)
    if (!record) throw new Error('report not found')
    const content = format === 'html' ? generateHtml(record) : generateMarkdown(record)
    const stamp = new Date(record.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export SecurLab report',
      defaultPath: `securlab-${record.chainId}-${stamp}.${format}`,
      filters: [{ name: format === 'html' ? 'HTML' : 'Markdown', extensions: [format] }]
    })
    if (canceled || !filePath) return { saved: false }
    writeFileSync(filePath, content)
    return { saved: true, path: filePath }
  })
}
