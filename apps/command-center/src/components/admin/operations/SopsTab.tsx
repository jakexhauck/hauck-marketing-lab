import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, ExternalLink, FileText, Folder, ArrowLeft, Paperclip, Search } from "lucide-react";
import { useSopHub } from "../../../hooks/useSopHub";
import { buildGroups, flagKey } from "../../../lib/sopTriage";
import {
  allFolders,
  catTrail,
  docSections,
  folderAt,
  treeTotalSops,
  type SopCategory,
  type SopDocResponse,
  type SopEntry,
  type SopFolder,
  type SopTree,
} from "../../../lib/sopHub";

// The Operations pillar's SOPs tab.
//
// Content lives in the agency's Google Drive folder, not in this repo: each
// subfolder is a folder here, each Google Doc is an SOP. Adding an SOP means
// creating a Doc, so nothing here is seeded and nothing needs a deploy. Drive is
// the only place SOPs are authored; this tab reads and never writes.
//
// It BROWSES the folder tree rather than listing it flat. Flat put all 25 folders
// on screen at once, which meant "Day 2: Find The Right People" sat as a sibling
// of "Client Sales" and the two top-level folders Jake actually thinks in, Agency
// and Client, were nowhere. So the top level is his two folders, and you open
// them.
//
// Search is the exception and ignores where you are: looking for a script you
// half remember is the one time the hierarchy is in the way, so a query flattens
// the whole tree and every hit says which folder it came from.
//
// The kicker, title, tagline and pillar tab bar come from PillarPage, so this
// renders only the search row and the browser. Opening an SOP swaps the list for
// the reader in place; the tab bar has no nested routes.
//
// The tree refreshes itself while this tab is open (see useSopHub), so nothing
// here holds a folder or SOP object: it stores keys and re-resolves them against
// the current tree on every render. A path that stops resolving means Drive moved
// something, which is said out loud rather than rendered blank.
//
// Nothing here fabricates data: an unconnected Drive says exactly that, and an
// empty folder is shown as an empty folder rather than hidden, because it is
// structure Jake made and the app should not disagree with Drive about what
// exists.

// Begins Google consent for the one agency account, brokered by Composio. Not
// the agency's own OAuth client: that one's consent screen is in Testing, so it
// answered "access_denied, developer-approved testers only" and would have
// expired the grant weekly even after adding the tester. Composio's Google app
// is already verified, and it accepts a callback on any origin, so this works
// unchanged on localhost.
const CONNECT_URL = "/api/admin/sops/connect";
// The Google account that owns the SOPs folder. Any other account consents
// happily and then 403s on every read, so the notices name it outright rather
// than saying "the right one".
const OWNER_ACCOUNT = "contact.jakehauck@gmail.com";

// Loose Docs at the root of the SOP folder belong to no subfolder. They are
// presented as one, keyed "general", which is the key their triage ticks were
// already written against.
function rootAsFolder(tree: SopTree): SopFolder {
  return {
    key: "general",
    name: "General",
    trail: [],
    sops: tree.sops,
    attachments: tree.attachments,
    folders: [],
    totalSops: tree.sops.length,
    totalFiles: tree.attachments.length,
  };
}

export default function SopsTab() {
  const {
    tree,
    status,
    loading,
    error,
    connectedEmail,
    considered,
    toggleFlag,
    docs,
    docLoading,
    docError,
    openDoc,
  } = useSopHub();
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  // Where in the tree we are, as folder keys. Keys, not objects: the tree
  // refetches underneath an open folder.
  const [path, setPath] = useState<string[]>([]);
  const [reading, setReading] = useState<{ catKey: string; slug: string } | null>(null);
  // The Google OAuth callback lands back here, so a failed consent reports the
  // reason rather than showing a bare "not connected" the admin has to guess at.
  const [searchParams] = useSearchParams();
  const connectError = searchParams.get("connect_error");

  const searching = query.trim().length > 0 || selectedOnly;

  // Every folder that holds anything, for search and for resolving the reader.
  // Search deliberately ignores `path`.
  const flat = useMemo(() => {
    const list = allFolders(tree);
    return tree.sops.length > 0 ? [rootAsFolder(tree), ...list] : list;
  }, [tree]);

  const groups = useMemo(
    () => (searching ? buildGroups(flat, query, considered, selectedOnly) : []),
    [searching, flat, query, considered, selectedOnly],
  );

  // The folder being browsed. null at the top level; null WITH a path set means
  // Drive renamed or removed it underneath us.
  const current = useMemo(() => (path.length > 0 ? folderAt(tree, path) : null), [tree, path]);
  const lost = path.length > 0 && current === null && !loading;

  // The SOP being read, resolved against the tree as it stands right now. Null
  // while reading is set means the Doc left the folder.
  const readingPair = useMemo(() => {
    if (!reading) return null;
    const cat = flat.find((c) => c.key === reading.catKey);
    const sop = cat?.sops.find((s) => s.slug === reading.slug);
    return cat && sop ? { cat, sop } : null;
  }, [reading, flat]);

  // Opens the Doc, and re-renders it whenever Drive reports a newer
  // modifiedTime. A cache hit is a no-op, so the first open and every live
  // update run through one path.
  const readingFileId = readingPair?.sop.fileId;
  const readingModified = readingPair?.sop.modifiedTime ?? null;
  useEffect(() => {
    if (!readingFileId) return;
    void openDoc(readingFileId, readingModified);
  }, [readingFileId, readingModified, openDoc]);

  const open = (cat: SopCategory, sop: SopEntry) => {
    setReading({ catKey: cat.key, slug: sop.slug });
  };

  if (reading) {
    return (
      <div className="sop">
        <SopsStyle />
        {readingPair ? (
          <SopReader
            cat={readingPair.cat}
            sop={readingPair.sop}
            doc={docs[readingPair.sop.fileId]}
            loading={docLoading === readingPair.sop.fileId}
            error={docError}
            onBack={() => setReading(null)}
          />
        ) : (
          <>
            <div className="sop-readerbar">
              <button type="button" className="sop-back" onClick={() => setReading(null)}>
                <ArrowLeft size={15} strokeWidth={2.4} />
                All SOPs
              </button>
            </div>
            <div className="sop-state">
              {loading ? "Loading SOPs from Drive" : "That SOP is no longer in the Drive folder."}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sop">
      <SopsStyle />

      {connectError && (
        <div className="sop-setup sop-failed">
          <h3>Connecting Google failed</h3>
          <p>
            Google returned <code>{connectError}</code>. Start the connect again, and make sure you pick{" "}
            <code>{OWNER_ACCOUNT}</code>, the account that owns the SOPs folder.
          </p>
          <ConnectButton label="Try connecting again" />
        </div>
      )}

      {status !== "ok" ? (
        <div className="sop-setup">
          <SetupNotice status={status} error={error} connectedEmail={connectedEmail} />
        </div>
      ) : loading && tree.folders.length === 0 ? (
        <div className="sop-state">Loading SOPs from Drive</div>
      ) : tree.folders.length === 0 && tree.sops.length === 0 ? (
        <div className="sop-state">
          That Drive folder is empty. Add a folder or a Google Doc and it appears here.
        </div>
      ) : (
        <>
          <div className="sop-controls">
            <label className="sop-search">
              <Search size={15} strokeWidth={2.2} />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every SOP"
                aria-label="Search every SOP"
              />
            </label>
            <button
              type="button"
              className={`sop-toggle${selectedOnly ? " on" : ""}`}
              onClick={() => setSelectedOnly((v) => !v)}
              aria-pressed={selectedOnly}
            >
              Ticked only
            </button>
            <div className="sop-count">
              {treeTotalSops(tree)} SOPs, {considered.size} ticked
              {connectedEmail && <span className="sop-acct"> · Drive: {connectedEmail}</span>}
            </div>
          </div>

          {searching ? (
            // Search ignores the folder you are in, so each hit names its folder.
            groups.length === 0 ? (
              <div className="sop-state">
                {selectedOnly && !query.trim()
                  ? "Nothing is ticked yet."
                  : "Nothing matches that search."}
              </div>
            ) : (
              groups.map(({ cat, sops }) => (
                <div className="sop-card" key={cat.key}>
                  <div className="sop-cathead static">
                    <span className="sop-catwrap">
                      {catTrail(cat).length > 0 && (
                        <span className="sop-cattrail">{catTrail(cat).join(" › ")}</span>
                      )}
                      <span className="sop-catname">{cat.name}</span>
                    </span>
                    <span className="sop-catmeta">
                      {sops.length} {sops.length === 1 ? "match" : "matches"}
                    </span>
                  </div>
                  <SopRows
                    cat={cat}
                    sops={sops}
                    considered={considered}
                    onToggle={toggleFlag}
                    onOpen={open}
                  />
                </div>
              ))
            )
          ) : lost ? (
            <>
              <Crumbs path={path} tree={tree} onGo={setPath} />
              <div className="sop-state">
                That folder is no longer in Drive. It may have been renamed or moved.
              </div>
            </>
          ) : (
            <>
              <Crumbs path={path} tree={tree} onGo={setPath} />

              {(() => {
                const folders = current ? current.folders : tree.folders;
                const sops = current ? current.sops : tree.sops;
                const attachments = current ? current.attachments : tree.attachments;
                const bare = folders.length === 0 && sops.length === 0 && attachments.length === 0;

                return (
                  <>
                    {folders.length > 0 && (
                      <div className="sop-grid">
                        {folders.map((f) => (
                          <button
                            key={f.key}
                            type="button"
                            className="sop-folder"
                            onClick={() => setPath([...path, f.key])}
                          >
                            <Folder size={17} strokeWidth={2} className="sop-fico" />
                            <span className="sop-fname">{f.name}</span>
                            <span className="sop-fmeta">{folderSummary(f)}</span>
                            <ChevronRight size={16} strokeWidth={2.4} className="sop-fchev" />
                          </button>
                        ))}
                      </div>
                    )}

                    {sops.length > 0 && (
                      <div className="sop-card">
                        {folders.length > 0 && (
                          <div className="sop-cathead static">
                            <span className="sop-catwrap">
                              <span className="sop-catname">
                                {current ? `In ${current.name}` : "Loose in the SOPs folder"}
                              </span>
                            </span>
                            <span className="sop-catmeta">
                              {sops.length} {sops.length === 1 ? "SOP" : "SOPs"}
                            </span>
                          </div>
                        )}
                        <SopRows
                          cat={current ?? rootAsFolder(tree)}
                          sops={sops}
                          considered={considered}
                          onToggle={toggleFlag}
                          onOpen={open}
                        />
                      </div>
                    )}

                    {attachments.length > 0 && (
                      <div className="sop-attach card">
                        <Paperclip size={13} strokeWidth={2.2} />
                        {attachments.map((a) => (
                          <a key={a.id} href={a.webViewLink ?? "#"} target="_blank" rel="noopener noreferrer">
                            {a.name}
                          </a>
                        ))}
                      </div>
                    )}

                    {bare && (
                      <div className="sop-state">
                        This folder is empty in Drive. Add a Doc to it and it appears here.
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}

// What a folder card says it holds. Counts are rolled up from the whole subtree,
// so "Agency SOPS" reads as its contents rather than as the zero Docs sitting
// directly in it.
function folderSummary(f: SopFolder): string {
  const bits: string[] = [];
  if (f.totalSops > 0) bits.push(`${f.totalSops} ${f.totalSops === 1 ? "SOP" : "SOPs"}`);
  if (f.totalFiles > 0) bits.push(`${f.totalFiles} ${f.totalFiles === 1 ? "file" : "files"}`);
  if (bits.length === 0) return f.folders.length > 0 ? `${f.folders.length} folders` : "Empty";
  if (f.folders.length > 0) bits.push(`${f.folders.length} folders`);
  return bits.join(" · ");
}

// Where you are, and a way back up. Names come from the resolved folders rather
// than the keys, which are slugified and would read "agency-sops".
function Crumbs({
  path,
  tree,
  onGo,
}: {
  path: string[];
  tree: SopTree;
  onGo: (p: string[]) => void;
}) {
  if (path.length === 0) return null;
  const steps = path.map((_, i) => ({
    keys: path.slice(0, i + 1),
    name: folderAt(tree, path.slice(0, i + 1))?.name ?? path[i],
  }));
  return (
    <nav className="sop-crumbs" aria-label="Folder path">
      <button type="button" onClick={() => onGo([])}>
        <ArrowLeft size={14} strokeWidth={2.4} />
        All SOPs
      </button>
      {steps.map((s, i) => (
        <span key={s.keys.join("/")} className="sop-crumb">
          <ChevronRight size={13} strokeWidth={2.4} />
          {i === steps.length - 1 ? (
            <b>{s.name}</b>
          ) : (
            <button type="button" onClick={() => onGo(s.keys)}>
              {s.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

// The SOP rows for one folder: tick box, title, video marker.
function SopRows({
  cat,
  sops,
  considered,
  onToggle,
  onOpen,
}: {
  cat: SopCategory;
  sops: readonly SopEntry[];
  considered: ReadonlySet<string>;
  onToggle: (catKey: string, slug: string) => Promise<void>;
  onOpen: (cat: SopCategory, sop: SopEntry) => void;
}) {
  return (
    <ul className="sop-list">
      {sops.map((sop) => (
        <li className="sop-row" key={sop.slug}>
          <input
            type="checkbox"
            className="sop-chk"
            checked={considered.has(flagKey(cat.key, sop.slug))}
            onChange={() => void onToggle(cat.key, sop.slug)}
            aria-label={`Tick ${sop.title}`}
          />
          <button type="button" className="sop-title" onClick={() => onOpen(cat, sop)}>
            <FileText size={15} strokeWidth={2} />
            {sop.title}
          </button>
          {sop.videoId && <span className="sop-tag">Video</span>}
        </li>
      ))}
    </ul>
  );
}

// A plain link rather than a fetch: the endpoint answers with a 302 to Google's
// consent screen, which only the browser can follow. The admin session cookie
// rides along on the navigation, which is what authorises the route.
function ConnectButton({ label }: { label: string }) {
  return (
    <a className="sop-connect" href={CONNECT_URL}>
      {label}
      <ExternalLink size={13} strokeWidth={2.2} />
    </a>
  );
}

// Each failure has a different fix, so each gets its own instruction rather than
// a shared "something went wrong". The two that a click can fix carry the button
// that fixes them: the connect flow used to live on an Assets page that no
// longer exists, which left the only route in an API URL typed by hand.
function SetupNotice({
  status,
  error,
  connectedEmail,
}: {
  status: string;
  error: string | null;
  connectedEmail: string | null;
}) {
  if (status === "not_configured") {
    return (
      <>
        <h3>SOP folder not set</h3>
        <p>
          Set <code>SOP_DRIVE_FOLDER_ID</code> to the Drive folder holding the SOPs, then reload. Until then
          this tab has nothing to read.
        </p>
      </>
    );
  }
  if (status === "not_connected") {
    return (
      <>
        <h3>Google Drive is not connected</h3>
        <p>
          SOPs live in Drive, and no Google account is linked yet. Connect as <code>{OWNER_ACCOUNT}</code>,
          the account that owns the SOPs folder. Any other account will sign in and then be refused on
          every read.
        </p>
        <ConnectButton label="Connect Google Drive" />
      </>
    );
  }
  if (status === "no_access") {
    return (
      <>
        <h3>That account cannot see the SOP folder</h3>
        <p>
          Drive returned a 403{connectedEmail ? <> for <code>{connectedEmail}</code></> : null}. That account
          does not own the SOPs folder. Reconnect as <code>{OWNER_ACCOUNT}</code>.
        </p>
        <ConnectButton label="Reconnect Google Drive" />
      </>
    );
  }
  return (
    <>
      <h3>Could not load SOPs</h3>
      <p>{error ?? "Drive did not answer."}</p>
    </>
  );
}

// A slug for a section anchor. Index-suffixed because two tabs can share a
// title and an anchor has to be unique on the page.
function sectionId(title: string | null, i: number): string {
  const base = (title ?? "section")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `sop-${base || "section"}-${i}`;
}

function SopReader({
  cat,
  sop,
  doc,
  loading,
  error,
  onBack,
}: {
  cat: SopCategory;
  sop: SopEntry;
  doc: SopDocResponse | undefined;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  const sections = docSections(doc);
  // Only worth a contents rail when there is more than one tab to jump between.
  // A single-tab Doc gets the page and nothing else, which is the point of the
  // layout: it should read like a document, not a dashboard.
  const contents = sections.filter((s) => s.title).map((s, i) => ({ ...s, id: sectionId(s.title, i) }));
  const hasContents = contents.length > 1;
  const empty = sections.length > 0 && sections.every((s) => s.html.trim() === "");

  return (
    <div className="sop-reader">
      <div className="sop-readerbar">
        {/* "Back", not "All SOPs": closing the reader returns you to the folder you
            opened it from, which is not the top of the tree. */}
        <button type="button" className="sop-back" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2.4} />
          Back
        </button>
        {sop.webViewLink && (
          <a className="sop-open" href={sop.webViewLink} target="_blank" rel="noopener noreferrer">
            Edit in Drive
            <ExternalLink size={13} strokeWidth={2.2} />
          </a>
        )}
      </div>

      <div className={hasContents ? "sop-shell has-toc" : "sop-shell"}>
        <article className="sop-page">
          <div className="sop-kicker">
            {catTrail(cat).length > 0 ? `${catTrail(cat).join(" › ")} › ${cat.name}` : cat.name}
          </div>
          <h2 className="sop-h">{doc?.title ?? sop.title}</h2>

          {sop.videoId && (
            <div className="sop-video">
              {/* Drive's own player: the file is an .mp4 in the same folder, not a hosted embed. */}
              <iframe
                src={`https://drive.google.com/file/d/${sop.videoId}/preview`}
                allow="autoplay"
                title={`${sop.title} video`}
              />
            </div>
          )}

          {error ? (
            <div className="sop-state">{error}</div>
          ) : loading ? (
            <div className="sop-state">Opening the Doc</div>
          ) : !doc ? (
            <div className="sop-state">Nothing to show.</div>
          ) : empty ? (
            <div className="sop-state">
              That Doc is empty. Write the steps in Drive and they appear here.
            </div>
          ) : (
            sections.map((s, i) => (
              <section key={sectionId(s.title, i)} id={sectionId(s.title, i)} className="sop-sec">
                {/* A tab title is the Doc's own structure, so it is shown as a
                    real heading rather than a UI chrome label. */}
                {s.title && (
                  <h3 className={s.depth > 0 ? "sop-sech sub" : "sop-sech"}>{s.title}</h3>
                )}
                {/* Sanitized server-side by functions/lib/sopHtml.ts, which strips
                    scripts, event handlers and unsafe hrefs to a tag allowlist. */}
                <div className="sop-body" dangerouslySetInnerHTML={{ __html: s.html }} />
              </section>
            ))
          )}
        </article>

        {hasContents && (
          <nav className="sop-toc" aria-label="Tabs in this SOP">
            <b>In this SOP</b>
            {contents.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={s.depth > 0 ? "sub" : undefined}>
                {s.title}
              </a>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function SopsStyle() {
  return (
    <style>{`
.pk-kit .sop {
  --sop-line: var(--border);
  /* The logo green. Used sparingly and structurally: the page rail, list markers,
     the contents rail on hover. Never on body text, which has to stay at full
     contrast for long-form reading. */
  --sop-brand: #4DBB83;
}
.pk-kit .sop-state, .pk-kit .sop-setup {
  padding: 28px 20px; text-align: center; color: var(--text-muted);
  background: var(--surface); border: 1px solid var(--sop-line); border-radius: 14px;
}
.pk-kit .sop-setup { text-align: left; padding: 22px 24px; }
.pk-kit .sop-failed { margin-bottom: 12px; border-color: color-mix(in srgb, #e5484d 45%, var(--border)); }
.pk-kit .sop-setup h3 {
  margin: 0 0 6px; font-family: var(--font-display); font-size: 15px; font-weight: 600; color: var(--text);
}
.pk-kit .sop-setup p { margin: 0; font-size: 13.5px; line-height: 1.6; }
.pk-kit .sop-setup code {
  font-size: 12.5px; padding: 1px 5px; border-radius: 5px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.pk-kit .sop-connect {
  display: inline-flex; align-items: center; gap: 7px; margin-top: 14px;
  padding: 9px 15px; font-size: 13px; font-weight: 500; text-decoration: none;
  color: var(--text); background: var(--surface);
  border: 1px solid color-mix(in srgb, var(--text) 32%, transparent); border-radius: 9px;
}
.pk-kit .sop-connect:hover { border-color: color-mix(in srgb, var(--text) 55%, transparent); }
.pk-kit .sop-note { margin: 10px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--text-faint); }

.pk-kit .sop-controls { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
.pk-kit .sop-search {
  display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-width: 0;
  padding: 8px 12px; background: var(--surface); border: 1px solid var(--sop-line); border-radius: 10px;
  color: var(--text-faint);
}
.pk-kit .sop-search input {
  border: 0; outline: 0; background: transparent; color: var(--text);
  font: inherit; font-size: 13.5px; width: 100%; min-width: 0;
}
.pk-kit .sop-toggle {
  padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer;
  background: var(--surface); color: var(--text-muted);
  border: 1px solid var(--sop-line); border-radius: 10px;
}
.pk-kit .sop-toggle.on { color: var(--text); border-color: color-mix(in srgb, var(--text) 32%, transparent); }
.pk-kit .sop-count { font-size: 12.5px; color: var(--text-faint); margin-left: auto; }
.pk-kit .sop-acct { opacity: .8; }

/* Where you are in the folder tree. */
.pk-kit .sop-crumbs {
  display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: 14px;
  font-size: 13px; color: var(--text-faint);
}
.pk-kit .sop-crumbs button {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 7px; margin: 0; font: inherit; cursor: pointer; border-radius: 7px;
  background: none; border: 0; color: var(--text-muted);
}
.pk-kit .sop-crumbs button:hover { background: color-mix(in srgb, var(--text) 6%, transparent); color: var(--text); }
.pk-kit .sop-crumb { display: inline-flex; align-items: center; gap: 4px; }
.pk-kit .sop-crumb b { padding: 4px 7px; font-family: var(--font-display); font-weight: 600; color: var(--text); }

/* One folder you can open. Sized so the two top-level folders read as the
   deliberate entry points they are rather than as list rows. */
.pk-kit .sop-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px; margin-bottom: 14px;
}
.pk-kit .sop-folder {
  display: grid; grid-template-columns: auto 1fr auto; grid-template-rows: auto auto;
  align-items: center; gap: 2px 12px; width: 100%;
  padding: 16px 16px 15px; cursor: pointer; text-align: left;
  background: var(--surface); border: 1px solid var(--sop-line); border-radius: 14px;
  box-shadow: var(--shadow-md); color: var(--text);
  transition: border-color .15s ease, transform .15s ease;
}
.pk-kit .sop-folder:hover {
  border-color: color-mix(in srgb, var(--sop-brand) 55%, var(--border));
  transform: translateY(-1px);
}
.pk-kit .sop-fico { grid-row: 1 / span 2; color: var(--sop-brand); }
.pk-kit .sop-fname {
  font-family: var(--font-display); font-size: 14.5px; font-weight: 600; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pk-kit .sop-fmeta { grid-column: 2; font-size: 12px; color: var(--text-faint); }
.pk-kit .sop-fchev { grid-row: 1 / span 2; grid-column: 3; color: var(--text-faint); }

.pk-kit .sop-card {
  background: var(--surface); border: 1px solid var(--sop-line); border-radius: 14px;
  margin-bottom: 10px; overflow: hidden; box-shadow: var(--shadow-md);
}
.pk-kit .sop-cathead {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 14px 16px; background: none; border: 0; cursor: pointer; text-align: left; color: var(--text);
}
.pk-kit .sop-cathead.static { cursor: default; border-bottom: 1px solid var(--sop-line); }
.pk-kit .sop-catwrap { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pk-kit .sop-cattrail {
  font-size: 11px; letter-spacing: .03em; color: var(--text-faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pk-kit .sop-catname { font-family: var(--font-display); font-size: 14.5px; font-weight: 600; }
.pk-kit .sop-catmeta { margin-left: auto; padding-left: 12px; font-size: 12px; color: var(--text-faint); }

.pk-kit .sop-list { list-style: none; margin: 0; padding: 0 0 6px; }
.pk-kit .sop-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px; border-top: 1px solid var(--sop-line);
}
.pk-kit .sop-chk { flex: none; width: 15px; height: 15px; cursor: pointer; accent-color: var(--text); }
.pk-kit .sop-title {
  display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
  background: none; border: 0; padding: 2px 0; cursor: pointer; text-align: left;
  font: inherit; font-size: 13.5px; color: var(--text);
}
.pk-kit .sop-title:hover { text-decoration: underline; }
.pk-kit .sop-title svg { flex: none; color: var(--text-faint); }
.pk-kit .sop-tag {
  flex: none; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase;
  padding: 2px 7px; border-radius: 999px; color: var(--text-faint);
  border: 1px solid var(--sop-line);
}

.pk-kit .sop-attach {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 16px; border-top: 1px solid var(--sop-line);
  font-size: 12.5px; color: var(--text-faint);
}
.pk-kit .sop-attach.card {
  border: 1px solid var(--sop-line); border-radius: 14px; margin-bottom: 10px;
  background: var(--surface); box-shadow: var(--shadow-md);
}
.pk-kit .sop-attach a { color: var(--text-muted); text-decoration: none; }
.pk-kit .sop-attach a:hover { text-decoration: underline; }

.pk-kit .sop-readerbar { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.pk-kit .sop-back, .pk-kit .sop-open {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 12px; font-size: 13px; cursor: pointer; text-decoration: none;
  background: var(--surface); color: var(--text-muted);
  border: 1px solid var(--sop-line); border-radius: 9px;
}
.pk-kit .sop-open { margin-left: auto; }
/* ---------------------------------------------------------------------------
   The reader: a document, not a dashboard panel.
   An SOP is read start to finish, so it gets a page with real margins, body type
   at 16.5px (14.5 was below the readable minimum for long-form), and a measure
   held near 70 characters. The brand shows up as one green rail down the page
   edge and on the contents rail, not as colour sprayed through the prose.
   --------------------------------------------------------------------------- */
.pk-kit .sop-shell { display: block; }
.pk-kit .sop-shell.has-toc {
  display: grid; grid-template-columns: minmax(0, 1fr) 228px; gap: 28px; align-items: start;
}

.pk-kit .sop-page {
  position: relative; overflow: hidden;
  padding: 46px 56px 56px 62px;
  background: var(--surface); border: 1px solid var(--sop-line); border-radius: 14px;
  box-shadow: 0 1px 3px rgba(16, 18, 30, .06), 0 14px 38px -16px rgba(16, 18, 30, .14);
}
[data-theme="dark"] .pk-kit .sop-page {
  box-shadow: 0 1px 3px rgba(0, 0, 0, .5), 0 16px 44px -16px rgba(0, 0, 0, .7);
}
/* The one piece of brand in the reader. */
.pk-kit .sop-page::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
  background: linear-gradient(180deg, var(--sop-brand),
    color-mix(in srgb, var(--sop-brand) 22%, transparent));
}
.pk-kit .sop-kicker {
  font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint);
}
.pk-kit .sop-h {
  margin: 5px 0 22px; font-family: var(--font-display);
  font-size: 28px; font-weight: 600; letter-spacing: -.015em; line-height: 1.22; color: var(--text);
}
.pk-kit .sop-video {
  position: relative; width: 100%; aspect-ratio: 16 / 9; margin-bottom: 26px;
  border-radius: 12px; overflow: hidden; border: 1px solid var(--sop-line); background: #000;
}
.pk-kit .sop-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

/* One Doc tab. The rule above it is what stops five cold-call scripts reading
   as one continuous script, which is exactly how they used to arrive. */
.pk-kit .sop-sec + .sop-sec { margin-top: 40px; padding-top: 34px; border-top: 1px solid var(--sop-line); }
.pk-kit .sop-sech {
  margin: 0 0 16px; font-family: var(--font-display);
  font-size: 20px; font-weight: 600; letter-spacing: -.012em; color: var(--text);
}
.pk-kit .sop-sech.sub { font-size: 16.5px; color: var(--text-muted); padding-left: 14px; border-left: 2px solid var(--sop-brand); }

.pk-kit .sop-body {
  max-width: 70ch; font-size: 16.5px; line-height: 1.75; color: var(--text);
}
.pk-kit .sop-body h1, .pk-kit .sop-body h2, .pk-kit .sop-body h3, .pk-kit .sop-body h4 {
  font-family: var(--font-display); font-weight: 600; letter-spacing: -.015em;
  margin: 1.7em 0 .5em; line-height: 1.28;
}
.pk-kit .sop-body h1 { font-size: 22px; }
.pk-kit .sop-body h2 { font-size: 19px; }
.pk-kit .sop-body h3 { font-size: 16.5px; }
.pk-kit .sop-body h4 { font-size: 15px; color: var(--text-muted); }
.pk-kit .sop-body p { margin: 0 0 1.05em; }
.pk-kit .sop-body ul, .pk-kit .sop-body ol { margin: 0 0 1.15em; padding-left: 1.5em; }
.pk-kit .sop-body li { margin-bottom: .45em; }
.pk-kit .sop-body ul > li::marker { color: var(--sop-brand); }
/* Emphasis inside a heading is already carried by the heading weight; doubling it
   makes one word in a title look like a mistake. */
.pk-kit .sop-body h1 strong, .pk-kit .sop-body h2 strong,
.pk-kit .sop-body h3 strong, .pk-kit .sop-body h4 strong { font-weight: inherit; }
.pk-kit .sop-body strong { font-weight: 650; }
.pk-kit .sop-body u { text-decoration-thickness: 1.5px; text-underline-offset: 2.5px; }
.pk-kit .sop-body a {
  color: var(--brand-primary); text-decoration: underline;
  text-underline-offset: 2px; text-decoration-thickness: 1px;
}
.pk-kit .sop-body img { max-width: 100%; height: auto; border-radius: 8px; margin: .7em 0; }
.pk-kit .sop-body table {
  width: 100%; border-collapse: collapse; margin: 0 0 1.3em; font-size: 14.5px; display: block; overflow-x: auto;
}
.pk-kit .sop-body td, .pk-kit .sop-body th {
  border: 1px solid var(--sop-line); padding: 9px 12px; text-align: left; vertical-align: top;
}
.pk-kit .sop-body th { font-weight: 600; background: color-mix(in srgb, var(--text) 4%, transparent); }
.pk-kit .sop-body blockquote {
  margin: 0 0 1.1em; padding: 2px 0 2px 16px; color: var(--text-muted);
  border-left: 2px solid var(--sop-brand);
}
.pk-kit .sop-body code {
  font-size: 13.5px; padding: 2px 6px; border-radius: 5px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.pk-kit .sop-body pre {
  padding: 12px 14px; border-radius: 10px; overflow-x: auto;
  background: color-mix(in srgb, var(--text) 6%, transparent);
}
.pk-kit .sop-body hr { height: 1px; border: 0; background: var(--sop-line); margin: 2em 0; }

/* Tabs in this SOP. Only rendered when a Doc has more than one. */
.pk-kit .sop-toc {
  position: sticky; top: 18px; padding: 18px 16px;
  background: var(--surface); border: 1px solid var(--sop-line); border-radius: 12px;
}
.pk-kit .sop-toc b {
  display: block; margin-bottom: 11px; font-family: var(--font-display);
  font-size: 11px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase;
  color: var(--text-faint);
}
.pk-kit .sop-toc a {
  display: block; padding: 5px 0 5px 11px; font-size: 13px; line-height: 1.42;
  color: var(--text-muted); text-decoration: none; border-left: 2px solid var(--sop-line);
}
.pk-kit .sop-toc a:hover { color: var(--text); border-left-color: var(--sop-brand); }
.pk-kit .sop-toc a.sub { padding-left: 22px; font-size: 12.5px; color: var(--text-faint); }

@media (max-width: 1000px) {
  .pk-kit .sop-shell.has-toc { grid-template-columns: 1fr; }
  .pk-kit .sop-toc { position: static; }
}
@media (max-width: 720px) {
  .pk-kit .sop-page { padding: 30px 20px 34px 26px; border-radius: 12px; }
  .pk-kit .sop-h { font-size: 23px; }
}

[data-theme="dark"] .pk-kit .sop-video { background: #000; }
`}</style>
  );
}
