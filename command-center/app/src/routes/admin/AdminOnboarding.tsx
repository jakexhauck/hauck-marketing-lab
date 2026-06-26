import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Rocket } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { api } from "../../lib/api";

interface Row {
  id: string;
  name: string;
  slug: string;
  status: string;
  provisionedAt: string | null;
}

export default function AdminOnboarding() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<{ clients: Row[] }>("/api/admin/onboarding");
        if (!cancelled) setRows(data.clients ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DesktopPage
      title="Onboarding"
      subtitle="Provision a new client's GHL and track launch readiness"
    >
      {loading ? (
        <div className="flex items-center gap-2 px-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading clients...
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : rows.length === 0 ? (
        <div className="px-2 py-16 text-center text-sm text-muted">No clients yet.</div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-border">
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/admin/onboarding/${r.id}`}
              className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 last:border-b-0 hover:bg-surface-2"
            >
              <span className="font-medium text-text">{r.name}</span>
              <span className="flex items-center gap-2 text-[13px] text-muted">
                <Rocket size={14} /> {r.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </DesktopPage>
  );
}
