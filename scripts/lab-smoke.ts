import { join } from 'node:path'
import mc from 'minecraft-protocol'
import { recipes } from '../src/main/lab/recipes'
import { LabServer } from '../src/main/lab/server'

const recipe = recipes.find((r) => r.id === 'A')
if (!recipe) throw new Error('recipe A missing')

const server = new LabServer(recipe, join(process.cwd(), 'lab-data'))

server.on('log', (line: string) => process.stdout.write(`[lab] ${line}\n`))
server.on('state', (state: string, error?: string) =>
  process.stdout.write(`[state] ${state}${error ? ` (${error})` : ''}\n`)
)

interface PingResponse {
  version?: { name?: string }
  players?: { online?: number; max?: number }
  description?: unknown
}

async function main(): Promise<void> {
  console.log('[smoke] starting recipe A ...')
  await server.start()

  console.log('[smoke] server up, probing SLP ...')
  const status = (await mc.ping({
    host: '127.0.0.1',
    port: recipe.port
  })) as PingResponse
  console.log(
    `[smoke] SLP OK: version=${status.version?.name ?? '?'} players=${status.players?.online ?? '?'}/${status.players?.max ?? '?'}`
  )

  console.log('[smoke] stopping ...')
  await server.stop()

  if (server.state !== 'exited') throw new Error(`unexpected final state: ${server.state}`)
  console.log('[smoke] PASS')
}

main().catch((error) => {
  console.error('[smoke] FAIL', error)
  process.exitCode = 1
})
