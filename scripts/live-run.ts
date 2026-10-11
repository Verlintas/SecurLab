import { randomUUID } from 'node:crypto'
import { getChain } from '../src/main/engine/chains'
import { executeChain } from '../src/main/engine/engine'

async function main(): Promise<void> {
  const host = process.env.HOST ?? ''
  const port = Number(process.env.PORT ?? 0)
  const chainId = process.env.CHAIN ?? 'C0'
  if (!host || !port) {
    console.error('usage: HOST=example.com PORT=25565 [CHAIN=C0] [PARAMS={"names":"Admin"}] npm run live:run')
    process.exit(1)
  }
  let params: Record<string, string> = {}
  if (process.env.PARAMS) {
    try {
      params = JSON.parse(process.env.PARAMS) as Record<string, string>
    } catch {
      console.error('PARAMS must be a JSON object of string values')
      process.exit(1)
    }
  }

  const chain = getChain(chainId)
  if (!chain) {
    console.error(`unknown chain: ${chainId} (available: C0, C0A, C1, C2, C5, C6)`)
    process.exit(1)
  }

  console.log(`[live] ${chain.title}`)
  console.log(`[live] target ${host}:${port}${Object.keys(params).length ? ` params=${JSON.stringify(params)}` : ''}`)
  console.log('')

  const result = await executeChain(
    chain,
    { host, port },
    params,
    (event) => {
      switch (event.type) {
        case 'step:start':
          console.log(`\n▸ ${event.title} (${event.module})`)
          break
        case 'step:log':
          console.log(`  ${event.line}`)
          break
        case 'step:end':
          console.log(`  [${event.status}]${event.error ? ` ${event.error}` : ''}`)
          break
        case 'evidence':
          console.log(`  data · ${event.key} = ${typeof event.value === 'object' ? JSON.stringify(event.value) : String(event.value)}`)
          break
        case 'finding':
          console.log(`  FINDING [${event.finding.severity.toUpperCase()}] ${event.finding.title}`)
          console.log(`    ${event.finding.detail}`)
          break
        case 'run:end':
          console.log(`\n[run] ${event.status} · ${event.findings} finding(s)${event.error ? ` · ${event.error}` : ''}`)
          break
        default:
          break
      }
    },
    new AbortController().signal,
    randomUUID()
  )

  process.exit(result.status === 'failed' || result.status === 'error' ? 1 : 0)
}

void main()
