import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getChain, singleModuleChain } from '../src/main/engine/chains'
import { executeChain, type RunSummary } from '../src/main/engine/engine'
import { recipes } from '../src/main/lab/recipes'
import { LabServer } from '../src/main/lab/server'

async function main(): Promise<void> {
  const recipe = recipes.find((r) => r.id === 'E')
  if (!recipe) throw new Error('recipe E missing')
  const chain = getChain('C8')
  if (!chain) throw new Error('chain C8 missing')

  const server = new LabServer(recipe, join(process.cwd(), 'lab-data'))
  server.on('log', (line: string) => {
    if (line.includes('Done (')) process.stdout.write(`[lab] ${line}\n`)
  })
  server.on('state', (state: string, error?: string) => {
    if (state === 'error') process.stdout.write(`[lab] error: ${error ?? ''}\n`)
  })

  let failed = false
  try {
    console.log('[smoke] resetting + starting lab E (weak RCON) ...')
    await server.reset()
    await server.start()

    console.log('[smoke] chain C8 — RCON takeover ...')
    const result: RunSummary = await executeChain(
      chain,
      { host: '127.0.0.1', port: recipe.port },
      {},
      (event) => {
        if (event.type === 'step:log') process.stdout.write(`  [engine] ${event.line}\n`)
        if (event.type === 'evidence')
          process.stdout.write(
            `  [data] ${event.key} = ${JSON.stringify(event.value).slice(0, 160)}\n`
          )
        if (event.type === 'finding')
          process.stdout.write(`  [finding] ${event.finding.severity}: ${event.finding.title}\n`)
        if (event.type === 'run:end')
          process.stdout.write(`  [run] ${event.status} · ${event.findings} finding(s)\n`)
      },
      new AbortController().signal,
      randomUUID()
    )

    if (!result.findings.some((f) => f.id === 'rcon-weak-password')) {
      throw new Error(
        `C8 did not take over RCON (findings: ${result.findings.map((f) => f.id).join(', ') || 'none'})`
      )
    }

    console.log('[smoke] single module recon.bases against the lab ...')
    const basesChain = singleModuleChain('recon.bases')
    if (!basesChain) throw new Error('recon.bases missing')
    const basesResult = await executeChain(
      basesChain,
      { host: '127.0.0.1', port: recipe.port },
      { radius: '32', step: '4' },
      (event) => {
        if (event.type === 'step:log') process.stdout.write(`  [bases] ${event.line}\n`)
      },
      new AbortController().signal,
      randomUUID()
    )
    if (basesResult.status !== 'passed') {
      throw new Error(`recon.bases did not pass: ${basesResult.error ?? ''}`)
    }
  } catch (error) {
    failed = true
    console.error('[smoke] FAIL', error)
  } finally {
    console.log('[smoke] stopping lab ...')
    await server.stop()
  }

  if (failed) process.exit(1)
  console.log('[smoke] PASS')
  process.exit(0)
}

void main()
