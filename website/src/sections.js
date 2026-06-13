/* Scroll orchestration. The page scrolls natively; we only observe it.

   - IntersectionObserver with a generous rootMargin pre-builds pieces
     before they are needed (lazy build, cached forever after).
   - A passive scroll listener picks the active section (the one whose
     band covers the viewport center) and reports scroll progress
     within it for the small scroll-tied piece rotation. */

export function initSections({ onApproach, onActive, onProgress }){
  const sections = Array.from(document.querySelectorAll('.stage-sec'));

  const io = new IntersectionObserver((entries) => {
    for (const e of entries){
      if (e.isIntersecting){
        onApproach(e.target.dataset.piece);
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '120% 0px 120% 0px' });
  sections.forEach(s => io.observe(s));

  let activeEl = null;

  function update(){
    const mid = window.innerHeight / 2;
    let best = null;
    let bestDist = Infinity;
    for (const s of sections){
      const r = s.getBoundingClientRect();
      const center = r.top + r.height / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist){ bestDist = dist; best = { el: s, rect: r }; }
    }
    if (!best) return;

    if (best.el !== activeEl){
      activeEl = best.el;
      onActive(best.el.dataset.piece, best.el.dataset.side);
    }
    const r = best.rect;
    const denom = r.height + window.innerHeight;
    const p = Math.min(1, Math.max(0, (window.innerHeight - r.top) / denom));
    onProgress(p);
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}
