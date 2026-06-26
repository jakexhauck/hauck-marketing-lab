import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Hammer,
  PackageCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  FlaskConical,
} from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import {
  parseBuildPlan,
  groupByStatus,
  BUILD_STATUS_ORDER,
  BUILD_STATUS_LABEL,
  type BuildItem,
  type BuildFile,
  type BuildStatus,
} from "../../lib/builds";

// Build Lab. A read-only, live status board over the Hermes build pipeline. Each
// card is a plan file in vault/Plans/Builds/ on the repo; Hermes files them and
// the builder moves them idea -> building -> ready -> done. We poll the admin
// GitHub proxy and render the four columns. No capture/edit here: state is owned
// by Hermes + the builder through the repo. See
// docs/superpowers/specs/2026-06-26-build-lab-github-status-board-design.md.

const POLL_MS = 30_000;

const STATUS_ICON: Record<BuildStatus, typeof Sparkles> = {
  idea: Sparkles,
  building: Hammer,
  ready: PackageCheck,
  done: CheckCircle2,
};

export default function AdminBuild() {
  const [items, setItems] = useState<BuildItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/builds");
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `request failed (${res.status})`);
      }
      const { files } = (await res.json()) as { files: BuildFile[] };
      const parsed = files
        .map(parseBuildPlan)
        .filter((i): i is BuildItem => i !== null)
        .sort((a, b) => (b.created || "").localeCompare(a.created || ""));
      setItems(parsed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not load builds");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const grouped = useMemo(() => groupByStatus(items ?? []), [items]);
  const buildingCount = grouped.building.length;
  const doneCount = grouped.done.length;

  const subtitle =
    items === null
      ? "Loading the build pipeline..."
      : `${doneCount} shipped · ${buildingCount} building · ${items.length} total`;

  return (
    <DesktopPage
      title="Build Lab"
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => window.open("/home?demo=1", "_blank")}
            title="Open the client app in a new tab with fabricated demo data"
          >
            <FlaskConical size={16} /> Demo client view
          </Button>
          <Button variant="secondary" onClick={load} title="Refresh the board">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-[14px] text-text shadow-[var(--shadow-sm)]">
          Could not load builds: {error}
        </div>
      )}

      {items === null && !error ? (
        <div className="text-[14px] text-muted">Loading builds...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {BUILD_STATUS_ORDER.map((status) => {
            const Icon = STATUS_ICON[status];
            const col = grouped[status];
            return (
              <section
                key={status}
                className="rounded-[var(--radius-lg)] border border-border bg-surface p-3 shadow-[var(--shadow-sm)]"
              >
                <header className="mb-3 flex items-center gap-2 text-[13px] font-medium text-text">
                  <Icon size={15} />
                  {BUILD_STATUS_LABEL[status]}
                  <span className="ml-auto text-muted">{col.length}</span>
                </header>
                <div className="flex flex-col gap-2">
                  {col.length === 0 ? (
                    <p className="px-1 py-3 text-[13px] text-faint">Nothing here.</p>
                  ) : (
                    col.map((item) => <BuildCardView key={item.slug} item={item} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </DesktopPage>
  );
}

function BuildCardView({ item }: { item: BuildItem }) {
  return (
    <article className="rounded-[var(--radius)] border border-border bg-bg p-3">
      <h3 className="text-[14px] font-medium text-text">{item.title}</h3>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
        <span className="rounded-full border border-border px-2 py-0.5">{item.kind}</span>
        {item.issueUrl && (
          <a
            href={item.issueUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-text"
          >
            #{item.issue} <ExternalLink size={11} />
          </a>
        )}
        <a
          href={item.planUrl}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 hover:text-text"
        >
          plan <ExternalLink size={11} />
        </a>
      </div>
    </article>
  );
}
