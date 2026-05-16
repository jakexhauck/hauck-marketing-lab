import { useEffect, useRef, useState } from 'react'
import { Menu, X } from 'lucide-react'

const links = [
  { label: 'Services', href: '#features' },
  { label: 'Proof', href: '#results' },
  { label: 'How It Works', href: '#protocol' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-4 transition-all duration-500"
        style={{ fontFamily: 'DM Sans, sans-serif' }}
      >
        <div
          className="w-full max-w-5xl flex items-center justify-between px-6 py-3 rounded-full transition-all duration-500"
          style={{
            background: scrolled ? 'rgba(4,8,16,0.88)' : 'transparent',
            backdropFilter: scrolled ? 'blur(20px)' : 'none',
            border: scrolled ? '1px solid var(--border)' : '1px solid transparent',
          }}
        >
          {/* Logo */}
          <a href="#" className="flex items-center gap-2">
            <span
              className="text-text-primary tracking-tight leading-none"
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
          </a>

          {/* Desktop nav */}
          <ul className="hidden md:flex items-center gap-6">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  className="text-text-primary hover:text-accent transition-colors text-sm font-medium"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <div className="hidden md:block">
            <a href="https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp" target="_blank" rel="noopener noreferrer" className="btn-primary text-sm py-2 px-5">
              Get More Leads →
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden text-text-primary p-1"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 w-72 flex flex-col p-8 gap-6 md:hidden transition-transform duration-300"
        style={{
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        <button
          className="self-end text-text-muted hover:text-text-primary"
          onClick={() => setOpen(false)}
        >
          <X size={22} />
        </button>
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            onClick={() => setOpen(false)}
            className="text-text-primary text-xl font-medium hover:text-accent transition-colors"
            style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700 }}
          >
            {l.label}
          </a>
        ))}
        <a href="https://link.hauckmarketing.com/widget/booking/bNngVkJWa6qNGw18whfp" target="_blank" rel="noopener noreferrer" className="btn-primary mt-auto text-center justify-center">
          Get More Leads →
        </a>
      </div>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 md:hidden bg-bg/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  )
}
