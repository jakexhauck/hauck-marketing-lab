(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var picker = document.querySelector('[data-picker]');
    var select = document.querySelector('[data-picker-select]');
    var dataEl = document.querySelector('[data-variant-data]');
    if (!picker || !select || !dataEl) return;

    var variants;
    try {
      variants = JSON.parse(dataEl.textContent);
    } catch (err) {
      // Malformed payload: leave the plain select in charge rather than guess.
      return;
    }
    if (!variants || !variants.length) return;

    var groups = Array.prototype.slice.call(picker.querySelectorAll('[data-opt-index]'));
    var form = select.closest('form');
    var priceEl = document.querySelector('[data-price]');
    var addBtn = form ? form.querySelector('[data-add]') : null;
    var addLabel = addBtn ? addBtn.querySelector('[data-add-label]') : null;
    var addPrice = addBtn ? addBtn.querySelector('[data-add-price]') : null;
    var mainImg = document.querySelector('[data-gallery-main] img');

    function byId(id) {
      for (var i = 0; i < variants.length; i++) {
        if (String(variants[i].id) === String(id)) return variants[i];
      }
      return null;
    }

    // The chips that are currently pressed, in option order.
    function selection() {
      return groups.map(function (g) {
        var on = g.querySelector('[data-chip][aria-pressed="true"]');
        return on ? on.getAttribute('data-value') : null;
      });
    }

    // First variant matching every non-null position of the wanted selection.
    function match(wanted) {
      for (var i = 0; i < variants.length; i++) {
        var ok = true;
        for (var j = 0; j < wanted.length; j++) {
          if (wanted[j] !== null && variants[i].options[j] !== wanted[j]) { ok = false; break; }
        }
        if (ok) return variants[i];
      }
      return null;
    }

    function exists(optIndex, value) {
      var wanted = selection();
      wanted[optIndex] = value;
      return !!match(wanted);
    }

    function available(optIndex, value) {
      var wanted = selection();
      wanted[optIndex] = value;
      var v = match(wanted);
      return !!(v && v.available);
    }

    function paint(variant) {
      groups.forEach(function (g) {
        var idx = parseInt(g.getAttribute('data-opt-index'), 10);
        g.querySelectorAll('[data-chip]').forEach(function (chip) {
          var value = chip.getAttribute('data-value');
          var pressed = variant.options[idx] === value;
          chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
          // Only disable combinations that do not exist at all. Sold-out ones
          // stay reachable so the customer can see them.
          var real = pressed || exists(idx, value);
          chip.disabled = !real;
          chip.classList.toggle('is-unavailable', real && !pressed && !available(idx, value));
        });
      });

      if (priceEl && variant.price_formatted) priceEl.textContent = variant.price_formatted;

      if (addBtn) {
        addBtn.disabled = !variant.available;
        if (addLabel) addLabel.textContent = variant.available ? 'Add to Cart' : 'Sold out';
        if (addPrice) addPrice.textContent = variant.available && variant.price_formatted ? '\u00b7 ' + variant.price_formatted : '';
      }

      if (mainImg && variant.image) mainImg.src = variant.image;

      if (window.history && window.history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());
      }
    }

    function choose(variant) {
      if (!variant) return;
      select.value = variant.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      paint(variant);
    }

    picker.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (!chip || chip.disabled) return;

      var idx = parseInt(chip.getAttribute('data-opt'), 10);
      var wanted = selection();
      wanted[idx] = chip.getAttribute('data-value');

      // Exact hit first. Failing that, hold the clicked option and let the
      // others fall where they may, so a click always does something.
      var next = match(wanted);
      if (!next) {
        var loose = wanted.map(function (v, i) { return i === idx ? v : null; });
        next = match(loose);
      }
      choose(next);
    });

    // Someone using the fallback select directly still gets a synced display.
    select.addEventListener('change', function () {
      var v = byId(select.value);
      if (v) paint(v);
    });

    var initial = byId(select.value);
    if (initial) paint(initial);
  });
})();
