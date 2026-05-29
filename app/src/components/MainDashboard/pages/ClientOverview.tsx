import { useEffect, useState } from "react";
import { api } from "../../../lib/tauri";
import { openInAppWindow } from "../../../lib/openInApp";
import type { ClientEntry, DriveIndex } from "../../../lib/types";

interface Props {
  clientName: string;
  clientSlug: string;
  client: ClientEntry | null;
  root: string | null;
  onBack: () => void;
}

export function ClientOverview({ clientName, clientSlug, client, root, onBack }: Props) {
  const [driveIndex, setDriveIndex] = useState<DriveIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driveUrl = client?.drive_folder_url ?? null;
  const canLoadContext = Boolean(root && driveUrl);

  useEffect(() => {
    let cancelled = false;
    if (!root) {
      setDriveIndex(null);
      return;
    }
    setLoading(true);
    api
      .readDriveIndex(root, clientSlug)
      .then((idx) => {
        if (!cancelled) {
          setDriveIndex(idx);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  const handleRefresh = async () => {
    if (!root || !driveUrl) return;
    setRefreshing(true);
    setError(null);
    try {
      const next = await api.refreshDriveIndex(root, clientSlug);
      setDriveIndex(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const formattedUpdated = driveIndex?.updated_at
    ? formatTimestamp(driveIndex.updated_at)
    : null;

  return (
    <div className="md-overview">
      <button type="button" className="md-back" onClick={onBack}>
        ◂ Back to dashboard
      </button>

      <header className="md-overview-head">
        <span className="md-page-head-eyebrow">▸ Client · Overview</span>
        <h1>{clientName}</h1>
        <div className="md-overview-meta">
          <span className="md-mono-faint">data/{clientSlug}/</span>
          {client?.status && (
            <span className="md-overview-status">{client.status.toUpperCase()}</span>
          )}
        </div>
      </header>

      <section className="md-card md-overview-card">
        <div className="md-card-head">
          <div>
            <div className="md-card-eyebrow">▸ GOOGLE DRIVE</div>
            <div className="md-card-title">Client folder</div>
          </div>
          {driveUrl ? (
            <a
              className="md-card-cta"
              href={driveUrl}
              target="_blank"
              rel="noreferrer"
              title={driveUrl}
              onClick={(e) => {
                e.preventDefault();
                openInAppWindow(driveUrl, "Google Drive");
              }}
            >
              Open in Drive ↗
            </a>
          ) : (
            <span className="md-card-cta md-card-cta--ghost">(not linked)</span>
          )}
        </div>
        {driveUrl ? (
          <p className="md-card-sub md-mono-faint">{truncate(driveUrl, 80)}</p>
        ) : (
          <p className="md-card-sub md-mono-faint">
            Add a Google Drive folder URL on the Clients page to enable one-click access
            and agent context loading.
          </p>
        )}
      </section>

      <section className="md-card md-overview-card">
        <div className="md-card-head">
          <div>
            <div className="md-card-eyebrow">▸ CLIENT CONTEXT</div>
            <div className="md-card-title">Drive index</div>
          </div>
          <button
            type="button"
            className="md-card-cta"
            onClick={handleRefresh}
            disabled={!canLoadContext || refreshing}
            title={
              !root
                ? "Pick a media-buying folder first."
                : !driveUrl
                  ? "Add a Drive URL to this client first."
                  : "Read the client's Drive folder and cache a context briefing."
            }
          >
            {refreshing
              ? "Loading…"
              : driveIndex
                ? "↻ Refresh context"
                : "Load context"}
          </button>
        </div>

        {loading && !driveIndex && (
          <p className="md-card-sub md-mono-faint">Reading cached context…</p>
        )}

        {!loading && !driveIndex && !error && (
          <p className="md-card-sub md-mono-faint">
            No context cached yet. Click <strong>Load context</strong> to have an agent
            read the Drive folder and write a briefing to{" "}
            <code>data/{clientSlug}/_drive-index.md</code>. This may take a minute.
          </p>
        )}

        {formattedUpdated && (
          <p className="md-card-sub md-mono-faint">Last updated · {formattedUpdated}</p>
        )}

        {error && <p className="md-overview-err">{error}</p>}

        {driveIndex && (
          <pre className="md-overview-preview">{truncate(driveIndex.body, 1800)}</pre>
        )}
      </section>
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}
