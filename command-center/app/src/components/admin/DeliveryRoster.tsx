import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useAdminClientsQuery } from "../../hooks/useApi";
import { formatMoney } from "../../lib/format";
import { filterRoster } from "../../lib/deliveryRoster";

// The persistent Service Delivery roster rail: search, then one row per
// tenant. Shared by AdminDelivery (no selection) and the per-tenant cockpit
// (Task 3.2), so the rail stays visible and in sync while a tenant is
// selected.
export default function DeliveryRoster({ selectedTenantId }: { selectedTenantId?: string }) {
  const [query, setQuery] = useState("");
  const clientsQuery = useAdminClientsQuery(true);
  const clients = clientsQuery.data?.clients ?? [];

  const filtered = useMemo(() => filterRoster(clients, query), [clients, query]);

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

      <div className="pk-roster-list">
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
                <span className="pk-roster-spend">{formatMoney(c.monthlySpend)}</span>
              </span>
            </Link>
          ))
        )}
      </div>
    </aside>
  );
}
