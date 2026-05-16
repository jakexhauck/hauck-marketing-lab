import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export { gsap, ScrollTrigger }

export function fadeUpOnScroll(targets, opts = {}) {
  return gsap.from(targets, {
    y: 40,
    opacity: 0,
    duration: 0.9,
    stagger: opts.stagger ?? 0.1,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: opts.trigger ?? targets,
      start: 'top 80%',
      once: true,
      ...opts.scrollTrigger,
    },
  })
}

export function countUp(el, target, opts = {}) {
  const obj = { val: 0 }
  return gsap.to(obj, {
    val: target,
    duration: opts.duration ?? 1.8,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: el,
      start: 'top 75%',
      once: true,
      ...opts.scrollTrigger,
    },
    onUpdate() {
      el.textContent = opts.format ? opts.format(obj.val) : Math.round(obj.val)
    },
  })
}
