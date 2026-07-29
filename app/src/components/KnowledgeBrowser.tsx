import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { KnowledgeChunk, KnowledgeTitle } from "../lib/types";

type Props = {
  root: string;
  initialChunkId?: string | null;
  onClose: () => void;
  onPinToChat: (chunk: KnowledgeChunk) => void;
};

function fuzzyScore(query: string, target: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  let prev = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      let bonus = 1;
      if (i === prev + 1) {
        streak++;
        bonus += streak * 2;
      } else {
        streak = 0;
      }
      if (i === 0 || /[\s\-_/.]/.test(t[i - 1])) bonus += 3;
      score += bonus;
      prev = i;
      qi++;
    }
  }
  return qi === q.length ? score : 0;
}

type ListItem = KnowledgeTitle & { tags: string[] };

export function KnowledgeBrowser({ root, initialChunkId, onClose, onPinToChat }: Props) {
  const [titles, setTitles] = useState<KnowledgeTitle[] | null>(null);
  const [chunkCache, setChunkCache] = useState<Record<string, KnowledgeChunk>>({});
  const [selectedId, setSelectedId] = useState<string | null>(initialChunkId ?? null);
  const [query, setQuery] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<string | null>(null);
  const readPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await api.listKnowledgeTitles(root);
        if (!mounted) return;
        setTitles(list);
        if (!selectedId && list.length > 0 && !initialChunkId) {
          setSelectedId(list[0].id);
        }
      } catch (e) {
        if (!mounted) return;
        setListError(String(e));
        setTitles([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [root, initialChunkId, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    if (chunkCache[selectedId]) return;
    let mounted = true;
    setReadingId(selectedId);
    setReadError(null);
    (async () => {
      try {
        const chunk = await api.readKnowledgeChunk(root, selectedId);
        if (!mounted) return;
        setChunkCache((prev) => ({ ...prev, [chunk.id]: chunk }));
      } catch (e) {
        if (!mounted) return;
        setReadError(String(e));
      } finally {
        if (mounted) setReadingId(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [root, selectedId, chunkCache]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = readPaneRef.current;
    if (el) el.scrollTop = 0;
  }, [selectedId]);

  const items: ListItem[] = useMemo(() => {
    if (!titles) return [];
    return titles.map((t) => {
      const cached = chunkCache[t.id];
      return { ...t, tags: cached?.tags ?? [] };
    });
  }, [titles, chunkCache]);

  const allTags = useMemo(() => {
    const seen = new Set<string>();
    for (const it of items) {
      for (const tag of it.tags) seen.add(tag);
    }
    return Array.from(seen).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim();
    let pool = items;
    if (activeTags.length > 0) {
      pool = pool.filter((it) => activeTags.every((t) => it.tags.includes(t)));
    }
    if (!q) return pool;
    return pool
      .map((it) => {
        const s = Math.max(
          fuzzyScore(q, it.id),
          fuzzyScore(q, it.title),
          ...it.tags.map((t) => fuzzyScore(q, t)),
        );
        return { it, s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  }, [items, query, activeTags]);

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const selectedChunk = selectedId ? chunkCache[selectedId] ?? null : null;

  return (
    <main className="main" style={{ position: "relative" }}>
      <section className="hero reveal reveal-1" style={{ padding: "32px 40px", marginBottom: 24 }}>
        <div className="hero-eyebrow">
          <span>▸ KNOWLEDGE</span>
          <span className="panel-meta">{titles?.length ?? 0} chunks · TFC corpus</span>
          <span style={{ marginLeft: "auto", color: "var(--text-faint)", fontWeight: 400 }}>
            search · filter · pin
          </span>
          <button
            type="button"
            className="drawer-close"
            onClick={onClose}
            title="Close knowledge browser"
            aria-label="Close knowledge browser"
            style={{ marginLeft: 12 }}
          >
            ×
          </button>
        </div>
        <input
          type="text"
          className="kpi-form-input"
          placeholder="Search by id, title, or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            fontFamily: "var(--mono)",
            fontSize: 13.5,
            padding: "12px 14px",
            background: "var(--bg-deep)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
            outline: "none",
          }}
        />
        {allTags.length > 0 && (
          <div className="chips" style={{ marginTop: 16, maxHeight: 84, overflowY: "auto" }}>
            {allTags.map((tag) => (
              <button
                type="button"
                key={tag}
                className={`chip ${activeTags.includes(tag) ? "featured" : ""}`}
                onClick={() => toggleTag(tag)}
                style={{ fontSize: 11.5, padding: "5px 10px" }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="row-split reveal reveal-2" style={{ marginBottom: 32 }}>
        <div className="panel" style={{ padding: 0 }}>
          <div
            className="panel-head"
            style={{ padding: "20px 24px 14px", marginBottom: 0 }}
          >
            <span className="panel-title">▸ CHUNKS</span>
            <span className="panel-meta">
              {filtered.length} / {items.length}
            </span>
          </div>
          <div
            className="kb-list"
            style={{
              maxHeight: 560,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {titles === null ? (
              <div className="thread-empty">▸ loading…</div>
            ) : filtered.length === 0 ? (
              <div className="thread-empty">▸ no chunks match</div>
            ) : (
              filtered.map((it) => (
                <button
                  type="button"
                  key={it.id}
                  className={`kb-row ${selectedId === it.id ? "active" : ""}`}
                  onClick={() => setSelectedId(it.id)}
                >
                  <span className="kb-row-id">{it.id}</span>
                  <span className="kb-row-title">{it.title}</span>
                  {it.tags.length > 0 && (
                    <span className="kb-row-tags">
                      {it.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="kb-row-tag">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          {listError && (
            <div
              style={{
                padding: "10px 24px",
                fontFamily: "var(--mono)",
                fontSize: 11.5,
                color: "var(--signal-stop)",
                borderTop: "1px solid var(--border)",
              }}
            >
              {listError}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          <div
            className="panel-head"
            style={{ padding: "20px 24px 14px", marginBottom: 0 }}
          >
            <span className="panel-title">
              {selectedChunk ? `▸ ${selectedChunk.id}` : "▸ READ PANE"}
            </span>
            <span className="panel-meta">
              {selectedChunk
                ? `${selectedChunk.body.length.toLocaleString()} chars`
                : selectedId
                ? "loading"
                : "select a chunk"}
            </span>
          </div>

          {selectedChunk && (
            <div
              style={{
                padding: "0 24px 16px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--sans)",
                  fontSize: 17,
                  fontWeight: 500,
                  color: "var(--text)",
                  letterSpacing: "-0.012em",
                  marginBottom: 10,
                }}
              >
                {selectedChunk.title}
              </div>
              {selectedChunk.tags.length > 0 && (
                <div className="chips" style={{ gap: 6 }}>
                  {selectedChunk.tags.map((tag) => (
                    <span
                      key={tag}
                      className="chip"
                      style={{
                        fontSize: 10.5,
                        padding: "3px 8px",
                        cursor: "default",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            ref={readPaneRef}
            className="kb-read"
            style={{
              flex: 1,
              maxHeight: 470,
              overflowY: "auto",
              padding: "18px 24px",
              fontFamily: "var(--sans)",
              fontSize: 14,
              lineHeight: 1.62,
              color: "var(--text-mid)",
              whiteSpace: "pre-wrap",
              wordWrap: "break-word",
            }}
          >
            {readError ? (
              <span style={{ color: "var(--signal-stop)", fontFamily: "var(--mono)", fontSize: 12 }}>
                {readError}
              </span>
            ) : selectedChunk ? (
              selectedChunk.body
            ) : readingId ? (
              <span className="thread-empty" style={{ display: "block" }}>
                ▸ loading chunk…
              </span>
            ) : (
              <span className="thread-empty" style={{ display: "block" }}>
                ▸ select a chunk from the list
              </span>
            )}
          </div>

          {selectedChunk && (
            <div
              className="actions-row"
              style={{
                margin: 0,
                padding: "16px 24px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                type="button"
                className="action primary"
                onClick={() => onPinToChat(selectedChunk)}
              >
                Pin to chat
              </button>
              <span
                style={{
                  marginLeft: "auto",
                  alignSelf: "center",
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  letterSpacing: "0.16em",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                }}
              >
                {selectedChunk.path.split(/[\\/]/).slice(-2).join("/")}
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
