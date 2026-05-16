import { useEffect, useState } from 'react'
import { Bot } from 'lucide-react'

const agents = [
  'Appointment Booking Agent',
  'Lead Follow-Up Agent',
  'Review Request Agent',
]

export default function ShufflerCard() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % agents.length), 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="relative rounded-[2rem] p-8 flex flex-col h-full overflow-hidden"
      style={{ background: '#111820', border: '1px solid #1E2D3D' }}
    >
      {/* Cycling agent badges */}
      <div className="relative h-40 mb-6 flex items-center justify-center">
        {agents.map((agent, i) => {
          const offset = (i - active + agents.length) % agents.length
          return (
            <div
              key={agent}
              className="absolute w-full"
              style={{
                transition: 'all 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                opacity: offset === 0 ? 1 : offset === 1 ? 0.45 : 0.15,
                transform: `translateY(${offset * 48}px) scale(${offset === 0 ? 1 : 0.92})`,
                zIndex: agents.length - offset,
              }}
            >
              <div
                className="mx-auto rounded-2xl px-5 py-3.5 flex items-center gap-3 max-w-xs"
                style={{
                  background: offset === 0 ? 'rgba(14,165,233,0.08)' : '#0D1420',
                  border: offset === 0 ? '1px solid rgba(14,165,233,0.3)' : '1px solid #1E2D3D',
                }}
              >
                <Bot size={16} className="text-accent flex-shrink-0" />
                <span
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}
                  className="text-text-primary"
                >
                  {agent}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-auto">
        <h3
          className="text-text-primary text-xl mb-3"
          style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
        >
          AI Agents, Deployed.
        </h3>
        <p className="text-text-muted text-sm leading-relaxed" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          We install intelligent agents directly into your business workflows — they
          book, follow up, and nurture leads 24/7 without lifting a finger.
        </p>
      </div>
    </div>
  )
}
