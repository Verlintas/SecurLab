import type { EngineModule } from '../types'

function parseVersion(text: string): number[] {
  const match = text.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!match) return []
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

function lt(a: number[], b: number[]): boolean {
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av < bv
  }
  return false
}

/**
 * Curated known-vulnerability matching. Version-range based — it cannot confirm
 * patch state remotely, so findings carry a verify-note. Extend this list with
 * sourced entries as new advisories land.
 */
export const assessCve: EngineModule = {
  id: 'assess.cve',
  title: 'Known-vulnerability matching',
  async run(ctx) {
    const versionRaw = ctx.state.evidence.version ? String(ctx.state.evidence.version) : ''
    const pluginVersions =
      (ctx.state.evidence.pluginVersions as Record<string, string> | undefined) ?? {}
    const pluginInventory =
      typeof ctx.state.evidence.pluginInventory === 'string'
        ? ctx.state.evidence.pluginInventory
        : ''
    const inventory = [pluginInventory, ...Object.keys(pluginVersions)].join(',')
    const versionParts = parseVersion(versionRaw)

    ctx.log(
      `fingerprints: version="${versionRaw || 'unknown'}" · plugin versions=${Object.keys(pluginVersions).length} · inventory=${inventory ? 'yes' : 'no'}`
    )

    let matched = 0

    // CVE-2021-44228 (Log4Shell): Minecraft 1.7 – 1.16.5 shipped vulnerable Log4j2.
    if (versionParts.length > 0 && !lt(versionParts, [1, 7]) && lt(versionParts, [1, 16, 6])) {
      matched++
      ctx.finding({
        id: 'cve-log4shell-range',
        severity: 'high',
        title: `Minecraft ${versionRaw} is in the Log4Shell-affected range`,
        detail:
          'Minecraft 1.7–1.16.5 shipped Log4j2 versions vulnerable to CVE-2021-44228 (remote code execution via crafted chat/name strings). Server jars built after December 2021 are normally patched — verify the build or update. Version-range match only; patch state cannot be confirmed remotely.',
        evidence: { version: versionRaw, cve: 'CVE-2021-44228' }
      })
    }

    const authmeEntry = Object.entries(pluginVersions).find(([file]) => /authme/i.test(file))
    if (authmeEntry) {
      const authmeVersion = parseVersion(authmeEntry[1])
      if (authmeVersion.length > 0) {
        if (lt(authmeVersion, [6, 0, 1])) {
          matched++
          ctx.finding({
            id: 'cve-authme-outdated',
            severity: 'high',
            title: `AuthMe ${authmeEntry[1]} — pre-join session takeover & empty-secret auto-login`,
            detail:
              'AuthMe builds before 6.0.1 (6.0.0 in particular) are affected by the pre-join session race and accept perform.login messages signed with an empty shared secret (both fixed in 6.0.1, 2026-09). Upgrade AuthMe and set Hooks.proxySharedSecret.',
            evidence: { file: authmeEntry[0], version: authmeEntry[1], fixedIn: '6.0.1' }
          })
        } else {
          ctx.finding({
            id: 'cve-authme-current',
            severity: 'info',
            title: `AuthMe ${authmeEntry[1]} is current`,
            detail:
              'The fingerprinted AuthMe version is >= 6.0.1, which includes the session-takeover and empty-secret fixes.',
            evidence: { version: authmeEntry[1] }
          })
        }
      }
    } else if (/authme/i.test(inventory)) {
      matched++
      ctx.finding({
        id: 'cve-authme-version-unknown',
        severity: 'info',
        title: 'AuthMe detected but version unknown',
        detail:
          'AuthMe is present but its version could not be fingerprinted. Confirm it is >= 6.0.1 (pre-join session + empty-secret fixes) and that Hooks.proxySharedSecret is set.',
        evidence: {}
      })
    }

    if (matched === 0) {
      ctx.log('no known-vulnerable fingerprints matched')
      ctx.finding({
        id: 'cve-none-matched',
        severity: 'info',
        title: 'No known-vulnerable fingerprints matched',
        detail:
          'Neither the server version nor the fingerprinted plugin versions matched the curated vulnerability list. Keep everything updated — the list is version-range based.',
        evidence: { version: versionRaw }
      })
    }
  }
}
