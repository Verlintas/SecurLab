import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getChain } from '../src/main/engine/chains'
import { executeChain, type RunSummary } from '../src/main/engine/engine'
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
      if (event.type === 'run:end')
        process.stdout.write(`  [run] ${event.status} · ${event.findings} finding(s)\n`)
    },
    new AbortController().signal,
    randomUUID()
  )
  return { result, evidence }
}

async function testRecipe(recipeId: string, expectRace: boolean): Promise<void> {
  const recipe = recipes.find((r) => r.id === recipeId)
  if (!recipe) throw new Error(`recipe ${recipeId} missing`)
  const server = new LabServer(recipe, join(process.cwd(), 'lab-data'))
  server.on('log', (line: string) => {
    if (line.includes('Done (')) process.stdout.write(`[lab] ${line}\n`)
  })
  server.on('state', (state: string, error?: string) => {
    if (state === 'error') process.stdout.write(`[lab] error: ${error ?? ''}\n`)
  })
  try {
    console.log(`[smoke] resetting + starting lab ${recipeId} ...`)
    await server.reset()
    await server.start()
    const { result } = await runChain('C2', recipe.port, { username: 'Admin' })
    const raced = result.findings.some((f) => f.id === 'prejoin-race')
    if (expectRace && !raced) {
      throw new Error(
        `expected a prejoin-race finding on ${recipeId}: ${result.findings.map((f) => f.id).join(', ') || 'none'}`
      )
    }
    if (!expectRace && raced) {
      throw new Error(`unexpected prejoin-race finding on control ${recipeId}`)
    }
    if (!expectRace && !result.findings.some((f) => f.id === 'race-blocked')) {
      throw new Error(
        `expected the control lab to refuse the race: ${result.findings.map((f) => f.id).join(', ') || 'none'}`
      )
    }
  } finally {
    console.log(`[smoke] stopping lab ${recipeId} ...`)
    await server.stop()
  }
}

async function main(): Promise<void> {
  console.log('[smoke] vulnerable recipe R0 (AuthMe 6.0.0)')
  await testRecipe('R0', true)
  console.log('[smoke] control recipe R1 (AuthMe 6.0.1)')
  await testRecipe('R1', false)
  console.log('[smoke] PASS')
  process.exit(0)
}

main().catch((error) => {
  console.error('[smoke] FAIL', error)
  process.exit(1)
})
