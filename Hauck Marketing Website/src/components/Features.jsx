import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '../utils/gsap-helpers'
import ShufflerCard from './ShufflerCard'
import TypewriterCard from './TypewriterCard'
import SchedulerCard from './SchedulerCard'

export default function Features() {
  const sectionRef = useRef(null)
  const headRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(headRef.current.children, {
        y: 40,
        opacity: 0,
        stagger: 0.12,
        duration: 0.9,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: headRef.current,
          start: 'top 80%',
          once: true,
        },
      })

      gsap.from('.feature-card', {
        y: 50,
        opacity: 0,
        stagger: 0.15,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.features-grid',
          start: 'top 75%',
          once: true,
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="features" className="py-24 px-6 sm:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto">
        <div ref={headRef} className="mb-14 text-center">
          <p
            className="text-text-muted tracking-widest uppercase mb-4 text-xs"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.2em' }}
          >
            What We Deploy
          </p>
          <h2
            className="text-text-primary leading-tight"
            style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            Three systems.
            <br />
            <span
              style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 600 }}
            >
              One compounding result.
            </span>
          </h2>
        </div>

        <div className="features-grid grid md:grid-cols-3 gap-6">
          <div className="feature-card h-full">
            <ShufflerCard />
          </div>
          <div className="feature-card h-full">
            <TypewriterCard />
          </div>
          <div className="feature-card h-full">
            <SchedulerCard />
          </div>
        </div>
      </div>
    </section>
  )
}
