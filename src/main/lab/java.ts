import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

export interface JavaInstall {
  path: string
  major: number
  version: string
}

function candidatePaths(): string[] {
  const candidates: string[] = []
  if (process.env.JAVA_HOME) candidates.push(join(process.env.JAVA_HOME, 'bin', 'java'))
  if (process.platform === 'darwin') {
    const root = '/Library/Java/JavaVirtualMachines'
    if (existsSync(root)) {
      for (const entry of readdirSync(root)) {
        candidates.push(join(root, entry, 'Contents', 'Home', 'bin', 'java'))
      }
    }
    const brewRoot = '/opt/homebrew/opt'
    if (existsSync(brewRoot)) {
      for (const entry of readdirSync(brewRoot)) {
        if (/^openjdk(@\d+)?$/.test(entry)) candidates.push(join(brewRoot, entry, 'bin', 'java'))
      }
    }
  }
  if (process.platform === 'linux') {
    const root = '/usr/lib/jvm'
    if (existsSync(root)) {
      for (const entry of readdirSync(root)) candidates.push(join(root, entry, 'bin', 'java'))
    }
  }
  candidates.push('java')
  return candidates
}

export function parseJavaMajor(versionOutput: string): number | null {
  const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/)
  if (!match) return null
  const first = Number(match[1])
  if (first === 1 && match[2]) return Number(match[2])
  return first
}

export async function detectJava(): Promise<JavaInstall[]> {
  const seen = new Set<string>()
  const found: JavaInstall[] = []
  for (const bin of candidatePaths()) {
    if (seen.has(bin)) continue
    seen.add(bin)
    try {
      const { stdout, stderr } = await execFileAsync(bin, ['-version'], { timeout: 5000 })
      const output = `${stdout}\n${stderr}`
      const major = parseJavaMajor(output)
      const version = output.match(/version "([^"]+)"/)?.[1] ?? 'unknown'
      if (major !== null) found.push({ path: bin, major, version })
    } catch {
      // not a usable java binary
    }
  }
  return found
}

export function pickJava(installs: JavaInstall[], required: number): JavaInstall | null {
  const exact = installs.find((i) => i.major === required)
  if (exact) return exact
  const higher = installs.filter((i) => i.major > required).sort((a, b) => a.major - b.major)
  return higher[0] ?? null
}
