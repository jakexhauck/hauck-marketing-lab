/* Root & Ritual - shared icon set.
   Usage: <i data-icon="leaf"></i>
   Etched / engraved line style to match the brand mark. */
(function () {
  var S = {
    leaf: '<path d="M20 4C10 6 4 12 4 20c0 6 4 12 12 12 8 0 16-8 16-20 0-4-1-6-1-6-3 1-7 1-11 -2z"/><path d="M12 30C16 22 22 14 30 8"/>',
    mountain: '<path d="M2 28l10-16 6 9 4-6 12 13z"/><path d="M8 22c2-1 4-1 6 0"/><path d="M24 20c2-1 4-1 6 1"/>',
    mortar: '<path d="M7 15h22c0 8-4 13-11 13S7 23 7 15z"/><path d="M4 15h28"/><path d="M22 13L31 4"/><path d="M29 2l3 3"/>',
    heart: '<path d="M18 30S5 22 5 13a7 7 0 0113-3 7 7 0 0113 3c0 9-13 17-13 17z"/>',
    sun: '<circle cx="18" cy="18" r="7"/><path d="M18 3v4M18 29v4M3 18h4M29 18h4M7.5 7.5l3 3M25.5 25.5l3 3M28.5 7.5l-3 3M10.5 25.5l-3 3"/>',
    lavender: '<path d="M18 34V14"/><path d="M18 14c-3-2-4-5-3-8 3 0 5 2 6 5M18 14c3-2 4-5 3-8-3 0-5 2-6 5"/><path d="M18 20c-3-2-5-4-5-7M18 20c3-2 5-4 5-7"/><path d="M18 27c-3-1-5-3-6-6M18 27c3-1 5-3 6-6"/>',
    search: '<circle cx="16" cy="16" r="10"/><path d="M23 23l8 8"/>',
    user: '<circle cx="18" cy="12" r="6"/><path d="M6 32c0-7 5-12 12-12s12 5 12 12"/>',
    bag: '<path d="M7 11h22l2 21H5z"/><path d="M13 15V9a5 5 0 0110 0v6"/>',
    arrow: '<path d="M5 18h26"/><path d="M23 10l8 8-8 8"/>',
    star: '<path d="M18 3l4.6 9.6 10.4 1.4-7.6 7.2 1.9 10.4L18 26.7 8.7 31.6l1.9-10.4L3 14l10.4-1.4z"/>',
    quote: '<path d="M14 8c-6 2-10 7-10 14 0 4 3 6 6 6s6-2 6-6-3-6-6-6c0-3 2-5 5-6z"/><path d="M32 8c-6 2-10 7-10 14 0 4 3 6 6 6s6-2 6-6-3-6-6-6c0-3 2-5 5-6z"/>',
    instagram: '<rect x="4" y="4" width="28" height="28" rx="8"/><circle cx="18" cy="18" r="7"/><circle cx="26" cy="10" r="1.6" fill="currentColor" stroke="none"/>',
    facebook: '<path d="M22 6h-4a6 6 0 00-6 6v4H8v6h4v14h6V22h5l1-6h-6v-3a2 2 0 012-2h4z"/>',
    youtube: '<rect x="2" y="8" width="32" height="20" rx="6"/><path d="M15 14l9 4-9 4z"/>',
    tiktok: '<path d="M22 4v18a7 7 0 11-6-7"/><path d="M22 4c1 4 4 7 8 7"/>',
    truck: '<path d="M2 8h20v16H2z"/><path d="M22 14h6l5 5v5h-11z"/><circle cx="9" cy="28" r="3"/><circle cx="26" cy="28" r="3"/>',
    gift: '<rect x="4" y="13" width="28" height="19"/><path d="M2 13h32v6H2z"/><path d="M18 13v19"/><path d="M18 13c-6 0-8-2-8-4a4 4 0 018-1 4 4 0 018 1c0 2-2 4-8 4z"/>',
    cup: '<path d="M6 12h20v10a10 10 0 01-20 0z"/><path d="M26 15h3a4 4 0 010 8h-3"/><path d="M4 34h24"/><path d="M12 6c0 2-2 2-2 4M18 5c0 2-2 2-2 4"/>',
    plus: '<path d="M18 6v24M6 18h24"/>',
    minus: '<path d="M6 18h24"/>'
  };
  function render(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (el) {
      var k = el.getAttribute('data-icon');
      if (!S[k] || el.dataset.done) return;
      var w = el.getAttribute('data-size') || '1em';
      el.innerHTML =
        '<svg viewBox="0 0 36 36" width="' + w + '" height="' + w + '" fill="none" ' +
        'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' + S[k] + '</svg>';
      el.dataset.done = '1';
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { render(); });
  } else { render(); }
  window.RRIcons = render;
})();
