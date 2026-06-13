import { detectTier, lowerTier, settingsFor } from './quality.js';
import { createStage } from './stage.js';
import { initSections } from './sections.js';
import { create as monogram } from './pieces/monogram.js';
import { create as engine } from './pieces/engine.js';
import { create as crm } from './pieces/crm.js';
import { create as gears } from './pieces/gears.js';
import { create as datacore } from './pieces/datacore.js';
import { create as stars } from './pieces/stars.js';
import { create as lens } from './pieces/lens.js';

const builders = { monogram, engine, crm, gears, datacore, stars, lens };

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function noWebGL(){
  document.body.classList.add('no3d');
}

async function boot(){
  let tier = detectTier();
  if (!tier){
    noWebGL();
    return;
  }
  let settings = settingsFor(tier);
  if (!settings.grain) document.body.classList.add('no-grain');

  /* Canvas-texture screens want the real fonts. Race with a timeout so a
     stalled font CDN never blocks the scene. */
  try{
    await Promise.race([
      Promise.all([
        document.fonts.load('800 46px Syne'),
        document.fonts.load('500 16px "JetBrains Mono"'),
        document.fonts.load('500 17px "DM Sans"')
      ]),
      new Promise(r => setTimeout(r, 1500))
    ]);
  }catch(e){ /* fallback fonts are acceptable */ }

  let stage;
  try{
    stage = createStage({ settings, reduceMotion });
  }catch(e){
    console.warn('WebGL init failed, serving the editorial page.', e);
    noWebGL();
    return;
  }

  function ensure(name){
    if (!name || stage.has(name) || !builders[name]) return;
    stage.register(name, builders[name](stage.ctx));
  }

  /* Hero piece builds immediately; the rest build lazily on approach. */
  ensure('monogram');
  stage.reveal('monogram');

  initSections({
    onApproach: ensure,
    onActive: (piece, side) => {
      ensure(piece);
      stage.show(piece);
      stage.setSide(side || 'center');
    },
    onProgress: p => stage.setProgress(p)
  });

  /* Damped mouse parallax, desktop only, never under reduced motion. */
  if (!reduceMotion && window.matchMedia('(pointer: fine)').matches){
    window.addEventListener('pointermove', e => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      stage.setParallax(nx, ny);
    }, { passive: true });
  }

  /* Measure the first 10 frames; drop one tier if the average is slow. */
  const avg = await stage.runProbe(10);
  if (avg > 24){
    tier = lowerTier(tier);
    settings = settingsFor(tier);
    stage.degrade(settings);
  }
}

boot();
