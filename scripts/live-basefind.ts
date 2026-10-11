import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Vec3 from 'vec3'
import { loginWithCredentials } from '../src/main/engine/modules/lib/authFlow'
import { McSession, sleep } from '../src/main/engine/modules/lib/mcSession'

const HOST = process.env.TARGET_HOST ?? ''
const PORT = Number(process.env.TARGET_PORT ?? 0)
const USERNAME = process.env.MC_NAME ?? 'SecurLabProbe'
const PASSWORD = process.env.MC_PASS ?? ''

const PLAYERISH =
  /planks|_wool|_concrete|terracotta|glass|obsidian|beacon|chest|barrel|shulker|furnace|crafting_table|torch|lantern|stone_bricks|brick|iron_block|gold_block|diamond_block|emerald_block|netherite_block|sea_lantern|glowstone|redstone_lamp|bookshelf|enchanting_table|anvil|_bed|_door|trapdoor|_sign|banner|carpet|_slab|_stairs|_wall|fence|_gate|ladder|scaffolding|honey_block|slime_block|target|note_block|jukebox|brewing_stand|cauldron|lightning_rod|chain|lodestone|respawn_anchor|crying_obsidian|conduit|quartz|prismarine|purpur|end_stone_bricks|deepslate_bricks|blackstone|copper_block|tuff_bricks|mud_bricks|polished|cut_|chiseled|smooth_|cobweb/i

const IGNORE = new Set(['cave_air', 'void_air', 'air', 'water', 'lava'])

function topBlock(session: McSession, x: number, z: number): { name: string; y: number } | null {
  for (let y = 100; y >= 48; y--) {
    const block = session.bot.blockAt(new Vec3(x, y, z))
    if (!block) return null
    if (IGNORE.has(block.name)) continue
    return { name: block.name, y }
  }
  return null
}

async function main(): Promise<void> {
  if (!HOST || !PORT) throw new Error('TARGET_HOST/TARGET_PORT required')
  const session = await McSession.open({ host: HOST, port: PORT }, USERNAME)
  try {
    const login = await loginWithCredentials(session, PASSWORD)
    console.log(`[base] login (${USERNAME}):`, login.state)
    if (login.loginOutput) console.log(`[base] login output: ${login.loginOutput.slice(0, 160)}`)

    for (const command of [
      '/dynmap url',
      '/dynmap version',
      '/dmarker listsets',
      '/dmarker listareas',
      '/dmarker listcircles'
    ]) {
      const out = (await session.sendAndCollect(command, 1200, 6000)).trim()
      console.log(`\n--- ${command} ---\n${out.slice(0, 700) || '(no response)'}`)
    }

    const position = session.bot.entity.position
    const centerOverride = process.env.CENTER
    let cx = Math.floor(position.x)
    let cz = Math.floor(position.z)
    if (centerOverride) {
      const [x, z] = centerOverride.split(',').map(Number)
      if (Number.isFinite(x) && Number.isFinite(z)) {
        cx = x
        cz = z
      }
    }
    const radius = Number(process.env.RADIUS ?? 128)
    const step = Number(process.env.STEP ?? 2)
    console.log(
      `\n[base] scanning around ${cx},${cz} (radius ${radius}, step ${step}); player at ${position.x.toFixed(1)},${position.y.toFixed(1)},${position.z.toFixed(1)}`
    )

    const histogram = new Map<string, number>()
    const samples = new Map<string, [number, number, number]>()
    const cells = new Map<string, { count: number; x: number; y: number; z: number }>()
    let scanned = 0
    let loaded = 0

    for (let x = cx - radius; x <= cx + radius; x += step) {
      for (let z = cz - radius; z <= cz + radius; z += step) {
        const top = topBlock(session, x, z)
        scanned++
        if (top === null) continue
        loaded++
        if (!PLAYERISH.test(top.name)) continue
        histogram.set(top.name, (histogram.get(top.name) ?? 0) + 1)
        if (!samples.has(top.name)) samples.set(top.name, [x, top.y, z])
        const cell = `${Math.floor(x / 16) * 16},${Math.floor(z / 16) * 16}`
        const entry = cells.get(cell) ?? { count: 0, x, y: top.y, z }
        entry.count++
        cells.set(cell, entry)
      }
    }

    const rankedCells = [...cells.entries()]
      .map(([cell, data]) => ({ cell, ...data }))
      .sort((a, b) => b.count - a.count)
    console.log(`[base] scanned ${scanned} columns · ${loaded} loaded`)
    console.log('[base] block histogram (player-like):')
    for (const [name, count] of [...histogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${count.toString().padStart(4)} × ${name}   e.g. [${(samples.get(name) ?? []).join(', ')}]`)
    }
    console.log('[base] top cells:')
    for (const cell of rankedCells.slice(0, 12)) {
      console.log(`  cell ${cell.cell} · hits=${cell.count} · near [${cell.x}, ${cell.y}, ${cell.z}]`)
    }

    const outputPath = join(process.cwd(), 'out', `basefind-${Date.now()}.json`)
    writeFileSync(
      outputPath,
      `${JSON.stringify(
        {
          host: HOST,
          port: PORT,
          center: [cx, cz],
          scanned,
          loaded,
          histogram: Object.fromEntries([...histogram.entries()].sort((a, b) => b[1] - a[1])),
          cells: rankedCells.slice(0, 100)
        },
        null,
        2
      )}\n`
    )
    console.log(`[base] results written to ${outputPath}`)
  } finally {
    session.close()
    await sleep(500)
    setTimeout(() => process.exit(0), 300)
  }
}

void main().catch((error) => {
  console.error('[base] FAIL', error)
  process.exit(1)
})
