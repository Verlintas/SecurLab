import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getChain } from '../src/main/engine/chains'
import { executeChain, type RunSummary } from '../src/main/engine/engine'
import type { ChainDefinition } from '../src/main/engine/types'
import { recipes } from '../src/main/lab/recipes'
import { LabServer } from '../src/main/lab/server'

async function runChain(
  chainId: string,
  port: number,
  params: Record<string, string>
): Promise<{ result: RunSummary; evidence: Record<string, unknown> }> {
  const chain = getChain(chainId)
  if (!chain) throw new Error(`chain ${chainId} missing`)
  console.log(`[smoke] chain ${chainId} ...`)
  const evidence: Record<string, unknown> = {}
  const result = await executeChain(
    chain,
    { host: '127.0.0.1', port },
    params,
    (event) => {
      if (event.type === 'step:log') process.stdout.write(`  [engine] ${event.line}\n`)
      if (event.type === 'evidence') evidence[event.key] = event.value
      if (event.type === 'finding')
        process.stdout.write(`  [finding] ${event.finding.severity}: ${event.finding.title}\n`)
      if (event.type === 'step:end' && event.status === 'failed')
        process.stdout.write(`  [engine] step ${event.stepId} failed: ${event.error ?? ''}\n`)
      if (event.type === 'run:end')
        process.stdout.write(`  [run] ${event.status} · ${event.findings} finding(s)\n`)
    },
    new AbortController().signal,
    randomUUID()
  )
  return { result, evidence }
}

async function testDestructiveGate(): Promise<void> {
  console.log('[smoke] destructive-module gate (non-local target) ...')
  const chain: ChainDefinition = {
    id: 'GATE',
    title: 'gate test',
    description: 'destructive gate test',
    steps: [{ id: 'op-spread', module: 'impact.op-spread' }]
  }
  const result = await executeChain(
    chain,
    { host: '198.51.100.7', port: 25565 },
    {},
    () => {},
    new AbortController().signal,
    randomUUID()
  )
  if (result.status !== 'failed' || !(result.error ?? '').includes('refusing destructive')) {
    throw new Error(`destructive gate did not block: ${result.status} / ${result.error ?? ''}`)
  }
  console.log('[smoke] gate blocked the non-local target as expected')
}

async function main(): Promise<void> {
  const recipe = recipes.find((r) => r.id === 'A')
  if (!recipe) throw new Error('recipe A missing')
  const server = new LabServer(recipe, join(process.cwd(), 'lab-data'))
  server.on('log', (line: string) => {
    if (line.includes('Done (')) process.stdout.write(`[lab] ${line}\n`)
  })
  server.on('state', (state: string, error?: string) => {
    if (state === 'error') process.stdout.write(`[lab] error: ${error ?? ''}\n`)
  })

  let failed = false
  try {
    await testDestructiveGate()

    console.log('[smoke] resetting + starting lab A ...')
    await server.reset()
    await server.start()

    const { result } = await runChain('C14', recipe.port, { username: 'Admin' })
    const ids = result.findings.map((f) => f.id)
    for (const required of [
      'offline-op-gained',
      'op-spread-demonstrated',
      'player-location-extraction'
    ]) {
      if (!ids.includes(required)) {
        throw new Error(`missing C14 finding: ${required} (got: ${ids.join(', ') || 'none'})`)
      }
    }
    console.log(`[smoke] C14 findings: ${ids.join(', ')}`)
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
