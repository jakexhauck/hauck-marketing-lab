const navLinks = [
  { label: 'Services', href: '#features' },
  { label: 'Proof', href: '#results' },
  { label: 'How It Works', href: '#protocol' },
  { label: 'Privacy Policy', href: '/privacy.html' },
  { label: 'Terms of Service', href: '/terms.html' },
]

export default function Footer() {
  return (
    <footer
      className="pt-16 pb-8 px-6 sm:px-12 lg:px-20"
      style={{
        background: 'var(--surface)',
        borderRadius: '4rem 4rem 0 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Three column grid */}
        <div className="grid md:grid-cols-3 gap-12 mb-16">
          {/* Col 1: Logo + tagline + status */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-text-primary"
                style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.25rem' }}
              >
                HAUCK
              </span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/30"
                style={{ fontFamily: 'JetBrains Mono, monospace' }}
              >
                [AI]
              </span>
            </div>
            <p
              className="text-text-muted text-sm mb-6 leading-relaxed"
              style={{ fontFamily: 'DM Sans, sans-serif', fontStyle: 'italic' }}
            >
              Local businesses. AI-powered growth.
            </p>

            {/* Status badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md"
              style={{
                background: 'rgba(34,197,94,0.06)',
                border: '1px solid rgba(34,197,94,0.15)',
              }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: '#22c55e', animation: 'pulse-dot 2s ease-in-out infinite' }}
              />
              <span
                className="text-[10px] tracking-widest uppercase"
                style={{ fontFamily: 'JetBrains Mono, monospace', color: '#6B7E8F' }}
              >
                System Operational
              </span>
            </div>
          </div>

          {/* Col 2: Nav links */}
          <div>
            <p
              className="text-text-muted text-xs tracking-widest uppercase mb-5"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              Navigation
            </p>
            <ul className="flex flex-col gap-3">
              {navLinks.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    className="text-text-muted hover:text-text-primary transition-colors text-sm"
                    style={{ fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Contact + Socials */}
          <div>
            <p
              className="text-text-muted text-xs tracking-widest uppercase mb-5"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              Contact
            </p>
            <a
              href="mailto:contact.jakehauck@gmail.com"
              className="text-text-muted hover:text-accent transition-colors text-sm block mb-2"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              contact.jakehauck@gmail.com
            </a>
            <a
              href="tel:+17343010570"
              className="text-text-muted hover:text-accent transition-colors text-sm block"
              style={{ fontFamily: 'JetBrains Mono, monospace' }}
            >
              734-301-0570
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px mb-8" style={{ background: 'var(--border)' }} />

        {/* Bottom bar */}
        <p
          className="text-center text-text-muted text-xs"
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          © 2026 Hauck Marketing LLC. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
