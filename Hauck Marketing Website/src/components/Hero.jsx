import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../utils/gsap-helpers'

export default function Hero() {
  const containerRef = useRef(null)
  const statsRef = useRef(null)
  const eyebrowRef = useRef(null)
  const headlineRef = useRef(null)
  const sublineRef = useRef(null)
  const ctaRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(
        [statsRef.current, eyebrowRef.current, headlineRef.current, sublineRef.current, ctaRef.current],
        {
          y: 40,
          opacity: 0,
          stagger: 0.1,
          duration: 0.9,
          ease: 'power3.out',
          delay: 0.2,
        }
      )
      ScrollTrigger.refresh()
    }, containerRef)
    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={containerRef}
      id="hero"
      className="relative w-full flex flex-col items-center justify-center overflow-hidden"
      style={{ height: '100dvh', minHeight: '600px' }}
    >
      {/* Blurred background photo */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url("https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80&auto=format&fit=crop")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(24px)',
          transform: 'scale(1.08)',
          zIndex: 0,
        }}
      />
      {/* Dark scrim — keeps text legible while photo shows through */}
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(4, 8, 16, 0.62)',
          zIndex: 0,
        }}
      />

      {/* Decorative glow orbs */}
      <div
        className="absolute"
        style={{
          top: '8%',
          left: '55%',
          width: 'clamp(300px, 45vw, 700px)',
          height: 'clamp(300px, 45vw, 700px)',
          background: 'radial-gradient(circle, rgba(14,165,233,0.13) 0%, transparent 70%)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
        }}
      />
      <div
        className="absolute"
        style={{
          top: '30%',
          left: '75%',
          width: 'clamp(200px, 30vw, 480px)',
          height: 'clamp(200px, 30vw, 480px)',
          background: 'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)',
          borderRadius: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 0,
        }}
      />

      {/* Fade to bg at bottom for seamless section transition */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: '35%',
          background: 'linear-gradient(to top, var(--bg) 0%, transparent 100%)',
          zIndex: 1,
        }}
      />

      {/* Content centered */}
      <div className="relative z-10 px-6 sm:px-12 lg:px-20 max-w-5xl w-full text-center">
        {/* Launch badge */}
        <div
          ref={statsRef}
          className="inline-flex items-center gap-3 mb-8 px-5 py-2.5 rounded-full"
          style={{
            fontFamily: 'JetBrains Mono, monospace',
            background: 'rgba(14,165,233,0.08)',
            border: '1px solid rgba(14,165,233,0.3)',
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: '#0EA5E9', boxShadow: '0 0 8px #0EA5E9' }}
          />
          <span style={{ fontSize: '0.72rem' }}>
            <span className="font-bold" style={{ color: '#0EA5E9' }}>7–14 Days</span>
            <span className="text-text-muted ml-2 tracking-widest uppercase">From Signup to Live — Guaranteed</span>
          </span>
        </div>

        {/* Eyebrow */}
        <p
          ref={eyebrowRef}
          className="text-text-muted mb-1 text-lg sm:text-xl md:text-2xl"
          style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
        >
          Local growth is
        </p>

        {/* Headline */}
        <h1
          ref={headlineRef}
          className="text-text-primary leading-none mb-6"
          style={{
            fontFamily: 'Fraunces, serif',
            fontStyle: 'italic',
            fontWeight: 600,
            fontSize: 'clamp(4rem, 12vw, 9rem)',
          }}
        >
          redefined.
        </h1>

        {/* Sub-headline */}
        <p
          ref={sublineRef}
          className="text-text-muted max-w-2xl mx-auto mb-10 leading-relaxed"
          style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '1.25rem' }}
        >
          We deploy AI agents and precision ad campaigns into local businesses —
          so your pipeline never runs dry.
        </p>

        {/* CTA row */}
        <div ref={ctaRef} className="flex flex-wrap items-center justify-center gap-4">
          <a href="https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp" target="_blank" rel="noopener noreferrer" className="btn-primary">
            Start Growing →
          </a>
          <a href="#results" className="btn-ghost">
            Here's Proof...
          </a>
        </div>
      </div>
    </section>
  )
}
