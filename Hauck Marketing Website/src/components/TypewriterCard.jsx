import { useEffect, useRef, useState } from 'react'

const LINES = [
  '> Campaign active: Google Search [LOCAL]',
  '> Impressions: 4,822 today',
  '> CPC: $1.47 avg.',
  '> Lead form submitted — "Mike\'s HVAC" — 2 min ago',
  '> Optimizing bid strategy...',
]

export default function TypewriterCard() {
  const [displayLines, setDisplayLines] = useState([])
  const [currentLine, setCurrentLine] = useState(0)
  const [charIndex, setCharIndex] = useState(0)
  const timerRef = useRef(null)

  useEffect(() => {
    if (currentLine >= LINES.length) {
      timerRef.current = setTimeout(() => {
        setDisplayLines([])
        setCurrentLine(0)
        setCharIndex(0)
      }, 3000)
      return
    }

    const line = LINES[currentLine]
    if (charIndex < line.length) {
      timerRef.current = setTimeout(() => {
        setDisplayLines((prev) => {
          const next = [...prev]
          next[currentLine] = (next[currentLine] ?? '') + line[charIndex]
          return next
        })
        setCharIndex((c) => c + 1)
      }, 28)
    } else {
      timerRef.current = setTimeout(() => {
        setCurrentLine((l) => l + 1)
        setCharIndex(0)
      }, 350)
    }
    return () => clearTimeout(timerRef.current)
  }, [currentLine, charIndex])

  return (
    <div
      className="rounded-[2rem] p-8 flex flex-col h-full"
      style={{ background: '#111820', border: '1px solid #1E2D3D' }}
    >
      {/* Terminal feed */}
      <div
        className="flex-1 rounded-xl p-5 mb-6 min-h-[160px] flex flex-col justify-between"
        style={{ background: '#080C10', border: '1px solid #1E2D3D' }}
      >
        {/* Header row */}
        <div className="flex items-center gap-2 mb-4">
          <span
            className="w-2 h-2 rounded-full bg-accent pulse-dot"
          />
          <span
            className="text-accent text-[10px] tracking-widest uppercase"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}
          >
            Live Feed
          </span>
        </div>

        {/* Lines */}
        <div className="flex flex-col gap-1.5 flex-1">
          {displayLines.map((line, i) => (
            <p
              key={i}
              className="text-[11px] leading-relaxed"
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                color: line?.startsWith('> Lead form') ? '#0EA5E9' : '#6B7E8F',
              }}
            >
              {line}
              {i === currentLine && currentLine < LINES.length && (
                <span className="blink text-accent">█</span>
              )}
            </p>
          ))}
          {currentLine < LINES.length && displayLines.length === 0 && (
            <span className="blink text-accent text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              █
            </span>
          )}
        </div>
      </div>

      <div>
        <h3
          className="text-text-primary text-xl mb-3"
          style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
        >
          Ads That Actually Convert.
        </h3>
        <p className="text-text-muted text-sm leading-relaxed" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          Google, Meta, and local search campaigns built for lead volume — not brand
          awareness. Every dollar tracked to a real outcome.
        </p>
      </div>
    </div>
  )
}
