import { useEffect, useRef } from 'react'
import { ScrollTrigger } from './utils/gsap-helpers'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import Results from './components/Results'
import Philosophy from './components/Philosophy'
import Protocol from './components/Protocol'
import Footer from './components/Footer'

export default function App() {
  const appRef = useRef(null)

  useEffect(() => {
    ScrollTrigger.refresh()
    return () => ScrollTrigger.getAll().forEach((t) => t.kill())
  }, [])

  return (
    <div ref={appRef} className="relative text-text-primary min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <Results />
      <Philosophy />
      <Protocol />
      <Footer />
    </div>
  )
}
