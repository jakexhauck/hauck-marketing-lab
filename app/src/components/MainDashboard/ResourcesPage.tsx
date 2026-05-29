import { useMemo, useState } from "react";
import "./resources/resources.css";
import { ARTICLES, CATEGORIES } from "./resources/articles";
import { BlockRenderer } from "./resources/blocks";
import type { Article, CategoryId } from "./resources/types";

interface ResourcesPageProps {
  root: string | null;
}

export function ResourcesPage(_props: ResourcesPageProps) {
  const [activeId, setActiveId] = useState<string>(
    ARTICLES[0]?.id ?? ""
  );
  const [query, setQuery] = useState("");

  const activeArticle: Article | undefined = useMemo(
    () => ARTICLES.find((a) => a.id === activeId),
    [activeId]
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<CategoryId, Article[]>();
    for (const cat of CATEGORIES) map.set(cat.id, []);
    for (const a of ARTICLES) {
      if (q && !a.title.toLowerCase().includes(q) && !a.lede.toLowerCase().includes(q)) {
        continue;
      }
      map.get(a.category)?.push(a);
    }
    return map;
  }, [query]);

  const activeCategoryLabel =
    CATEGORIES.find((c) => c.id === activeArticle?.category)?.label ?? "";

  const sections = useMemo(
    () =>
      activeArticle?.body.filter(
        (b): b is Extract<typeof b, { kind: "section" }> => b.kind === "section"
      ) ?? [],
    [activeArticle]
  );

  const flatArticles = ARTICLES;
  const activeIndex = flatArticles.findIndex((a) => a.id === activeId);
  const prevArticle = activeIndex > 0 ? flatArticles[activeIndex - 1] : null;
  const nextArticle =
    activeIndex >= 0 && activeIndex < flatArticles.length - 1
      ? flatArticles[activeIndex + 1]
      : null;

  return (
    <div className="rsx-shell">
      {/* LEFT RAIL */}
      <aside className="rsx-rail">
        <div className="rsx-rail-head">
          <div className="rsx-rail-eyebrow">Workspace</div>
          <div className="rsx-rail-title">Resources</div>
        </div>

        <div className="rsx-rail-search">
          <input
            type="text"
            placeholder={`Search ${ARTICLES.length} article${ARTICLES.length === 1 ? "" : "s"}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="rsx-rail-search-kbd">⌘K</kbd>
        </div>

        {CATEGORIES.map((cat) => {
          const items = grouped.get(cat.id) ?? [];
          return (
            <div key={cat.id} className="rsx-rail-group">
              <div className="rsx-rail-group-label">
                {cat.label}
                <span className="rsx-rail-group-count">
                  {String(items.length).padStart(2, "0")}
                </span>
              </div>
              <ul className="rsx-rail-list">
                {items.length === 0 ? (
                  <li className="rsx-rail-empty">Nothing here yet</li>
                ) : (
                  items.map((art) => (
                    <li key={art.id}>
                      <button
                        type="button"
                        className={art.id === activeId ? "rsx-active" : ""}
                        onClick={() => setActiveId(art.id)}
                      >
                        {art.title}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          );
        })}
      </aside>

      {/* MAIN */}
      <main className="rsx-main">
        {activeArticle ? (
          <>
            <div className="rsx-breadcrumb">
              Workspace · Resources ·{" "}
              <span className="rsx-breadcrumb-current">{activeCategoryLabel}</span>
            </div>

            <div className="rsx-meta">
              <span>{activeArticle.readTimeMin} min read</span>
              <span className="rsx-meta-sep">·</span>
              <span>Updated {formatDate(activeArticle.updated)}</span>
              {activeArticle.source && (
                <>
                  <span className="rsx-meta-sep">·</span>
                  <span>Source: {activeArticle.source.label}</span>
                </>
              )}
            </div>

            <h1 className="rsx-article-title">{activeArticle.title}</h1>
            <p className="rsx-article-lede">{activeArticle.lede}</p>

            {activeArticle.body.map((block, i) => (
              <BlockRenderer key={i} block={block} />
            ))}

            <nav className="rsx-article-foot">
              <button
                type="button"
                className="rsx-pager"
                disabled={!prevArticle}
                onClick={() => prevArticle && setActiveId(prevArticle.id)}
              >
                <div className="rsx-pager-dir">← Previous</div>
                <div className="rsx-pager-title">
                  {prevArticle?.title ?? "—"}
                </div>
              </button>
              <button
                type="button"
                className="rsx-pager rsx-pager-next"
                disabled={!nextArticle}
                onClick={() => nextArticle && setActiveId(nextArticle.id)}
              >
                <div className="rsx-pager-dir">Next →</div>
                <div className="rsx-pager-title">
                  {nextArticle?.title ?? "—"}
                </div>
              </button>
            </nav>
          </>
        ) : (
          <div className="rsx-empty">No article selected</div>
        )}
      </main>

      {/* RIGHT RAIL — ON THIS PAGE */}
      {sections.length > 0 && (
        <aside className="rsx-toc">
          <div className="rsx-toc-label">On this page</div>
          <ul>
            {sections.map((s, i) => (
              <li key={s.id} className={i === 0 ? "rsx-toc-active" : ""}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
