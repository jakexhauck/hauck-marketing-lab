import { useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import { useColdCallAssetsQuery } from "../../../hooks/useColdCallAssets";
import { groupByCategory } from "../../../../functions/lib/coldCallAssets";
import { assetHtml, useDriveDocs } from "../../../hooks/useDriveDoc";

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
// One document at full width, picked from a dropdown above it, rather than a
// contents rail down the side. An SOP is read start to finish, so the reading
// surface gets the whole column and the navigation costs one click only when
// somebody actually wants a different document.
//
// Since 0077 the words come from Google Docs. Jake lists which documents belong
// here under Management > SOPs; this page renders them through the SOP Hub's own
// doc endpoint. A document he has not repointed yet still shows the text it
// already had, which is why nothing here went blank on the day that shipped.
export default function ColdCallSops() {
  const query = useColdCallAssetsQuery();
  const [openId, setOpenId] = useState<string | null>(null);

  const sops = useMemo(
    () => (query.data?.assets ?? []).filter((a) => a.kind === "sop" && !a.archivedAt),
    [query.data],
  );
  const groups = useMemo(() => groupByCategory(sops), [sops]);
  const driveDocs = useDriveDocs(sops.map((s) => s.driveFileId));

  // Default to the first document rather than to an empty pane: landing on
  // "pick something" wastes the one click that matters.
  const selected = sops.find((s) => s.id === openId) ?? sops[0] ?? null;
  const doc = assetHtml(selected, driveDocs);

  if (query.isLoading) return <div className="pk-empty">Loading SOPs...</div>;
  if (query.isError) {
    return <div className="pk-empty">Could not load the SOPs. Reload to try again.</div>;
  }
  if (sops.length === 0) {
    return (
      <div className="pk-empty">
        No SOPs yet. Jake lists them under Management &gt; SOPs and they appear here.
      </div>
    );
  }

  return (
    <div className="ccsop">
      <SopStyle />

      <div className="ccsop-bar">
        <label className="ccsop-pick">
          <span className="ccsop-picklabel">SOP</span>
          <select
            className="pk-select pk-select-pill"
            value={selected?.id ?? ""}
            onChange={(e) => setOpenId(e.target.value)}
            aria-label="Which SOP to read"
          >
            {/* Grouped by the owner's own headings. optgroup rather than a
                flat list so a growing set stays findable. */}
            {groups.map((group) => (
              <optgroup key={group.category} label={group.category}>
                {group.items.map((sop) => (
                  <option key={sop.id} value={sop.id}>
                    {sop.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <span className="ccsop-count">
          {sops.length} {sops.length === 1 ? "document" : "documents"}
        </span>
      </div>

      {selected && (
        <article className="ccsop-doc">
          <header className="ccsop-head">
            <span className="ccsop-badge">
              <BookOpen size={13} aria-hidden />
              {selected.category || "SOP"}
            </span>
            <h2 className="ccsop-title">{selected.name}</h2>
          </header>

          {doc.loading ? (
            <p className="ccsop-blank">Opening the document...</p>
          ) : doc.error ? (
            <p className="ccsop-blank">
              Could not open this one from Google Drive. It may have been renamed
              or moved out of the SOP folder.
            </p>
          ) : doc.html.trim() ? (
            // Sanitized server-side either way: the stored column through
            // setterScript.ts on write, a Drive export through sopHtml.ts on
            // render. Nothing reaches here that has not been through one of them.
            <div className="ccsop-body" dangerouslySetInnerHTML={{ __html: doc.html }} />
          ) : (
            <p className="ccsop-blank">
              This one has not been pointed at a document yet. Jake does that.
            </p>
          )}
        </article>
      )}
    </div>
  );
}

function SopStyle() {
  return (
    <style>{`
      .ccsop-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
      .ccsop-pick { display: inline-flex; align-items: center; gap: 9px; }
      .ccsop-picklabel { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); }
      .ccsop-count { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); }

      /* The document owns the whole column. */
      .ccsop-doc { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); padding: 38px 52px 46px; }

      .ccsop-head { margin-bottom: 26px; padding-bottom: 20px; border-bottom: 1px solid var(--divider); }
      .ccsop-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--brand-text); background: var(--brand-tint); border-radius: 999px; padding: 3px 10px; }
      .ccsop-title { font-family: var(--font-display); font-size: 27px; font-weight: 600; letter-spacing: -0.015em; color: var(--text); margin: 13px 0 0; line-height: 1.2; }

      /* Long-form reading. The measure is capped generously rather than tightly:
         the document has the full width, and a cap this wide only bites on a
         very large monitor, where an uncapped line would run past what an eye
         can track back from. */
      .ccsop-body { max-width: 92ch; font-size: 15px; line-height: 1.75; color: var(--text-muted); }
      .ccsop-body > *:first-child { margin-top: 0; }
      .ccsop-body h1, .ccsop-body h2, .ccsop-body h3 { font-family: var(--font-display); color: var(--text); line-height: 1.3; font-weight: 600; margin: 30px 0 10px; }
      .ccsop-body h1 { font-size: 21px; }
      .ccsop-body h2 { font-size: 18px; }
      .ccsop-body h3 { font-size: 15.5px; }
      .ccsop-body p { margin: 0 0 15px; }
      .ccsop-body ul, .ccsop-body ol { margin: 0 0 15px; padding-left: 24px; }
      .ccsop-body li { margin: 7px 0; }
      .ccsop-body li::marker { color: var(--brand); font-weight: 600; }
      .ccsop-body a { color: var(--brand-text); }
      .ccsop-body strong { color: var(--text); font-weight: 600; }
      .ccsop-body blockquote { margin: 0 0 15px; padding: 2px 0 2px 16px; border-left: 3px solid var(--brand); color: var(--text); }
      .ccsop-blank { color: var(--text-faint); font-size: 13.5px; margin: 0; }

      /* A phone does not have a column to give away, so the padding comes back
         to something a thumb-width screen can carry. */
      @media (max-width: 860px) {
        .ccsop-doc { padding: 24px 20px 30px; }
        .ccsop-title { font-size: 22px; }
      }

      /* Printing an SOP is a real thing somebody does on their first day. */
      @media print {
        .ccsop-bar { display: none; }
        .ccsop-doc { border: 0; box-shadow: none; padding: 0; }
        .ccsop-body { max-width: none; color: #000; }
      }
    `}</style>
  );
}
