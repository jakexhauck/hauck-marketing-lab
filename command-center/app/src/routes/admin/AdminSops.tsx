import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SOP_CATEGORIES } from "../../lib/sopData";

// SOP Hub inside the admin console. Self-contained dark-green styling (the
// internal-website look) scoped under .hsop-root, so it carries the brand
// regardless of the surrounding admin theme. Phase 1 reads the static seed in
// lib/sopData.ts; phase 2 swaps to a Supabase table + an add/edit editor.

export default function AdminSops() {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    return SOP_CATEGORIES.map((cat) => ({
      cat,
      sops: query
        ? cat.sops.filter((s) =>
            (s.title + " " + (s.desc ?? "")).toLowerCase().includes(query),
          )
        : cat.sops,
    })).filter((g) => g.sops.length > 0);
  }, [q]);

  const total = groups.reduce((n, g) => n + g.sops.length, 0);

  return (
    <div className="hsop-root">
      <HsopStyle />
      <header className="hsop-head">
        <div>
          <h1 className="hsop-title">SOP Hub</h1>
          <p className="hsop-sub">Every process, with written steps and the original training video.</p>
        </div>
        <label className="hsop-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SOPs…" />
        </label>
      </header>

      {total === 0 ? (
        <div className="hsop-empty">No SOPs match that search.</div>
      ) : (
        groups.map(({ cat, sops }) => (
          <section className="hsop-cat" key={cat.key}>
            <div className="hsop-cat-head">
              <span className="hsop-cemoji">{cat.emoji}</span>
              <h2>{cat.name}</h2>
              <span className="hsop-count">{sops.length} SOP{sops.length === 1 ? "" : "s"}</span>
            </div>
            {sops.map((s) => (
              <Link className="hsop-row" key={s.slug} to={`/admin/sops/${cat.key}/${s.slug}`}>
                <span className="hsop-li">
                  <span className="hsop-emoji">{s.emoji}</span>
                  <span className="hsop-l">
                    <span className="hsop-rt">{s.title}</span>
                    <span className="hsop-rd">{s.desc}</span>
                  </span>
                </span>
                <span className="hsop-r">
                  {s.video && (
                    <span className="hsop-tag">
                      <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg> Video
                    </span>
                  )}
                  <span className="hsop-arrow">
                    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </span>
                </span>
              </Link>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

// Scoped style for the SOP Hub (the green internal-site look). Kept inline so the
// feature is self-contained and does not depend on the global admin theme.
export function HsopStyle() {
  return (
    <style>{`
      .hsop-root {
        --g-bg: #081512; --g-card: #0b201b; --g-card-h: #102a23; --g-border: #1c3a31;
        --g-text: #fff; --g-muted: #90a89e; --g-muted2: #54695f; --g-accent: #4dbb83; --g-accent2: #6fd3a0;
        background: var(--g-bg); color: var(--g-text); border-radius: 18px;
        font-family: 'Inter', system-ui, sans-serif; padding: 30px 30px 60px; min-height: 100%;
        background-image: radial-gradient(700px 460px at 90% -10%, rgba(77,187,131,0.14), transparent 60%);
      }
      .hsop-root *, .hsop-root *::before, .hsop-root *::after { box-sizing: border-box; }
      .hsop-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 18px; }
      .hsop-title { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; }
      .hsop-sub { color: var(--g-muted); font-size: 14.5px; margin-top: 6px; }
      .hsop-search { display: flex; align-items: center; gap: 9px; padding: 9px 14px; border: 1px solid var(--g-border); border-radius: 12px; color: var(--g-muted2); background: rgba(255,255,255,0.02); min-width: 240px; }
      .hsop-search input { border: 0; background: transparent; color: var(--g-text); font: inherit; font-size: 13.5px; outline: none; width: 100%; }
      .hsop-search input::placeholder { color: var(--g-muted2); }
      .hsop-cat { margin-top: 26px; }
      .hsop-cat-head { display: flex; align-items: center; gap: 11px; padding: 0 4px 10px; border-bottom: 1px solid var(--g-border); }
      .hsop-cemoji { font-size: 20px; line-height: 1; }
      .hsop-cat-head h2 { font-size: 14px; font-weight: 700; letter-spacing: 0.04em; color: var(--g-muted); text-transform: uppercase; }
      .hsop-count { margin-left: auto; color: var(--g-muted2); font-size: 12px; font-weight: 500; }
      .hsop-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 12px; border-radius: 14px; text-decoration: none; color: inherit; border-bottom: 1px solid rgba(28,58,49,0.45); transition: background .16s, transform .16s; }
      .hsop-row:last-child { border-bottom: none; }
      .hsop-row:hover { background: var(--g-card-h); transform: translateX(4px); }
      .hsop-li { display: flex; align-items: center; gap: 14px; min-width: 0; }
      .hsop-emoji { width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0; font-size: 20px; display: grid; place-items: center; background: rgba(77,187,131,0.08); border: 1px solid rgba(77,187,131,0.16); }
      .hsop-l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .hsop-rt { font-weight: 650; font-size: 16px; letter-spacing: -0.01em; }
      .hsop-rd { color: var(--g-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hsop-r { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .hsop-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 4px 9px; border-radius: 999px; color: var(--g-accent2); background: rgba(77,187,131,0.10); border: 1px solid rgba(77,187,131,0.22); }
      .hsop-tag svg { width: 11px; height: 11px; fill: var(--g-accent2); }
      .hsop-arrow svg { width: 17px; height: 17px; stroke: var(--g-muted2); fill: none; transition: stroke .16s, transform .16s; }
      .hsop-row:hover .hsop-arrow svg { stroke: var(--g-accent); transform: translateX(3px); }
      .hsop-empty { text-align: center; color: var(--g-muted2); padding: 60px 0; font-size: 14px; }
      .hsop-back { display: inline-flex; align-items: center; gap: 7px; color: var(--g-muted); font-size: 13.5px; font-weight: 500; text-decoration: none; margin-bottom: 22px; }
      .hsop-back:hover { color: var(--g-accent); }
      .hsop-back svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; }
      .hsop-detail-head { display: flex; align-items: center; gap: 16px; }
      .hsop-detail-emoji { width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0; font-size: 27px; display: grid; place-items: center; background: rgba(77,187,131,0.08); border: 1px solid rgba(77,187,131,0.16); }
      .hsop-kicker { color: var(--g-accent); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
      .hsop-detail-head h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; margin-top: 4px; }
      .hsop-video { margin: 26px 0; border: 1px solid var(--g-border); border-radius: 18px; overflow: hidden; background: var(--g-card); }
      .hsop-video iframe { width: 100%; aspect-ratio: 16/9; border: 0; display: block; }
      .hsop-video .ph { aspect-ratio: 16/9; display: grid; place-items: center; gap: 12px; background: linear-gradient(180deg,#0c2820,#081713); color: var(--g-muted); }
      .hsop-video .play { width: 58px; height: 58px; border-radius: 50%; background: var(--g-accent); display: grid; place-items: center; box-shadow: 0 8px 30px rgba(77,187,131,0.35); }
      .hsop-video .play svg { width: 23px; height: 23px; fill: #06140f; margin-left: 3px; }
      .hsop-prose { color: #d7e4dd; font-size: 15.5px; line-height: 1.7; max-width: 760px; }
      .hsop-prose h2 { color: var(--g-text); font-size: 19px; font-weight: 700; margin: 24px 0 10px; }
      .hsop-prose h2:first-child { margin-top: 0; }
      .hsop-prose ul, .hsop-prose ol { margin: 8px 0 8px 2px; padding-left: 22px; }
      .hsop-prose li { margin: 6px 0; }
      .hsop-prose li::marker { color: var(--g-accent); }
      .hsop-prose strong { color: var(--g-text); }
      .hsop-prose code { background: rgba(77,187,131,0.10); border: 1px solid rgba(77,187,131,0.18); border-radius: 6px; padding: 1px 6px; font-size: 13.5px; color: var(--g-accent2); }
    `}</style>
  );
}
