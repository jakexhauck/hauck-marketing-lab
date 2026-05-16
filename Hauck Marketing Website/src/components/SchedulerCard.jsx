import { useEffect, useRef, useState } from 'react'

const DAYS = 30
const COLS = 6
const ROWS = Math.ceil(DAYS / COLS)

export default function SchedulerCard() {
  const [lit, setLit] = useState(new Set())
  const [showReport, setShowReport] = useState(false)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const gridRef = useRef(null)
  const animRef = useRef(null)

  useEffect(() => {
    let idx = 0
    function tick() {
      if (idx < DAYS) {
        setLit((prev) => {
          const next = new Set(prev)
          next.add(idx)
          return next
        })
        // Update cursor position
        const col = idx % COLS
        const row = Math.floor(idx / COLS)
        const cellW = 100 / COLS
        const cellH = 100 / ROWS
        setCursorPos({
          x: (col + 0.5) * cellW,
          y: (row + 0.5) * cellH,
        })
        idx++
        animRef.current = setTimeout(tick, 90)
      } else {
        setShowReport(true)
        animRef.current = setTimeout(() => {
          setLit(new Set())
          setShowReport(false)
          idx = 0
          animRef.current = setTimeout(tick, 400)
        }, 2500)
      }
    }
    animRef.current = setTimeout(tick, 600)
    return () => clearTimeout(animRef.current)
  }, [])

  return (
    <div
      className="rounded-[2rem] p-8 flex flex-col h-full overflow-hidden"
      style={{ background: '#111820', border: '1px solid #1E2D3D' }}
    >
      {/* Calendar */}
      <div ref={gridRef} className="relative flex-1 mb-6" style={{ minHeight: '160px' }}>
        <div
          className="grid gap-1.5 h-full"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {Array.from({ length: DAYS }, (_, i) => (
            <div
              key={i}
              className="rounded-md transition-all duration-200 flex items-center justify-center"
              style={{
                background: lit.has(i) ? 'rgba(14,165,233,0.15)' : '#0D1420',
                border: lit.has(i) ? '1px solid rgba(14,165,233,0.4)' : '1px solid #1E2D3D',
                aspectRatio: '1',
                boxShadow: lit.has(i) ? '0 0 8px rgba(14,165,233,0.2)' : 'none',
              }}
            >
              <span
                className="text-[9px] font-medium"
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: lit.has(i) ? '#0EA5E9' : '#1E2D3D',
                }}
              >
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* SVG cursor */}
        <div
          className="pointer-events-none absolute transition-all duration-100"
          style={{
            left: `${cursorPos.x}%`,
            top: `${cursorPos.y}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
          }}
        >
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
            <path
              d="M0 0L0 16L4 12L6.5 18L8.5 17.2L6 11L11 11L0 0Z"
              fill="#F0F4F8"
              stroke="#080C10"
              strokeWidth="0.5"
            />
          </svg>
        </div>

        {/* View Report button overlay */}
        {showReport && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button className="btn-primary text-xs py-2 px-5 shadow-lg">
              View Report →
            </button>
          </div>
        )}
      </div>

      <div>
        <h3
          className="text-text-primary text-xl mb-3"
          style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
        >
          Full Visibility, Always.
        </h3>
        <p className="text-text-muted text-sm leading-relaxed" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          A live dashboard shows every lead, every campaign, every agent interaction.
          You always know exactly what's working.
        </p>
      </div>
    </div>
  )
}
