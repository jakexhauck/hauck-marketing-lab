import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SOP_CATEGORIES } from "../../lib/sopData";

// SOP Hub inside the admin console. Styling is scoped under .hsop-root but reads
// the shared admin theme tokens (surface/border/text/brand), so it follows the
// neutral light/dark theme with green as an accent, matching the rest of the
// console. Phase 1 reads the static seed in lib/sopData.ts; phase 2 swaps to a
// Supabase table + an add/edit editor.

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

// Scoped style for the SOP Hub. Reads the shared admin theme tokens so the hub
// follows the neutral light/dark theme with green as an accent, matching the
// rest of the console. Each category renders as a calm surface card.
export function HsopStyle() {
  return (
    <style>{`
      .hsop-root {
        color: var(--text); font-family: var(--font-body);
        padding: 28px 36px 60px; min-height: 100%;
        max-width: 1280px; margin: 0 auto;
      }
      .hsop-root *, .hsop-root *::before, .hsop-root *::after { box-sizing: border-box; }
      .hsop-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 6px; }
      .hsop-title { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.03em; }
      .hsop-sub { color: var(--text-muted); font-size: 14px; margin-top: 6px; }
      .hsop-search { display: flex; align-items: center; gap: 9px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 999px; color: var(--text-faint); background: var(--surface); min-width: 250px; }
      .hsop-search:focus-within { border-color: var(--brand); box-shadow: 0 0 0 4px var(--brand-tint); }
      .hsop-search input { border: 0; background: transparent; color: var(--text); font: inherit; font-size: 13.5px; outline: none; width: 100%; }
      .hsop-search input::placeholder { color: var(--text-faint); }
      .hsop-cat { margin-top: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
      .hsop-cat-head { display: flex; align-items: center; gap: 11px; padding: 16px 22px; border-bottom: 1px solid var(--divider); }
      .hsop-cemoji { font-size: 19px; line-height: 1; }
      .hsop-cat-head h2 { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
      .hsop-count { margin-left: auto; color: var(--text-muted); font-size: 12px; font-weight: 600; background: var(--surface-2); border-radius: 999px; padding: 3px 10px; }
      .hsop-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 22px; text-decoration: none; color: inherit; border-bottom: 1px solid var(--divider); transition: background .16s; }
      .hsop-row:last-child { border-bottom: none; }
      .hsop-row:hover { background: var(--surface-2); }
      .hsop-li { display: flex; align-items: center; gap: 14px; min-width: 0; }
      .hsop-emoji { width: 42px; height: 42px; border-radius: 11px; flex-shrink: 0; font-size: 20px; display: grid; place-items: center; background: var(--surface-2); border: 1px solid var(--border); }
      .hsop-l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
      .hsop-rt { font-family: var(--font-display); font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
      .hsop-rd { color: var(--text-muted); font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hsop-r { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .hsop-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 4px 9px; border-radius: 999px; color: var(--brand-text); background: var(--brand-tint); }
      .hsop-tag svg { width: 11px; height: 11px; fill: var(--brand-text); }
      .hsop-arrow svg { width: 17px; height: 17px; stroke: var(--text-faint); fill: none; transition: stroke .16s, transform .16s; }
      .hsop-row:hover .hsop-arrow svg { stroke: var(--brand-text); transform: translateX(3px); }
      .hsop-empty { text-align: center; color: var(--text-muted); padding: 60px 0; font-size: 14px; }
      .hsop-back { display: inline-flex; align-items: center; gap: 7px; color: var(--text-muted); font-size: 13.5px; font-weight: 500; text-decoration: none; margin-bottom: 22px; }
      .hsop-back:hover { color: var(--brand-text); }
      .hsop-back svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 2; }
      .hsop-detail-head { display: flex; align-items: center; gap: 16px; }
      .hsop-detail-emoji { width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0; font-size: 27px; display: grid; place-items: center; background: var(--surface-2); border: 1px solid var(--border); }
      .hsop-kicker { color: var(--brand-text); font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
      .hsop-detail-head h1 { font-family: var(--font-display); font-size: 28px; font-weight: 600; letter-spacing: -0.03em; margin-top: 4px; }
      .hsop-video { margin: 26px 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--surface); }
      .hsop-video iframe { width: 100%; aspect-ratio: 16/9; border: 0; display: block; }
      .hsop-video .ph { aspect-ratio: 16/9; display: grid; place-items: center; gap: 12px; background: var(--surface-2); color: var(--text-muted); }
      .hsop-video .play { width: 58px; height: 58px; border-radius: 50%; background: var(--brand); display: grid; place-items: center; box-shadow: 0 8px 30px rgba(77,187,131,0.35); }
      .hsop-video .play svg { width: 23px; height: 23px; fill: var(--brand-fg); margin-left: 3px; }
      .hsop-prose { color: var(--text); font-size: 15.5px; line-height: 1.7; max-width: 760px; }
      .hsop-prose h2 { font-family: var(--font-display); color: var(--text); font-size: 19px; font-weight: 600; letter-spacing: -0.01em; margin: 24px 0 10px; }
      .hsop-prose h2:first-child { margin-top: 0; }
      .hsop-prose ul, .hsop-prose ol { margin: 8px 0 8px 2px; padding-left: 22px; }
      .hsop-prose li { margin: 6px 0; color: var(--text-muted); }
      .hsop-prose li::marker { color: var(--brand-text); }
      .hsop-prose strong { color: var(--text); }
      .hsop-prose code { background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; padding: 1px 6px; font-size: 13.5px; color: var(--brand-text); }
    `}</style>
  );
}
