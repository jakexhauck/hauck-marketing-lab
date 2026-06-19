import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Users, Building2, Loader2 } from "lucide-react";
import { api, type AdminClient } from "../../lib/api";

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--brand-primary)]";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

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
  brandColor: "#1d6fb8",
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

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
            Clients
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {clients.length} {clients.length === 1 ? "client" : "clients"}
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setFormError(null);
          }}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--brand-fg)]"
          style={{ background: "var(--brand-primary)" }}
        >
          <Plus size={16} /> New client
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <h2 className="mb-3 font-display text-base font-semibold text-[var(--text)]">
            Create a client
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <input className={inputCls} type="text" value={form.brandColor} onChange={set("brandColor")} placeholder="#1d6fb8" />
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

          <div className="mt-4 border-t border-[var(--divider)] pt-4">
            <p className="mb-2 text-[12px] font-semibold text-[var(--text-muted)]">
              Owner login (optional, both fields or neither)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

          {formError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{formError}</p>}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60"
              style={{ background: "var(--brand-primary)" }}
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? "Creating..." : "Create client"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" /> Loading clients...
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          {loadError}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-12 text-center">
          <Building2 size={28} className="mx-auto mb-2 text-[var(--text-faint)]" />
          <p className="text-sm text-[var(--text-muted)]">No clients yet. Create your first one.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => {
            const connected = c.ghlLocationId && !["", "pending", "env"].includes(c.ghlLocationId.toLowerCase());
            return (
              <li key={c.id}>
                <Link
                  to={`/admin/clients/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition-colors hover:border-[var(--brand-primary)]"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold text-white"
                    style={{ background: c.brandColor || "var(--brand-primary)" }}
                  >
                    {c.brandInitials || c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--text)]">{c.name}</div>
                    <div className="truncate text-[12px] text-[var(--text-muted)]">
                      {c.niche || "no niche"} · {c.slug}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
                    <Users size={13} /> {c.memberCount}
                  </div>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      connected
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    ].join(" ")}
                  >
                    {connected ? "GHL connected" : "not connected"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
