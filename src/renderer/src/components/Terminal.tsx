import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

function colorize(line: string): string {
  if (line.includes('[securlab]')) return `\x1b[38;2;255;77;77m${line}\x1b[0m`
  if (/ERROR|SEVERE|\bException\b/.test(line)) return `\x1b[31m${line}\x1b[0m`
  if (/WARN/.test(line)) return `\x1b[33m${line}\x1b[0m`
  if (line.includes('Done (')) return `\x1b[32m${line}\x1b[0m`
  return line
}

export default function Terminal({
  attach,
  className = ''
}: {
  attach: (write: (line: string) => void) => () => void
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const attachRef = useRef(attach)
  attachRef.current = attach

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const term = new XTerm({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      scrollback: 5000,
      theme: {
        background: '#070707',
        foreground: '#d4d4d4',
        cursor: '#ff0000',
        selectionBackground: 'rgba(255, 0, 0, 0.3)',
        black: '#111111',
        red: '#ff4444',
        green: '#2ecc71',
        yellow: '#e6b800',
        blue: '#4d9fff',
        magenta: '#ff66cc',
        cyan: '#33cccc',
        white: '#d4d4d4'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // container not measurable while hidden
      }
    })
    observer.observe(el)

    const unsubscribe = attachRef.current((line) => term.writeln(colorize(line)))

    return () => {
      unsubscribe()
      observer.disconnect()
      term.dispose()
    }
  }, [])

  return <div ref={containerRef} className={`h-full w-full ${className}`} />
}
