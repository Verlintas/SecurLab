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
  const evidence: Record<string, unknown> = {}
  const result = await executeChain(
    chain,
    { host: '127.0.0.1', port },
    params,
    (event) => {
      if (event.type === 'step:log') process.stdout.write(`[engine] ${event.line}\n`)
      if (event.type === 'evidence') evidence[event.key] = event.value
      if (event.type === 'step:end' && event.status !== 'passed')
        process.stdout.write(
          `[engine] step ${event.stepId}: ${event.status}${event.error ? ` (${event.error})` : ''}\n`
        )
      if (event.type === 'finding')
        process.stdout.write(`[engine] finding ${event.finding.severity}: ${event.finding.title}\n`)
      if (event.type === 'run:end')
        process.stdout.write(`[engine] run ${event.status} · ${event.findings} finding(s)\n`)
    },
    new AbortController().signal,
    randomUUID()
  )
  return { result, evidence }
}

async function main(): Promise<void> {
  const recipe = recipes.find((r) => r.id === 'F')
  if (!recipe) throw new Error('recipe F missing')
  const baseDir = join(process.cwd(), 'lab-data')
  const server = new LabServer(recipe, baseDir)
  server.on('log', (line: string) => {
    if (line.includes('Done (')) process.stdout.write(`[lab] ${line}\n`)
  })
  server.on('state', (state: string, error?: string) => {
    if (state === 'error') process.stdout.write(`[lab] error: ${error ?? ''}\n`)
  })

  let failed = false
  try {
    console.log('[smoke] starting lab F (query exposure) ...')
    await server.start()

    console.log('[smoke] chain C0 — recon sweep ...')
    const recon = await runChain('C0', recipe.port, {})
    if (recon.result.status !== 'passed')
      throw new Error(`C0 status: ${recon.result.status} (${recon.result.error ?? ''})`)
    if (typeof recon.evidence.version !== 'string') throw new Error('missing version evidence')
    if (recon.evidence.queryEnabled !== true) throw new Error('expected query to be enabled')

    console.log('[smoke] chain C0A — config audit ...')
    const audit = await runChain('C0A', recipe.port, { path: join(baseDir, 'servers', 'F') })
    const ids = audit.result.findings.map((f) => f.id)
    for (const required of ['offline-mode', 'query-enabled', 'whitelist-off']) {
      if (!ids.includes(required)) throw new Error(`missing audit finding: ${required}`)
    }
    console.log(`[smoke] audit findings: ${ids.join(', ')}`)
  } catch (error) {
    failed = true
    console.error('[smoke] FAIL', error)
  } finally {
    console.log('[smoke] stopping lab ...')
    await server.stop()
  }

  if (failed) {
    process.exit(1)
  }
  console.log('[smoke] PASS')
  process.exit(0)
}

void main()
