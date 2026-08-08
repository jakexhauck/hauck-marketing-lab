/* Root & Ritual - shared mockup behaviour.
   Scroll reveal, mobile nav, accordions, quantity stepper, sticky header state. */
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    /* ---- scroll reveal ---- */
    var rise = document.querySelectorAll('[data-rise]');
    if (rise.length && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var d = e.target.getAttribute('data-rise');
          e.target.style.transitionDelay = (d ? parseFloat(d) : 0) + 'ms';
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      rise.forEach(function (el) { io.observe(el); });
    } else {
      rise.forEach(function (el) { el.classList.add('is-in'); });
    }

    /* ---- sticky header shrink ---- */
    var hdr = document.querySelector('[data-header]');
    if (hdr) {
      var onScroll = function () {
        hdr.classList.toggle('is-stuck', window.scrollY > 40);
      };
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    /* ---- mobile nav ---- */
    var burger = document.querySelector('[data-burger]');
    var drawer = document.querySelector('[data-drawer]');
    if (burger && drawer) {
      burger.addEventListener('click', function () {
        var open = drawer.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        document.body.style.overflow = open ? 'hidden' : '';
      });
      drawer.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          drawer.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        });
      });
    }

    /* ---- accordions ---- */
    document.querySelectorAll('[data-acc] > button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.parentElement;
        var open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    /* ---- quantity stepper ----
       Also syncs the hidden quantity input so the Shopify add-to-cart form
       actually receives the number, not just the visible label. */
    document.querySelectorAll('[data-qty]').forEach(function (box) {
      var out = box.querySelector('[data-qty-val]');
      var form = box.closest('form');
      var input = form ? form.querySelector('[data-qty-input]') : null;
      box.querySelectorAll('[data-qty-step]').forEach(function (b) {
        b.addEventListener('click', function () {
          var n = Math.max(1, parseInt(out.textContent, 10) + parseInt(b.getAttribute('data-qty-step'), 10));
          out.textContent = n;
          if (input) input.value = n;
        });
      });
    });

    /* ---- product page: swap main image ---- */
    document.querySelectorAll('[data-gallery]').forEach(function (g) {
      var main = g.querySelector('[data-gallery-main] img');
      g.querySelectorAll('[data-gallery-thumb]').forEach(function (t) {
        t.addEventListener('click', function () {
          if (!main) return;
          main.src = t.querySelector('img').src;
          main.style.objectPosition = t.getAttribute('data-pos') || '50% 46%';
          g.querySelectorAll('[data-gallery-thumb]').forEach(function (x) { x.classList.remove('is-sel'); });
          t.classList.add('is-sel');
        });
      });
    });

    /* ---- mockup only: intercept cart / checkout ---- */
    document.querySelectorAll('[data-noop]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var was = el.getAttribute('data-label') || el.textContent.trim();
        el.setAttribute('data-label', was);
        el.textContent = 'Added to cart';
        setTimeout(function () { el.textContent = was; }, 1600);
      });
    });
  });
})();
