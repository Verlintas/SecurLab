import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { LabRecipe } from './types'
import { USER_AGENT, downloadFile, fetchToFile, resolveGithubAsset, resolveJenkinsArtifact } from './download'

export interface ProvisionResult {
  serverJar: string
  plugins: { label: string; path: string }[]
}

/**
 * Paperclip downloads the vanilla server jar from Mojang on first launch, which is
 * painfully slow from some regions. Pre-seed the exact file paperclip expects
 * (cache/mojang_<version>.jar) from the BMCLAPI mirror so first start is fast.
 * A copy is kept in the shared lab cache so server resets don't re-download.
 */
export async function seedVanillaJar(
  mcVersion: string,
  serverDir: string,
  sharedCacheDir: string,
  log: (line: string) => void
): Promise<void> {
  const dest = join(serverDir, 'cache', `mojang_${mcVersion}.jar`)
  const shared = join(sharedCacheDir, `mojang_${mcVersion}.jar`)

  const valid = (path: string): boolean => existsSync(path) && statSync(path).size > 1_000_000

  if (valid(dest)) {
    if (!valid(shared)) {
      try {
        mkdirSync(sharedCacheDir, { recursive: true })
        cpSync(dest, shared)
      } catch {
        // best effort
      }
    }
    log(`[vanilla] cache hit mojang_${mcVersion}.jar`)
    return
  }
  if (valid(shared)) {
    mkdirSync(join(serverDir, 'cache'), { recursive: true })
    cpSync(shared, dest)
    log(`[vanilla] restored mojang_${mcVersion}.jar from shared cache`)
    return
  }

  const url = `https://bmclapi2.bangbang93.com/version/${mcVersion}/server`
  try {
    log(`[vanilla] seeding mojang_${mcVersion}.jar from BMCLAPI (max 90s)`)
    await fetchToFile(url, dest, 90_000)
    mkdirSync(sharedCacheDir, { recursive: true })
    cpSync(dest, shared)
    log(`[vanilla] seeded mojang_${mcVersion}.jar`)
  } catch (error) {
    log(
      `[vanilla] seed skipped: ${error instanceof Error ? error.message : String(error)} — Paper will download it itself`
    )
  }
}

async function provisionPaper(
  version: string,
  cacheDir: string,
  log: (line: string) => void
): Promise<string> {
  const res = await fetch(
    `https://fill.papermc.io/v3/projects/paper/versions/${version}/builds/latest`,
    { headers: { 'user-agent': USER_AGENT } }
  )
  if (!res.ok) throw new Error(`PaperMC API HTTP ${res.status} for ${version}`)
  const data = (await res.json()) as {
    id: number
    downloads: Record<string, { name: string; url: string; checksums?: { sha256?: string } }>
  }
  const dl = data.downloads['server:default']
  if (!dl) throw new Error('PaperMC response has no server:default download')
  log(`[paper] resolved ${dl.name} (build ${data.id})`)
  const dest = join(cacheDir, dl.name)
  await downloadFile(dl.url, dest, { sha256: dl.checksums?.sha256, log })
  return dest
}

export async function provisionRecipe(
  recipe: LabRecipe,
  cacheDir: string,
  log: (line: string) => void
): Promise<ProvisionResult> {
  const serverJar = await provisionPaper(recipe.mcVersion, cacheDir, log)
  const plugins: { label: string; path: string }[] = []

  for (const plugin of recipe.config.plugins) {
    const dest = join(cacheDir, plugin.fileName)
    if (plugin.source.kind === 'github') {
      const asset = await resolveGithubAsset(
        plugin.source.repo,
        plugin.source.tag,
        plugin.source.assetPattern
      )
      await downloadFile(asset.url, dest, { log })
    } else if (plugin.source.kind === 'jenkins') {
      const artifact = await resolveJenkinsArtifact(
        plugin.source.jobUrl,
        plugin.source.artifactPattern
      )
      await downloadFile(artifact.url, dest, { log })
    } else {
      await downloadFile(plugin.source.url, dest, { sha256: plugin.source.sha256, log })
    }
    plugins.push({ label: plugin.label, path: dest })
  }

  return { serverJar, plugins }
}
