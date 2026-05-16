import { useEffect, useRef } from 'react'
import { gsap } from '../utils/gsap-helpers'

/* ─── Canvas Animations ─── */

function ConcentricRings() {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200" fill="none" className="mx-auto">
      {[80, 60, 40, 20].map((r, i) => (
        <circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          stroke="#0EA5E9"
          strokeWidth="1"
          opacity={0.15 + i * 0.06}
          style={{
            transformOrigin: '100px 100px',
            animation: `ring-rotate ${8 + i * 3}s linear infinite`,
            animationDirection: i % 2 === 0 ? 'normal' : 'reverse',
          }}
          strokeDasharray={i % 2 === 0 ? '4 6' : '1 8'}
        />
      ))}
      <circle cx="100" cy="100" r="4" fill="#0EA5E9" opacity="0.6" />
    </svg>
  )
}

function LaserGrid() {
  return (
    <div className="relative mx-auto" style={{ width: 200, height: 120 }}>
      {/* Dot grid */}
      <div
        className="absolute inset-0 grid"
        style={{
          gridTemplateColumns: 'repeat(10, 1fr)',
          gridTemplateRows: 'repeat(6, 1fr)',
          gap: 0,
        }}
      >
        {Array.from({ length: 60 }).map((_, i) => (
          <div key={i} className="flex items-center justify-center">
            <div
              className="rounded-full"
              style={{ width: 2, height: 2, background: '#1E2D3D' }}
            />
          </div>
        ))}
      </div>
      {/* Laser line */}
      <div
        className="absolute left-0 right-0 h-px"
        style={{
          background: 'linear-gradient(90deg, transparent, #0EA5E9, transparent)',
          boxShadow: '0 0 8px #0EA5E9',
          animation: 'laser-scan 2s ease-in-out infinite',
        }}
      />
    </div>
  )
}

function EKGWave() {
  const path = 'M0,60 L30,60 L40,60 L45,15 L50,95 L55,35 L60,60 L90,60 L100,60 L110,60 L115,20 L120,90 L125,40 L130,60 L160,60 L200,60'
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" className="mx-auto">
      <path
        d={path}
        stroke="#0EA5E9"
        strokeWidth="2"
        fill="none"
        opacity="0.8"
        strokeDasharray="500"
        strokeDashoffset="0"
        style={{
          animation: 'ekg 2s linear infinite',
          strokeDasharray: 500,
        }}
      />
      <path
        d={path}
        stroke="#0EA5E9"
        strokeWidth="0.5"
        fill="none"
        opacity="0.2"
      />
    </svg>
  )
}

/* ─── Protocol cards ─── */

const cards = [
  {
    step: '01',
    title: 'We Audit Your Growth Gap',
    body: 'We map where your leads are leaking — missed calls, dead follow-ups, poor ad targeting — and build a system to plug every hole.',
    Canvas: ConcentricRings,
    bg: 'rgba(10, 20, 36, 0.88)',
  },
  {
    step: '02',
    title: 'We Build Your Growth Stack',
    body: 'AI agents are installed. Ad campaigns are launched. Your CRM is built. The entire system is live within 7–14 days.',
    Canvas: LaserGrid,
    bg: 'rgba(8, 16, 30, 0.88)',
  },
  {
    step: '03',
    title: 'We Scale What\'s Working',
    body: 'Every week we review performance data, cut what\'s not working, and double down on what is. Compounding results, month over month.',
    Canvas: EKGWave,
    bg: 'rgba(6, 12, 24, 0.88)',
  },
]

export default function Protocol() {
  const sectionRef = useRef(null)
  const headRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(headRef.current.children, {
        y: 30,
        opacity: 0,
        stagger: 0.1,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: headRef.current,
          start: 'top 80%',
          once: true,
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="protocol">
      {/* Header */}
      <div className="pt-14 pb-0 px-6 sm:px-12 lg:px-20 max-w-6xl mx-auto">
        <div ref={headRef} className="text-center">
          <p
            className="text-text-muted tracking-widest uppercase mb-4 text-xs"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.2em' }}
          >
            The Process
          </p>
          <h2
            className="text-text-primary leading-tight"
            style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            From audit to
            <span
              style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 600 }}
            >
              {' '}scale.
            </span>
          </h2>
        </div>
      </div>

      {/* Sticky cards */}
      {cards.map((card, i) => (
        <div
          key={i}
          className="protocol-card"
        >
          <div className="max-w-6xl mx-auto px-6 sm:px-12 lg:px-20 w-full">
            <div
              className="rounded-[2rem] p-10 md:p-14 grid md:grid-cols-2 gap-10 items-center"
              style={{
                background: card.bg,
                border: '1px solid var(--border)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* Copy */}
              <div>
                <span
                  className="text-accent mb-4 block"
                  style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', letterSpacing: '0.15em' }}
                >
                  STEP {card.step}
                </span>
                <h3
                  className="text-text-primary mb-5 leading-tight"
                  style={{
                    fontFamily: 'Syne, sans-serif',
                    fontWeight: 800,
                    fontSize: 'clamp(1.5rem, 3.5vw, 2.5rem)',
                  }}
                >
                  {card.title}
                </h3>
                <p
                  className="text-text-muted leading-relaxed"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '1.05rem' }}
                >
                  {card.body}
                </p>
              </div>

              {/* Canvas */}
              <div className="flex items-center justify-center py-8">
                <card.Canvas />
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Spacer after sticky section */}
      <div className="h-24" />
    </section>
  )
}
