import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeLogFile, renderForensicsMarkdown } from '../src/main/forensics/analyze'

const inputPath = process.env.LOG ?? process.argv[2] ?? ''
if (!inputPath) {
  console.error('usage: LOG=/path/to/latest.log npm run log:forensics')
  process.exit(1)
}

try {
  const report = analyzeLogFile(inputPath)
  const markdown = renderForensicsMarkdown(report)
  const outputPath = join(process.cwd(), 'out', `forensics-${Date.now()}.md`)
  writeFileSync(outputPath, markdown)
  console.log(markdown)
  console.log(`\n[forensics] report written to ${outputPath}`)
} catch (error) {
  console.error('[forensics] FAIL', error)
  process.exit(1)
}
