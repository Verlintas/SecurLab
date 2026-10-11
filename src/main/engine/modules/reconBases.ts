import { Vec3 } from 'vec3'
import type { EngineModule } from '../types'
import { JoinFailure, McSession } from './lib/mcSession'

const PLAYER_BLOCK =
  /planks|_wool|_concrete|terracotta|glass|obsidian|beacon|chest|barrel|shulker|furnace|crafting_table|torch|lantern|stone_bricks|brick|iron_block|gold_block|diamond_block|emerald_block|netherite_block|sea_lantern|glowstone|redstone_lamp|bookshelf|enchanting_table|anvil|_bed|_door|trapdoor|_sign|banner|carpet|_slab|_stairs|_wall|fence|_gate|ladder|scaffolding|honey_block|slime_block|target|note_block|jukebox|brewing_stand|cauldron|lightning_rod|lodestone|respawn_anchor|crying_obsidian|conduit|quartz|prismarine|purpur|end_stone_bricks|deepslate_bricks|blackstone|copper_block|tuff_bricks|mud_bricks|polished|cut_|chiseled|smooth_|cobweb/i

const IGNORE = new Set(['cave_air', 'void_air', 'air', 'water', 'lava'])

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

export const reconBases: EngineModule = {
  id: 'recon.bases',
  title: 'Structure / base scanner',
  async run(ctx) {
    const radius = clampInt(Number(ctx.params.radius), 32, 192, 96)
    const step = clampInt(Number(ctx.params.step), 1, 4, 2)
    ctx.log(`joining to sweep terrain for player structures (radius ${radius}, step ${step})`)

    let session: McSession
    try {
      session = await McSession.open(ctx.target, 'SecurLabProbe', 12000)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/online.?mode|encrypt|verify|authenticate/i.test(message)) {
        ctx.finding({
          id: 'online-mode-enforced',
          severity: 'info',
          title: 'Server enforces online-mode',
          detail: 'Terrain scanning requires a connection and was refused by Mojang authentication.',
          evidence: { reason: message }
        })
        return
      }
      if (error instanceof JoinFailure) {
        ctx.log(`join failed: ${message}`)
        ctx.finding({
          id: 'base-scan-blocked',
          severity: 'info',
          title: 'Terrain scan could not join',
          detail: 'The probe connection was refused, so the structure scan did not run.',
          evidence: { reason: message }
        })
        return
      }
      throw error
    }

    try {
      const position = session.bot.entity.position
      const centerX = Math.floor(position.x)
      const centerZ = Math.floor(position.z)
      const histogram = new Map<string, number>()
      const samples = new Map<string, [number, number, number]>()
      const cells = new Map<string, { count: number; x: number; y: number; z: number }>()
      let scanned = 0
      let loaded = 0

      for (let x = centerX - radius; x <= centerX + radius; x += step) {
        if (ctx.signal.aborted) return
        for (let z = centerZ - radius; z <= centerZ + radius; z += step) {
          let topName: string | null = null
          let topY = 0
          for (let y = 100; y >= 48; y--) {
            const block = session.bot.blockAt(new Vec3(x, y, z))
            if (!block) {
              topName = null
              break
            }
            if (IGNORE.has(block.name)) continue
            topName = block.name
            topY = y
            break
          }
          scanned++
          if (topName === null) continue
          loaded++
          if (!PLAYER_BLOCK.test(topName)) continue
          histogram.set(topName, (histogram.get(topName) ?? 0) + 1)
          if (!samples.has(topName)) samples.set(topName, [x, topY, z])
          const cell = `${Math.floor(x / 16) * 16},${Math.floor(z / 16) * 16}`
          const entry = cells.get(cell) ?? { count: 0, x, y: topY, z }
          entry.count++
          cells.set(cell, entry)
        }
      }

      const rankedCells = [...cells.entries()]
        .map(([cell, data]) => ({ cell, ...data }))
        .sort((a, b) => b.count - a.count)
      const topBlocks = [...histogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)

      ctx.log(`scanned ${scanned} columns (${loaded} loaded) — ${rankedCells.length} candidate cell(s)`)
      for (const [name, count] of topBlocks.slice(0, 6)) {
        ctx.log(`  ${count} × ${name} e.g. [${(samples.get(name) ?? []).join(', ')}]`)
      }
      for (const cell of rankedCells.slice(0, 6)) {
        ctx.log(`  cell ${cell.cell} · hits=${cell.count} near [${cell.x}, ${cell.y}, ${cell.z}]`)
      }

      ctx.evidence('scanCoverage', { scanned, loaded, radius, step })
      ctx.evidence('structureBlocks', Object.fromEntries(topBlocks))
      ctx.evidence('structureCells', rankedCells.slice(0, 20))

      if (rankedCells.length > 0) {
        ctx.finding({
          id: 'player-structures-located',
          severity: 'medium',
          title: `${rankedCells.length} player-made structure candidate(s) located`,
          detail:
            'Blocks such as planks, stairs and torches were clustered into candidate player builds. This reconnaissance — possible without any staff permissions — is what precedes targeted griefing; coordinates are in the evidence.',
          evidence: { topCells: rankedCells.slice(0, 8), topBlocks: topBlocks.slice(0, 8) }
        })
      } else {
        ctx.finding({
          id: 'no-structures-found',
          severity: 'info',
          title: 'No player structures in scan range',
          detail: `Scanned ${loaded} loaded columns within ${radius} blocks; no player-like block clusters were found.`,
          evidence: { scanned, loaded }
        })
      }
    } finally {
      session.close()
    }
  }
}
