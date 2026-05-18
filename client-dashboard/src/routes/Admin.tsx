import { useMemo, useState } from "react";
import { LogOut } from "lucide-react";
import Shell from "../components/Shell";
import SearchBar from "../components/SearchBar";
import EmptyState from "../components/EmptyState";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { useAdminClientsQuery } from "../hooks/useApi";
import { formatMoney } from "../lib/formatMoney";
import type { AdminClient } from "../lib/api";

export default function Admin() {
  const { session, signOut, currentUser } = useAuth();
  const useReal = Boolean(session);
  const query = useAdminClientsQuery(useReal);
  const [search, setSearch] = useState("");

  const clients: AdminClient[] = useMemo(
    () => query.data?.clients ?? [],
    [query.data],
  );

  const trimmed = search.trim();
  const visible = useMemo(() => {
    if (!trimmed) return clients;
    const q = trimmed.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.niche.toLowerCase().includes(q),
    );
  }, [clients, trimmed]);

  return (
    <Shell>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <div className="label-cap">Hauck Marketing</div>
          <div className="mt-0.5 truncate font-display text-lg font-bold tracking-tight text-[var(--text)]">
            Admin
          </div>
        </div>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
          aria-label="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </header>

      <div className="mb-2 mt-4 flex items-end justify-between px-5">
        <div className="flex flex-col gap-1">
          <span
            className="label-cap-strong"
            style={{ color: "var(--brand-primary)" }}
          >
            Clients
          </span>
          <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text)]">
            {query.isLoading ? (
              <>Loading clients...</>
            ) : trimmed ? (
              <>
                {visible.length} of {clients.length}{" "}
                {clients.length === 1 ? "client" : "clients"}
              </>
            ) : (
              <>
                {clients.length} {clients.length === 1 ? "client" : "clients"} on the
                mobile app
              </>
            )}
          </h2>
          {currentUser?.email && (
            <p className="text-xs text-[var(--text-faint)]">
              Signed in as {currentUser.email}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 pt-4">
        <SearchBar value={search} onChange={setSearch} />
      </div>

      <main className="mt-4 flex flex-1 flex-col px-5 pb-6">
        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load clients.{" "}
            {(query.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : query.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand)]"
              aria-hidden="true"
            />
          </div>
        ) : visible.length === 0 ? (
          trimmed ? (
            <EmptyState message={`No clients match "${trimmed}"`} />
          ) : (
            <EmptyState message="No clients on the mobile app yet." />
          )
        ) : (
          <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {visible.map((c, idx) => (
              <li key={c.id}>
                <ClientRow client={c} isLast={idx === visible.length - 1} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </Shell>
  );
}

interface ClientRowProps {
  client: AdminClient;
  isLast: boolean;
}

function ClientRow({ client, isLast }: ClientRowProps) {
  return (
    <div
      className={
        "flex items-center gap-3 bg-[var(--surface)] px-4 py-3.5" +
        (isLast ? "" : " border-b border-[var(--divider)]")
      }
      style={{ minHeight: "68px" }}
    >
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold text-white"
        style={{ backgroundColor: client.brandColor || "#1d6fb8" }}
        aria-hidden="true"
      >
        {client.brandInitials || client.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[15px] font-bold text-[var(--text)]">
          {client.name}
        </div>
        <div className="mt-0.5 truncate text-xs text-[var(--text-faint)]">
          {client.niche} | {client.appName}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs font-semibold text-[var(--text-muted)]">
          {formatMoney(client.monthlySpend)}/mo
        </span>
        <span className="tabular-figs text-[10.5px] font-semibold text-[var(--text-faint)]">
          {client.memberCount} {client.memberCount === 1 ? "user" : "users"}
        </span>
      </div>
    </div>
  );
}
