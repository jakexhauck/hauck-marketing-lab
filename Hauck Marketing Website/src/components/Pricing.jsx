import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { gsap, ScrollTrigger } from '../utils/gsap-helpers'

const tiers = [
  {
    name: 'Starter',
    price: '$997',
    period: '/mo',
    tag: null,
    features: [
      'AI Booking Agent',
      'Google Ads Setup',
      'Monthly Report',
      'Email Support',
    ],
    cta: 'Get Started',
    href: 'https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp',
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$1,997',
    period: '/mo',
    tag: 'Most Popular',
    features: [
      'Everything in Starter',
      'Lead Follow-Up Agent',
      'Meta Ads',
      'Live Dashboard',
      'Weekly Strategy Call',
    ],
    cta: 'Get More Leads',
    href: 'https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp',
    highlighted: true,
  },
  {
    name: 'Dominate',
    price: 'Custom',
    period: '',
    tag: 'Full Stack',
    features: [
      'Everything in Growth',
      'Custom Agent Build',
      'Multi-Location',
      'Dedicated Strategist',
      'Priority Support',
    ],
    cta: 'Contact Us',
    href: 'https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp',
    highlighted: false,
  },
]

export default function Pricing() {
  const sectionRef = useRef(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.pricing-head > *', {
        y: 30,
        opacity: 0,
        stagger: 0.1,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.pricing-head',
          start: 'top 80%',
          once: true,
        },
      })
      gsap.from('.pricing-card', {
        y: 50,
        opacity: 0,
        stagger: 0.12,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.pricing-grid',
          start: 'top 75%',
          once: true,
        },
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="pricing" className="py-24 bg-bg px-6 sm:px-12 lg:px-20">
      <div className="max-w-6xl mx-auto">
        <div className="pricing-head text-center mb-14">
          <p
            className="text-text-muted tracking-widest uppercase mb-4 text-xs"
            style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.2em' }}
          >
            Packages
          </p>
          <h2
            className="text-text-primary leading-tight"
            style={{
              fontFamily: 'Syne, sans-serif',
              fontWeight: 800,
              fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            }}
          >
            Choose your{' '}
            <span
              style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 600 }}
            >
              weapon.
            </span>
          </h2>
          <p
            className="text-text-muted mt-4 max-w-xl mx-auto"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Every package ships with a 30-day ramp guarantee. If we don't generate
            qualified leads in your first month, we work free until we do.
          </p>
        </div>

        <div className="pricing-grid grid md:grid-cols-3 gap-6 items-stretch">
          {tiers.map((tier) => (
            <div
              key={tier.name}
              className="pricing-card rounded-[2rem] p-8 flex flex-col relative overflow-hidden"
              style={{
                background: tier.highlighted ? '#0EA5E9' : '#111820',
                border: tier.highlighted
                  ? '1px solid rgba(14,165,233,0.5)'
                  : '1px solid #1E2D3D',
                boxShadow: tier.highlighted
                  ? '0 0 60px rgba(14,165,233,0.18), 0 0 0 1px rgba(14,165,233,0.15)'
                  : 'none',
                transform: tier.highlighted ? 'scale(1.03)' : 'scale(1)',
              }}
            >
              {/* Tag */}
              {tier.tag && (
                <span
                  className="absolute top-6 right-6 text-[10px] px-2.5 py-1 rounded-md tracking-widest uppercase"
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    background: tier.highlighted ? 'rgba(255,255,255,0.18)' : 'rgba(14,165,233,0.12)',
                    color: tier.highlighted ? '#fff' : '#0EA5E9',
                    border: tier.highlighted ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(14,165,233,0.25)',
                  }}
                >
                  {tier.tag}
                </span>
              )}

              {/* Name & Price */}
              <div className="mb-8">
                <p
                  className={`text-xs tracking-widest uppercase mb-3 ${tier.highlighted ? 'text-white/70' : 'text-text-muted'}`}
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {tier.name}
                </p>
                <div className="flex items-end gap-1">
                  <span
                    className={`leading-none ${tier.highlighted ? 'text-white' : 'text-text-primary'}`}
                    style={{
                      fontFamily: 'Syne, sans-serif',
                      fontWeight: 800,
                      fontSize: 'clamp(2.5rem, 6vw, 3.5rem)',
                    }}
                  >
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span
                      className={`mb-2 text-sm ${tier.highlighted ? 'text-white/60' : 'text-text-muted'}`}
                      style={{ fontFamily: 'DM Sans, sans-serif' }}
                    >
                      {tier.period}
                    </span>
                  )}
                </div>
              </div>

              {/* Features */}
              <ul className="flex flex-col gap-3 mb-8 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <Check
                      size={14}
                      className="mt-0.5 flex-shrink-0"
                      style={{ color: tier.highlighted ? '#fff' : '#0EA5E9' }}
                    />
                    <span
                      className={`text-sm ${tier.highlighted ? 'text-white/90' : 'text-text-muted'}`}
                      style={{ fontFamily: 'DM Sans, sans-serif' }}
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={tier.href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full justify-center text-center"
                style={{
                  background: tier.highlighted ? '#fff' : '#0EA5E9',
                  color: tier.highlighted ? '#0EA5E9' : '#fff',
                }}
              >
                {tier.cta} →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
