/* ===========================================================================
   PRE-CALL BREAKOUT DECKS - THE SHARED ENGINE

   One engine, eight decks. Each precall-vN-*.html is a thin file: a <title>,
   a window.DECK array, and a <script src="precall-deck.js"> at the end. All
   the CSS and all the rendering lives here, so a fix lands once.

   THE FORMAT (same as precall-step1.html, which Jake signed off):
     Near-black ground. Everything centred on a fixed 1920x1080 canvas.
     Small accent mono eyebrow, uppercase, wide tracking.
     A two-line headline: line one WHITE, line two ACCENT.
     An optional grey sub.
     Then ONE body block. Then an optional quiet punch line. Then a CTA.

   COLOUR IS THE ARGUMENT. Accent green is us and the fix. Red is the pain
   and the competitor. Slide 2 of every deck is "The real question", and it
   is always red, so by the third video the viewer reads the colour before
   they read the words.

   BODY KINDS
     title     nothing under the headline
     problem   red card: pill label, then bullets            (always slide 2)
     step      accent card: pill label, then bullets
     rows      row stack, icon left, pill right   tone:'neg' (X, red) | 'pos'
     system    row stack, emoji tile + title + one grey line
     timeline  row stack, day chip + title + line + status pill
     numbers   row stack, numbered chip + title + line
     cols      two cards side by side       tone:'you'|'we'|'bad'|'good'

   ANY slide also takes:  sub, punch, chips[], cta

   NO OVERFLOW BY HAND. Every slide measures itself on load and scales its
   own content down if it would run past the canvas. That kills the whole
   class of "the fourth bullet is off the bottom" bugs, and it means these
   eight decks did not need thirty-two hand-tuned font sizes. If a slide
   ever scales below 0.7 the console says so, which is the signal that the
   copy is genuinely too long rather than merely tight.

   DRIVE IT: Space or Right advances. Left goes back. Home / End jump.
   G shows the progress hairline (off by default, so the recorded frame is
   clean). F is fullscreen. Record at 1920x1080.
   =========================================================================== */
(function () {
  var D = window.DECK || [];

  /* --- styles ------------------------------------------------------------- */
  var CSS = `
:root{
  --acc:#4DBB83;
  --acc-soft:rgba(77,187,131,.16);
  --acc-line:rgba(77,187,131,.34);

  --red:#E2603A;
  --red-soft:rgba(226,96,58,.13);
  --red-line:rgba(226,96,58,.32);

  --bg:#0E1113;
  --card:#14181A;
  --card-2:#171C1E;
  --line:rgba(255,255,255,.07);
  --line-2:rgba(255,255,255,.11);

  --text:#FFFFFF;
  --body:#D6DCE0;
  --muted:#98A2A8;
  --faint:#6B7780;

  --ease:cubic-bezier(.22,.61,.36,1);
}

*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#000;overflow:hidden}
body{
  font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  color:var(--text);
  display:flex;align-items:center;justify-content:center;
  -webkit-font-smoothing:antialiased;
}

#stage{
  position:relative;width:1920px;height:1080px;flex:none;
  transform-origin:center center;
  background:
    radial-gradient(1100px 620px at 50% 22%, rgba(77,187,131,.05), transparent 70%),
    var(--bg);
  overflow:hidden;
}
/* Slide 2 is the pain in every deck, so its glow turns over to red. */
#stage.warm{
  background:
    radial-gradient(1100px 620px at 50% 22%, rgba(226,96,58,.055), transparent 70%),
    var(--bg);
}

.slide{
  position:absolute;inset:0;
  display:none;align-items:center;justify-content:center;
  padding:72px 120px;
}
.slide.on,.slide.measuring{display:flex}
.slide.measuring{visibility:hidden}

.inner{
  display:flex;flex-direction:column;align-items:center;
  text-align:center;transform-origin:center center;
}

.eyebrow{
  font-size:20px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;
  color:var(--acc);
}
.slide.pain .eyebrow{color:var(--red)}

.head{margin-top:26px;font-family:'Poppins',system-ui,sans-serif;font-weight:700;
      font-size:82px;line-height:1.12;letter-spacing:-.035em;max-width:24ch}
.head .l2{color:var(--acc);display:block}
.slide.pain .head .l2{color:var(--red)}

.sub{margin-top:24px;font-size:27px;line-height:1.5;color:var(--muted);
     white-space:pre-line;max-width:54ch}

/* --- the card body (problem / step) ------------------------------------- */
.card{
  margin-top:46px;width:1180px;
  background:var(--card);border:1px solid var(--line-2);
  border-radius:20px;padding:42px 52px 46px;text-align:left;
}
.card.pain{background:linear-gradient(180deg,var(--red-soft),transparent 55%),var(--card);
           border-color:var(--red-line)}
.card .label{
  display:inline-block;
  background:var(--acc-soft);border:1px solid var(--acc-line);border-radius:999px;
  padding:9px 22px;margin-bottom:28px;
  font-size:18px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  color:var(--acc);
}
.card.pain .label{background:var(--red-soft);border-color:var(--red-line);color:var(--red)}

.blist{list-style:none;display:flex;flex-direction:column;gap:24px}
.blist li{position:relative;padding-left:34px;font-size:25px;line-height:1.5;color:var(--body)}
.blist li::before{content:'';position:absolute;left:2px;top:.55em;
                  width:10px;height:10px;border-radius:50%;background:var(--acc)}
.card.pain .blist li::before{background:var(--red)}
.blist b{color:var(--acc);font-weight:600}
.card.pain .blist b{color:var(--red)}

/* --- rows ---------------------------------------------------------------- */
.rows{margin-top:48px;width:1180px;display:flex;flex-direction:column;gap:15px}
.rrow{
  display:flex;align-items:center;gap:22px;
  background:var(--card);border:1px solid var(--line);
  border-left:3px solid var(--acc);
  border-radius:12px;padding:22px 26px;text-align:left;
}
.rrow .ic{flex:none;width:26px;height:26px;color:var(--acc)}
.rows.neg .rrow{border-left-color:var(--red)}
.rows.neg .rrow .ic{color:var(--red)}
.rrow .t{flex:1;min-width:0;font-size:26px;font-weight:500}
.rrow .pill{
  margin-left:auto;flex:none;
  background:var(--acc-soft);border:1px solid var(--acc-line);border-radius:999px;
  padding:8px 18px;font-size:17px;font-weight:600;color:var(--acc);white-space:nowrap;
}

/* --- system rows --------------------------------------------------------- */
.srows{margin-top:40px;width:1220px;display:flex;flex-direction:column;gap:10px}
.srow{display:flex;align-items:center;gap:16px;text-align:left}
.srow .tile{
  flex:none;width:54px;height:54px;border-radius:12px;
  background:var(--card-2);border:1px solid var(--line);
  display:grid;place-items:center;font-size:25px;line-height:1;
}
.srow .bd{flex:1;background:var(--card);border:1px solid var(--line);
          border-radius:12px;padding:14px 22px}
.srow .t{font-size:22px;font-weight:600;letter-spacing:-.01em}
.srow .d{margin-top:3px;font-size:19px;color:var(--muted);line-height:1.4}
.srow .d b{color:var(--acc);font-weight:500}

/* --- timeline ------------------------------------------------------------ */
.trows{margin-top:44px;width:1300px;display:flex;flex-direction:column;gap:14px}
.trow{display:flex;align-items:center;gap:18px;text-align:left}
.trow .day{
  flex:none;width:112px;padding:14px 0;border-radius:12px;text-align:center;
  background:var(--card-2);border:1px solid var(--line-2);
}
.trow .day .k{font-size:13px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;
              color:var(--faint)}
.trow .day .v{margin-top:2px;font-size:26px;font-weight:700;color:var(--acc);
              font-family:'Poppins',sans-serif;letter-spacing:-.02em}
.trow .bd{flex:1;min-width:0;display:flex;align-items:center;gap:24px;
          background:var(--card);border:1px solid var(--line);
          border-radius:12px;padding:18px 24px}
/* min-width:0 is load-bearing. Without it the text block refuses to shrink
   below its content and runs straight under the status pill. */
.trow .tx{flex:1;min-width:0}
.trow .t{font-size:24px;font-weight:600;letter-spacing:-.01em}
.trow .d{margin-top:3px;font-size:19px;color:var(--muted);line-height:1.4}
.trow .pill{
  margin-left:auto;flex:none;
  background:var(--card-2);border:1px solid var(--line-2);border-radius:999px;
  padding:8px 18px;font-size:17px;font-weight:600;color:var(--muted);white-space:nowrap;
}
/* The last row is the one that matters, so it is the only lit one. */
.trow.live .day{background:var(--acc-soft);border-color:var(--acc-line)}
.trow.live .bd{border-color:var(--acc-line)}
.trow.live .pill{background:var(--acc-soft);border-color:var(--acc-line);color:var(--acc)}

/* --- numbers ------------------------------------------------------------- */
.nrows{margin-top:44px;width:1220px;display:flex;flex-direction:column;gap:14px}
.nrow{display:flex;align-items:center;gap:18px;text-align:left;
      background:var(--card);border:1px solid var(--line);
      border-left:3px solid var(--acc);border-radius:12px;padding:20px 26px}
.nrow .n{
  flex:none;width:52px;height:52px;border-radius:12px;
  background:var(--acc-soft);border:1px solid var(--acc-line);
  display:grid;place-items:center;
  font-family:'Poppins',sans-serif;font-size:26px;font-weight:700;color:var(--acc);
}
.nrow .tx{flex:1;min-width:0}
.nrow .t{font-size:24px;font-weight:600;letter-spacing:-.01em}
.nrow .d{margin-top:3px;font-size:20px;color:var(--muted);line-height:1.4}

/* --- two columns ---------------------------------------------------------- */
/* Stretched to a common height, so the empty space under the short list is
   part of the argument rather than a layout accident. */
.cols{margin-top:40px;width:1400px;display:grid;grid-template-columns:1fr 1fr;
      gap:26px;align-items:stretch}
.col{background:var(--card);border:1px solid var(--line-2);border-radius:14px;
     overflow:hidden;text-align:left;display:flex;flex-direction:column}
.col .hd{display:flex;align-items:center;gap:16px;padding:22px 30px;
         border-bottom:1px solid var(--line-2);background:var(--card-2)}
.col.you .hd,.col.good .hd{background:var(--acc-soft)}
.col.bad .hd{background:var(--red-soft)}
.col .hd .em{font-size:30px;line-height:1}
.col .hd h3{font-size:27px;font-weight:700;letter-spacing:-.02em;color:var(--text)}
.col.you .hd h3,.col.good .hd h3{color:var(--acc)}
.col.bad .hd h3{color:var(--red)}
.col .hd .st{margin-top:2px;font-size:19px;color:var(--faint);font-weight:400}

.col ul{list-style:none;padding:26px 30px 32px;display:flex;flex-direction:column;gap:18px}
.col li{position:relative;padding-left:40px;font-size:23px;line-height:1.38}
.col li::before{position:absolute;left:2px;top:0;font-size:21px;line-height:1.38}

.col.you li{color:var(--text);font-weight:600}
.col.you li::before{content:'\\2713';color:var(--text)}
.col.good li{color:var(--body)}
.col.good li::before{content:'\\2713';color:var(--acc)}
.col.we li{color:var(--muted)}
.col.we li::before{content:'\\2192';color:var(--acc)}
.col.bad li{color:var(--muted)}
.col.bad li::before{content:'\\2715';color:var(--red)}
/* diag: a red header over green arrows. The header names the failure mode,
   the arrows are what we do about it. Crosses would read as five more
   problems, which is the opposite of the point. */
.col.diag .hd{background:var(--red-soft)}
.col.diag .hd h3{color:var(--red)}
.col.diag li{color:var(--body)}
.col.diag li::before{content:'\\2192';color:var(--acc)}

/* --- punch, chips, cta ---------------------------------------------------- */
/* The quiet line the whole slide has been building to. Deliberately not a
   card: it should read as the presenter's own sentence, not more content. */
.punch{margin-top:34px;max-width:82ch;font-size:25px;line-height:1.5;color:var(--muted)}
.punch b{color:var(--text);font-weight:600}

.chips{margin-top:32px;display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
.chip{background:var(--card);border:1px solid var(--line-2);border-radius:999px;
      padding:11px 22px;font-size:19px;color:var(--muted)}
.chip::before{content:'\\2713  ';color:var(--acc)}

.cta{margin-top:42px;display:inline-block;background:var(--acc);color:#07130E;
     border-radius:999px;padding:22px 52px;
     font-size:25px;font-weight:600;letter-spacing:-.01em}

/* Reveal: everything on a slide arrives together, in one beat. */
.rv{opacity:0;transform:translateY(14px);
    transition:opacity 320ms var(--ease), transform 320ms var(--ease)}
.rv.in{opacity:1;transform:none}

#bar{position:absolute;left:0;bottom:0;height:3px;background:var(--acc);width:0;
     opacity:0;transition:width 380ms var(--ease), opacity 200ms}
body.guides #bar{opacity:.85}

@media (prefers-reduced-motion:reduce){ .rv{transition-duration:1ms} }
`;

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* --- markup -------------------------------------------------------------- */
  var stage = document.createElement('div');
  stage.id = 'stage';
  stage.innerHTML = '<div id="slides"></div><div id="bar"></div>';
  document.body.appendChild(stage);

  var XICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var VICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  function esc(v) { return v == null ? '' : String(v); }

  function bullets(list) {
    return '<ul class="blist">' + list.map(function (b) {
      return '<li class="rv">' + esc(b) + '</li>';
    }).join('') + '</ul>';
  }

  function bodyHTML(s) {
    var k = s.kind;

    if (k === 'problem' || k === 'step') {
      var pain = (k === 'problem');
      return '<div class="card' + (pain ? ' pain' : '') + '">' +
        (s.pill ? '<span class="label">' + esc(s.pill) + '</span>' : '') +
        bullets(s.bullets || []) + '</div>';
    }

    if (k === 'rows') {
      var neg = (s.tone !== 'pos');
      return '<div class="rows' + (neg ? ' neg' : '') + '">' + (s.rows || []).map(function (r) {
        return '<div class="rrow rv"><span class="ic">' + (neg ? XICON : VICON) + '</span>' +
          '<span class="t">' + esc(r.t) + '</span>' +
          (r.pill ? '<span class="pill">' + esc(r.pill) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }

    if (k === 'system') {
      return '<div class="srows">' + (s.rows || []).map(function (r) {
        return '<div class="srow rv"><span class="tile">' + esc(r.icon) + '</span>' +
          '<div class="bd"><div class="t">' + esc(r.t) + '</div>' +
          '<div class="d">' + esc(r.d) + '</div></div></div>';
      }).join('') + '</div>';
    }

    if (k === 'timeline') {
      return '<div class="trows">' + (s.rows || []).map(function (r) {
        return '<div class="trow rv' + (r.live ? ' live' : '') + '">' +
          '<div class="day"><div class="k">Day</div><div class="v">' + esc(r.day) + '</div></div>' +
          '<div class="bd"><div class="tx"><div class="t">' + esc(r.t) + '</div>' +
          '<div class="d">' + esc(r.d) + '</div></div>' +
          (r.pill ? '<span class="pill">' + esc(r.pill) + '</span>' : '') +
          '</div></div>';
      }).join('') + '</div>';
    }

    if (k === 'numbers') {
      return '<div class="nrows">' + (s.rows || []).map(function (r, n) {
        return '<div class="nrow rv"><span class="n">' + (n + 1) + '</span>' +
          '<div class="tx"><div class="t">' + esc(r.t) + '</div>' +
          '<div class="d">' + esc(r.d) + '</div></div></div>';
      }).join('') + '</div>';
    }

    if (k === 'cols') {
      return '<div class="cols">' + (s.cols || []).map(function (c) {
        return '<div class="col ' + esc(c.tone) + ' rv">' +
          '<div class="hd"><span class="em">' + esc(c.icon) + '</span>' +
          '<div><h3>' + esc(c.t) + '</h3>' +
          (c.sub ? '<div class="st">' + esc(c.sub) + '</div>' : '') + '</div></div>' +
          '<ul>' + (c.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
          '</ul></div>';
      }).join('') + '</div>';
    }

    return '';
  }

  var host = document.getElementById('slides');

  D.forEach(function (s, i) {
    var sec = document.createElement('section');
    sec.className = 'slide' + (s.kind === 'problem' ? ' pain' : '');
    sec.id = 'sl-' + i;

    var html =
      '<span class="eyebrow">' + esc(s.eyebrow) + '</span>' +
      '<h1 class="head">' + esc(s.h1) + '<span class="l2">' + esc(s.h2) + '</span></h1>' +
      (s.sub ? '<p class="sub">' + esc(s.sub) + '</p>' : '') +
      bodyHTML(s) +
      (s.punch ? '<p class="punch rv">' + esc(s.punch) + '</p>' : '') +
      (s.chips ? '<div class="chips rv">' + s.chips.map(function (c) {
        return '<span class="chip">' + esc(c) + '</span>';
      }).join('') + '</div>' : '') +
      (s.cta ? '<div class="cta rv">' + esc(s.cta) + '</div>' : '');

    sec.innerHTML = '<div class="inner">' + html + '</div>';
    host.appendChild(sec);
  });

  /* --- self-fitting -------------------------------------------------------- */
  /* Measured once, after fonts land. Anything that would run past the canvas
     scales itself down instead of spilling. */
  function fitAll() {
    D.forEach(function (_, i) {
      var sec = document.getElementById('sl-' + i);
      var inner = sec.querySelector('.inner');
      var wasOn = sec.classList.contains('on');

      inner.style.transform = 'none';
      if (!wasOn) sec.classList.add('measuring');

      var h = inner.offsetHeight, w = inner.offsetWidth;
      var maxH = 1080 - 144, maxW = 1920 - 240;
      var s = Math.min(1, maxH / h, maxW / w);

      if (s < 1) inner.style.transform = 'scale(' + s.toFixed(4) + ')';
      if (s < 0.7) console.warn('Slide ' + (i + 1) + ' scaled to ' + s.toFixed(2) + ' - copy is too long for the canvas.');

      if (!wasOn) sec.classList.remove('measuring');
    });
  }

  /* --- drive it ------------------------------------------------------------ */
  var revealEls = D.map(function (_, i) {
    return Array.prototype.slice.call(document.querySelectorAll('#sl-' + i + ' .rv'));
  });

  var i = 0;

  function render() {
    D.forEach(function (_, k) {
      var on = (k === i);
      document.getElementById('sl-' + k).classList.toggle('on', on);
      revealEls[k].forEach(function (el) { el.classList.toggle('in', on); });
    });
    stage.classList.toggle('warm', D[i].kind === 'problem');
    document.getElementById('bar').style.width = (D.length > 1 ? i / (D.length - 1) * 100 : 100) + '%';
  }

  function go(n) { i = Math.max(0, Math.min(D.length - 1, n)); render(); }

  document.addEventListener('keydown', function (e) {
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { go(0); }
    else if (e.key === 'End') { go(D.length - 1); }
    else if (e.key === 'g' || e.key === 'G') { document.body.classList.toggle('guides'); }
    else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
    }
  });
  document.addEventListener('click', function () { go(i + 1); });

  function fitStage() {
    stage.style.transform = 'scale(' + Math.min(innerWidth / 1920, innerHeight / 1080) + ')';
  }
  addEventListener('resize', fitStage);

  fitStage();
  render();
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
})();
