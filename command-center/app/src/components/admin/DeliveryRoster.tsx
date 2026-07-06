import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Search, HeartHandshake } from "lucide-react";
import { useAdminClientsQuery } from "../../hooks/useApi";
import { formatMoney } from "../../lib/format";
import {
  ROSTER_FILTERS,
  filterRoster,
  healthDotClass,
  type RosterFilter,
} from "../../lib/deliveryRoster";

// The persistent Service Delivery roster rail: search + a health segmented
// filter, a pinned "Delivery overview" row, then one row per tenant. Shared
// by AdminDelivery (no selection) and the per-tenant cockpit (Task 3.2), so
// the rail stays visible and in sync while a tenant is selected.
export default function DeliveryRoster({ selectedTenantId }: { selectedTenantId?: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const clientsQuery = useAdminClientsQuery(true);
  const clients = clientsQuery.data?.clients ?? [];

  const filtered = useMemo(
    () => filterRoster(clients, query, filter),
    [clients, query, filter],
  );

  return (
    <aside className="pk-roster">
      <div className="pk-roster-head">
        <div className="pk-roster-head-row">
          <h2 className="pk-roster-title">Fulfillment</h2>
          <span className="pk-roster-count">
            {clientsQuery.isLoading ? "..." : filtered.length}
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
      </div>

      <div className="pk-roster-filters">
        {ROSTER_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`pk-roster-filter-btn${filter === f.id ? " on" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="pk-roster-list">
        <Link
          to="/admin/delivery"
          className={`pk-roster-row pk-roster-pinned${!selectedTenantId ? " active" : ""}`}
        >
          <span className="pk-roster-avatar pk-roster-avatar-pinned" aria-hidden>
            <HeartHandshake size={16} />
          </span>
          <span className="pk-roster-who">
            <b>Delivery overview</b>
            <span>Pillar health &amp; constraint</span>
          </span>
        </Link>

        {clientsQuery.isLoading ? (
          <div className="pk-roster-empty">Loading clients...</div>
        ) : clientsQuery.isError ? (
          <div className="pk-roster-empty">Could not load clients.</div>
        ) : filtered.length === 0 ? (
          <div className="pk-roster-empty">
            {clients.length === 0 ? "No clients yet." : "No clients match."}
          </div>
        ) : (
          filtered.map((c) => (
            <Link
              key={c.id}
              to={`/admin/delivery/${c.id}`}
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
                <span className={`pk-roster-dot ${healthDotClass(c.healthStatus)}`} aria-hidden />
                <span className="pk-roster-spend">
                  {c.healthStatus === "paused" ? "-" : formatMoney(c.monthlySpend)}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
