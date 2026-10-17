// Build one talking-head ad (HyperFrames project) from an ad config, in the
// Above All Garage Doors style, with any client's brand.
// Usage:
//   node build.mjs <ad.json> --brand <brand.json> --proxy <src.mp4> --transcript <words.json> --out <dir>
//
// Moved from aag-video-ads/template/build.mjs (2026-10-17). What changed: every
// AAG string, colour and asset comes from the brand file (the runner writes
// it from brandFor(), src/creative.ts), and paths come from flags instead of
// the old folder layout. Built with the AAG brand, the page is byte-for-byte what the old
// script wrote; that is the regression gate (docs/build-plans/agents.md).
//
// The config names cuts in SOURCE seconds and anchors every graphic to a spoken
// phrase, so timings follow the edit automatically:
//   segments: [[in, out], ...]          kept source ranges, in playback order
//             {freeze: srcT, dur}       a held still frame (pattern interrupt)
//   overlays: [{type, at: "phrase", to: "phrase" | dur: n, ...}]
//   beats:    [{at: "phrase", scale}]   punch-ins on top of the automatic jump-cut zooms
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TPL = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0 || !argv[i + 1]) throw new Error(`missing --${name}`);
  return argv[i + 1];
};
const cfg = JSON.parse(readFileSync(argv[0], "utf8"));
const brand = JSON.parse(readFileSync(flag("brand"), "utf8"));
const OUT = flag("out");
const PROXY = flag("proxy");
const TRANSCRIPT = flag("transcript");
const GAP_CUT = cfg.gapCut ?? 0.22;
const RATE = cfg.rate ?? 1.0; // playback speed; tight jump cuts already carry the pace // pauses longer than this inside a kept range become jump cuts
const PAD_OUT = 0.08;
const PAD_IN = 0.05;
const MAX_WORD = 0.7; // transcript word ends often swallow the pause that follows
const r2 = (n) => Math.round(n * 100) / 100;

// ---------- brand colours ----------
// The template's CSS is written in AAG's palette. Each brand colour replaces
// its AAG value, so the AAG brand leaves the CSS exactly as it was.
const AAG = { ink: "#061017", ink2: "#0c1d27", fg: "#f1f7fa", chrome: "#c4d0d6", accent: "#19c3f0", accentDeep: "#0a8fbf", star: "#ffc531" };
const colors = { ...AAG, ...(brand.colors ?? {}) };
const ACCENT = colors.accent;
const INK = colors.ink;
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
const VARS = { ink: "--ink", ink2: "--ink-2", fg: "--fg", chrome: "--chrome", accent: "--cyan", accentDeep: "--cyan-deep", star: "--star" };
const themed = (css) => {
  let out = css;
  for (const [key, v] of Object.entries(VARS)) out = out.split(`${v}: ${AAG[key]};`).join(`${v}: ${colors[key]};`);
  return out.split(`rgba(${rgb(AAG.accent)},`).join(`rgba(${rgb(colors.accent)},`);
};

// ---------- project scaffold ----------
// Only the photos this ad names, so a client's whole Drive photo folder (job
// clips included) is never copied into every project.
const ENDCARD_BG = (cfg.endcard ?? {}).bg ?? brand.endcardBg;
const photoNames = new Set([ENDCARD_BG]);
for (const o of cfg.overlays) {
  for (const p of [o.photo, o.before, o.after, ...(o.photos ?? [])]) if (p) photoNames.add(p);
}
mkdirSync(join(OUT, "assets", "photos"), { recursive: true });
for (const p of photoNames) {
  const from = join(brand.photosDir, `${p}.jpg`);
  if (!existsSync(from)) throw new Error(`photo not found: "${p}" (no ${p}.jpg in ${brand.photosDir})`);
  copyFileSync(from, join(OUT, "assets", "photos", `${p}.jpg`));
}
cpSync(join(TPL, "sfx"), join(OUT, "assets", "sfx"), { recursive: true });
copyFileSync(brand.logoPath, join(OUT, "assets", "logo-color.png"));
copyFileSync(PROXY, join(OUT, "assets", "src.mp4"));
const pinned = "0.8.140";
writeFileSync(join(OUT, "hyperframes.json"), readFileSync(join(TPL, "hyperframes.json")));
writeFileSync(join(OUT, "meta.json"), JSON.stringify({ id: cfg.id, name: cfg.id, createdAt: new Date().toISOString() }, null, 2));
writeFileSync(
  join(OUT, "package.json"),
  JSON.stringify(
    {
      name: cfg.id,
      private: true,
      type: "module",
      scripts: {
        dev: `npx --yes hyperframes@${pinned} preview`,
        check: `npx --yes hyperframes@${pinned} check`,
        render: `npx --yes hyperframes@${pinned} render`,
      },
    },
    null,
    2,
  ),
);

// ---------- edit: segments -> clips, words -> composition time ----------
const words = JSON.parse(readFileSync(TRANSCRIPT, "utf8"));
const fixes = cfg.fixes ?? {};
const clips = []; // {kind:"video"|"freeze", mediaStart, dur, start}
const compWords = [];
let t = 0;

const pushVideo = (a, b) => {
  if (b - a < 0.05) return;
  clips.push({ kind: "video", mediaStart: r2(a), dur: r2((b - a) / RATE), start: r2(t) });
  for (const w of words) {
    if (w.start >= a && w.start < b) {
      compWords.push({ t: fixes[w.text] ?? w.text, s: r2((w.start - a) / RATE + t), e: r2((Math.min(w.end, w.start + MAX_WORD, b) - a) / RATE + t) });
    }
  }
  t += (b - a) / RATE;
};

for (const seg of cfg.segments) {
  if (!Array.isArray(seg)) {
    clips.push({ kind: "freeze", src: seg.freeze, dur: seg.dur, start: r2(t) });
    t += seg.dur;
    continue;
  }
  const [a, b] = seg;
  const inside = words.filter((w) => w.start >= a && w.start < b);
  // word ends are often stretched across the following pause, so cap each word at the next word's start
  let cur = a;
  for (let i = 0; i < inside.length - 1; i++) {
    const end = Math.min(inside[i].end, inside[i].start + MAX_WORD, inside[i + 1].start);
    const gap = inside[i + 1].start - end;
    if (gap > GAP_CUT && seg[2] !== "keep") {
      pushVideo(cur, end + PAD_OUT);
      cur = inside[i + 1].start - PAD_IN;
    }
  }
  pushVideo(cur, b);
}
const SPEECH_END = r2(t);
const TAIL = cfg.tail ?? 2.6;
const lastVideo = [...clips].reverse().find((c) => c.kind === "video");
const tailSrc = cfg.tailFrom ?? lastVideo.mediaStart + lastVideo.dur * RATE;
clips.push({ kind: "video", mediaStart: r2(tailSrc), dur: TAIL, start: SPEECH_END, tail: true });
const DURATION = r2(SPEECH_END + TAIL);

// ---------- phrase anchors ----------
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
const findPhrase = (phrase, after = 0) => {
  const p = phrase.split(/\s+/).map(norm);
  for (let i = 0; i < compWords.length; i++) {
    if (compWords[i].s < after) continue;
    if (p.every((w, j) => compWords[i + j] && norm(compWords[i + j].t) === w)) {
      return { s: compWords[i].s, e: compWords[i + p.length - 1].e };
    }
  }
  throw new Error(`phrase not found: "${phrase}" (after ${after})`);
};
const srcToComp = (src) => {
  const c = clips.find((c) => c.kind === "video" && !c.tail && src >= c.mediaStart && src < c.mediaStart + c.dur * RATE + 0.001);
  if (!c) throw new Error("source time not in edit: " + src);
  return r2(c.start + (src - c.mediaStart) / RATE);
};
const when = (spec, after) => (typeof spec === "string" && spec.startsWith("src:") ? { s: srcToComp(+spec.slice(4)), e: srcToComp(+spec.slice(4)) } : typeof spec === "number" ? { s: spec, e: spec } : spec === "end" ? { s: SPEECH_END, e: SPEECH_END } : findPhrase(spec, after));
const span = (o) => {
  const a = when(o.at, o.afterT ?? 0);
  const t0 = r2(a.s + (o.offset ?? 0));
  let t1;
  if (o.dur) t1 = t0 + o.dur;
  else if (o.to) t1 = when(o.to, a.s).e + (o.toOffset ?? 0);
  else t1 = a.e;
  return [t0, r2(Math.min(t1, DURATION))];
};

// ---------- markup + timeline ----------
const html = [];
const js = [];
const sfx = [];
let sfxN = 0;
const addSfx = (name, at, vol = 0.6) => {
  const d = { whoosh: 0.45, thud: 0.35, pop: 0.09, ding: 0.45, tick: 0.06, scratch: 0.32 }[name];
  sfx.push(`<audio id="sfx-${sfxN}" class="clip" src="assets/sfx/${name}.wav" data-start="${r2(Math.max(0, at))}" data-duration="${d}" data-track-index="${10 + (sfxN % 6)}" data-volume="${vol}"></audio>`);
  sfxN++;
};
let uid = 0;
const id = (p) => `${p}-${uid++}`;
const clipAttrs = (t0, t1, track) => `class="clip" data-start="${t0}" data-duration="${r2(t1 - t0)}" data-track-index="${track}"`;
const zoneInfo = cfg.zones?.info ?? { left: 40, top: 290, width: 460 };
const zoneChest = cfg.zones?.chest ?? { left: 330, top: 650, width: 710 };

const C = {
  loc(o, t0, t1) {
    const k = id("loc");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 2)} style="position:absolute;left:${zoneInfo.left}px;top:${zoneInfo.top + 10}px;width:640px">
  <div class="card loc-card"><svg viewBox="0 0 40 48" class="loc-pin"><path d="M20 2C10 2 3 9.5 3 19c0 12.5 17 27 17 27s17-14.5 17-27C37 9.5 30 2 20 2z" fill="${ACCENT}"/><circle cx="20" cy="19" r="6.5" fill="${INK}"/></svg><div class="mono loc-text">${o.text ?? brand.location}</div></div></div>`);
    js.push(`tl.fromTo("#${k} .card",{x:-640},{x:0,duration:0.45,ease:"expo.out"},${t0 + 0.05})
  .fromTo("#${k} svg",{y:-30,scale:0.6},{y:0,scale:1,duration:0.45,ease:"back.out(2.5)"},${t0 + 0.25})
  .to("#${k} .card",{x:-640,duration:0.3,ease:"power3.in"},${r2(t1 - 0.32)});`);
    addSfx("pop", t0 + 0.08, 0.5);
  },
  exhibit(o, t0, t1) {
    const k = id("ex");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 3)} style="position:absolute;left:${o.left ?? 40}px;top:${o.top ?? 560}px;width:400px;height:200px">
  <div class="tag mono ex-tag">${o.label ?? "Exhibit A"}</div>
  <svg viewBox="0 0 140 150" class="ex-svg"><path id="${k}-p" d="M100 6 C 60 20, 30 50, 26 128" fill="none" stroke="${ACCENT}" stroke-width="9" stroke-linecap="round"/><path id="${k}-h" d="M6 104 L26 136 L46 106" fill="none" stroke="${ACCENT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`);
    js.push(`{const p=document.getElementById("${k}-p");const L=p.getTotalLength();p.style.strokeDasharray=L;
tl.fromTo("#${k} .ex-tag",{scale:0,rotation:-12},{scale:1,rotation:-4,duration:0.3,ease:"back.out(2.2)"},${t0})
  .fromTo(p,{strokeDashoffset:L},{strokeDashoffset:0,duration:0.3,ease:"power2.out"},${t0 + 0.15})
  .fromTo("#${k}-h",{opacity:0,y:-10},{opacity:1,y:0,duration:0.15,ease:"power2.out"},${t0 + 0.4});}`);
    addSfx("pop", t0 + 0.05, 0.5);
  },
  name(o, t0, t1) {
    const k = id("name");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 2)} style="position:absolute;left:${zoneInfo.left}px;top:${zoneInfo.top}px;width:${zoneInfo.width}px">
  <div class="card name-card"><div class="kicker mono">Owner</div><div class="who">${brand.ownerName}</div><div class="bar"></div><div class="role">${brand.name}</div></div></div>`);
    const d = t1 - t0;
    js.push(`tl.fromTo("#${k} .card",{y:40,opacity:0},{y:0,opacity:1,duration:0.45,ease:"power3.out"},${t0})
  .fromTo("#${k} .kicker",{opacity:0,x:-20},{opacity:1,x:0,duration:0.3,ease:"power2.out"},${r2(t0 + 0.14)})
  .fromTo("#${k} .bar",{scaleX:0},{scaleX:1,duration:0.55,ease:"expo.out"},${r2(t0 + 0.34)})
  .fromTo("#${k} .role",{opacity:0,y:14},{opacity:1,y:0,duration:0.35,ease:"power2.out"},${r2(t0 + Math.min(1.5, d * 0.45))})
  .to("#${k} .card",{y:-30,opacity:0,duration:0.25,ease:"power2.in"},${r2(t1 - 0.27)});`);
    addSfx("pop", t0 + 0.04, 0.5);
  },
  rating(o, t0, t1) {
    const k = id("rate");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 2)} style="position:absolute;left:${zoneInfo.left}px;top:${zoneInfo.top}px;width:${zoneInfo.width}px">
  <div class="card rate-card"><div class="row"><div class="score" id="${k}-s">${brand.rating}</div><div class="stars"><svg viewBox="0 0 250 46" class="stars-off"></svg><svg viewBox="0 0 250 46" class="stars-on" id="${k}-on"></svg></div></div><div class="reviews"><b>${brand.reviews}</b> Google reviews</div></div></div>`);
    js.push(`{const s=document.getElementById("${k}-s");const p={v:0};
tl.fromTo("#${k} .card",{scale:0.6,opacity:0},{scale:1,opacity:1,duration:0.45,ease:"back.out(1.8)"},${t0})
  .fromTo(p,{v:0},{v:${brand.rating},duration:0.8,ease:"power2.out",onUpdate:()=>{s.textContent=p.v.toFixed(1);}},${r2(t0 + 0.09)})
  .fromTo(s,{scale:0.85},{scale:1,duration:0.8,ease:"power2.out"},${r2(t0 + 0.09)})
  .fromTo("#${k}-on",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 2% 0 0)",duration:0.9,ease:"power2.out"},${r2(t0 + 0.19)})
  .fromTo("#${k} .reviews",{opacity:0,y:12},{opacity:1,y:0,duration:0.3,ease:"power2.out"},${r2(t0 + 0.64)})
  .to("#${k} .card",{y:-30,opacity:0,duration:0.25,ease:"power2.in"},${r2(t1 - 0.27)});}`);
    addSfx("pop", t0 + 0.04, 0.5);
  },
  process(o, t0, t1) {
    const k = id("proc");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 3)} style="position:absolute;left:${zoneChest.left}px;top:${zoneChest.top}px;width:${zoneChest.width}px">
  <div class="card proc-card"><div class="kicker mono">Our method</div><div class="title">${brand.processHtml}</div></div></div>`);
    js.push(`tl.fromTo("#${k} .card",{y:60,opacity:0,rotation:2},{y:0,opacity:1,rotation:0,duration:0.45,ease:"expo.out"},${t0})
  .fromTo("#${k} .title",{opacity:0,y:20},{opacity:1,y:0,duration:0.35,ease:"power3.out"},${r2(t0 + 0.12)})
  .to("#${k} .card",{y:40,opacity:0,duration:0.25,ease:"power2.in"},${r2(t1 - 0.27)});`);
    addSfx("pop", t0 + 0.04, 0.5);
  },
  stamp(o, t0, t1) {
    const k = id("stamp");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 3)} style="position:absolute;left:${o.left ?? 360}px;top:${o.top ?? 700}px;width:640px;height:300px">
  <div class="stamp-inner"><div class="big">${o.big ?? brand.stamp.big}</div><div class="small mono">${o.small ?? brand.stamp.small}</div></div></div>`);
    js.push(`tl.fromTo("#${k} .stamp-inner",{scale:2.2,rotation:-14,opacity:0},{scale:1,rotation:-6,opacity:1,duration:0.25,ease:"power4.in"},${t0})
  .fromTo("#${k} .stamp-inner",{x:0},{x:8,duration:0.05,yoyo:true,repeat:3,ease:"none",immediateRender:false},${r2(t0 + 0.25)})
  .to("#${k} .stamp-inner",{opacity:0,scale:0.92,duration:0.2,ease:"power2.in"},${r2(t1 - 0.2)});`);
    addSfx("thud", t0 + 0.25, 0.9);
  },
  tap(o, t0, t1) {
    const k = id("tap");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 3)} style="position:absolute;left:${o.left ?? 340}px;top:${o.top ?? zoneChest.top + 10}px;width:680px;height:380px">
  <div class="card tap-card"><div class="line1 mono">${brand.offer}</div><div class="line2">${brand.cta}</div></div>
  <svg class="arrow tap-arrow" viewBox="0 0 100 140"><path d="M50 6 V118 M14 84 L50 124 L86 84" fill="none" stroke="${ACCENT}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`);
    const bounces = Math.max(1, Math.floor((t1 - t0 - 0.9) / 0.35));
    js.push(`tl.fromTo("#${k} .card",{y:-50,opacity:0},{y:0,opacity:1,duration:0.45,ease:"back.out(1.6)"},${t0})
  .fromTo("#${k} .arrow",{opacity:0,y:-20},{opacity:1,y:0,duration:0.3,ease:"power2.out"},${r2(t0 + 0.3)})
  .fromTo("#${k} .arrow",{y:0},{y:26,duration:0.35,ease:"sine.inOut",yoyo:true,repeat:${bounces},immediateRender:false},${r2(t0 + 0.65)})
  .to("#${k}",{opacity:0,duration:0.25},${r2(t1 - 0.25)});`);
    addSfx("pop", t0 + 0.05, 0.5);
  },
  notif(o, t0, t1) {
    const k = id("notif");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 3)} style="position:absolute;left:120px;top:${o.top ?? zoneChest.top + 10}px;width:860px">
  <div class="card notif-card"><div class="icon"><img src="assets/logo-color.png" alt=""/></div><div><div class="meta mono">${brand.name} · now</div><div class="msg">${o.msg ?? brand.notifMsg}</div></div></div></div>`);
    js.push(`tl.fromTo("#${k} .card",{y:-140,opacity:0,scale:0.94},{y:0,opacity:1,scale:1,duration:0.5,ease:"back.out(1.4)"},${t0})
  .to("#${k} .card",{y:-60,opacity:0,duration:0.3,ease:"power2.in"},${r2(t1 - 0.3)});`);
    addSfx("ding", t0 + 0.05, 0.7);
  },
  // full-frame photo slams, one per photo, evenly split
  montage(o, t0, t1) {
    const k = id("mont");
    const n = o.photos.length;
    const step = (t1 - t0) / n;
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 1)} style="position:absolute;inset:0" ><div class="broll">
  ${o.photos.map((p, i) => `<img class="ph" id="${k}-${i}" src="assets/photos/${p}.jpg" alt=""/>`).join("\n  ")}
  <div class="grade"></div>${o.chip ? `<div class="chip mono${o.chipDark ? " dark" : ""}" id="${k}-c">${o.chip}</div>` : ""}</div></div>`);
    o.photos.forEach((_, i) => {
      const at = r2(t0 + i * step);
      js.push(`tl.set("#${k}-${i}",{opacity:0},${t0}).set("#${k}-${i}",{opacity:1},${at})
  .fromTo("#${k}-${i}",{scale:${o.calm ? 1.04 : 1.25},rotation:${o.calm ? 0 : i % 2 ? 2 : -2}},{scale:${o.calm ? 1.14 : 1.05},rotation:0,duration:${o.calm ? r2(step) : 0.5},ease:"${o.calm ? "none" : "expo.out"}",immediateRender:false},${at});`);
      addSfx(o.calm ? "tick" : "thud", at, o.calm ? 0.5 : 0.7);
    });
    if (o.chip) js.push(`tl.fromTo("#${k}-c",{scale:0,rotation:-8},{scale:1,rotation:-3,duration:0.35,ease:"back.out(2.4)"},${r2(t0 + 0.1)});`);
    if (!o.calm) addSfx("whoosh", t0 - 0.12, 0.5);
  },
  ba(o, t0, t1) {
    const k = id("ba");
    const wipe = r2(t0 + (t1 - t0) * (o.wipeAt ?? 0.35));
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 1)} style="position:absolute;inset:0"><div class="broll ba">
  <img class="ph" src="assets/photos/${o.before}.jpg" alt=""/>
  <div class="after-wrap" id="${k}-a"><img class="ph" src="assets/photos/${o.after}.jpg" alt=""/></div>
  <div class="divider" id="${k}-d"></div>
  ${o.labels === false ? "" : `<div class="lbl b mono" id="${k}-lb">Before</div><div class="lbl a mono" id="${k}-la">After</div>`}
  ${o.chip ? `<div class="chip mono" id="${k}-c" style="top:1500px;left:300px">${o.chip}</div>` : ""}</div></div>`);
    js.push(`tl.fromTo("#${k}-a",{clipPath:"inset(0 100% 0 0)"},{clipPath:"inset(0 0% 0 0)",duration:0.6,ease:"power3.inOut"},${wipe})
  .fromTo("#${k}-d",{x:0,opacity:1},{x:1072,duration:0.6,ease:"power3.inOut"},${wipe})
  .to("#${k}-d",{opacity:0,duration:0.15},${r2(wipe + 0.6)});`);
    if (o.labels !== false)
      js.push(`tl.fromTo("#${k}-lb",{x:-300},{x:0,duration:0.35,ease:"expo.out"},${r2(t0 + 0.08)}).to("#${k}-lb",{opacity:0,duration:0.2},${r2(wipe + 0.05)})
  .fromTo("#${k}-la",{x:300,opacity:0},{x:0,opacity:1,duration:0.35,ease:"expo.out"},${r2(wipe + 0.55)});`);
    if (o.chip) js.push(`tl.fromTo("#${k}-c",{y:40,opacity:0},{y:0,opacity:1,duration:0.35,ease:"back.out(2)"},${r2(wipe + 0.5)});`);
    addSfx("whoosh", wipe - 0.05, 0.7);
  },
  photo(o, t0, t1) {
    const k = id("ph");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 1)} style="position:absolute;inset:0"><div class="broll">
  <img class="ph" id="${k}-i" src="assets/photos/${o.photo}.jpg" alt=""/><div class="grade"></div>
  ${o.chip ? `<div class="chip mono${o.chipDark ? " dark" : ""}" id="${k}-c">${o.chip}</div>` : ""}</div></div>`);
    js.push(`tl.fromTo("#${k}-i",{scale:1.02,xPercent:0},{scale:1.16,xPercent:-4,duration:${r2(t1 - t0)},ease:"none"},${t0});`);
    if (o.chip) js.push(`tl.fromTo("#${k}-c",{x:-500},{x:0,duration:0.4,ease:"expo.out"},${r2(t0 + 0.12)});`);
    addSfx("whoosh", t0 - 0.12, 0.7);
  },
  diag(o, t0, t1) {
    const k = id("diag");
    const n = o.photos.length;
    const step = (t1 - t0) / n;
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 1)} style="position:absolute;inset:0"><div class="broll">
  ${o.photos.map((p, i) => `<img class="ph" id="${k}-${i}" src="assets/photos/${p}.jpg" alt=""/>`).join("\n  ")}
  <div class="grade"></div><div class="diag-scan" id="${k}-s"></div>
  <div class="diag-reticle" id="${k}-r"><svg viewBox="0 0 500 500"><path d="M10 110V10h100M390 10h100v100M490 390v100H390M110 490H10V390" fill="none" stroke="${ACCENT}" stroke-width="10"/><circle cx="250" cy="250" r="12" fill="${ACCENT}"/></svg></div>
  <div class="chip mono" id="${k}-c">${o.chip ?? brand.diagChip}</div></div></div>`);
    o.photos.forEach((_, i) => {
      const at = r2(t0 + i * step);
      js.push(`tl.set("#${k}-${i}",{opacity:0},${t0}).set("#${k}-${i}",{opacity:1},${at})
  .fromTo("#${k}-${i}",{scale:1.08},{scale:1.18,duration:${r2(step)},ease:"none",immediateRender:false},${at});`);
      if (i > 0) js.push(`tl.fromTo("#${k}-r",{rotation:${(i - 1) * 90}},{rotation:${i * 90},duration:0.35,ease:"power2.inOut",immediateRender:false},${at});`);
      addSfx("tick", at, 0.6);
    });
    js.push(`tl.fromTo("#${k}-s",{y:300},{y:1500,duration:${r2((t1 - t0) / 2)},ease:"sine.inOut",yoyo:true,repeat:1},${t0})
  .fromTo("#${k}-r",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:0.35,ease:"expo.out"},${r2(t0 + 0.04)})
  .fromTo("#${k}-c",{x:-500},{x:0,duration:0.4,ease:"expo.out"},${r2(t0 + 0.14)});`);
    addSfx("whoosh", t0 - 0.12, 0.5);
  },
  // big punchline text (pattern interrupt)
  text(o, t0, t1) {
    const k = id("txt");
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 4)} style="position:absolute;left:60px;top:${o.top ?? 300}px;width:960px"><div class="punch${o.alt ? " alt" : ""}" id="${k}-t">${o.text}</div></div>`);
    js.push(`tl.fromTo("#${k}-t",{scale:1.8,rotation:${o.rot ?? -4},opacity:0},{scale:1,rotation:${o.rot ?? -4},opacity:1,duration:0.22,ease:"power4.in"},${t0});`);
    addSfx(o.sound ?? "thud", t0 + 0.2, 0.8);
  },
  endcard(o, t0, t1) {
    const k = "endcard";
    html.push(`<div id="${k}" ${clipAttrs(t0, t1, 5)} style="position:absolute;inset:0">
  <img class="bg" id="end-bg" src="assets/photos/${o.bg ?? brand.endcardBg}.jpg" alt=""/><div class="veil"></div><div class="glow"></div>
  <div class="stack">${o.kicker ? `<div class="end-kicker">${o.kicker}</div>` : ""}<img class="logo" src="assets/logo-color.png" alt="${brand.name}"/>
  <div class="offer">${brand.offerHtml}</div><div class="cta">${brand.cta}</div><div class="proof"><b>★ ${brand.rating}</b> from ${brand.reviews} Google reviews</div></div></div>`);
    js.push(`tl.fromTo("#end-bg",{scale:1.15},{scale:1.0,duration:${r2(t1 - t0)},ease:"power1.out"},${t0})
  .fromTo("#endcard .veil",{opacity:0.4},{opacity:1,duration:0.5,ease:"power2.out"},${t0})
  .fromTo("#endcard .glow",{scale:0.7,opacity:0},{scale:1,opacity:1,duration:1.2,ease:"sine.out"},${r2(t0 + 0.05)})
  ${o.kicker ? `.fromTo("#endcard .end-kicker",{scale:1.6,opacity:0},{scale:1,opacity:1,duration:0.25,ease:"power4.in"},${r2(t0 + 0.05)})` : ""}
  .fromTo("#endcard .logo",{scale:0.8,opacity:0,y:30},{scale:1,opacity:1,y:0,duration:0.55,ease:"expo.out"},${r2(t0 + 0.1)})
  .fromTo("#endcard .offer",{opacity:0,y:30},{opacity:1,y:0,duration:0.45,ease:"power3.out"},${r2(t0 + 0.4)})
  .fromTo("#endcard .cta",{scale:0,opacity:0},{scale:1,opacity:1,duration:0.5,ease:"back.out(2.2)"},${r2(t0 + 0.7)})
  .fromTo("#endcard .cta",{scale:1},{scale:1.06,duration:0.3,ease:"sine.inOut",yoyo:true,repeat:3,immediateRender:false},${r2(t0 + 1.25)})
  .fromTo("#endcard .proof",{opacity:0},{opacity:1,duration:0.4,ease:"power2.out"},${r2(t0 + 1.0)});`);
    addSfx("whoosh", t0 - 0.1, 0.8);
  },
};

const mids = [0.4];
for (const o of cfg.overlays) {
  const [t0, t1] = span(o);
  mids.push(r2(t0 + (t1 - t0) * 0.6));
  C[o.type](o, t0, t1);
}
C.endcard(cfg.endcard ?? {}, SPEECH_END, DURATION);

// ---------- footage + camera ----------
const FACE = cfg.face ?? "65% 21%";
const vids = [];
const freezes = [];
clips.forEach((c, i) => {
  if (c.kind === "video") {
    const lane = c.tail ? `data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":${cfg.tailVolume ?? 0}},{"t":${c.dur},"v":${cfg.tailVolume ?? 0}}]}]}'` : "";
    vids.push(`<video id="v-${i}" class="clip" src="assets/src.mp4" data-start="${c.start}" data-duration="${c.dur}" data-media-start="${c.mediaStart}" data-playback-rate="${RATE}" data-track-index="0" playsinline data-has-audio="true" ${lane}></video>`);
  } else {
    const f = `freeze-${i}.jpg`;
    // pull the held frame from the full-res original when given, so the zoom stays sharp
    const from = cfg.freezeFrom ?? join(OUT, "assets", "src.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(c.src), "-i", from, "-frames:v", "1", "-vf", "scale=2160:3840", "-q:v", "2", join(OUT, "assets", f)]);
    freezes.push(`<div id="fz-${i}" class="clip freeze" data-start="${c.start}" data-duration="${c.dur}" data-track-index="0"><img id="fz-${i}-i" src="assets/${f}" alt=""/></div>`);
    const fz = cfg.freezeZoom ?? { origin: "20% 55%", scale: 2.2 };
    js.push(`tl.fromTo("#fz-${i}-i",{scale:1,transformOrigin:"${fz.origin}"},{scale:${fz.scale},duration:0.5,ease:"expo.out"},${c.start});`);
    addSfx("scratch", c.start, 0.9);
  }
});

// automatic jump-cut zooms: alternate framing on each cut so splices read as deliberate
const cam = [];
let zoomed = false;
clips.forEach((c) => {
  if (c.kind !== "video" || c.start === 0) return;
  zoomed = !zoomed;
  cam.push({ t: c.start, scale: c.tail ? 1.06 : zoomed ? 1.08 : 1 });
});
for (const b of cfg.beats ?? []) cam.push({ t: when(b.at, b.afterT ?? 0).s, scale: b.scale });
cam.sort((a, b) => a.t - b.t);
const camJs = [];
if (cfg.hook) {
  const ht = when(cfg.hook.until, 0).s;
  camJs.push(`tl.fromTo("#cam",{scale:${cfg.hook.scale ?? 1.75},transformOrigin:"${cfg.hook.origin}"},{scale:1,duration:0.32,ease:"expo.inOut"},${r2(ht - 0.16)});`);
  camJs.push(`tl.set("#cam",{transformOrigin:"${FACE}"},${r2(ht + 0.2)});`);
  addSfx("whoosh", ht - 0.2, 0.8);
  for (let i = cam.length - 1; i >= 0; i--) if (cam[i].t < ht + 0.2) cam.splice(i, 1);
} else {
  camJs.push(`tl.set("#cam",{scale:1,transformOrigin:"${FACE}"},0);`);
}
for (const c of cam) camJs.push(`tl.set("#cam",{scale:${c.scale}},${r2(c.t)});`);

// ---------- captions ----------
const CAPTIONS_END = SPEECH_END;
const HOT = cfg.hot ?? brand.hot;

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>${themed(readFileSync(join(TPL, "style.css"), "utf8"))}${themed(readFileSync(join(TPL, "extra.css"), "utf8"))}</style>
  </head>
  <body>
    <!-- ${cfg.title}: built by template/build.mjs from ${cfg.id}.json, edit the config and rebuild -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DURATION}" data-width="1080" data-height="1920">
      <div class="shot" id="cam">
        ${vids.join("\n        ")}
      </div>
      ${freezes.join("\n      ")}
      <div id="shade"></div>
      ${html.join("\n      ")}
      <div id="captions"></div>
      ${sfx.join("\n      ")}
    </div>
    <script>
      const WORDS = ${JSON.stringify(compWords)};
      const HOT = new Set(${JSON.stringify(HOT)});
      const CAPTIONS_END = ${CAPTIONS_END};
      const GROUPS = [];
      let cur = [];
      WORDS.forEach((w, i) => {
        cur.push(w);
        const next = WORDS[i + 1];
        const punct = /[.,?!]$/.test(w.t);
        const gap = next ? next.s - w.e : 1;
        if (!next || punct || gap > 0.15 || cur.length >= 3) { GROUPS.push(cur); cur = []; }
      });
      const box = document.getElementById("captions");
      GROUPS.forEach((g, gi) => {
        const el = document.createElement("div");
        el.className = "cg";
        el.id = "cg-" + gi;
        g.forEach((w, wi) => {
          const s = document.createElement("span");
          s.className = "cw";
          s.id = "cw-" + gi + "-" + wi;
          s.textContent = w.t.replace(/[.,?!]$/, "");
          el.appendChild(s);
        });
        box.appendChild(el);
      });
      const starPath = (x) => { const cx = x + 23, cy = 23, R = 22, r = 9.5; let d = ""; for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2; const rad = i % 2 ? r : R; d += (i ? "L" : "M") + (cx + rad * Math.cos(a)).toFixed(1) + " " + (cy + rad * Math.sin(a)).toFixed(1); } return d + "Z"; };
      let starsD = ""; for (let i = 0; i < 5; i++) starsD += starPath(i * 51);
      document.querySelectorAll(".stars-off").forEach((s) => (s.innerHTML = '<path d="' + starsD + '" fill="rgba(196,208,214,0.28)"/>'));
      document.querySelectorAll(".stars-on").forEach((s) => (s.innerHTML = '<path d="' + starsD + '" fill="#ffc531"/>'));

      const tl = gsap.timeline({ paused: true });
      ${camJs.join("\n      ")}
      ${js.join("\n      ")}

      GROUPS.forEach((g, gi) => {
        const el = "#cg-" + gi;
        const start = g[0].s;
        if (start >= CAPTIONS_END) return;
        const nextStart = GROUPS[gi + 1] ? GROUPS[gi + 1][0].s : CAPTIONS_END;
        const end = Math.min(nextStart, CAPTIONS_END, g[g.length - 1].e + 0.6);
        tl.set(el, { visibility: "visible" }, start)
          .fromTo(el, { opacity: 0, scale: 0.86, y: 14 }, { opacity: 1, scale: 1, y: 0, duration: 0.14, ease: "back.out(2)" }, start);
        g.forEach((w, wi) => {
          const key = w.t.toLowerCase().replace(/[^a-z']/g, "");
          if (!HOT.has(key)) return;
          tl.set("#cw-" + gi + "-" + wi, { className: "cw hot" }, w.s)
            .fromTo("#cw-" + gi + "-" + wi, { scale: 1 }, { scale: 1.12, duration: 0.1, ease: "power2.out", yoyo: true, repeat: 1 }, w.s);
        });
        tl.set(el, { opacity: 0, visibility: "hidden" }, end);
      });

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(join(OUT, "index.html"), page);
mids.push(r2(DURATION - 0.6));
writeFileSync(join(OUT, "snap-times.txt"), mids.join(","));
console.log(`${cfg.id}: ${clips.length} clips, ${compWords.length} words, speech ${SPEECH_END}s, total ${DURATION}s`);
