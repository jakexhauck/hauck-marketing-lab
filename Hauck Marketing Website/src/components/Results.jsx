import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../utils/gsap-helpers'

const stats = [
  {
    number: 47,
    prefix: '',
    suffix: '×',
    label: 'faster lead response',
    context: 'Industry avg: 47 hrs · Your AI: under 60 seconds',
    detail: {
      tag: 'Lead Capture',
      headline: 'First to respond wins the job.',
      body: 'Studies show the business that responds first closes the deal 78% of the time. Your AI texts and emails the moment a lead comes in — midnight, Sunday, holiday.',
    },
  },
  {
    number: 20,
    prefix: '',
    suffix: ' hrs',
    label: 'freed per week, per location',
    context: 'Scheduling · Reminders · Follow-ups · Re-activation',
    detail: {
      tag: 'Automation Stack',
      headline: '1,000+ hours a year back in your pocket.',
      body: 'Your AI handles booking, confirmation texts, no-show reminders, and review requests — with zero staff time. Owners use those hours to grow, not grind.',
    },
  },
  {
    number: 36000,
    prefix: '$',
    suffix: '',
    label: 'in overhead eliminated annually',
    context: 'vs. marketing agencies charging $3,000–$4,000/month',
    detail: {
      tag: 'ROI',
      headline: 'Agencies charge more. Deliver less.',
      body: 'Marketing agencies charge $3,000–$4,000/month in retainers and rarely move the needle. Our AI works 24/7 for a fraction of that — and actually gets you results.',
    },
  },
]

const clients = [
  'HVAC', 'Law Firms', 'Dental', 'Roofing', 'Med Spas',
  'Plumbing', 'Chiro', 'Real Estate', 'Auto', 'Restaurants',
  'HVAC', 'Law Firms', 'Dental', 'Roofing', 'Med Spas',
  'Plumbing', 'Chiro', 'Real Estate', 'Auto', 'Restaurants',
]

function StatBlock({ stat, index }) {
  const numRef = useRef(null)

  useEffect(() => {
    const el = numRef.current
    if (!el) return
    const obj = { val: 0 }
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top 80%',
      once: true,
      onEnter() {
        gsap.to(obj, {
          val: stat.number,
          duration: 1.8,
          ease: 'power2.out',
          onUpdate() {
            const formatted = stat.number >= 10000
              ? Math.round(obj.val).toLocaleString()
              : (stat.decimals ? obj.val.toFixed(stat.decimals) : Math.round(obj.val))
            el.textContent = stat.prefix + formatted + stat.suffix
          },
        })
      },
    })
    return () => st.kill()
  }, [stat])

  return (
    <div
      className="rounded-[2rem] p-8 grid md:grid-cols-2 gap-8 items-center"
      style={{ border: '1px solid var(--border)', background: 'rgba(12, 24, 40, 0.82)', backdropFilter: 'blur(12px)' }}
    >
      {/* Stat */}
      <div className="min-w-0">
        <div
          ref={numRef}
          className="stat-number text-text-primary leading-none mb-2"
          style={{
            fontFamily: 'Syne, sans-serif',
            fontWeight: 800,
            fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
            color: '#0EA5E9',
            wordBreak: 'keep-all',
            whiteSpace: 'nowrap',
          }}
        >
          {stat.prefix}0{stat.suffix}
        </div>
        <p
          className="text-text-muted text-sm mb-1"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          {stat.label}
        </p>
        <p
          className="text-[11px] tracking-widest uppercase"
          style={{ fontFamily: 'JetBrains Mono, monospace', color: '#6B8CA4' }}
        >
          {stat.context}
        </p>
      </div>

      {/* Capability detail */}
      <div
        className="rounded-2xl p-6 flex flex-col gap-3 min-w-0"
        style={{ background: 'rgba(8, 16, 30, 0.7)', border: '1px solid var(--border)' }}
      >
        <span
          className="inline-block self-start px-3 py-1 rounded-full text-[10px] tracking-widest uppercase"
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            background: 'rgba(14, 165, 233, 0.12)',
            color: '#0EA5E9',
            border: '1px solid rgba(14, 165, 233, 0.25)',
          }}
        >
          {stat.detail.tag}
        </span>
        <p
          className="text-text-primary text-base font-semibold leading-snug"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          {stat.detail.headline}
        </p>
        <p
          className="text-text-muted text-sm leading-relaxed"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          {stat.detail.body}
        </p>
      </div>
    </div>
  )
}

export default function Results() {
  const sectionRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.results-head > *', {
        y: 40,
        opacity: 0,
        stagger: 0.12,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.results-head',
          start: 'top 80%',
          once: true,
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="results" className="py-24">
      <div className="max-w-6xl mx-auto px-6 sm:px-12 lg:px-20">
        <div className="results-head mb-14 text-center">
          <p
            className="text-text-muted tracking-widest uppercase mb-4 text-xs"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.2em' }}
          >
            Proof of Work
          </p>
          <h2
            className="text-text-primary leading-tight"
            style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            Numbers that{' '}
            <span
              style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 600, color: '#0EA5E9' }}
            >
              don't lie.
            </span>
          </h2>
        </div>

        <div className="flex flex-col gap-6 mb-16">
          {stats.map((stat, i) => (
            <StatBlock key={i} stat={stat} index={i} />
          ))}
        </div>
      </div>

      {/* Marquee strip */}
      <div
        className="overflow-hidden py-4 border-y"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="marquee-inner flex items-center gap-0" style={{ width: 'max-content' }}>
          {clients.map((c, i) => (
            <span
              key={i}
              className="px-6 py-2 flex items-center gap-4"
              style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}
            >
              <span className="text-text-muted tracking-widest uppercase">{c}</span>
              <span className="text-border">·</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
