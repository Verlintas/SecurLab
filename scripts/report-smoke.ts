import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateHtml, generateMarkdown } from '../src/main/report/generate'
import type { RunRecord } from '../src/shared/engineTypes'

const record: RunRecord = {
  runId: '00000000-0000-0000-0000-000000000000',
  chainId: 'C1',
  chainTitle: 'C1 · Offline OP takeover',
  chainDescription: 'Join as a privileged name and attempt to claim operator status.',
  target: { host: '127.0.0.1', port: 25565 },
  params: { names: 'Admin' },
  startedAt: Date.now() - 45_000,
  endedAt: Date.now(),
  status: 'passed',
  steps: [
    {
      id: 'slp',
      module: 'recon.slp',
      title: 'Server list ping',
      status: 'passed',
      logs: ['ping 127.0.0.1:25565', 'pong in 180ms', 'version: Paper 1.21.11 (protocol 774)'],
      evidence: [
        { key: 'version', value: 'Paper 1.21.11' },
        { key: 'protocol', value: 774 }
      ],
      startedAt: Date.now() - 45_000,
      endedAt: Date.now() - 44_000
    },
    {
      id: 'takeover',
      module: 'access.offline-op',
      title: 'Identity takeover attempt',
      status: 'passed',
      logs: ['─ trying identity "Admin"', 'joined as "Admin"', '/seed allowed → operator status'],
      evidence: [{ key: 'opGainedAs', value: 'Admin' }],
      startedAt: Date.now() - 44_000,
      endedAt: Date.now() - 2_000
    }
  ],
  findings: [
    {
      id: 'offline-op-gained',
      severity: 'high',
      title: 'Operator access gained as "Admin"',
      detail: 'The name carries operator status and the join+authentication path did not prevent claiming it.',
      evidence: { name: 'Admin', proofCommand: '/seed' }
    },
    {
      id: 'fingerprint',
      severity: 'info',
      title: 'Version disclosure: Paper 1.21.11',
      detail: 'The server advertises its exact software version over server list ping.',
      evidence: { version: 'Paper 1.21.11' }
    }
  ]
}

try {
  const markdown = generateMarkdown(record)
  const html = generateHtml(record)
  const outDir = join(process.cwd(), 'out')
  writeFileSync(join(outDir, 'report-sample.md'), markdown)
  writeFileSync(join(outDir, 'report-sample.html'), html)

  const markdownRequired = [
    '# SecurLab — Penetration Test Report',
    '## Findings summary',
    '## Findings',
    '## Steps',
    'Operator access gained as "Admin"',
    '| high | 1 |'
  ]
  for (const needle of markdownRequired) {
    if (!markdown.includes(needle)) throw new Error(`markdown missing: ${needle}`)
  }
  const htmlRequired = ['<!doctype html>', 'badge-high', 'Findings summary', '<h2>Steps</h2>']
  for (const needle of htmlRequired) {
    if (!html.includes(needle)) throw new Error(`html missing: ${needle}`)
  }
  console.log(`[smoke] markdown ${markdown.length} bytes, html ${html.length} bytes, both passed checks`)
  console.log('[smoke] PASS')
} catch (error) {
  console.error('[smoke] FAIL', error)
  process.exit(1)
}
