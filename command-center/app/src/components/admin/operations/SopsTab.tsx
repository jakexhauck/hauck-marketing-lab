import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, ExternalLink, FileText, ArrowLeft, Paperclip, Search } from "lucide-react";
import { useSopHub } from "../../../hooks/useSopHub";
import { buildGroups, flagKey, selectedCount } from "../../../lib/sopTriage";
import { totalSops, type SopCategory, type SopEntry } from "../../../lib/sopHub";

// The Operations pillar's SOPs tab.
//
// Content lives in the agency's Google Drive folder, not in this repo: each
// subfolder is a category, each Google Doc is an SOP. Adding an SOP means
// creating a Doc, so nothing here is seeded and nothing needs a deploy. Drive is
// the only place SOPs are authored; this tab reads and never writes.
//
// The kicker, title, tagline and pillar tab bar come from PillarPage, so this
// renders only the search row and the category cards. Opening an SOP swaps the
// list for the reader in place; the tab bar has no nested routes.
//
// The tree refreshes itself while this tab is open (see useSopHub), so the
// reader must never hold onto the category and SOP objects it was opened with:
// it stores the keys and resolves them against the current tree on every render.
//
// Nothing here fabricates data: an unconnected Drive says exactly that, and a
// category with no Docs shows its attachments rather than inventing SOPs.

// Begins Google consent for the one agency account. Named "assets" for historic
// reasons: it is the same single Drive connection the SOP Hub reads through.
const CONNECT_URL = "/api/admin/assets/oauth/start";
// The Google account that owns the SOPs folder. Any other account consents
// happily and then 403s on every read, so the notices name it outright rather
// than saying "the right one".
const OWNER_ACCOUNT = "contact.jakehauck@gmail.com";
const PROD_ORIGIN = "https://app.hauckmarketing.com";

// Google refuses any callback URL not registered against the OAuth client, and
// only the production one is, so consenting from a dev origin dies on a
// redirect_uri_mismatch. Sending it to production is not a workaround: the
// refresh token lands in one shared row that every origin reads, so connecting
// there connects here. Reading Drive afterwards needs no callback at all.
function connectHref(): string {
  const offProd = typeof window !== "undefined" && window.location.origin !== PROD_ORIGIN;
  return offProd ? `${PROD_ORIGIN}${CONNECT_URL}` : CONNECT_URL;
}

export default function SopsTab() {
  const {
    categories,
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Keys, not objects: the tree refetches underneath an open reader, and holding
  // the objects would pin it to the copy it was opened with.
  const [reading, setReading] = useState<{ catKey: string; slug: string } | null>(null);
  // The Google OAuth callback lands back here, so a failed consent reports the
  // reason rather than showing a bare "not connected" the admin has to guess at.
  const [searchParams] = useSearchParams();
  const connectError = searchParams.get("connect_error");

  const groups = useMemo(
    () => buildGroups(categories, query, considered, selectedOnly),
    [categories, query, considered, selectedOnly],
  );

  // The SOP being read, resolved against the tree as it stands right now. Null
  // while reading is set means the Doc left the folder.
  const readingPair = useMemo(() => {
    if (!reading) return null;
    const cat = categories.find((c) => c.key === reading.catKey);
    const sop = cat?.sops.find((s) => s.slug === reading.slug);
    return cat && sop ? { cat, sop } : null;
  }, [reading, categories]);

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
      ) : loading ? (
        <div className="sop-state">Loading SOPs from Drive</div>
      ) : categories.length === 0 ? (
        <div className="sop-state">
          That Drive folder has no Google Docs in it yet. Add one and it appears here.
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
                placeholder="Search SOPs"
                aria-label="Search SOPs"
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
              {totalSops(categories)} SOPs, {considered.size} ticked
              {connectedEmail && <span className="sop-acct"> · Drive: {connectedEmail}</span>}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="sop-state">Nothing matches that search.</div>
          ) : (
            groups.map(({ cat, sops }) => {
              // While searching, force categories open so hits are never hidden
              // behind a collapsed card.
              const isOpen = query.trim() ? true : !collapsed.has(cat.key);
              return (
                <div className="sop-card" key={cat.key}>
                  <button
                    type="button"
                    className="sop-cathead"
                    aria-expanded={isOpen}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev);
                        if (next.has(cat.key)) next.delete(cat.key);
                        else next.add(cat.key);
                        return next;
                      })
                    }
                  >
                    <ChevronDown size={16} strokeWidth={2.4} className={isOpen ? "sop-chev open" : "sop-chev"} />
                    <span className="sop-catname">{cat.name}</span>
                    <span className="sop-catmeta">
                      {sops.length} {sops.length === 1 ? "SOP" : "SOPs"}
                      {selectedCount(cat, considered) > 0 ? `, ${selectedCount(cat, considered)} ticked` : ""}
                    </span>
                  </button>

                  {isOpen && (
                    <>
                      <ul className="sop-list">
                        {sops.map((sop) => (
                          <li className="sop-row" key={sop.slug}>
                            <input
                              type="checkbox"
                              className="sop-chk"
                              checked={considered.has(flagKey(cat.key, sop.slug))}
                              onChange={() => void toggleFlag(cat.key, sop.slug)}
                              aria-label={`Tick ${sop.title}`}
                            />
                            <button type="button" className="sop-title" onClick={() => open(cat, sop)}>
                              <FileText size={15} strokeWidth={2} />
                              {sop.title}
                            </button>
                            {sop.videoId && <span className="sop-tag">Video</span>}
                          </li>
                        ))}
                      </ul>

                      {cat.attachments.length > 0 && (
                        <div className="sop-attach">
                          <Paperclip size={13} strokeWidth={2.2} />
                          {cat.attachments.map((a) => (
                            <a key={a.id} href={a.webViewLink ?? "#"} target="_blank" rel="noopener noreferrer">
                              {a.name}
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

// A plain link rather than a fetch: the endpoint answers with a 302 to Google's
// consent screen, which only the browser can follow. The admin session cookie
// rides along on the navigation, which is what authorises the route.
function ConnectButton({ label }: { label: string }) {
  const href = connectHref();
  const offProd = href !== CONNECT_URL;
  return (
    <>
      <a className="sop-connect" href={href}>
        {label}
        <ExternalLink size={13} strokeWidth={2.2} />
      </a>
      {offProd && (
        <p className="sop-note">
          This opens the live console to consent, because Google only accepts the production callback
          address. The connection is shared, so once it is done there this copy reads Drive too.
        </p>
      )}
    </>
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
  doc: { title: string; html: string } | undefined;
  loading: boolean;
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div className="sop-reader">
      <div className="sop-readerbar">
        <button type="button" className="sop-back" onClick={onBack}>
          <ArrowLeft size={15} strokeWidth={2.4} />
          All SOPs
        </button>
        {sop.webViewLink && (
          <a className="sop-open" href={sop.webViewLink} target="_blank" rel="noopener noreferrer">
            Edit in Drive
            <ExternalLink size={13} strokeWidth={2.2} />
          </a>
        )}
      </div>

      <div className="sop-kicker">{cat.name}</div>
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
      ) : doc.html.trim() === "" ? (
        <div className="sop-state">
          That Doc is empty. Write the steps in Drive and they appear here.
        </div>
      ) : (
        // Sanitized server-side by functions/lib/sopHtml.ts, which strips scripts,
        // event handlers and unsafe hrefs down to a fixed tag allowlist.
        <div className="sop-body" dangerouslySetInnerHTML={{ __html: doc.html }} />
      )}
    </div>
  );
}

function SopsStyle() {
  return (
    <style>{`
.pk-kit .sop { --sop-line: var(--border); }
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

.pk-kit .sop-card {
  background: var(--surface); border: 1px solid var(--sop-line); border-radius: 14px;
  margin-bottom: 10px; overflow: hidden; box-shadow: var(--shadow-md);
}
.pk-kit .sop-cathead {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 14px 16px; background: none; border: 0; cursor: pointer; text-align: left; color: var(--text);
}
.pk-kit .sop-chev { transition: transform .18s ease; color: var(--text-faint); flex: none; }
.pk-kit .sop-chev.open { transform: rotate(180deg); }
.pk-kit .sop-catname { font-family: var(--font-display); font-size: 14.5px; font-weight: 600; }
.pk-kit .sop-catmeta { margin-left: auto; font-size: 12px; color: var(--text-faint); }

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
.pk-kit .sop-kicker {
  font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint);
}
.pk-kit .sop-h {
  margin: 4px 0 18px; font-family: var(--font-display);
  font-size: 24px; font-weight: 600; letter-spacing: -.01em; color: var(--text);
}
.pk-kit .sop-video {
  position: relative; width: 100%; aspect-ratio: 16 / 9; margin-bottom: 22px;
  border-radius: 12px; overflow: hidden; border: 1px solid var(--sop-line); background: #000;
}
.pk-kit .sop-video iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

.pk-kit .sop-body {
  max-width: 72ch; font-size: 14.5px; line-height: 1.75; color: var(--text);
}
.pk-kit .sop-body h1, .pk-kit .sop-body h2, .pk-kit .sop-body h3, .pk-kit .sop-body h4 {
  font-family: var(--font-display); font-weight: 600; letter-spacing: -.01em;
  margin: 1.6em 0 .5em; line-height: 1.3;
}
.pk-kit .sop-body h1 { font-size: 20px; }
.pk-kit .sop-body h2 { font-size: 17.5px; }
.pk-kit .sop-body h3 { font-size: 15.5px; }
.pk-kit .sop-body h4 { font-size: 14.5px; color: var(--text-muted); }
.pk-kit .sop-body p { margin: 0 0 1em; }
.pk-kit .sop-body ul, .pk-kit .sop-body ol { margin: 0 0 1em; padding-left: 1.4em; }
.pk-kit .sop-body li { margin-bottom: .4em; }
.pk-kit .sop-body a { color: var(--text); text-underline-offset: 2px; }
.pk-kit .sop-body img { max-width: 100%; height: auto; border-radius: 8px; margin: .6em 0; }
.pk-kit .sop-body table {
  width: 100%; border-collapse: collapse; margin: 0 0 1.2em; font-size: 13.5px; display: block; overflow-x: auto;
}
.pk-kit .sop-body td, .pk-kit .sop-body th {
  border: 1px solid var(--sop-line); padding: 7px 10px; text-align: left; vertical-align: top;
}
.pk-kit .sop-body th { font-weight: 600; background: color-mix(in srgb, var(--text) 4%, transparent); }
.pk-kit .sop-body blockquote {
  margin: 0 0 1em; padding: 2px 0 2px 14px; color: var(--text-muted);
  border-left: 2px solid var(--sop-line);
}
.pk-kit .sop-body code {
  font-size: 12.5px; padding: 1px 5px; border-radius: 5px;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.pk-kit .sop-body pre {
  padding: 12px 14px; border-radius: 10px; overflow-x: auto;
  background: color-mix(in srgb, var(--text) 6%, transparent);
}

[data-theme="dark"] .pk-kit .sop-video { background: #000; }
`}</style>
  );
}
