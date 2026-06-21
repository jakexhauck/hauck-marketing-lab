import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users, Building2, Loader2, ChevronRight } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { api, type AdminClient } from "../../lib/api";

const inputCls =
  "w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const labelCls = "label-cap mb-1 block";

interface CreateForm {
  name: string;
  niche: string;
  appName: string;
  brandColor: string;
  brandInitials: string;
  wonLabel: string;
  valueLabel: string;
  monthlySpend: string;
  ghlLocationId: string;
  ghlToken: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

const EMPTY_FORM: CreateForm = {
  name: "",
  niche: "",
  appName: "",
  brandColor: "#4dbb83",
  brandInitials: "",
  wonLabel: "",
  valueLabel: "",
  monthlySpend: "",
  ghlLocationId: "",
  ghlToken: "",
  ownerName: "",
  ownerEmail: "",
  ownerPassword: "",
};

export default function AdminClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<AdminClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api<{ clients: AdminClient[] }>("/api/admin/clients");
      setClients(data.clients ?? []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load clients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const set = (k: keyof CreateForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Business name is required.");
      return;
    }
    const ownerEmail = form.ownerEmail.trim();
    const ownerPassword = form.ownerPassword.trim();
    if ((ownerEmail || ownerPassword) && !(ownerEmail && ownerPassword)) {
      setFormError("Owner email and password must be provided together.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        niche: form.niche.trim() || undefined,
        appName: form.appName.trim() || undefined,
        brandColor: form.brandColor.trim() || undefined,
        brandInitials: form.brandInitials.trim() || undefined,
        wonLabel: form.wonLabel.trim() || undefined,
        valueLabel: form.valueLabel.trim() || undefined,
        ghlLocationId: form.ghlLocationId.trim() || undefined,
        ghlToken: form.ghlToken.trim() || undefined,
        ownerName: form.ownerName.trim() || undefined,
        ownerEmail: ownerEmail || undefined,
        ownerPassword: ownerPassword || undefined,
      };
      const spend = Number(form.monthlySpend);
      if (form.monthlySpend.trim() && !Number.isNaN(spend)) body.monthlySpend = spend;

      const res = await api<{ ok: boolean; id: string; ownerWarning?: string }>(
        "/api/admin/clients",
        { method: "POST", body: JSON.stringify(body) },
      );
      if (res.ownerWarning) {
        // The tenant was created but the owner login was not: surface it, then
        // still navigate so the admin can fix the owner on the detail page.
        setFormError(`Client created, but owner login failed: ${res.ownerWarning}`);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load();
      navigate(`/admin/clients/${res.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not create client");
    } finally {
      setSubmitting(false);
    }
  };

  const countLabel = loading
    ? "Loading..."
    : `${clients.length} ${clients.length === 1 ? "client" : "clients"}`;

  return (
    <DesktopPage
      title="Clients"
      subtitle={countLabel}
      actions={
        <Button
          variant="primary"
          onClick={() => {
            setShowForm((s) => !s);
            setFormError(null);
          }}
        >
          <Plus size={16} /> New client
        </Button>
      }
    >
      {showForm && (
        <form
          onSubmit={onCreate}
          className="mb-6 rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]"
        >
          <h2 className="mb-4 font-display text-[15px] font-semibold text-text">
            Create a client
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label>
              <span className={labelCls}>Business name *</span>
              <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Willis Windows" />
            </label>
            <label>
              <span className={labelCls}>Niche</span>
              <input className={inputCls} value={form.niche} onChange={set("niche")} placeholder="home-services" />
            </label>
            <label>
              <span className={labelCls}>App name (header)</span>
              <input className={inputCls} value={form.appName} onChange={set("appName")} placeholder="Willis Leads" />
            </label>
            <label>
              <span className={labelCls}>Initials</span>
              <input className={inputCls} value={form.brandInitials} onChange={set("brandInitials")} placeholder="WW" maxLength={3} />
            </label>
            <label>
              <span className={labelCls}>Brand color</span>
              <input className={inputCls} type="text" value={form.brandColor} onChange={set("brandColor")} placeholder="#4dbb83" />
            </label>
            <label>
              <span className={labelCls}>Monthly spend</span>
              <input className={inputCls} value={form.monthlySpend} onChange={set("monthlySpend")} placeholder="0" inputMode="decimal" />
            </label>
            <label>
              <span className={labelCls}>Won label</span>
              <input className={inputCls} value={form.wonLabel} onChange={set("wonLabel")} placeholder="Won" />
            </label>
            <label>
              <span className={labelCls}>Value label</span>
              <input className={inputCls} value={form.valueLabel} onChange={set("valueLabel")} placeholder="Job Value" />
            </label>
            <label>
              <span className={labelCls}>GHL location id</span>
              <input className={inputCls} value={form.ghlLocationId} onChange={set("ghlLocationId")} placeholder="leave blank to connect later" />
            </label>
            <label>
              <span className={labelCls}>GHL token</span>
              <input className={inputCls} type="password" value={form.ghlToken} onChange={set("ghlToken")} placeholder="pit-..." autoComplete="off" />
            </label>
          </div>

          <div className="mt-5 border-t border-divider pt-5">
            <p className="mb-3 text-[12px] font-semibold text-muted">
              Owner login (optional, both fields or neither)
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label>
                <span className={labelCls}>Owner name</span>
                <input className={inputCls} value={form.ownerName} onChange={set("ownerName")} placeholder="Jane Willis" />
              </label>
              <label>
                <span className={labelCls}>Owner email</span>
                <input className={inputCls} type="email" autoCapitalize="none" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="owner@business.com" autoComplete="off" />
              </label>
              <label>
                <span className={labelCls}>Owner password</span>
                <input className={inputCls} type="password" value={form.ownerPassword} onChange={set("ownerPassword")} placeholder="min 8 chars" autoComplete="new-password" />
              </label>
            </div>
          </div>

          {formError && <p className="mt-4 text-sm text-danger">{formError}</p>}

          <div className="mt-5 flex items-center gap-2">
            <Button type="submit" variant="primary" loading={submitting}>
              {submitting ? "Creating..." : "Create client"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading clients...
        </div>
      ) : loadError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          {loadError}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-16 text-center">
          <Building2 size={28} className="mx-auto mb-2 text-faint" />
          <p className="text-sm text-muted">No clients yet. Create your first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-divider text-left">
                <th className="label-cap px-6 py-3 font-semibold">Client</th>
                <th className="label-cap hidden px-6 py-3 font-semibold lg:table-cell">Niche</th>
                <th className="label-cap px-6 py-3 text-right font-semibold lg:text-left">Members</th>
                <th className="label-cap px-6 py-3 text-right font-semibold">Status</th>
                <th className="w-10 px-2 py-3" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const connected =
                  c.ghlLocationId && !["", "pending", "env"].includes(c.ghlLocationId.toLowerCase());
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/admin/clients/${c.id}`)}
                    className="group cursor-pointer border-b border-divider transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-[12px] font-bold"
                          style={{ background: c.brandColor || "var(--brand-primary)", color: "var(--brand-fg)" }}
                        >
                          {c.brandInitials || c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-display text-[14.5px] font-semibold text-text">
                            {c.name}
                          </div>
                          <div className="truncate font-data text-[12px] text-faint">{c.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-6 py-3.5 lg:table-cell">
                      <span className="text-[13px] text-muted">{c.niche || "--"}</span>
                    </td>
                    <td className="px-6 py-3.5 text-right lg:text-left">
                      <span className="inline-flex items-center gap-1 font-data text-[13px] text-muted tabular-nums">
                        <Users size={13} className="text-faint" /> {c.memberCount}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <StatusPill connected={Boolean(connected)} />
                    </td>
                    <td className="px-2 py-3.5">
                      <ChevronRight
                        size={16}
                        className="text-faint transition-colors group-hover:text-muted"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DesktopPage>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        connected
          ? "bg-positive-tint text-positive"
          : "bg-warning-tint text-warning",
      ].join(" ")}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: "currentColor" }}
        aria-hidden
      />
      {connected ? "GHL connected" : "not connected"}
    </span>
  );
}
