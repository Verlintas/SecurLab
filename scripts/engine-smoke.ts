import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getChain } from '../src/main/engine/chains'
import { executeChain } from '../src/main/engine/engine'
import { recipes } from '../src/main/lab/recipes'
import { LabServer } from '../src/main/lab/server'

async function main(): Promise<void> {
  const recipe = recipes.find((r) => r.id === 'A')
  if (!recipe) throw new Error('recipe A missing')
  const chain = getChain('C0')
  if (!chain) throw new Error('chain C0 missing')

  const server = new LabServer(recipe, join(process.cwd(), 'lab-data'))
  server.on('log', (line: string) => {
    if (line.includes('Done (')) process.stdout.write(`[lab] ${line}\n`)
  })
  server.on('state', (state: string, error?: string) => {
    if (state === 'error') process.stdout.write(`[lab] error: ${error ?? ''}\n`)
  })

  console.log('[smoke] starting lab A ...')
  await server.start()

  console.log('[smoke] running chain C0 ...')
  const seen: string[] = []
  const result = await executeChain(
    chain,
    { host: '127.0.0.1', port: recipe.port },
    {},
    (event) => {
      seen.push(event.type)
      if (event.type === 'step:log') process.stdout.write(`[engine] ${event.line}\n`)
      if (event.type === 'step:end')
        process.stdout.write(`[engine] step ${event.stepId}: ${event.status}\n`)
      if (event.type === 'finding')
        process.stdout.write(
          `[engine] finding ${event.finding.severity}: ${event.finding.title}\n`
        )
      if (event.type === 'run:end')
        process.stdout.write(
          `[engine] run ${event.status} · ${event.findings} finding(s)\n`
        )
    },
    new AbortController().signal,
    randomUUID()
  )

  console.log('[smoke] stopping lab ...')
  await server.stop()

  const required = ['run:start', 'step:start', 'step:end', 'finding', 'run:end']
  for (const type of required) {
    if (!seen.includes(type)) throw new Error(`missing event: ${type}`)
  }
  if (result.status !== 'passed') throw new Error(`unexpected run status: ${result.status}`)
  if (result.findings.length < 1) throw new Error('expected at least one finding')

  console.log('[smoke] PASS')
}

main().catch((error) => {
  console.error('[smoke] FAIL', error)
  process.exitCode = 1
})
