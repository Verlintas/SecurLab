import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { offlineUuid } from '../util/offlineUuid'
import { detectJava, pickJava } from './java'
import { provisionRecipe, seedVanillaJar } from './provisioner'
import type { LabRecipe, LabState } from './types'

const STARTUP_TIMEOUT_MS = 300_000
const STOP_TIMEOUT_MS = 15_000

function renderProperties(recipe: LabRecipe): string {
  const all: Record<string, string | number | boolean> = {
    ...recipe.config.properties,
    'server-port': recipe.port
  }
  return `${Object.entries(all)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n')}\n`
}

export class LabServer extends EventEmitter {
  readonly recipe: LabRecipe
  private readonly baseDir: string
  private proc: ChildProcessWithoutNullStreams | null = null
  private outputBuffer = ''
  private currentState: LabState = 'idle'
  private lastError?: string

  constructor(recipe: LabRecipe, baseDir: string) {
    super()
    this.recipe = recipe
    this.baseDir = baseDir
  }

  get state(): LabState {
    return this.currentState
  }

  get error(): string | undefined {
    return this.lastError
  }

  get serverDir(): string {
    return join(this.baseDir, 'servers', this.recipe.id)
  }

  get cacheDir(): string {
    return join(this.baseDir, 'cache')
  }

  async start(): Promise<void> {
    if (this.proc) throw new Error('server is already running')
    try {
      this.setState('preparing')
      const java = pickJava(await detectJava(), this.recipe.javaMajor)
      if (!java) {
        throw new Error(
          `Java ${this.recipe.javaMajor}+ not found — install a matching JDK (e.g. Temurin ${this.recipe.javaMajor})`
        )
      }
      this.log(`[securlab] java ${java.version} (${java.path})`)

      const { serverJar, plugins } = await provisionRecipe(
        this.recipe,
        this.cacheDir,
        (line) => this.log(line)
      )
      this.prepareServerDir(plugins)
      await seedVanillaJar(this.recipe.mcVersion, this.serverDir, (line) => this.log(line))

      this.setState('starting')
      this.log(`[securlab] launching recipe ${this.recipe.id} on port ${this.recipe.port}`)
      const proc = spawn(java.path, ['-Xms512M', '-Xmx1024M', '-jar', serverJar, 'nogui'], {
        cwd: this.serverDir
      })
      this.proc = proc
      proc.stdout.on('data', (chunk: Buffer) => this.onOutput(chunk))
      proc.stderr.on('data', (chunk: Buffer) => this.onOutput(chunk))
      proc.on('exit', (code) => this.onExit(code))

      await this.waitForReady()
      this.setState('running')
    } catch (error) {
      this.killProc()
      const message = error instanceof Error ? error.message : String(error)
      this.setState('error', message)
      throw error
    }
  }

  async stop(): Promise<void> {
    const proc = this.proc
    if (!proc) {
      this.setState('exited')
      return
    }
    this.setState('stopping')
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()))
    try {
      proc.stdin.write('stop\n')
    } catch {
      // stdin already closed
    }
    const timeout = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), STOP_TIMEOUT_MS)
    )
    const result = await Promise.race([exited.then(() => 'exited' as const), timeout])
    if (result === 'timeout') {
      this.log('[securlab] graceful stop timed out, killing process')
      proc.kill('SIGKILL')
    }
    await exited
    if (this.currentState === 'stopping') this.setState('exited')
  }

  async reset(): Promise<void> {
    await this.stop()
    if (existsSync(this.serverDir)) rmSync(this.serverDir, { recursive: true, force: true })
    this.setState('idle')
  }

  private prepareServerDir(plugins: { label: string; path: string }[]): void {
    const dir = this.serverDir
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'eula.txt'), 'eula=true\n')
    writeFileSync(join(dir, 'server.properties'), renderProperties(this.recipe))
    writeFileSync(
      join(dir, 'ops.json'),
      `${JSON.stringify(
        this.recipe.config.ops.map((name) => ({
          uuid: offlineUuid(name),
          name,
          level: 4,
          bypassesPlayerLimit: false
        })),
        null,
        2
      )}\n`
    )
    writeFileSync(
      join(dir, 'whitelist.json'),
      `${JSON.stringify(
        this.recipe.config.whitelist.map((name) => ({ uuid: offlineUuid(name), name })),
        null,
        2
      )}\n`
    )
    const pluginDir = join(dir, 'plugins')
    mkdirSync(pluginDir, { recursive: true })
    for (const plugin of plugins) {
      const dest = join(pluginDir, basename(plugin.path))
      try {
        cpSync(plugin.path, dest, { force: true })
        this.log(`[securlab] plugin ready: ${plugin.label} -> plugins/${basename(plugin.path)}`)
      } catch {
        // destination already mapped (e.g. running on host fs)
      }
    }
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('server did not reach "Done" within timeout'))
      }, STARTUP_TIMEOUT_MS)
      const onLog = (line: string): void => {
        if (line.includes('Done (') || line.includes('Done in')) {
          cleanup()
          resolve()
        }
      }
      const onState = (_state: LabState, error?: string): void => {
        if (_state === 'error' || _state === 'exited') {
          cleanup()
          reject(new Error(error ?? 'server exited during startup'))
        }
      }
      const cleanup = (): void => {
        clearTimeout(timer)
        this.off('log', onLog)
        this.off('state', onState)
      }
      this.on('log', onLog)
      this.on('state', onState)
    })
  }

  private onOutput(chunk: Buffer): void {
    this.outputBuffer += chunk.toString('utf8')
    let index: number
    while ((index = this.outputBuffer.indexOf('\n')) >= 0) {
      const line = this.outputBuffer.slice(0, index).replace(/\r$/, '')
      this.outputBuffer = this.outputBuffer.slice(index + 1)
      this.log(line)
    }
  }

  private onExit(code: number | null): void {
    this.proc = null
    if (this.currentState === 'stopping') {
      this.setState('exited')
      return
    }
    if (this.currentState === 'running' || this.currentState === 'starting') {
      this.setState(
        code === 0 ? 'exited' : 'error',
        code === 0 ? undefined : `server exited with code ${String(code)}`
      )
    }
  }

  private killProc(): void {
    if (this.proc) {
      this.proc.kill('SIGKILL')
      this.proc = null
    }
  }

  private log(line: string): void {
    this.emit('log', line)
  }

  private setState(state: LabState, error?: string): void {
    this.currentState = state
    this.lastError = error
    this.emit('state', state, error)
  }
}
