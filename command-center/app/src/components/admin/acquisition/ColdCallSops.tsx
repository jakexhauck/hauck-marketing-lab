import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { useColdCallAssetsQuery } from "../../../hooks/useColdCallAssets";
import { groupByCategory } from "../../../../functions/lib/coldCallAssets";

// Cold Call > SOPs: how the job is done, for whoever is doing it.
//
// LEFT side of the strip, so a cold caller sees it. The owner writes these
// under Management > SOPs; this page is the reading side and has no edit
// control at all. That is not only a permission (the API refuses a non-owner
// write on its own account): a page that offers an edit button it will then
// refuse is worse than one that never offered it.
//
// A page rather than the floating panel on purpose. The panel is for the thing
// you need WHILE someone is on the line; an SOP is read before the first dial
// and returned to between calls, and it is usually longer than a panel wants to
// be.
//
// Contents rail on the left, one document open at a time on the right. An SOP
// nobody can find is an SOP nobody follows.
export default function ColdCallSops() {
  const query = useColdCallAssetsQuery();
  const [openId, setOpenId] = useState<string | null>(null);

  const sops = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.kind === "sop" && !a.archivedAt),
    [query.data],
  );
  const groups = useMemo(() => groupByCategory(sops), [sops]);

  // Default to the first document rather than to an empty pane: landing on
  // "pick something" wastes the one click that matters.
  const selected = sops.find((s) => s.id === openId) ?? sops[0] ?? null;

  if (query.isLoading) return <div className="pk-empty">Loading SOPs...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the SOPs. Reload to try again.</div>;
  }
  if (sops.length === 0) {
    return (
      <div className="pk-empty">
        No SOPs yet. Jake writes these, and they appear here the moment he saves one.
      </div>
    );
  }

  return (
    <div className="ccsop">
      <SopStyle />

      <nav className="ccsop-rail" aria-label="SOPs">
        {groups.map((group) => (
          <div key={group.category} className="ccsop-group">
            <h3 className="ccsop-cat">{group.category}</h3>
            <ul>
              {group.items.map((sop) => (
                <li key={sop.id}>
                  <button
                    type="button"
                    className={`ccsop-item${selected?.id === sop.id ? " on" : ""}`}
                    aria-current={selected?.id === sop.id}
                    onClick={() => setOpenId(sop.id)}
                  >
                    {sop.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <article className="ccsop-doc">
        {selected && (
          <>
            <header className="ccsop-head">
              <span className="ccsop-badge">
                <BookOpen size={13} aria-hidden />
                {selected.category || "SOP"}
              </span>
              <h2 className="ccsop-title">{selected.name}</h2>
            </header>
            {selected.html.trim() ? (
              // Sanitized server-side on every write (functions/lib/setterScript.ts),
              // which is the same boundary the dialing script and the mid-call
              // shelf are rendered through.
              <div
                className="ccsop-body"
                dangerouslySetInnerHTML={{ __html: selected.html }}
              />
            ) : (
              <p className="ccsop-blank">
                This one has not been written yet. Jake writes these.
              </p>
            )}
          </>
        )}
      </article>
    </div>
  );
}

function SopStyle() {
  return (
    <style>{`
      .ccsop { display: flex; gap: 22px; align-items: flex-start; }

      .ccsop-rail { flex: 0 0 216px; position: sticky; top: 0; }
      .ccsop-group + .ccsop-group { margin-top: 18px; }
      .ccsop-cat { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); margin: 0 0 7px; }
      .ccsop-rail ul { list-style: none; margin: 0; padding: 0; }
      .ccsop-item { display: block; width: 100%; text-align: left; border: 0; background: transparent; border-left: 2px solid var(--divider); padding: 7px 12px; font: inherit; font-size: 13.5px; color: var(--text-muted); cursor: pointer; transition: color .14s, border-color .14s; }
      .ccsop-item:hover { color: var(--text); }
      .ccsop-item.on { color: var(--brand-text); border-left-color: var(--brand); font-weight: 600; }

      .ccsop-doc { flex: 1 1 auto; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 26px 30px; }
      .ccsop-head { margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--divider); }
      .ccsop-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--brand-text); background: var(--brand-tint); border-radius: 999px; padding: 3px 10px; }
      .ccsop-title { font-family: var(--font-display); font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: var(--text); margin: 10px 0 0; line-height: 1.25; }

      /* Long-form reading: wider line height and a capped measure, since an SOP
         is read start to finish rather than scanned like the mid-call shelf. */
      .ccsop-body { max-width: 68ch; font-size: 14.5px; line-height: 1.7; color: var(--text-muted); }
      .ccsop-body h1, .ccsop-body h2, .ccsop-body h3 { font-family: var(--font-display); color: var(--text); line-height: 1.3; margin: 24px 0 8px; }
      .ccsop-body h1 { font-size: 20px; }
      .ccsop-body h2 { font-size: 17px; }
      .ccsop-body h3 { font-size: 15px; }
      .ccsop-body p { margin: 0 0 13px; }
      .ccsop-body ul, .ccsop-body ol { margin: 0 0 13px; padding-left: 22px; }
      .ccsop-body li { margin: 5px 0; }
      .ccsop-body li::marker { color: var(--brand); }
      .ccsop-body a { color: var(--brand-text); }
      .ccsop-body strong { color: var(--text); font-weight: 600; }
      .ccsop-blank { color: var(--text-faint); font-size: 13.5px; margin: 0; }

      /* On a phone the rail becomes a scrolling chip row above the document,
         rather than a 216px column eating half the width. */
      @media (max-width: 860px) {
        .ccsop { flex-direction: column; }
        .ccsop-rail { position: static; flex: none; width: 100%; display: flex; gap: 18px; overflow-x: auto; padding-bottom: 4px; }
        .ccsop-group + .ccsop-group { margin-top: 0; }
        .ccsop-rail ul { display: flex; gap: 6px; }
        .ccsop-item { white-space: nowrap; border-left: 0; border-bottom: 2px solid var(--divider); padding: 6px 10px; }
        .ccsop-item.on { border-bottom-color: var(--brand); }
        .ccsop-doc { padding: 20px; }
      }
    `}</style>
  );
}
