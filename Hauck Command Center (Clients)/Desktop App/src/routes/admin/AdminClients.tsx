import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, Users, ChevronRight } from "lucide-react";
import type { AdminClient } from "@hauck/core";
import { useAdminClientsQuery, useCreateClient } from "@/hooks/useApi";
import { useToast } from "@/context/ToastContext";
import { ApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import {
  Button,
  Input,
  Field,
  Modal,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/ui";

function money(n: number): string {
  return n ? `$${n.toLocaleString()}` : "—";
}

export function AdminClients() {
  const clientsQuery = useAdminClientsQuery();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const clients = clientsQuery.data?.clients ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.niche.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q),
    );
  }, [clients, query]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Clients"
        count={clients.length || undefined}
        description="Every business in the platform. Open one to manage its people, access and content."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> Register business
          </Button>
        }
        filters={
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="max-w-xs"
          />
        }
      />

      {clientsQuery.isLoading ? (
        <LoadingState label="Loading clients" />
      ) : clientsQuery.isError ? (
        <ErrorState description="Couldn't load clients." onRetry={() => void clientsQuery.refetch()} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Building2 size={22} />}
          title="No clients yet"
          description="Register your first business to start managing it from here."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Register business
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {filtered.map((c, i) => (
            <ClientRow key={c.id} client={c} divided={i > 0} onOpen={() => navigate(`/admin/clients/${c.id}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-faint">No clients match “{query}”.</div>
          )}
        </div>
      )}

      {creating && <RegisterModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function ClientRow({
  client,
  divided,
  onOpen,
}: {
  client: AdminClient;
  divided: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className={
        "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 " +
        (divided ? "border-t border-divider" : "")
      }
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[12px] font-bold text-brand-fg"
        style={{ background: client.brandColor || "var(--brand)" }}
      >
        {client.brandInitials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-text">{client.name}</div>
        <div className="truncate text-[12.5px] text-muted">{client.niche}</div>
      </div>
      <div className="hidden items-center gap-1.5 text-[12.5px] text-muted sm:flex">
        <Users size={13} /> {client.memberCount}
      </div>
      <div className="font-data hidden w-24 text-right text-[13px] text-text tnum md:block">
        {money(client.monthlySpend)}
      </div>
      <ChevronRight size={16} className="shrink-0 text-faint" />
    </button>
  );
}

function RegisterModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const createClient = useCreateClient();
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [appName, setAppName] = useState("");
  const [spend, setSpend] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (createClient.isPending) return;
    setError(null);
    if (!name.trim()) return setError("Enter a business name.");
    try {
      const res = await createClient.mutateAsync({
        name: name.trim(),
        niche: niche.trim() || undefined,
        appName: appName.trim() || undefined,
        monthlySpend: spend.trim() ? Number(spend) || 0 : undefined,
      });
      toast("Business registered.", "success");
      onClose();
      navigate(`/admin/clients/${res.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't register the business.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Register a business"
      className="max-w-md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={createClient.isPending} onClick={onSubmit}>
            Register
          </Button>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Business name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Willis Windows" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Niche" hint="Optional">
            <Input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="home-services" />
          </Field>
          <Field label="Monthly spend" hint="Optional">
            <Input value={spend} onChange={(e) => setSpend(e.target.value)} placeholder="0" inputMode="numeric" />
          </Field>
        </div>
        <Field label="App name" hint="What the client sees. Defaults to the business name.">
          <Input value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Willis Leads" />
        </Field>
        <p className="text-[12.5px] text-faint">
          All features start enabled. Connect GoHighLevel and add employees from the client's page.
        </p>
        {error && (
          <p className="rounded-[var(--radius-sm)] bg-danger-tint px-3 py-2 text-[13px] text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
}
