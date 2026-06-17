import React, { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type { AppConfig, SopFile, SopSummary, SopsIndex } from "../../lib/types";
import { HAUCK_SOPS, type HauckSop } from "../../lib/hauckSops";

interface SOPsPageProps {
  root: string | null;
}

type TabId = "drive" | "hauck";

// ---------- tiny markdown renderer ----------
// H1/H2/H3, paragraphs, `- ` bullets, checkbox lines, **bold**, *italic*, `code`, links.

const CHECKBOX_RE = /^(\s*)-\s*\[([ xX])\]\s+(.+)$/;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

function parseCheckboxLine(line: string): { ok: boolean; text: string; done: boolean; indent: number } {
  const m = line.match(CHECKBOX_RE);
  if (!m) return { ok: false, text: "", done: false, indent: 0 };
  return { ok: true, text: m[3], done: m[2].toLowerCase() === "x", indent: m[1].length };
}

function renderInline(text: string, prefix: string): React.ReactNode[] {
  const linkMatches: { match: string; label: string; href: string }[] = [];
  const placeheld = text.replace(LINK_RE, (m, label, href) => {
    linkMatches.push({ match: m, label, href });
    return ` LINK${linkMatches.length - 1} `;
  });

  const out: React.ReactNode[] = [];
  let buf = "";
  let i = 0;
  let key = 0;
  const flush = () => {
    if (buf) {
      const parts = buf.split(/( LINK\d+ )/);
      for (const part of parts) {
        const linkMatch = part.match(/^ LINK(\d+) $/);
        if (linkMatch) {
          const li = linkMatches[parseInt(linkMatch[1], 10)];
          out.push(
            <a
              key={`${prefix}-l${key++}`}
              href={li.href}
              onClick={(e) => {
                e.preventDefault();
                void openUrl(li.href);
              }}
            >
              {li.label}
            </a>,
          );
        } else if (part) {
          out.push(<span key={`${prefix}-t${key++}`}>{part}</span>);
        }
      }
      buf = "";
    }
  };
  while (i < placeheld.length) {
    if (placeheld.startsWith("**", i)) {
      const end = placeheld.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        out.push(<strong key={`${prefix}-b${key++}`}>{placeheld.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (placeheld[i] === "`") {
      const end = placeheld.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push(<code key={`${prefix}-c${key++}`}>{placeheld.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (placeheld[i] === "*") {
      const end = placeheld.indexOf("*", i + 1);
      if (end !== -1 && placeheld[i + 1] !== "*") {
        flush();
        out.push(<em key={`${prefix}-i${key++}`}>{placeheld.slice(i + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    buf += placeheld[i];
    i++;
  }
  flush();
  return out;
}

function MarkdownView({ body }: { body: string }) {
  const lines = body.split("\n");
  const nodes: React.ReactElement[] = [];
  let para: string[] = [];
  let bullets: React.ReactElement[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length === 0) return;
    const txt = para.join(" ").trim();
    if (txt) {
      nodes.push(<p key={`p${key++}`}>{renderInline(txt, `p${key}`)}</p>);
    }
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length === 0) return;
    nodes.push(
      <ul key={`u${key++}`} className="sop-bullets">
        {bullets}
      </ul>,
    );
    bullets = [];
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushPara();
      flushBullets();
      continue;
    }

    const cb = parseCheckboxLine(line);
    if (cb.ok) {
      flushPara();
      flushBullets();
      const stepClass = cb.indent >= 2 ? "sop-step sop-step-sub" : "sop-step";
      nodes.push(
        <label key={`s${key++}`} className={`${stepClass} sop-step-static${cb.done ? " sop-step-done" : ""}`}>
          <input type="checkbox" defaultChecked={cb.done} />
          <span>{renderInline(cb.text, `s${key}`)}</span>
        </label>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushPara();
      flushBullets();
      nodes.push(<h3 key={`h${key++}`}>{renderInline(line.slice(4), `h${key}`)}</h3>);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      flushBullets();
      nodes.push(<h2 key={`h${key++}`}>{renderInline(line.slice(3), `h${key}`)}</h2>);
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      flushBullets();
      nodes.push(<h1 key={`h${key++}`}>{renderInline(line.slice(2), `h${key}`)}</h1>);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      bullets.push(<li key={`l${key++}`}>{renderInline(line.slice(2), `l${key}`)}</li>);
      continue;
    }
    if (line.trim() === "---") {
      flushPara();
      flushBullets();
      nodes.push(<hr key={`hr${key++}`} className="sop-rule" />);
      continue;
    }

    flushBullets();
    para.push(line);
  }
  flushPara();
  flushBullets();

  return <div className="sop-md">{nodes}</div>;
}

function formatStamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`.toUpperCase();
}

// ---------- main page (tab host) ----------

export function SOPsPage({ root }: SOPsPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("drive");

  return (
    <div className="hml-content">
      <style>{sopsPageCSS}</style>

      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace
          </div>
          <h1 className="hml-page-title">Standard Operating Procedures</h1>
          <div className="hml-page-subtitle">
            {activeTab === "drive"
              ? "Live mirror of your Google Drive SOPs folder. Edit in Drive, read here."
              : `Built-in agency playbooks. ${HAUCK_SOPS.length} checklists for service delivery.`}
          </div>
        </div>
      </section>

      <div className="sops-tabs">
        <button
          type="button"
          className={`sops-tab${activeTab === "drive" ? " is-active" : ""}`}
          onClick={() => setActiveTab("drive")}
        >
          Google Drive
        </button>
        <button
          type="button"
          className={`sops-tab${activeTab === "hauck" ? " is-active" : ""}`}
          onClick={() => setActiveTab("hauck")}
        >
          Hauck Marketing Lab
        </button>
      </div>

      {activeTab === "drive" ? <DriveTab root={root} /> : <HauckLabTab />}
    </div>
  );
}

// ---------- Drive tab (existing Drive-mirror flow) ----------

function DriveTab({ root }: { root: string | null }) {
  const [index, setIndex] = useState<SopsIndex>({
    folderUrl: null,
    updatedAt: null,
    items: [],
  });
  const [configUrl, setConfigUrl] = useState<string>("");
  const [urlDraft, setUrlDraft] = useState<string>("");
  const [savingUrl, setSavingUrl] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [current, setCurrent] = useState<SopFile | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!root) {
      setIndex({ folderUrl: null, updatedAt: null, items: [] });
      return;
    }
    try {
      const cfg = await api.loadConfig();
      const url = cfg.sops_drive_folder_url ?? "";
      setConfigUrl(url);
      setUrlDraft(url);
    } catch (err) {
      console.warn("Failed to load config:", err);
    }
    try {
      const idx = await api.listSops(root);
      setIndex(idx);
      if (!selectedId && idx.items.length > 0) {
        setSelectedId(idx.items[0].id);
      }
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    }
  }, [root, selectedId]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  useEffect(() => {
    if (!root || !selectedId) {
      setCurrent(null);
      return;
    }
    let cancelled = false;
    setDocError(null);
    setLoadingDoc(true);
    (async () => {
      try {
        const cached = await api.readSop(root, selectedId);
        if (cancelled) return;
        if (cached) {
          setCurrent(cached);
          setLoadingDoc(false);
          return;
        }
        const fetched = await api.fetchSop(root, selectedId);
        if (cancelled) return;
        setCurrent(fetched);
        const idx = await api.listSops(root);
        if (cancelled) return;
        setIndex(idx);
      } catch (err) {
        if (!cancelled) {
          setDocError(err instanceof Error ? err.message : String(err));
          setCurrent(null);
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, selectedId]);

  const handleSaveUrl = async () => {
    if (!root) return;
    setSavingUrl(true);
    try {
      const cfg = await api.loadConfig();
      const next: AppConfig = {
        ...cfg,
        sops_drive_folder_url: urlDraft.trim() || null,
      };
      await api.saveConfig(next);
      setConfigUrl(urlDraft.trim());
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingUrl(false);
    }
  };

  const handleRefresh = async () => {
    if (!root) return;
    if (!configUrl.trim()) {
      setListError("Set a Google Drive folder URL first.");
      return;
    }
    setRefreshing(true);
    setListError(null);
    try {
      const idx = await api.refreshSopsIndex(root, configUrl.trim());
      setIndex(idx);
      if (selectedId && !idx.items.some((i) => i.id === selectedId)) {
        setSelectedId(idx.items[0]?.id ?? null);
      } else if (!selectedId && idx.items.length > 0) {
        setSelectedId(idx.items[0].id);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefetchDoc = async () => {
    if (!root || !selectedId) return;
    setLoadingDoc(true);
    setDocError(null);
    try {
      await api.clearSopCache(root, selectedId);
      const fetched = await api.fetchSop(root, selectedId);
      setCurrent(fetched);
      const idx = await api.listSops(root);
      setIndex(idx);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingDoc(false);
    }
  };

  const handleOpenInDrive = () => {
    const link = current?.webViewLink;
    if (!link) return;
    void openUrl(link);
  };

  const groupedItems = useMemo(() => {
    const groups: Record<string, SopSummary[]> = {};
    for (const item of index.items) {
      const key = item.folder?.trim() || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    const keys = Object.keys(groups).sort((a, b) => {
      if (a === "" && b !== "") return -1;
      if (b === "" && a !== "") return 1;
      return a.localeCompare(b);
    });
    return keys.map((k) => ({ folder: k, items: groups[k] }));
  }, [index.items]);

  const urlDirty = urlDraft.trim() !== configUrl.trim();
  const hasUrl = configUrl.trim().length > 0;

  return (
    <div className="md-sops-page">
      <div className="sops-config">
        <label className="sops-config-label">
          <span>Google Drive SOPs folder URL</span>
          <input
            type="text"
            value={urlDraft}
            placeholder="https://drive.google.com/drive/folders/…"
            onChange={(e) => setUrlDraft(e.target.value)}
            spellCheck={false}
          />
        </label>
        <div className="sops-config-actions">
          <button
            type="button"
            className="sops-btn-ghost"
            onClick={handleSaveUrl}
            disabled={!urlDirty || savingUrl || !root}
          >
            {savingUrl ? "Saving…" : urlDirty ? "Save URL" : "Saved"}
          </button>
          <button
            type="button"
            className="sops-btn-primary"
            onClick={handleRefresh}
            disabled={refreshing || !hasUrl || !root}
            title={!hasUrl ? "Save a folder URL first" : "Re-scan Drive for SOPs"}
          >
            {refreshing ? "Refreshing from Drive…" : "Refresh from Drive"}
          </button>
        </div>
        {index.updatedAt && (
          <div className="sops-config-stamp">
            List last refreshed {formatStamp(index.updatedAt)}
          </div>
        )}
      </div>

      <div className="sops-shell">
        <aside className="sops-rail">
          <div className="sops-rail-head">
            <span>
              {index.items.length} doc{index.items.length === 1 ? "" : "s"}
            </span>
          </div>

          {listError ? (
            <div className="sops-empty sops-err">{listError}</div>
          ) : index.items.length === 0 ? (
            <div className="sops-empty">
              {hasUrl
                ? <>Nothing cached yet. Click <strong>Refresh from Drive</strong> to pull the list.</>
                : <>Paste your Drive folder URL above to begin.</>}
            </div>
          ) : (
            <div className="sops-groups">
              {groupedItems.map((g) => (
                <div key={g.folder || "__root"} className="sops-group">
                  {g.folder && <div className="sops-group-label">{g.folder}</div>}
                  <ul className="sops-list">
                    {g.items.map((s) => {
                      const isActive = s.id === selectedId;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={`sops-list-item${isActive ? " is-active" : ""}`}
                            onClick={() => setSelectedId(s.id)}
                          >
                            <span className="sops-list-title">{s.title}</span>
                            <span className="sops-list-meta">
                              {s.cached ? "CACHED" : "NOT FETCHED"}
                              {s.modifiedTime ? ` · ${formatStamp(s.modifiedTime)}` : ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </aside>

        <section className="sops-pane">
          {!root ? (
            <div className="sops-pane-empty">Pick a media-buying folder first.</div>
          ) : !selectedId ? (
            <div className="sops-pane-empty">
              {index.items.length === 0
                ? "No SOPs loaded yet."
                : "Select an SOP from the left."}
            </div>
          ) : (
            <>
              <div className="sops-pane-head">
                <div className="sops-pane-head-left">
                  <h2>{current?.title ?? index.items.find((i) => i.id === selectedId)?.title}</h2>
                  {current?.fetchedAt && (
                    <p className="sops-summary">
                      Cached {formatStamp(current.fetchedAt)}
                    </p>
                  )}
                </div>
                <div className="sops-pane-head-actions">
                  {current?.webViewLink && (
                    <button
                      type="button"
                      className="sops-btn-ghost"
                      onClick={handleOpenInDrive}
                    >
                      Edit in Drive ↗
                    </button>
                  )}
                  <button
                    type="button"
                    className="sops-btn-ghost"
                    onClick={handleRefetchDoc}
                    disabled={loadingDoc}
                  >
                    {loadingDoc ? "Fetching…" : "Re-fetch"}
                  </button>
                </div>
              </div>

              <div className="sops-body">
                {loadingDoc ? (
                  <div className="sops-empty">Fetching from Drive…</div>
                ) : docError ? (
                  <div className="sops-empty sops-err">{docError}</div>
                ) : current ? (
                  <MarkdownView body={current.body} />
                ) : (
                  <div className="sops-empty">Doc body not loaded.</div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------- Hauck Marketing Lab tab (bundled SOPs) ----------

const HAUCK_CATEGORY_ORDER = [
  "Onboarding",
  "Build & Launch",
  "Creative",
  "Research",
  "Optimization",
  "Leads",
  "Comms",
  "Upsell",
  "Operations",
  "Stack",
];

function HauckLabTab() {
  const [selectedId, setSelectedId] = useState<string>(HAUCK_SOPS[0]?.id ?? "");

  const current = useMemo(
    () => HAUCK_SOPS.find((s) => s.id === selectedId) ?? HAUCK_SOPS[0],
    [selectedId],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, HauckSop[]>();
    for (const sop of HAUCK_SOPS) {
      const cat = sop.category || "Uncategorized";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(sop);
    }
    const ordered: { category: string; sops: HauckSop[] }[] = [];
    for (const c of HAUCK_CATEGORY_ORDER) {
      const sops = map.get(c);
      if (sops) ordered.push({ category: c, sops });
    }
    for (const [cat, sops] of map) {
      if (!HAUCK_CATEGORY_ORDER.includes(cat)) {
        ordered.push({ category: cat, sops });
      }
    }
    return ordered;
  }, []);

  return (
    <div className="md-sops-page">
      <div className="sops-shell">
        <aside className="sops-rail">
          <div className="sops-rail-head">
            <span>
              {HAUCK_SOPS.length} sop{HAUCK_SOPS.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="sops-groups">
            {grouped.map((g) => (
              <div key={g.category} className="sops-group">
                <div className="sops-group-label">{g.category}</div>
                <ul className="sops-list">
                  {g.sops.map((s) => {
                    const isActive = s.id === selectedId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`sops-list-item${isActive ? " is-active" : ""}`}
                          onClick={() => setSelectedId(s.id)}
                        >
                          <span className="sops-list-title">{s.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        <section className="sops-pane">
          {!current ? (
            <div className="sops-pane-empty">No SOPs available.</div>
          ) : (
            <>
              <div className="sops-pane-head">
                <div className="sops-pane-head-left">
                  <h2>{current.title}</h2>
                  <p className="sops-summary">{current.category}</p>
                </div>
              </div>
              <div className="sops-body">
                <MarkdownView body={current.body} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

const sopsPageCSS = `
.md-sops-page {
  padding: 0;
  max-width: 1280px;
}
.sops-head { margin-bottom: 18px; }
.sops-head h1 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.sops-subtitle {
  margin: 8px 0 0;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--text-muted);
}
.sops-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--border);
}
.sops-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  padding: 12px 18px 10px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 120ms ease, border-color 120ms ease;
}
.sops-tab:hover { color: var(--text); }
.sops-tab.is-active {
  color: var(--copper);
  border-bottom-color: var(--copper);
}
.sops-config {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 16px 18px;
  margin-bottom: 22px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px 16px;
  align-items: end;
}
.sops-config-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sops-config-label > span {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.sops-config-label input {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 9px 11px;
  font-family: var(--mono);
  font-size: 12.5px;
  outline: none;
  transition: border-color 120ms ease;
}
.sops-config-label input:focus {
  border-color: var(--copper);
}
.sops-config-actions {
  display: flex;
  gap: 8px;
}
.sops-config-stamp {
  grid-column: 1 / -1;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-shell {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 22px;
  align-items: start;
}
.sops-rail {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 14px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}
.sops-rail-head {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.sops-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sops-group-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--copper);
  margin: 4px 0 4px 4px;
}
.sops-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sops-list-item {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  text-align: left;
  display: grid;
  gap: 3px;
  padding: 8px 10px;
  cursor: pointer;
  color: var(--text);
  transition: background 120ms ease, border-color 120ms ease;
}
.sops-list-item:hover {
  background: rgba(var(--ink), 0.02);
  border-color: var(--border);
}
.sops-list-item.is-active {
  background: color-mix(in srgb, var(--copper) 8%, transparent);
  border-color: var(--copper);
}
.sops-list-title {
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
}
.sops-list-meta {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-empty {
  padding: 24px 12px;
  text-align: center;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-empty strong {
  color: var(--copper);
  font-weight: 600;
}
.sops-empty.sops-err {
  color: var(--danger);
  letter-spacing: 0.06em;
  text-transform: none;
  font-size: 12px;
}
.sops-pane {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 22px 26px;
  min-height: 480px;
}
.sops-pane-empty {
  padding: 80px 12px;
  text-align: center;
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-pane-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 14px;
  margin-bottom: 18px;
}
.sops-pane-head-left { flex: 1; min-width: 0; }
.sops-pane-head h2 {
  margin: 0;
  font-family: var(--sans);
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
}
.sops-summary {
  margin: 6px 0 0;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.sops-pane-head-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.sops-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sop-md h1 {
  font-family: var(--sans);
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
  margin: 14px 0 6px;
}
.sop-md h2 {
  font-family: var(--sans);
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
  margin: 22px 0 8px;
}
.sop-md h3 {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  margin: 16px 0 6px;
  letter-spacing: 0.02em;
}
.sop-md p {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.62;
  color: var(--text-muted);
  margin: 0 0 10px;
}
.sop-md a {
  color: var(--copper);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.sop-md p em { color: var(--text-faint); }
.sop-md code {
  font-family: var(--mono);
  font-size: 12.5px;
  background: var(--bg-void);
  padding: 1px 6px;
  border: 1px solid var(--border);
  color: var(--copper);
}
.sop-md p strong {
  color: var(--text);
  font-weight: 600;
}
.sop-bullets {
  list-style: none;
  margin: 0 0 10px;
  padding: 0;
}
.sop-bullets li {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
  padding: 2px 0 2px 18px;
  position: relative;
}
.sop-bullets li::before {
  content: "›";
  position: absolute;
  left: 0;
  color: var(--copper);
}
.sop-rule {
  border: none;
  border-top: 1px solid var(--border);
  margin: 18px 0;
}
.sop-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 10px;
  margin: 2px 0;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.55;
  color: var(--text);
  cursor: pointer;
}
.sop-step-sub {
  padding-left: 36px;
}
.sop-step input[type="checkbox"] {
  margin-top: 3px;
  flex-shrink: 0;
  accent-color: var(--copper);
  cursor: pointer;
}
.sop-step:has(input:checked) > span {
  color: var(--text-faint);
  text-decoration: line-through;
}
.sop-step-done > span {
  color: var(--text-faint);
  text-decoration: line-through;
}
.sops-btn-primary, .sops-btn-ghost {
  background: var(--bg-void);
  border: 1px solid var(--border);
  color: var(--copper);
  padding: 0 16px;
  height: 36px;
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.sops-btn-primary:hover:not(:disabled) {
  border-color: var(--copper);
  background: color-mix(in srgb, var(--copper) 8%, transparent);
}
.sops-btn-ghost { color: var(--text-muted); }
.sops-btn-ghost:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--text-muted);
}
.sops-btn-primary:disabled, .sops-btn-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .sops-shell { grid-template-columns: 1fr; }
  .sops-config { grid-template-columns: 1fr; }
  .sops-rail { position: static; max-height: none; }
}
`;
