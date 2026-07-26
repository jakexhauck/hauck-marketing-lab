import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useAdminOnboardingListQuery } from "../../../hooks/useApi";

// The persistent Onboarding roster rail: search, then one row per client with
// how far through the checklist they are.
//
// It mirrors DeliveryRoster deliberately (same rail, same rows) but shows a
// different number: Fulfillment's rail leads with monthly spend, because that is
// what matters once a client is running. Here the client is not running yet, so
// the rail leads with what is left to do.

export default function OnboardingRoster({ selectedTenantId }: { selectedTenantId?: string }) {
  const [query, setQuery] = useState("");
  const listQuery = useAdminOnboardingListQuery();
  const clients = listQuery.data?.clients ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.niche.toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <aside className="pk-roster">
      <div className="pk-roster-head">
        <div className="pk-roster-head-row">
          <h2 className="pk-roster-title">Onboarding</h2>
          <span className="pk-roster-count">
            {listQuery.isLoading ? "..." : filtered.length}
          </span>
        </div>
        <label className="pk-roster-search">
          <Search size={14} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients..."
            aria-label="Search clients"
          />
        </label>

        <Link
          to="/admin/clients/new"
          className="mt-2.5 flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-[13px] font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--brand)] hover:bg-[var(--surface-2)] hover:text-[var(--brand-text)]"
        >
          <Plus size={14} aria-hidden />
          New client
        </Link>
      </div>

      <div className="pk-roster-list">
        {listQuery.isLoading ? (
          <div className="pk-roster-empty">Loading clients...</div>
        ) : listQuery.isError ? (
          <div className="pk-roster-empty">Could not load clients.</div>
        ) : filtered.length === 0 ? (
          <div className="pk-roster-empty">
            {clients.length === 0 ? "No clients yet." : "No clients match."}
          </div>
        ) : (
          filtered.map((c) => (
            <Link
              key={c.id}
              to={`/admin/onboarding/${c.id}`}
              className={`pk-roster-row${selectedTenantId === c.id ? " active" : ""}`}
              style={{ "--rc": c.brandColor } as CSSProperties}
            >
              <span className="pk-roster-avatar" style={{ background: c.brandColor }}>
                {c.brandInitials || c.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="pk-roster-who">
                <b>{c.name}</b>
                <span>{c.niche || "-"}</span>
              </span>
              <span className="pk-roster-side">
                <span className="pk-roster-spend">
                  {c.tasksDone}/{c.tasksTotal}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
