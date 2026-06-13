import * as THREE from 'three';

/* Canvas-drawn textures. Nothing is fetched from the network. */

export function makeCanvas(w, h){
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function asTexture(canvas, { srgb = true, anisotropy = 8 } = {}){
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

/* Deterministic pseudo-random, so builds look identical every load. */
export function rng(seed){
  let s = seed;
  return () => (s = (s * 48271) % 2147483647) / 2147483647;
}

/* Fine linear brushing streaks: subtle roughness variation reads as brushed metal. */
export function brushedLinear(seed = 7){
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, 256, 256);
  const rnd = rng(seed);
  for (let x = 0; x < 256; x++){
    const v = 130 + Math.floor(rnd() * 70);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.globalAlpha = 0.35;
    g.fillRect(x, 0, 1, 256);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/* Concentric machining rings, for lathe-turned faces like the pedestal top. */
export function brushedRadial(seed = 11){
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 512, 512);
  const rnd = rng(seed);
  for (let r = 2; r < 380; r += 1.6){
    const v = 110 + Math.floor(rnd() * 70);
    g.strokeStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/* Grainy noise roughness, used by the polished floor. */
export function noiseRoughness(seed = 13, repeatX = 14, repeatY = 18){
  const c = makeCanvas(256, 256);
  const g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  const rnd = rng(seed);
  for (let p = 0; p < img.data.length; p += 4){
    const v = 90 + Math.floor(rnd() * 70);
    img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
    img.data[p + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  return t;
}

/* Vertical knurling stripes for the lens focus ring. */
export function knurlStripes(){
  const c = makeCanvas(512, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#6a6a6a';
  g.fillRect(0, 0, 512, 64);
  for (let x = 0; x < 512; x += 8){
    g.fillStyle = '#c8c8c8';
    g.fillRect(x, 0, 3, 64);
    g.fillStyle = '#3a3a3a';
    g.fillRect(x + 3, 0, 2, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}

/* ---------- CRM screens ---------- */

const INK = '#0c0e12';
const PANEL = '#14171d';
const PANEL2 = '#191d24';
const BONE = '#ECEAE4';
const STEEL = '#9BA1A8';
const COPPER = '#C98B5E';
const HAIR = 'rgba(155,161,168,0.16)';

function roundRect(g, x, y, w, h, r){
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* Dark CRM dashboard for the laptop: stat tiles, line chart, pipeline columns. */
export function crmDesktopScreen(){
  const c = makeCanvas(1536, 960);
  const g = c.getContext('2d');

  g.fillStyle = INK;
  g.fillRect(0, 0, 1536, 960);

  /* top bar */
  g.fillStyle = PANEL;
  g.fillRect(0, 0, 1536, 64);
  g.fillStyle = COPPER;
  g.font = '800 22px Syne, sans-serif';
  g.fillText('H', 36, 42);
  g.fillStyle = BONE;
  g.font = '500 16px "JetBrains Mono", monospace';
  g.fillText('HAUCK CRM', 62, 41);
  g.fillStyle = STEEL;
  g.font = '400 14px "JetBrains Mono", monospace';
  g.textAlign = 'right';
  g.fillText('PIPELINE  /  TODAY', 1500, 41);
  g.textAlign = 'left';
  g.fillStyle = HAIR;
  g.fillRect(0, 64, 1536, 1);

  /* stat tiles */
  const stats = [
    ['NEW LEADS / 7 DAYS', '23'],
    ['CALLS BOOKED', '9'],
    ['JOBS WON', '5']
  ];
  for (let i = 0; i < 3; i++){
    const x = 36 + i * 300;
    g.fillStyle = PANEL;
    roundRect(g, x, 96, 276, 132, 10);
    g.fill();
    g.fillStyle = STEEL;
    g.font = '400 13px "JetBrains Mono", monospace';
    g.fillText(stats[i][0], x + 22, 134);
    g.fillStyle = i === 0 ? COPPER : BONE;
    g.font = '800 46px Syne, sans-serif';
    g.fillText(stats[i][1], x + 22, 198);
  }

  /* line chart */
  const cx = 956, cy = 96, cw = 544, ch = 132;
  g.fillStyle = PANEL;
  roundRect(g, cx, cy, cw, ch, 10);
  g.fill();
  g.fillStyle = STEEL;
  g.font = '400 13px "JetBrains Mono", monospace';
  g.fillText('LEADS / 30 DAYS', cx + 22, cy + 38);
  g.strokeStyle = HAIR;
  g.lineWidth = 1;
  for (let i = 1; i <= 3; i++){
    g.beginPath();
    g.moveTo(cx + 20, cy + 38 + i * 22);
    g.lineTo(cx + cw - 20, cy + 38 + i * 22);
    g.stroke();
  }
  const pts = [78, 70, 74, 60, 66, 52, 56, 44, 50, 38, 40, 30];
  g.strokeStyle = COPPER;
  g.lineWidth = 3;
  g.beginPath();
  pts.forEach((p, i) => {
    const px = cx + 28 + i * ((cw - 56) / (pts.length - 1));
    const py = cy + 36 + p;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  });
  g.stroke();

  /* pipeline columns */
  const cols = [
    ['NEW', ['M. Alvarez : Roof repair', 'T. Brooks : Gutter line', 'New lead : Web form']],
    ['CONTACTED', ['S. Patel : Full tear-off', 'D. Keller : Inspection']],
    ['QUOTED', ['R. Moss : $12,400', 'J. Whitman : $8,150']],
    ['WON', ['L. Ortiz : Scheduled', 'A. Chen : Deposit paid']]
  ];
  const top = 268;
  for (let i = 0; i < 4; i++){
    const x = 36 + i * 372;
    g.fillStyle = STEEL;
    g.font = '500 14px "JetBrains Mono", monospace';
    g.fillText(cols[i][0], x + 4, top + 22);
    g.fillStyle = COPPER;
    g.fillText(String(cols[i][1].length), x + 4 + g.measureText(cols[i][0]).width + 16, top + 22);
    g.fillStyle = HAIR;
    g.fillRect(x, top + 38, 340, 1);
    cols[i][1].forEach((card, j) => {
      const y = top + 58 + j * 128;
      g.fillStyle = j === 0 && i === 0 ? PANEL2 : PANEL;
      roundRect(g, x, y, 340, 108, 10);
      g.fill();
      if (i === 0 && j === 0){
        g.fillStyle = COPPER;
        g.fillRect(x, y + 10, 4, 88);
      }
      g.fillStyle = BONE;
      g.font = '500 17px "DM Sans", sans-serif';
      g.fillText(card, x + 22, y + 42);
      g.fillStyle = STEEL;
      g.font = '400 13px "JetBrains Mono", monospace';
      g.fillText(i === 3 ? 'CLOSED THIS WEEK' : 'FOLLOW-UP SET', x + 22, y + 76);
    });
  }

  return c;
}

/* Phone screen: incoming lead notifications. */
export function crmPhoneScreen(){
  const c = makeCanvas(480, 1000);
  const g = c.getContext('2d');

  g.fillStyle = INK;
  g.fillRect(0, 0, 480, 1000);

  /* status bar */
  g.fillStyle = STEEL;
  g.font = '500 22px "JetBrains Mono", monospace';
  g.fillText('9:41', 36, 52);
  g.textAlign = 'right';
  g.fillText('LTE', 444, 52);
  g.textAlign = 'left';

  /* header */
  g.fillStyle = BONE;
  g.font = '800 40px Syne, sans-serif';
  g.fillText('Leads', 36, 136);
  g.fillStyle = COPPER;
  g.font = '500 20px "JetBrains Mono", monospace';
  g.fillText('3 NEW', 360, 132);
  g.fillStyle = HAIR;
  g.fillRect(36, 162, 408, 1);

  const cards = [
    ['New lead : Kitchen remodel', 'Sarah P.  :  2 min ago', true],
    ['New lead : Roof inspection', 'Mike D.  :  11 min ago', true],
    ['Quote viewed : $9,800', 'T. Brooks  :  26 min ago', true],
    ['Call booked : Thursday 9 AM', 'L. Ortiz  :  1 hr ago', false],
    ['Review left : 5 stars', 'A. Chen  :  3 hr ago', false]
  ];
  cards.forEach((card, i) => {
    const y = 196 + i * 148;
    g.fillStyle = PANEL;
    roundRect(g, 36, y, 408, 124, 14);
    g.fill();
    if (card[2]){
      g.fillStyle = COPPER;
      g.beginPath();
      g.arc(62, y + 38, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = BONE;
    g.font = '500 21px "DM Sans", sans-serif';
    g.fillText(card[0], card[2] ? 84 : 60, y + 46);
    g.fillStyle = STEEL;
    g.font = '400 17px "JetBrains Mono", monospace';
    g.fillText(card[1], card[2] ? 84 : 60, y + 86);
  });

  /* bottom nav hint */
  g.fillStyle = PANEL;
  g.fillRect(0, 936, 480, 64);
  g.fillStyle = COPPER;
  g.fillRect(60, 966, 44, 4);
  g.fillStyle = 'rgba(155,161,168,0.5)';
  g.fillRect(186, 966, 44, 4);
  g.fillRect(312, 966, 44, 4);

  return c;
}

/* Dark inner lens disc with an etched copper reticle. Kept opaque on purpose:
   transmission glass cannot see transparent objects behind it. */
export function reticleDisc(){
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');

  const bg = g.createRadialGradient(256, 256, 30, 256, 256, 256);
  bg.addColorStop(0, '#101216');
  bg.addColorStop(0.7, '#0a0b0e');
  bg.addColorStop(1, '#060708');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 512);

  g.strokeStyle = 'rgba(201,139,94,0.85)';
  g.lineWidth = 2;
  [70, 130, 195].forEach(r => {
    g.beginPath();
    g.arc(256, 256, r, 0, Math.PI * 2);
    g.stroke();
  });

  /* crosshair with a center gap */
  g.lineWidth = 2.5;
  [[256, 20, 256, 226], [256, 286, 256, 492], [20, 256, 226, 256], [286, 256, 492, 256]].forEach(l => {
    g.beginPath();
    g.moveTo(l[0], l[1]);
    g.lineTo(l[2], l[3]);
    g.stroke();
  });

  /* tick marks around the outer ring */
  g.lineWidth = 2;
  for (let i = 0; i < 24; i++){
    const a = (i / 24) * Math.PI * 2;
    const r1 = 222, r2 = i % 6 === 0 ? 200 : 212;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * r1, 256 + Math.sin(a) * r1);
    g.lineTo(256 + Math.cos(a) * r2, 256 + Math.sin(a) * r2);
    g.stroke();
  }

  /* faint center dot */
  g.fillStyle = 'rgba(201,139,94,0.9)';
  g.beginPath();
  g.arc(256, 256, 4, 0, Math.PI * 2);
  g.fill();

  return c;
}
