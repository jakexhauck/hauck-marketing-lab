// DCFC Downriver field booking demo: shared data, map, booking store and message text.

const SIZES = {
  '11v11': { block: 150, len: '2h30' },
  '9v9': { block: 120, len: '2h' },
  '7v7': { block: 90, len: '1h30' },
};
// Traced from Jake's drawing of Heritage Park (map units, viewBox 120 30 800 340).
const PITCHES = [
  { id: 'north-a', name: 'North A', short: 'N A', size: '7v7', x: 172, y: 70, w: 88, h: 132 },
  { id: 'north-b', name: 'North B', short: 'N B', size: '7v7', x: 300, y: 78, w: 80, h: 110 },
  { id: 'north-big', name: 'North Big', short: 'N Big', size: '11v11', x: 168, y: 214, w: 224, h: 60 },
  { id: 'field-1', name: 'Field 1', short: 'F1', size: '9v9', x: 458, y: 150, w: 188, h: 84 },
  { id: 'field-1-small', name: 'Field 1 Small', short: 'F1 S', size: '7v7', x: 448, y: 244, w: 90, h: 92 },
  { id: 'field-2-small', name: 'Field 2 Small', short: 'F2 S', size: '7v7', x: 548, y: 244, w: 128, h: 92 },
  { id: 'field-3', name: 'Field 3', short: 'F3', size: '11v11', x: 686, y: 138, w: 100, h: 200 },
  { id: 'field-4', name: 'Field 4', short: 'F4', size: '11v11', x: 796, y: 142, w: 96, h: 192 },
];
const pitchById = id => PITCHES.find(p => p.id === id);

function fmt(min) {
  const h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'pm' : 'am';
  return `${h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')}${ap}`;
}
function slotsFor(p) {
  const b = SIZES[p.size].block, out = [];
  for (let t = 8 * 60; t + b <= 18 * 60; t += b) out.push({ start: t, end: t + b });
  return out;
}
const totalBlocks = () => PITCHES.reduce((n, p) => n + slotsFor(p).length, 0);

// Next 8 weekends, Saturdays and Sundays only.
const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function weekends(n = 8) {
  const out = [], d = new Date(); d.setHours(0, 0, 0, 0);
  while (out.length < n * 2) {
    const wd = d.getDay();
    if (wd === 6 || wd === 0) out.push({ key: keyOf(d), label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '') });
    d.setDate(d.getDate() + 1);
  }
  return out;
}
const dayLabel = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', ''); };

// Bookings live in this browser only (look-around demo, no backend).
// A first-time visitor gets a busy sample: the next two weekends filled in.
const KEY = 'dcfc-demo-bookings-v2';
const TEAMS = ['U9 Boys Rouge','U9 Girls Gold','U10 Boys Gold','U10 Girls Rouge','U11 Boys Rouge','U11 Girls Gold','U12 Boys Gold','U12 Girls Rouge','U13 Boys Rouge','U13 Girls Gold','U14 Boys Rouge','U14 Girls Gold','U15 Boys Gold','U16 Girls Rouge','U17 Boys Rouge'];
const OPPS = ['Wyandotte FC','Southgate SC','Trenton Elite','Allen Park United','Dearborn Stars','Lincoln Park SC','Romulus FC','Woodhaven Wave','Riverview Rush','Grosse Ile SC'];
const COACHES = [['Mike Kowalski','0113'],['Sarah Nguyen','0117'],['Dan Rivera','0142'],['Jess Thompson','0188'],['Tony Russo','0163'],['Amy Patel','0129'],['Chris Walker','0126'],['Nicole Brooks','0134'],['Kevin Doyle','0131'],['Laura Chen','0143'],['Marcus Hill','0159'],['Rachel Adams','0141']];
function sampleBookings() {
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const now = new Date(), today = keyOf(now), nowMin = now.getHours() * 60 + now.getMinutes(), out = [];
  weekends(2).forEach((d, di) => PITCHES.forEach(p => slotsFor(p).forEach(s => {
    if (rnd() > (di < 2 ? 0.62 : 0.3) || (d.key === today && s.start <= nowMin)) return;
    const i = Math.floor(rnd() * TEAMS.length), [coach, tail] = COACHES[i % COACHES.length];
    out.push({ pitch: p.id, date: d.key, start: s.start, team: TEAMS[i], opp: OPPS[Math.floor(rnd() * OPPS.length)], coach, phone: `(734) 555-${tail}`,
      id: 1e12 + out.length, bookedAt: new Date(now.getTime() - (1 + rnd() * 6 * 24) * 3600e3).toISOString() });
  })));
  return out;
}
function loadBookings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) { const s = sampleBookings(); saveBookings(s); return s; }
    return JSON.parse(raw) || [];
  } catch { return []; }
}
function saveBookings(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} }
function addBooking(b) {
  const list = loadBookings();
  if (list.some(x => x.pitch === b.pitch && x.date === b.date && x.start === b.start)) return null;
  const rec = { ...b, id: Math.max(Date.now(), ...list.map(x => x.id + 1)), bookedAt: new Date().toISOString() };
  list.push(rec); saveBookings(list); return rec;
}
function cancelBooking(id) { saveBookings(loadBookings().filter(b => b.id !== id)); }
function onBookingsChange(fn) { window.addEventListener('storage', e => { if (e.key === KEY) fn(); }); }

// Text messages the system sends.
const CLUB = 'DCFC Downriver';
function coachText(b) {
  const p = pitchById(b.pitch);
  return `${CLUB}: You're booked! ${b.team}${b.opp ? ' vs ' + b.opp : ''}, ${p.name} (${p.size}), ${dayLabel(b.date)}, ${fmt(b.start)} to ${fmt(b.start + SIZES[p.size].block)}. The field is yours from ${fmt(b.start)} for warm-up. Heritage Park, 12111 Pardee Rd, Taylor.`;
}
function adminText(b) {
  const p = pitchById(b.pitch);
  return `New field booking\n${p.name} (${p.size})\n${dayLabel(b.date)}, ${fmt(b.start)} to ${fmt(b.start + SIZES[p.size].block)}\nTeam: ${b.team}${b.opp ? ' vs ' + b.opp : ''}\nCoach: ${b.coach}\nPhone: ${b.phone}`;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telHref = s => 'tel:' + String(s).replace(/\D/g, '');

// Top navigation shared by every page.
function nav(active) {
  const links = [['index.html', 'Book a field'], ['admin.html', 'Admin'], ['messages.html', 'Messages']];
  return `<nav class="nav"><a class="brand" href="index.html"><img src="crest.png" alt="Detroit City FC Downriver"><span>DCFC <b>Downriver</b></span></a>
    <div class="tabs">${links.map(([h, t]) => `<a href="${h}"${h === active ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('')}</div></nav>`;
}

// iPhone with a Messages thread. msgs: [{ text, at }]
function phoneHTML({ contact, msgs, typing }) {
  const now = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/, '');
  let last = 0, body = '';
  msgs.forEach(m => {
    const t = new Date(m.at).getTime();
    if (t - last > 10 * 60 * 1000) { const at = new Date(m.at), time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const when = keyOf(at) === keyOf(new Date()) ? `Today ${time}` : `${at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
      body += `<div class="stamp"><b>Text Message</b><br>${when}</div>`; }
    last = t;
    body += `<div class="bub${m.fresh ? ' fresh' : ''}">${esc(m.text).replace(/^([^\n]*)\n/, '<b>$1</b><br>').replace(/\n/g, '<br>')}</div>`;
  });
  if (typing) body += `<div class="bub typing"><i></i><i></i><i></i></div>`;
  return `<div class="iphone"><div class="screen">
    <div class="status"><span>${now}</span><span class="island"></span><span class="icons"><i class="sig"></i><i class="bat"></i></span></div>
    <div class="imhead"><span class="back">‹</span><div class="who"><img src="crest.png" alt=""><span>${esc(contact)} ›</span></div></div>
    <div class="thread">${body}</div>
    <div class="compose"><span class="plus">+</span><span class="field">Text Message</span></div>
    <div class="home"></div></div></div>`;
}

// Illustrated park map.
function pitchMarkings(p) {
  const horiz = p.w >= p.h, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const short = Math.min(p.w, p.h), r = short * 0.16, boxD = (horiz ? p.w : p.h) * 0.14, boxW = short * 0.5, s = 'class="mk"';
  let g = `<rect ${s} x="${p.x + 4}" y="${p.y + 4}" width="${p.w - 8}" height="${p.h - 8}"/><circle ${s} cx="${cx}" cy="${cy}" r="${r}"/>`;
  if (horiz) g += `<line ${s} x1="${cx}" y1="${p.y + 4}" x2="${cx}" y2="${p.y + p.h - 4}"/><rect ${s} x="${p.x + 4}" y="${cy - boxW / 2}" width="${boxD}" height="${boxW}"/><rect ${s} x="${p.x + p.w - 4 - boxD}" y="${cy - boxW / 2}" width="${boxD}" height="${boxW}"/>`;
  else g += `<line ${s} x1="${p.x + 4}" y1="${cy}" x2="${p.x + p.w - 4}" y2="${cy}"/><rect ${s} x="${cx - boxW / 2}" y="${p.y + 4}" width="${boxW}" height="${boxD}"/><rect ${s} x="${cx - boxW / 2}" y="${p.y + p.h - 4 - boxD}" width="${boxW}" height="${boxD}"/>`;
  return g;
}
function mapSVG() {
  const trees = [[420,300],[432,318],[410,330],[395,350],[440,345],[600,352],[622,356],[648,350],[150,300],[132,330],[905,110],[912,300]]
    .map(([x, y]) => `<circle class="tree" cx="${x}" cy="${y}" r="9"/>`).join('');
  const pitches = PITCHES.map(p => `<g class="pitch" data-id="${p.id}" data-size="${p.size}" tabindex="0" role="button" aria-label="${p.name} ${p.size}">
      <rect class="turf" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="3"/>${pitchMarkings(p)}
      <g class="tag"><rect x="${p.x + p.w / 2 - 28}" y="${p.y + p.h / 2 - 12}" width="56" height="24" rx="12"/><text x="${p.x + p.w / 2}" y="${p.y + p.h / 2 + 5}">${p.short}</text></g></g>`).join('');
  return `<svg class="parkmap" viewBox="120 30 800 340" xmlns="http://www.w3.org/2000/svg">
    <rect class="ground" x="120" y="30" width="800" height="340"/>
    <path class="road" d="M120 120 C 170 60, 220 52, 300 50 L 890 44 C 915 44, 918 70, 915 100 L 905 370"/><path class="road" d="M425 50 L 430 370"/>
    <rect class="lot" x="560" y="62" width="200" height="30" rx="15"/><rect class="lot" x="130" y="130" width="28" height="80" rx="6"/>
    <path class="diamond" d="M470 370 L 470 360 A 60 60 0 0 1 560 360 L 560 370 Z"/><path class="diamond" d="M640 370 L 640 362 A 55 55 0 0 1 730 362 L 730 370 Z"/>
    <text class="area" x="164" y="62">NORTH FIELD</text><text class="area" x="450" y="132">MAIN FIELDS</text>${trees}${pitches}</svg>`;
}
