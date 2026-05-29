import { useCallback, useEffect, useRef, useState } from "react";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../../lib/tauri";
import type { ProspectFile, ScraperEvent } from "../../lib/types";
import { logActivity } from "../../lib/activity";

interface LeadScraperPageProps {
  root: string | null;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtWhen(unix: number): string {
  if (!unix) return "—";
  const d = new Date(unix * 1000);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LeadScraperPage({ root }: LeadScraperPageProps) {
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [files, setFiles] = useState<ProspectFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [doneCsv, setDoneCsv] = useState<string | null>(null);
  const [scraperDir, setScraperDir] = useState<string | null>(null);
  const [prospectsDir, setProspectsDir] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const runIdRef = useRef<string>("");
  const runMetaRef = useRef<{ niche: string; city: string }>({ niche: "", city: "" });

  const refreshFiles = useCallback(async () => {
    if (!root) return;
    try {
      const next = await api.listProspectFiles(root);
      setFiles(next);
    } catch (e) {
      console.warn("listProspectFiles failed:", e);
    }
  }, [root]);

  useEffect(() => {
    if (!root) return;
    void refreshFiles();
    api
      .leadScraperPaths(root)
      .then(([dir, prospects]) => {
        setScraperDir(dir);
        setProspectsDir(prospects);
      })
      .catch((e) => {
        setError(String(e));
      });
  }, [root, refreshFiles]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await api.onLeadScraperStream((evt: ScraperEvent) => {
        if (evt.id !== runIdRef.current) return;
        if (evt.kind === "started") {
          setLogLines((prev) => [...prev, "▸ Scraper started…"]);
        } else if (evt.kind === "line") {
          setLogLines((prev) => [...prev, evt.text]);
        } else if (evt.kind === "done") {
          setRunning(false);
          setLogLines((prev) => [
            ...prev,
            "",
            evt.exit_code === 0
              ? "✓ Scraper finished successfully."
              : `✗ Scraper exited with code ${evt.exit_code}.`,
          ]);
          setDoneCsv(evt.csv_path);
          void refreshFiles();
          if (evt.exit_code === 0) {
            const { niche: nm, city: ct } = runMetaRef.current;
            void logActivity(root, {
              type: "scraper.run",
              summary: `Scraped leads (${nm} · ${ct})`,
              refPath: evt.csv_path ?? undefined,
            });
          }
        } else if (evt.kind === "error") {
          setError(evt.message);
          setRunning(false);
        }
      });
    })();
    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshFiles, root]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logLines.length]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!root) {
      setError("No media-buying folder configured. Pick the folder from Settings first.");
      return;
    }
    const n = niche.trim();
    const c = city.trim();
    if (!n || !c) {
      setError("Both niche and city are required.");
      return;
    }
    setError(null);
    setDoneCsv(null);
    setLogLines([]);
    setRunning(true);
    const id = `lead-${Date.now().toString(36)}`;
    runIdRef.current = id;
    runMetaRef.current = { niche: n, city: c };
    try {
      await api.runLeadScraper(id, root, n, c);
    } catch (err) {
      setError(String(err));
      setRunning(false);
    }
  };

  const onOpenFile = async (path: string) => {
    try {
      await openPath(path);
    } catch (e) {
      console.warn("openPath failed:", e);
    }
  };

  const onRevealFile = async (path: string) => {
    try {
      await revealItemInDir(path);
    } catch (e) {
      console.warn("revealItemInDir failed:", e);
    }
  };

  const onOpenProspectsFolder = async () => {
    if (!prospectsDir) return;
    try {
      await openPath(prospectsDir);
    } catch (e) {
      console.warn("openPath failed:", e);
    }
  };

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Outreach
          </div>
          <h1 className="hml-page-title">Lead Scraper</h1>
          <div className="hml-page-subtitle">
            Find local-business prospects by niche and city. Each lead is scored
            1–5 for how easy they are to close, then dropped in
            <code style={{ fontFamily: "var(--hml-font-mono)", color: "var(--hml-accent)", padding: "0 4px" }}>prospects/</code>
            and a fresh tab in the configured Google Sheet.
          </div>
        </div>
      </section>

      <div className="ls-root">

      <div className="ls-grid md-reveal md-reveal-3">
        <form className="ls-card ls-form" onSubmit={onSubmit}>
          <div className="ls-card-head">
            <span className="ls-card-eyebrow">▸ Run scraper</span>
            <h2>New search</h2>
          </div>

          <label className="ls-field">
            <span className="ls-label">Niche</span>
            <input
              type="text"
              className="ls-input"
              placeholder="dentists · HVAC companies · med spas"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              disabled={running}
              autoFocus
            />
            <span className="ls-hint">The kind of local business you want to scrape.</span>
          </label>

          <label className="ls-field">
            <span className="ls-label">City, state</span>
            <input
              type="text"
              className="ls-input"
              placeholder="Tampa, FL"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={running}
            />
            <span className="ls-hint">Where to search. Include the state for accuracy.</span>
          </label>

          {error && <div className="ls-error">{error}</div>}

          <div className="ls-actions">
            <button type="submit" className="ls-run" disabled={running || !root}>
              {running ? "Running…" : "Run scraper"}
            </button>
            <button
              type="button"
              className="ls-secondary"
              onClick={onOpenProspectsFolder}
              disabled={!prospectsDir}
            >
              Open prospects folder
            </button>
          </div>

          {!root && (
            <div className="ls-warn">
              No media-buying folder configured. Pick the folder from Settings (⚙)
              before running the scraper.
            </div>
          )}
          {scraperDir && (
            <div className="ls-path-line" title={scraperDir}>
              Script: <code>{scraperDir}\scrape.py</code>
            </div>
          )}
        </form>

        <div className="ls-card ls-log">
          <div className="ls-card-head">
            <span className="ls-card-eyebrow">▸ Output</span>
            <h2>Live log</h2>
          </div>
          {logLines.length === 0 ? (
            <div className="ls-log-empty">
              Output from <code>scrape.py</code> will stream here once you run a search.
            </div>
          ) : (
            <pre className="ls-log-body">
              {logLines.join("\n")}
              <div ref={logEndRef} />
            </pre>
          )}
          {doneCsv && !running && (
            <div className="ls-done-row">
              <button type="button" className="ls-secondary" onClick={() => onOpenFile(doneCsv)}>
                Open latest CSV
              </button>
              <button type="button" className="ls-secondary" onClick={() => onRevealFile(doneCsv)}>
                Show in folder
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="ls-card ls-files md-reveal md-reveal-4">
        <div className="ls-card-head">
          <span className="ls-card-eyebrow">▸ History</span>
          <h2>Saved prospect CSVs</h2>
          <button type="button" className="ls-link" onClick={() => void refreshFiles()}>
            Refresh
          </button>
        </div>
        {files.length === 0 ? (
          <div className="ls-log-empty">No CSVs yet. Run a search and they'll show up here.</div>
        ) : (
          <div className="ls-file-list">
            {files.map((f) => (
              <div key={f.path} className="ls-file-row">
                <div className="ls-file-name" title={f.path}>{f.name}</div>
                <div className="ls-file-meta">{fmtWhen(f.modified_unix)} · {fmtSize(f.size_bytes)}</div>
                <div className="ls-file-actions">
                  <button type="button" className="ls-link" onClick={() => onOpenFile(f.path)}>
                    Open
                  </button>
                  <button type="button" className="ls-link" onClick={() => onRevealFile(f.path)}>
                    Reveal
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
