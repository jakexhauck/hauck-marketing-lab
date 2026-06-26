import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Building2,
  DollarSign,
  ListChecks,
  Loader2,
  ChevronRight,
  Search,
} from "lucide-react";
import { api, type AdminClient } from "../../lib/api";
import AdminHero, { type HeroKpi } from "./AdminHero";

// Agency-wide client overview. A dark "overview" hero with live KPIs sits above
// a calm clients table. Creating a client is intentionally absent here for now;
// a dedicated onboarding flow will own that. The data wiring stays in api().

function greet(): string {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `Good ${part}, Jake`;
}

function money(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `$${n.toLocaleString()}`;
}

export default function AdminClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [openTasks, setOpenTasks] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await api<{ clients: AdminClient[] }>("/api/admin/clients");
        if (!cancelled) setClients(data.clients ?? []);
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : "Could not load clients");
      } finally {
        if (!cancelled) setLoading(false);
      }
      // Open-task count is best-effort; the overview stays useful without it.
      try {
        const t = await api<{ tasks: { completed: boolean }[] }>("/api/admin/tasks");
        if (!cancelled) setOpenTasks((t.tasks ?? []).filter((x) => !x.completed).length);
      } catch {
        /* ignore: KPI simply hides */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalSpend = useMemo(
    () => clients.reduce((sum, c) => sum + (c.monthlySpend || 0), 0),
    [clients],
  );

  const kpis = useMemo<HeroKpi[]>(() => {
    const list: HeroKpi[] = [
      { icon: Building2, label: "Active clients", value: String(clients.length) },
      { icon: DollarSign, label: "Managed spend", value: money(totalSpend), delta: "per month" },
    ];
    if (openTasks !== null) {
      list.push({
        icon: ListChecks,
        label: "Open tasks",
        value: String(openTasks),
        delta: openTasks > 0 ? "needs attention" : "all clear",
        deltaUp: openTasks > 0,
      });
    }
    return list;
  }, [clients.length, totalSpend, openTasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.niche || "").toLowerCase().includes(q),
    );
  }, [clients, query]);

  // Embeddable board: this is the Operations Overview. The greeting hero sits
  // above the live clients table. No page chrome of its own (the pillar
  // workspace provides the header and padding); search lives in the table head.
  return (
    <div className="w-full">
      <AdminHero
        greeting={greet()}
        subtitle="Here is how the agency is running."
        kpis={kpis}
      />

      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-3 px-6 py-4">
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.02em]">All clients</h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold text-muted">
            {loading ? "..." : `${filtered.length} total`}
          </span>
          <label className="ml-auto flex w-[250px] items-center gap-2.5 rounded-full border border-border bg-surface px-3.5 py-2 text-faint transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--brand-tint)]">
            <Search size={15} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients..."
              className="w-full border-0 bg-transparent text-[13.5px] text-text outline-none placeholder:text-faint"
            />
          </label>
        </div>

          {loading ? (
            <div className="flex items-center gap-2 px-6 py-16 text-sm text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading clients...
            </div>
          ) : loadError ? (
            <div className="mx-6 mb-6 rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
              {loadError}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Building2 size={28} className="mx-auto mb-2 text-faint" />
              <p className="text-sm text-muted">
                {query ? "No clients match that search." : "No clients yet."}
              </p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-y border-divider px-6 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint">
                    Client
                  </th>
                  <th className="hidden border-y border-divider px-6 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint sm:table-cell">
                    Niche
                  </th>
                  <th className="border-y border-divider px-6 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.01em] text-faint">
                    Members
                  </th>
                  <th className="w-12 border-y border-divider px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/admin/clients/${c.id}`)}
                    className="group cursor-pointer border-b border-divider transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] font-display text-[13px] font-bold text-white shadow-[var(--shadow-sm)]"
                          style={{ background: c.brandColor || "var(--brand)" }}
                        >
                          {c.brandInitials || c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-display text-[14.5px] font-semibold tracking-[-0.01em]">
                          {c.name}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-6 py-4 sm:table-cell">
                      <span className="text-[14px] text-muted">{c.niche || "--"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 text-[14px] font-medium text-muted tabular-nums">
                        <Users size={15} className="text-faint" /> {c.memberCount}
                      </span>
                    </td>
                    <td className="px-2 py-4 text-right">
                      <ChevronRight
                        size={18}
                        className="text-faint transition-all group-hover:translate-x-1 group-hover:text-brand-text"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
    </div>
  );
}
