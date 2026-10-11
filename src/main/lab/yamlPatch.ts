export interface YamlPatch {
  path: string[]
  value: string
}

/**
 * Minimal indentation-based YAML value patcher for lab config overrides.
 * Only rewrites scalar leaf values; sections and list items are left untouched.
 */
export function patchYaml(text: string, patches: YamlPatch[]): { text: string; applied: number } {
  const lines = text.split('\n')
  const stack: { indent: number; key: string }[] = []
  let applied = 0

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ')) continue

    const indent = raw.length - raw.trimStart().length
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop()

    const colon = trimmed.indexOf(':')
    if (colon < 0) continue
    const key = trimmed.slice(0, colon).trim()
    const valuePart = trimmed.slice(colon + 1).trim()

    const path = [...stack.map((entry) => entry.key), key]
    for (const patch of patches) {
      if (
        path.length === patch.path.length &&
        path.every((segment, index) => segment === patch.path[index])
      ) {
        if (patch.value === '[]') {
          lines[i] = `${' '.repeat(indent)}${key}: []`
          applied++
          for (let j = i + 1; j < lines.length; j++) {
            const childTrimmed = lines[j].trim()
            const childIndent = lines[j].length - lines[j].trimStart().length
            if (childTrimmed !== '' && childIndent >= indent && childTrimmed.startsWith('- ')) {
              lines[j] = ''
              continue
            }
            if (childTrimmed === '' || childTrimmed.startsWith('#')) continue
            break
          }
        } else {
          lines[i] = `${' '.repeat(indent)}${key}: ${patch.value}`
          applied++
        }
      }
    }

    const isSection = valuePart === '' || valuePart.startsWith('#')
    if (isSection) stack.push({ indent, key })
  }

  return { text: lines.join('\n'), applied }
}
