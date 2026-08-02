import { useState } from "react";
import { ChevronRight, Folder, Link2, Search } from "lucide-react";
import { useCreativesBrowseQuery } from "../../../../hooks/useApi";

// Choosing which Drive folder holds a client's ad creatives.
//
// Two steps, and the first one usually is not shown: connect the agency Google
// account (once, ever), then walk to the folder and pick it.
//
// This replaced a box you pasted a Drive URL into. Pasting worked, but it made
// the operator leave the app, find the folder, copy an address whose shape
// differs depending on whether it came from the address bar or the share menu,
// and paste something unverifiable: a typo saved silently and only surfaced as a
// client-facing 404. Walking a real folder tree cannot produce a folder that
// does not exist.
//
// The paste box survives as an escape hatch, because the picker walks My Drive
// and a folder shared INTO the agency account from a client's own Drive is not
// under it.

interface Crumb {
  id: string;
  name: string;
}

// Drive's alias for My Drive, so the picker opens without looking an id up.
const ROOT: Crumb = { id: "root", name: "My Drive" };

export default function CreativesWizard({
  tenantId,
  saving,
  onChoose,
  onPaste,
  error,
}: {
  tenantId: string;
  saving: boolean;
  onChoose: (folderId: string) => void;
  onPaste: (folderUrl: string) => void;
  error: string | null;
}) {
  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [search, setSearch] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasted, setPasted] = useState("");

  const here = trail[trail.length - 1]!;
  const query = useCreativesBrowseQuery(here.id, search);
  const data = query.data;
  const searching = search.trim().length > 0;

  // Step one. Nothing else on this panel can work until the grant exists, so it
  // replaces the picker rather than sitting above it.
  if (data && !data.connected) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <h3 className="text-[14px] font-semibold text-text">Connect Google Drive</h3>
        <p className="mt-1 max-w-prose text-[13px] leading-snug text-muted">
          Connect the agency Google account once, then pick each client's creatives folder from a
          list instead of pasting links. This is the same connection the SOP Hub uses.
        </p>
        <a
          href={`/api/admin/ads/creatives-connect?client=${encodeURIComponent(tenantId)}`}
          className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-colors hover:border-brand hover:text-brand"
        >
          <Link2 size={15} aria-hidden />
          Connect Google Drive
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13.5px] font-semibold text-text">Choose the creatives folder</h3>
        {data?.email && <span className="text-[11.5px] text-faint">{data.email}</span>}
      </div>

      <label className="relative mt-3 block">
        <Search
          size={15}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all folders by name"
          aria-label="Search folders"
          className="w-full rounded-[var(--radius)] border border-border bg-surface-2 py-2 pl-9 pr-3 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
        />
      </label>

      {/* Breadcrumbs double as the way back up: clicking one truncates the trail
          to it. Hidden while searching, because a search result is not a
          position in the tree and pretending otherwise would make Up lie. */}
      {!searching && (
        <nav className="mt-3 flex flex-wrap items-center gap-1 text-[12px]" aria-label="Folder path">
          {trail.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-faint" aria-hidden />}
              <button
                type="button"
                onClick={() => setTrail((t) => t.slice(0, i + 1))}
                disabled={i === trail.length - 1}
                className="rounded px-1 py-0.5 font-medium text-muted hover:text-brand disabled:text-text disabled:hover:text-text"
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className="mt-3 max-h-72 overflow-y-auto rounded-[var(--radius)] border border-border">
        {query.isLoading && !data ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted">Reading Drive...</p>
        ) : data?.error ? (
          <p className="px-3 py-6 text-center text-[13px] text-danger">{data.error}</p>
        ) : (data?.folders.length ?? 0) === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted">
            {searching ? "No folders match that name." : "This folder has no sub-folders."}
          </p>
        ) : (
          <ul>
            {data!.folders.map((f) => (
              <li key={f.id} className="flex items-center gap-2 border-b border-border/60 last:border-b-0">
                {/* Opening a folder and choosing it are different actions, so
                    they are different controls. One button that did both would
                    make every drill-down a commitment. */}
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setTrail((t) => [...t, { id: f.id, name: f.name }]);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-[13px] text-text hover:bg-surface-2"
                >
                  <Folder size={15} className="shrink-0 text-faint" aria-hidden />
                  <span className="truncate">{f.name}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChoose(f.id)}
                  disabled={saving}
                  className="mr-2 shrink-0 rounded-[var(--radius)] border border-border px-2.5 py-1 text-[12px] font-semibold text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Choosing the folder you are standing in, which is otherwise
          unreachable: the list shows a folder's CHILDREN, so the last folder on
          a branch can only be picked from inside it. */}
      {!searching && trail.length > 1 && (
        <button
          type="button"
          onClick={() => onChoose(here.id)}
          disabled={saving}
          className="mt-3 w-full rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
        >
          {saving ? "Saving..." : `Use "${here.name}"`}
        </button>
      )}

      {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowPaste((v) => !v)}
          className="text-[12px] font-medium text-muted hover:text-brand"
        >
          {showPaste ? "Hide link box" : "Paste a link instead"}
        </button>

        {showPaste && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onPaste(pasted);
            }}
            className="mt-2 flex flex-col gap-2 sm:flex-row"
          >
            <input
              type="url"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              aria-label="Drive folder link"
              className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving || !pasted.trim()}
              className="shrink-0 rounded-[var(--radius)] border border-border bg-surface-2 px-4 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-50"
            >
              Save
            </button>
          </form>
        )}
        {showPaste && (
          <p className="mt-2 text-[12px] text-faint">
            For a folder shared into the agency account from someone else's Drive, which the picker
            above cannot walk to.
          </p>
        )}
      </div>
    </div>
  );
}
