import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Check, UserPlus, DownloadCloud, Pencil, X, Eye } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  CAPABILITIES,
  defaultGrantsForRole,
  type Capability,
  type StaffRole,
} from "../../lib/capabilities";

const inputCls =
  "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--brand-primary)]";
const labelCls = "block text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]";

interface DetailClient {
  id: string;
  slug: string;
  name: string;
  niche: string;
  brandColor: string;
  brandInitials: string;
  appName: string;
  wonLabel: string;
  valueLabel: string;
  ghlLocationId: string;
  ownerPasswordSet: boolean;
  monthlySpend: number;
  createdAt: string;
}

interface StaffPerm {
  capability: Capability;
  view: boolean;
  edit: boolean;
}

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: string;
  ghlUserId: string | null;
  createdAt?: string;
  permissions: StaffPerm[];
}

interface DetailResponse {
  client: DetailClient;
  entitlements: string[];
  staff: StaffMember[];
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="mb-3 font-display text-base font-semibold text-[var(--text)]">{title}</h2>
      {children}
    </section>
  );
}

function placeholderConn(v: string) {
  return ["", "pending", "env"].includes((v ?? "").trim().toLowerCase());
}

export default function AdminClientDetail() {
  const { id = "" } = useParams();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<DetailResponse>(`/api/admin/clients/${id}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load client");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--text-muted)]">
        <Loader2 size={16} className="animate-spin" /> Loading client...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div>
        <BackLink />
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          {error ?? "Client not found"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <div className="mb-5 flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
          style={{ background: data.client.brandColor || "var(--brand-primary)" }}
        >
          {data.client.brandInitials || data.client.name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--text)]">
            {data.client.name}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">{data.client.slug}</p>
        </div>
        <PreviewButton tenantId={id} />
      </div>

      <div className="space-y-4">
        <BrandingCard client={data.client} onSaved={load} />
        <GhlCard client={data.client} onSaved={load} />
        <OwnerCard tenantId={id} ownerPasswordSet={data.client.ownerPasswordSet} />
        <EntitlementsCard tenantId={id} enabled={data.entitlements} onSaved={load} />
        <TeamCard tenantId={id} staff={data.staff} entitlements={data.entitlements} ghlConnected={!placeholderConn(data.client.ghlLocationId)} onSaved={load} />
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/admin/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
      <ArrowLeft size={15} /> All clients
    </Link>
  );
}

// Enter a read-only preview of this client. Swaps the admin session for a
// preview session (AuthContext) and routes into the client's home, where the
// app-wide PreviewBanner offers the way back.
function PreviewButton({ tenantId }: { tenantId: string }) {
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate("/home", { replace: true });
    } else {
      setErr(res.error ?? "Could not start preview");
      setBusy(false);
    }
  };

  return (
    <div className="ml-auto flex flex-col items-end gap-1">
      <button
        onClick={() => void onClick()}
        disabled={busy}
        title="View this client's app read-only"
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-60"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
        {busy ? "Opening..." : "Preview as client"}
      </button>
      {err && <span className="text-[12px] text-rose-600 dark:text-rose-400">{err}</span>}
    </div>
  );
}

// View the client's app from one staff member's point of view: a read-only
// preview scoped to that person's role + permissions. Same mechanism as the
// client-wide PreviewButton, narrowed by staffId. Only offered for active staff
// (the backend rejects previewing a disabled account).
function ViewAsButton({ tenantId, staffId }: { tenantId: string; staffId: string }) {
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setErr(null);
    const res = await previewClient(tenantId, staffId);
    if (res.ok) {
      navigate("/home", { replace: true });
    } else {
      setErr(res.error ?? "Could not start preview");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        onClick={() => void onClick()}
        disabled={busy}
        title="View the app from this person's point of view (read-only)"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-60"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
        {busy ? "Opening..." : "View as"}
      </button>
      {err && <span className="text-[11px] text-rose-600 dark:text-rose-400">{err}</span>}
    </span>
  );
}

function SaveButton({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60"
      style={{ background: "var(--brand-primary)" }}
    >
      {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
      {saving ? "Saving..." : saved ? "Saved" : "Save"}
    </button>
  );
}

function useSaver(onSaved: () => Promise<void> | void) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (path: string, body: Record<string, unknown>, method = "PATCH") => {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      setSaved(true);
      await onSaved();
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, saved, err, run };
}

function BrandingCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({
    name: client.name,
    niche: client.niche,
    appName: client.appName,
    brandColor: client.brandColor,
    brandInitials: client.brandInitials,
    wonLabel: client.wonLabel,
    valueLabel: client.valueLabel,
    monthlySpend: String(client.monthlySpend ?? 0),
  });
  const { saving, saved, err, run } = useSaver(onSaved);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name: f.name,
      niche: f.niche,
      appName: f.appName,
      brandColor: f.brandColor,
      brandInitials: f.brandInitials,
      wonLabel: f.wonLabel,
      valueLabel: f.valueLabel,
    };
    const spend = Number(f.monthlySpend);
    if (!Number.isNaN(spend)) body.monthlySpend = spend;
    void run(`/api/admin/clients/${client.id}`, body);
  };
  return (
    <Card title="Business & branding">
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label><span className={labelCls}>Business name</span><input className={inputCls} value={f.name} onChange={set("name")} /></label>
          <label><span className={labelCls}>Niche</span><input className={inputCls} value={f.niche} onChange={set("niche")} /></label>
          <label><span className={labelCls}>App name (header)</span><input className={inputCls} value={f.appName} onChange={set("appName")} /></label>
          <label><span className={labelCls}>Initials</span><input className={inputCls} value={f.brandInitials} onChange={set("brandInitials")} maxLength={3} /></label>
          <label><span className={labelCls}>Brand color</span><input className={inputCls} value={f.brandColor} onChange={set("brandColor")} /></label>
          <label><span className={labelCls}>Monthly spend</span><input className={inputCls} value={f.monthlySpend} onChange={set("monthlySpend")} inputMode="decimal" /></label>
          <label><span className={labelCls}>Won label</span><input className={inputCls} value={f.wonLabel} onChange={set("wonLabel")} /></label>
          <label><span className={labelCls}>Value label</span><input className={inputCls} value={f.valueLabel} onChange={set("valueLabel")} /></label>
        </div>
        {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
        <div className="mt-4"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

function GhlCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const connected = !placeholderConn(client.ghlLocationId);
  const [locationId, setLocationId] = useState(connected ? client.ghlLocationId : "");
  const [token, setToken] = useState("");
  const { saving, saved, err, run } = useSaver(onSaved);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    if (locationId.trim()) body.ghlLocationId = locationId.trim();
    if (token.trim()) body.ghlToken = token.trim();
    if (Object.keys(body).length === 0) return;
    void run(`/api/admin/clients/${client.id}`, body).then((ok) => {
      if (ok) setToken("");
    });
  };
  return (
    <Card title="GoHighLevel connection">
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        {connected ? "Connected. Update the location id or paste a new token to rotate it." : "Not connected. Add this client's GHL location id and private token."}
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label><span className={labelCls}>GHL location id</span><input className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="OznT3..." /></label>
          <label><span className={labelCls}>GHL token (write-only)</span><input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-..." autoComplete="off" /></label>
        </div>
        {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
        <div className="mt-4"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

function OwnerCard({ tenantId, ownerPasswordSet }: { tenantId: string; ownerPasswordSet: boolean }) {
  const [pw, setPw] = useState("");
  const { saving, saved, err, run } = useSaver(async () => {});
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pw.trim().length < 8) return;
    void run(`/api/admin/clients/${tenantId}`, { ownerPassword: pw.trim() }).then((ok) => {
      if (ok) setPw("");
    });
  };
  return (
    <Card title="Owner login">
      <p className="mb-3 text-[13px] text-[var(--text-muted)]">
        {ownerPasswordSet ? "An owner password is set." : "No owner password set yet."} Set or replace the legacy owner password here. The primary owner login is the owner's staff account (email + password) in the Team section below.
      </p>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className={labelCls}>New owner password (min 8)</span>
          <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <SaveButton saving={saving} saved={saved} />
      </form>
      {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
    </Card>
  );
}

function EntitlementsCard({ tenantId, enabled, onSaved }: { tenantId: string; enabled: string[]; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState<Capability | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const enabledSet = new Set(enabled);
  const toggle = async (capability: Capability, next: boolean) => {
    setBusy(capability);
    setErr(null);
    try {
      await api(`/api/admin/clients/${tenantId}/entitlements`, {
        method: "PATCH",
        body: JSON.stringify({ capability, enabled: next }),
      });
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Surfaces (what this client sees)">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CAPABILITIES.map((c) => {
          const on = enabledSet.has(c.key);
          return (
            <button
              key={c.key}
              onClick={() => void toggle(c.key, !on)}
              disabled={busy === c.key}
              className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2.5 text-left transition-colors hover:border-[var(--brand-primary)] disabled:opacity-60"
            >
              <span className="text-sm font-medium text-[var(--text)]">{c.label}</span>
              <span
                className={[
                  "relative h-5 w-9 rounded-full transition-colors",
                  on ? "bg-emerald-500" : "bg-[var(--surface-2)]",
                ].join(" ")}
              >
                <span className={["absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5"].join(" ")} />
              </span>
            </button>
          );
        })}
      </div>
      {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
    </Card>
  );
}

function roleLabel(role: StaffRole) {
  return role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Rep";
}

function TeamCard({ tenantId, staff, entitlements, ghlConnected, onSaved }: { tenantId: string; staff: StaffMember[]; entitlements: string[]; ghlConnected: boolean; onSaved: () => Promise<void> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState({ name: "", email: "", password: "", role: "rep" as StaffRole });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value as never }));

  const grantsFor = (role: StaffRole) => {
    const defaults = defaultGrantsForRole(role);
    return CAPABILITIES.map((c) => ({
      capability: c.key,
      view: defaults[c.key].view,
      edit: defaults[c.key].edit,
    }));
  };

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim() || !f.email.trim() || f.password.trim().length < 8) {
      setErr("Name, a valid email, and an 8+ char password are required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/admin/clients/${tenantId}/staff`, {
        method: "POST",
        body: JSON.stringify({
          name: f.name.trim(),
          email: f.email.trim(),
          password: f.password.trim(),
          role: f.role,
          permissions: f.role === "owner" ? [] : grantsFor(f.role),
        }),
      });
      setF({ name: "", email: "", password: "", role: "rep" });
      setShowAdd(false);
      await onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not add person");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (staffId: string, status: "active" | "disabled") => {
    try {
      if (status === "disabled") {
        await api(`/api/admin/clients/${tenantId}/staff/${staffId}`, { method: "DELETE" });
      } else {
        await api(`/api/admin/clients/${tenantId}/staff/${staffId}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "active" }),
        });
      }
      await onSaved();
    } catch {
      // surfaced via reload; ignore here
    }
  };

  const importFromGhl = async () => {
    setImportMsg(null);
    setErr(null);
    try {
      const res = await api<{ imported: number; skipped: number; total: number }>(
        `/api/admin/clients/${tenantId}/import-staff`,
        { method: "POST" },
      );
      setImportMsg(`Imported ${res.imported}, skipped ${res.skipped} of ${res.total}. Imported reps are disabled until you set a password.`);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Import failed");
    }
  };

  const owners = staff.filter((s) => s.role === "owner");
  const others = staff.filter((s) => s.role !== "owner");

  const renderRow = (s: StaffMember) => (
    <li key={s.id} className="py-2.5">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text)]">{s.name}</div>
          <div className="truncate text-[12px] text-[var(--text-muted)]">{s.email}</div>
        </div>
        <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">{roleLabel(s.role)}</span>
        <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", s.status === "active" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-[var(--surface-2)] text-[var(--text-faint)]"].join(" ")}>{s.status}</span>
        {s.status === "active" && <ViewAsButton tenantId={tenantId} staffId={s.id} />}
        <button
          onClick={() => setEditingId((cur) => (cur === s.id ? null : s.id))}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          {editingId === s.id ? <X size={13} /> : <Pencil size={13} />} {editingId === s.id ? "Close" : "Edit"}
        </button>
        {s.status === "active" ? (
          <button onClick={() => void setStatus(s.id, "disabled")} className="text-[12px] font-medium text-rose-600 hover:underline dark:text-rose-400">Disable</button>
        ) : (
          <button onClick={() => void setStatus(s.id, "active")} className="text-[12px] font-medium text-emerald-600 hover:underline dark:text-emerald-400">Enable</button>
        )}
      </div>
      {editingId === s.id && (
        <EditMemberForm
          tenantId={tenantId}
          member={s}
          enabled={entitlements}
          onCancel={() => setEditingId(null)}
          onSaved={async () => {
            setEditingId(null);
            await onSaved();
          }}
        />
      )}
    </li>
  );

  return (
    <Card title="Team & owners">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[var(--brand-fg)]"
          style={{ background: "var(--brand-primary)" }}
        >
          <UserPlus size={15} /> Add person
        </button>
        <button
          onClick={() => void importFromGhl()}
          disabled={!ghlConnected}
          title={ghlConnected ? "Pull users from this client's GHL" : "Connect GHL first"}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-50"
        >
          <DownloadCloud size={15} /> Import from GHL
        </button>
      </div>

      <p className="mb-3 text-[12px] text-[var(--text-muted)]">
        Add owners or staff, then use Edit to rename, change role, reset a password, or set which surfaces a person can view and edit. Owners have full access automatically.
      </p>

      {importMsg && <p className="mb-3 text-[13px] text-emerald-600 dark:text-emerald-400">{importMsg}</p>}

      {showAdd && (
        <form onSubmit={onAdd} className="mb-4 rounded-xl border border-[var(--divider)] p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label><span className={labelCls}>Name</span><input className={inputCls} value={f.name} onChange={set("name")} /></label>
            <label><span className={labelCls}>Email</span><input className={inputCls} type="email" autoCapitalize="none" value={f.email} onChange={set("email")} autoComplete="off" /></label>
            <label><span className={labelCls}>Password (min 8)</span><input className={inputCls} type="password" value={f.password} onChange={set("password")} autoComplete="new-password" /></label>
            <label>
              <span className={labelCls}>Role</span>
              <select className={inputCls} value={f.role} onChange={set("role")}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
                <option value="owner">Owner</option>
              </select>
            </label>
          </div>
          {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
          <div className="mt-3">
            <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
              {busy && <Loader2 size={15} className="animate-spin" />} {busy ? "Adding..." : "Add"}
            </button>
          </div>
        </form>
      )}

      {staff.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No people yet.</p>
      ) : (
        <div className="space-y-4">
          {owners.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Owners</h3>
              <ul className="divide-y divide-[var(--divider)]">{owners.map(renderRow)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Staff</h3>
              <ul className="divide-y divide-[var(--divider)]">{others.map(renderRow)}</ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function EditMemberForm({
  tenantId,
  member,
  enabled,
  onCancel,
  onSaved,
}: {
  tenantId: string;
  member: StaffMember;
  enabled: string[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<StaffRole>(member.role);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const enabledCaps = CAPABILITIES.filter((c) => enabled.includes(c.key));

  const [grants, setGrants] = useState<Record<string, { view: boolean; edit: boolean }>>(() => {
    const map: Record<string, { view: boolean; edit: boolean }> = {};
    for (const c of CAPABILITIES) map[c.key] = { view: false, edit: false };
    for (const p of member.permissions) map[p.capability] = { view: p.view || p.edit, edit: p.edit };
    return map;
  });

  const toggle = (cap: Capability, field: "view" | "edit") =>
    setGrants((g) => {
      const cur = { ...g[cap] };
      if (field === "view") {
        cur.view = !cur.view;
        if (!cur.view) cur.edit = false;
      } else {
        cur.edit = !cur.edit;
        if (cur.edit) cur.view = true;
      }
      return { ...g, [cap]: cur };
    });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Name is required.");
      return;
    }
    if (password.trim() && password.trim().length < 8) {
      setErr("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = { name: name.trim(), role };
    if (password.trim()) body.password = password.trim();
    if (role !== "owner") {
      body.permissions = enabledCaps.map((c) => ({
        capability: c.key,
        view: grants[c.key].view,
        edit: grants[c.key].edit,
      }));
    }
    try {
      await api(`/api/admin/clients/${tenantId}/staff/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="mt-3 rounded-xl border border-[var(--divider)] bg-[var(--surface-2)]/40 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label><span className={labelCls}>Name</span><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>
          <span className={labelCls}>Role</span>
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as StaffRole)}>
            <option value="rep">Rep</option>
            <option value="manager">Manager</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className={labelCls}>Reset password (leave blank to keep current)</span>
          <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="New password (min 8)" />
        </label>
      </div>

      {role === "owner" ? (
        <p className="mt-3 text-[12px] text-[var(--text-muted)]">Owners have full access to every surface. Per-surface permissions do not apply.</p>
      ) : (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Surface permissions</p>
          {enabledCaps.length === 0 ? (
            <p className="text-[12px] text-[var(--text-muted)]">No surfaces are enabled for this client yet.</p>
          ) : (
            <div className="space-y-1.5">
              {enabledCaps.map((c) => (
                <div key={c.key} className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                  <span className="text-sm text-[var(--text)]">{c.label}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                      <input type="checkbox" checked={grants[c.key].view} onChange={() => toggle(c.key, "view")} /> View
                    </label>
                    {c.hasEdit && (
                      <label className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
                        <input type="checkbox" checked={grants[c.key].edit} onChange={() => toggle(c.key, "edit")} /> Edit
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{err}</p>}
      <div className="mt-4 flex items-center gap-2">
        <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-[var(--brand-fg)] disabled:opacity-60" style={{ background: "var(--brand-primary)" }}>
          {busy && <Loader2 size={15} className="animate-spin" />} {busy ? "Saving..." : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text)]">Cancel</button>
      </div>
    </form>
  );
}
