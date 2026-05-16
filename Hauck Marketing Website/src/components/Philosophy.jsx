import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../utils/gsap-helpers'

export default function Philosophy() {
  const sectionRef = useRef(null)
  const bgRef = useRef(null)
  const copyRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Parallax background
      gsap.to(bgRef.current, {
        yPercent: -15,
        ease: 'none',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      })

      // Lines fade up
      const words = copyRef.current.querySelectorAll('.anim-word')
      gsap.from(words, {
        y: 30,
        opacity: 0,
        stagger: 0.08,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: copyRef.current,
          start: 'top 75%',
          once: true,
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="philosophy"
      className="relative py-32 overflow-hidden"
    >
      {/* Parallax texture */}
      <div
        ref={bgRef}
        className="absolute inset-0 scale-110"
        style={{ zIndex: 0 }}
      >
        <img
          src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80"
          alt=""
          loading="lazy"
          className="w-full h-full object-cover"
          style={{ opacity: 0.09 }}
        />
      </div>

      <div ref={copyRef} className="relative z-10 max-w-4xl mx-auto px-6 sm:px-12 lg:px-20">
        <div className="anim-word mb-12">
          <p
            className="text-text-muted mb-2 leading-snug"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '1rem' }}
          >
            Most agencies focus on:
          </p>
          <p
            className="leading-snug"
            style={{
              fontFamily: 'Fraunces, serif',
              fontStyle: 'italic',
              fontWeight: 600,
              fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
              color: '#6A8FA8',
            }}
          >
            "impressions, reach, and brand awareness."
          </p>
        </div>

        <div className="anim-word mb-12">
          <p
            className="text-text-muted mb-2 leading-snug"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '1rem' }}
          >
            We focus on:
          </p>
          <p
            className="leading-none"
            style={{
              fontFamily: 'Fraunces, serif',
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 'clamp(4rem, 12vw, 9rem)',
              color: '#0EA5E9',
              lineHeight: '0.9',
            }}
          >
            leads.
          </p>
        </div>

        <div className="anim-word max-w-2xl">
          <div
            className="w-12 h-px mb-6"
            style={{ background: 'var(--border)' }}
          />
          <p
            className="text-text-muted leading-relaxed"
            style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '1.05rem' }}
          >
            Every system we build, every campaign we launch, every agent we deploy is
            measured on one thing only: did it generate a real, qualified lead for your
            business?
          </p>
        </div>
      </div>
    </section>
  )
}
