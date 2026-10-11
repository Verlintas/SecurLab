import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const USER_AGENT = 'SecurLab/0.1.0 (+https://github.com/Verlintas/SecurLab)'

const GITHUB_MIRRORS = ['https://ghproxy.net/', 'https://ghfast.top/']

export async function fetchToFile(url: string, dest: string, timeoutMs = 0): Promise<void> {
  const controller = new AbortController()
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null
  const tmp = `${dest}.part`
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/octet-stream' },
      redirect: 'follow',
      signal: controller.signal
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`)
    mkdirSync(dirname(dest), { recursive: true })
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp))
    renameSync(tmp, dest)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function sha256File(path: string): Promise<string> {
  const buf = await readFile(path)
  return createHash('sha256').update(buf).digest('hex')
}

export async function downloadFile(
  url: string,
  dest: string,
  opts: { sha256?: string; log?: (line: string) => void } = {}
): Promise<void> {
  const log = opts.log ?? ((): void => {})
  if (existsSync(dest)) {
    if (!opts.sha256 || (await sha256File(dest)) === opts.sha256) {
      log(`[cache] hit ${dest}`)
      return
    }
    log(`[cache] stale, redownloading ${dest}`)
    rmSync(dest, { force: true })
  }

  const bases = ['', ...(url.startsWith('https://github.com/') ? GITHUB_MIRRORS : [])]
  let lastError: unknown
  for (const base of bases) {
    const target = base ? `${base}${url}` : url
    try {
      log(`[download] ${target}`)
      await fetchToFile(target, dest)
      if (opts.sha256) {
        const got = await sha256File(dest)
        if (got !== opts.sha256) throw new Error(`sha256 mismatch: ${got} != ${opts.sha256}`)
      }
      log(`[download] saved ${dest}`)
      return
    } catch (error) {
      lastError = error
      log(`[download] failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export async function resolveGithubAsset(
  repo: string,
  tag: string,
  assetPattern: string
): Promise<{ url: string; name: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} for ${repo}@${tag}`)
  const data = (await res.json()) as {
    assets?: { name: string; browser_download_url: string }[]
  }
  const re = new RegExp(assetPattern)
  const asset = data.assets?.find((a) => re.test(a.name))
  if (!asset) throw new Error(`no asset matching ${assetPattern} in ${repo}@${tag}`)
  return { url: asset.browser_download_url, name: asset.name }
}
