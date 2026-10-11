import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { getChain } from '../src/main/engine/chains'
import { executeChain, type RunSummary } from '../src/main/engine/engine'
import { McSession } from '../src/main/engine/modules/lib/mcSession'
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

async function main(): Promise<void> {
  const recipe = recipes.find((r) => r.id === 'A')
  if (!recipe) throw new Error('recipe A missing')
  const server = new LabServer(recipe, join(process.cwd(), 'lab-data'))
  server.on('log', (line: string) => {
    if (line.includes('Done (') || line.includes('[vanilla]') || line.includes('[AuthMe]'))
      process.stdout.write(`[lab] ${line}\n`)
  })
  server.on('state', (state: string, error?: string) => {
    if (state === 'error') process.stdout.write(`[lab] error: ${error ?? ''}\n`)
  })

  let failed = false
  try {
    console.log('[smoke] resetting lab A for a clean state ...')
    await server.reset()
    console.log('[smoke] starting lab A ...')
    await server.start()

    // C1 — "Admin" is an operator in ops.json and unregistered in AuthMe
    const c1 = await runChain('C1', recipe.port, { names: 'Admin' })
    if (!c1.result.findings.some((f) => f.id === 'offline-op-gained')) {
      throw new Error(
        `C1 did not gain operator (findings: ${c1.result.findings.map((f) => f.id).join(', ') || 'none'})`
      )
    }
    if (c1.evidence.opGainedAs !== 'Admin') throw new Error('C1 evidence mismatch')

    // Prepare a weak account for the spray
    console.log('[smoke] registering WeakUser with password "123456" ...')
    const session = await McSession.open({ host: '127.0.0.1', port: recipe.port }, 'WeakUser')
    try {
      const prompt = await session.waitForChat(/\/register/i, 5000)
      if (!prompt) throw new Error('no register prompt for WeakUser')
      const out = await session.sendAndCollect('/register 123456 123456', 1500, 8000)
      if (!/success/i.test(out)) {
        throw new Error(`WeakUser registration not confirmed: ${out.slice(0, 160)}`)
      }
    } finally {
      session.close()
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))

    // C5 — spray finds the weak password
    const c5 = await runChain('C5', recipe.port, { username: 'WeakUser', maxAttempts: '4' })
    const weak = c5.result.findings.find((f) => f.id === 'weak-password')
    if (!weak) {
      throw new Error(`C5 did not find weak password (findings: ${c5.result.findings.map((f) => f.id).join(', ')})`)
    }
    if (weak.evidence?.password !== '123456') throw new Error('C5 evidence mismatch')

    // C6 — Moderator is unregistered -> claimable, claim it, no op rights
    const c6 = await runChain('C6', recipe.port, { names: 'Admin,Moderator' })
    const claimable = c6.evidence.claimableNames as string[] | undefined
    if (!claimable?.includes('Moderator')) {
      throw new Error(`C6 claimable mismatch: ${JSON.stringify(claimable)}`)
    }
    if (!c6.result.findings.some((f) => f.id === 'name-claimed' || f.id === 'offline-op-gained')) {
      throw new Error('C6 did not report a claim result')
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
