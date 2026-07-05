import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, UserPlus, DownloadCloud, Pencil, X, Eye } from "lucide-react";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import {
  CAPABILITIES,
  defaultGrantsForRole,
  type Capability,
  type StaffRole,
} from "../../lib/capabilities";

// The full client-hub config body: branding, backend (GHL) connection, owner
// login, account health, surfaces, and team + permissions. Extracted from
// AdminClientDetail (Task 3.2) so both the standalone /admin/clients/:id page
// and the Service Delivery cockpit's Config tab render the exact same cards
// and saves against /api/admin/clients/:id*. This panel owns its own load and
// save; it does NOT render page chrome (no DesktopPage, no back link, no
// page-level preview button) - the surrounding route owns that.

const inputCls =
  "mt-1 w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[14px] text-text placeholder:text-faint transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25";
const labelCls = "label-cap block";

export type HealthStatus = "healthy" | "warn" | "paused";

export interface DetailClient {
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
  metaAdAccountId: string | null;
  googlePlaceId: string | null;
  ga4PropertyId: string | null;
  websiteUrl: string | null;
  ownerPasswordSet: boolean;
  monthlySpend: number;
  createdAt: string;
  healthStatus: HealthStatus;
  healthNote: string | null;
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

function Card({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-[var(--shadow-sm)]"
    >
      <h2 className="mb-4 font-display text-[15px] font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

function placeholderConn(v: string) {
  return ["", "pending", "env"].includes((v ?? "").trim().toLowerCase());
}

export default function ClientConfigPanel({
  tenantId,
  onClientChange,
}: {
  tenantId: string;
  // Fires whenever the client (re)loads so a host page can keep its own header
  // (name/avatar/slug) in sync, including after a rename save. Held in a ref so
  // an inline callback never re-triggers the load effect.
  onClientChange?: (client: DetailClient | null) => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const onClientChangeRef = useRef(onClientChange);
  useEffect(() => {
    onClientChangeRef.current = onClientChange;
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<DetailResponse>(`/api/admin/clients/${tenantId}`);
      setData(res);
      onClientChangeRef.current?.(res.client);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load client");
      onClientChangeRef.current?.(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  // This panel does its own fetch/save against /api/admin/clients/:id* and
  // only ever reloaded its own local copy, leaving the roster list and the
  // cockpit header (which read via React Query) stale for up to their
  // staleTime after a save. Every mutation below reloads the panel via
  // load() AND invalidates both cached queries so the roster dot/name/spend
  // and the cockpit header pick up the change immediately.
  const invalidateClientCaches = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "clients"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "clients", tenantId] });
  }, [queryClient, tenantId]);

  const refreshAfterSave = useCallback(async () => {
    await load();
    invalidateClientCaches();
  }, [load, invalidateClientCaches]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" /> Loading client...
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
        {error ?? "Client not found"}
      </div>
    );
  }

  const { client } = data;

  return (
    <div className="space-y-4">
      <BrandingCard client={client} onSaved={refreshAfterSave} />
      <HealthCard client={client} onSaved={refreshAfterSave} />
      <GhlCard client={client} onSaved={refreshAfterSave} />
      <AdsCard client={client} onSaved={refreshAfterSave} />
      <ReviewsCard client={client} onSaved={refreshAfterSave} />
      <WebsiteCard client={client} onSaved={refreshAfterSave} />
      <AnalyticsCard client={client} onSaved={refreshAfterSave} />
      <OwnerCard tenantId={tenantId} ownerPasswordSet={client.ownerPasswordSet} onSaved={refreshAfterSave} />
      <EntitlementsCard tenantId={tenantId} enabled={data.entitlements} onSaved={refreshAfterSave} />
      <div id="cockpit-team">
        <TeamCard
          tenantId={tenantId}
          staff={data.staff}
          entitlements={data.entitlements}
          ghlConnected={!placeholderConn(client.ghlLocationId)}
          onSaved={refreshAfterSave}
        />
      </div>
    </div>
  );
}

// View the client's app from one staff member's point of view: a read-only
// preview scoped to that person's role + permissions. Only offered for active
// staff (the backend rejects previewing a disabled account).
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
        className="inline-flex items-center gap-1 text-[12px] font-medium text-muted transition-colors hover:text-text disabled:opacity-60"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
        {busy ? "Opening..." : "View as"}
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}
    </span>
  );
}

function SaveButton({ saving, saved }: { saving: boolean; saved: boolean }) {
  return (
    <Button type="submit" variant="primary" loading={saving}>
      {!saving && saved && <Check size={15} />}
      {saving ? "Saving..." : saved ? "Saved" : "Save"}
    </Button>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label><span className={labelCls}>Business name</span><input className={inputCls} value={f.name} onChange={set("name")} /></label>
          <label><span className={labelCls}>Niche</span><input className={inputCls} value={f.niche} onChange={set("niche")} /></label>
          <label><span className={labelCls}>App name (header)</span><input className={inputCls} value={f.appName} onChange={set("appName")} /></label>
          <label><span className={labelCls}>Initials</span><input className={inputCls} value={f.brandInitials} onChange={set("brandInitials")} maxLength={3} /></label>
          <label>
            <span className={labelCls}>Brand color</span>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="h-9 w-9 shrink-0 rounded-[var(--radius)] border border-border"
                style={{ background: f.brandColor || "var(--brand-primary)" }}
                aria-hidden
              />
              <input className={`${inputCls} mt-0`} value={f.brandColor} onChange={set("brandColor")} placeholder="#4f46e5" />
            </div>
          </label>
          <label><span className={labelCls}>Monthly spend</span><input className={inputCls} value={f.monthlySpend} onChange={set("monthlySpend")} inputMode="decimal" /></label>
          <label><span className={labelCls}>Won label</span><input className={inputCls} value={f.wonLabel} onChange={set("wonLabel")} /></label>
          <label><span className={labelCls}>Value label</span><input className={inputCls} value={f.valueLabel} onChange={set("valueLabel")} /></label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

const HEALTH_OPTIONS: { value: HealthStatus; label: string }[] = [
  { value: "healthy", label: "Healthy" },
  { value: "warn", label: "Needs attention" },
  { value: "paused", label: "Paused" },
];

function HealthCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState<HealthStatus>(client.healthStatus);
  const [note, setNote] = useState(client.healthNote ?? "");
  const { saving, saved, err, run } = useSaver(onSaved);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(`/api/admin/clients/${client.id}`, { healthStatus: status, healthNote: note });
  };
  return (
    <Card title="Account health">
      <p className="mb-4 text-[13px] text-muted">
        A manual flag that surfaces in the Service Delivery roster and the at-risk list. Use the note to record why an account needs attention or is paused.
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label>
            <span className={labelCls}>Status</span>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as HealthStatus)}>
              {HEALTH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelCls}>Note (optional)</span>
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. CPL rising, needs a creative refresh"
            />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
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
      <p className="mb-4 text-[13px] text-muted">
        {connected ? "Connected. Update the location id or paste a new token to rotate it." : "Not connected. Add this client's GHL location id and private token."}
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label><span className={labelCls}>GHL location id</span><input className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="OznT3..." /></label>
          <label><span className={labelCls}>GHL token (write-only)</span><input className={inputCls} type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="pit-..." autoComplete="off" /></label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

// Per-client Meta ad account. The agency system-user token is shared across all
// clients (a global env var); only the account id is per-client, which is what
// keeps one client's Paid Ads from ever showing another's numbers.
function AdsCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const [account, setAccount] = useState(client.metaAdAccountId ?? "");
  const { saving, saved, err, run } = useSaver(onSaved);
  const connected = Boolean((client.metaAdAccountId ?? "").trim());
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Always send the field so an emptied box clears it (back to not-connected).
    void run(`/api/admin/clients/${client.id}`, { metaAdAccountId: account.trim() });
  };
  return (
    <Card title="Paid Ads (Meta)">
      <p className="mb-4 text-[13px] text-muted">
        {connected
          ? "Connected. This client's Paid Ads read only this ad account."
          : "Not connected. Add this client's Meta ad account id so their Paid Ads show their own numbers."}{" "}
        The agency access token is shared across all clients; only the account is per-client.
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelCls}>Meta ad account id</span>
            <input
              className={inputCls}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="act_1234567890 or 1234567890"
            />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

// Per-client Google Places place_id. The Places API key is a shared agency env
// secret; only the place is per-client, which is what keeps one client's rating
// hero from ever showing another's Google reviews.
function ReviewsCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const [placeId, setPlaceId] = useState(client.googlePlaceId ?? "");
  const { saving, saved, err, run } = useSaver(onSaved);
  const connected = Boolean((client.googlePlaceId ?? "").trim());
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Always send the field so an emptied box clears it (back to not-connected).
    void run(`/api/admin/clients/${client.id}`, { googlePlaceId: placeId.trim() });
  };
  return (
    <Card title="Reviews (Google)">
      <p className="mb-4 text-[13px] text-muted">
        {connected
          ? "Connected. This client's rating hero reads only this Google place."
          : "Not connected. Add this client's Google place_id so their rating and recent reviews show on the Reviews page."}{" "}
        The Places API key is shared across all clients; only the place is per-client.
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelCls}>Google place_id</span>
            <input
              className={inputCls}
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              placeholder="ChIJ..."
            />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

// Per-client live website. The single site under the client's GHL Sites tab.
// Shown on the client's Website page as a real preview + "View live site", and
// as the canvas the client drops change-request pins on.
function WebsiteCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const [url, setUrl] = useState(client.websiteUrl ?? "");
  const { saving, saved, err, run } = useSaver(onSaved);
  const connected = Boolean((client.websiteUrl ?? "").trim());
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Always send the field so an emptied box clears it (back to not-connected).
    void run(`/api/admin/clients/${client.id}`, { websiteUrl: url.trim() });
  };
  return (
    <Card title="Website">
      <p className="mb-4 text-[13px] text-muted">
        {connected
          ? "Connected. This client's Website page previews this site and requests changes on it."
          : "Not connected. Add the client's live site URL so their Website page shows a real preview and change requests."}{" "}
        Use the published address of their single site (bare domains get https:// added).
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelCls}>Website URL</span>
            <input
              className={inputCls}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="rivertownplumbing.com"
            />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

// Per-client GA4 property id. The service-account key is a shared agency env
// secret; only the property is per-client, which is what keeps one client's
// visitor numbers off another's Website page.
function AnalyticsCard({ client, onSaved }: { client: DetailClient; onSaved: () => Promise<void> }) {
  const [propertyId, setPropertyId] = useState(client.ga4PropertyId ?? "");
  const { saving, saved, err, run } = useSaver(onSaved);
  const connected = Boolean((client.ga4PropertyId ?? "").trim());
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Always send the field so an emptied box clears it (back to not-connected).
    void run(`/api/admin/clients/${client.id}`, { ga4PropertyId: propertyId.trim() });
  };
  return (
    <Card title="Website analytics (Google Analytics)">
      <p className="mb-4 text-[13px] text-muted">
        {connected
          ? "Connected. This client's Website Overview + Insights read real visitor numbers from this GA4 property."
          : "Not connected. Add this client's GA4 property id so their Website tabs show real visitors, top pages, and traffic sources."}{" "}
        The service-account key is shared across all clients; only the property is per-client.
      </p>
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelCls}>GA4 property id</span>
            <input
              className={inputCls}
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="544141225"
              inputMode="numeric"
            />
          </label>
        </div>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
        <div className="mt-5"><SaveButton saving={saving} saved={saved} /></div>
      </form>
    </Card>
  );
}

function OwnerCard({
  tenantId,
  ownerPasswordSet,
  onSaved,
}: {
  tenantId: string;
  ownerPasswordSet: boolean;
  onSaved: () => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const { saving, saved, err, run } = useSaver(onSaved);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pw.trim().length < 8) return;
    void run(`/api/admin/clients/${tenantId}`, { ownerPassword: pw.trim() }).then((ok) => {
      if (ok) setPw("");
    });
  };
  return (
    <Card title="Owner login">
      <p className="mb-4 text-[13px] text-muted">
        {ownerPasswordSet ? "An owner password is set." : "No owner password set yet."} Set or replace the legacy owner password here. The primary owner login is the owner's staff account (email + password) in the Team section below.
      </p>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className={labelCls}>New owner password (min 8)</span>
          <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </label>
        <SaveButton saving={saving} saved={saved} />
      </form>
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
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
              className="flex items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2.5 text-left transition-colors hover:border-brand disabled:opacity-60"
            >
              <span className="text-sm font-medium text-text">{c.label}</span>
              <span
                className={[
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  on ? "bg-positive" : "bg-surface-3",
                ].join(" ")}
              >
                <span className={["absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-all", on ? "left-[18px]" : "left-0.5"].join(" ")} />
              </span>
            </button>
          );
        })}
      </div>
      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
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
          <div className="truncate text-sm font-medium text-text">{s.name}</div>
          <div className="truncate text-[12px] text-muted">{s.email}</div>
        </div>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">{roleLabel(s.role)}</span>
        <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", s.status === "active" ? "bg-positive-tint text-positive" : "bg-surface-2 text-faint"].join(" ")}>{s.status}</span>
        {s.status === "active" && <ViewAsButton tenantId={tenantId} staffId={s.id} />}
        <button
          onClick={() => setEditingId((cur) => (cur === s.id ? null : s.id))}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-muted transition-colors hover:text-text"
        >
          {editingId === s.id ? <X size={13} /> : <Pencil size={13} />} {editingId === s.id ? "Close" : "Edit"}
        </button>
        {s.status === "active" ? (
          <button onClick={() => void setStatus(s.id, "disabled")} className="text-[12px] font-medium text-danger hover:underline">Disable</button>
        ) : (
          <button onClick={() => void setStatus(s.id, "active")} className="text-[12px] font-medium text-positive hover:underline">Enable</button>
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
        <Button variant="primary" size="sm" onClick={() => setShowAdd((s) => !s)}>
          <UserPlus size={15} /> Add person
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void importFromGhl()}
          disabled={!ghlConnected}
          title={ghlConnected ? "Pull users from this client's GHL" : "Connect GHL first"}
        >
          <DownloadCloud size={15} /> Import from GHL
        </Button>
      </div>

      <p className="mb-3 text-[12px] text-muted">
        Add owners or staff, then use Edit to rename, change role, reset a password, or set which surfaces a person can view and edit. Owners have full access automatically.
      </p>

      {importMsg && <p className="mb-3 text-[13px] text-positive">{importMsg}</p>}

      {showAdd && (
        <form onSubmit={onAdd} className="mb-4 rounded-[var(--radius)] border border-divider bg-surface-2/40 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          {err && <p className="mt-3 text-sm text-danger">{err}</p>}
          <div className="mt-4">
            <Button type="submit" variant="primary" loading={busy}>
              {busy ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      )}

      {staff.length === 0 ? (
        <p className="text-sm text-muted">No people yet.</p>
      ) : (
        <div className="space-y-4">
          {owners.length > 0 && (
            <div>
              <h3 className="label-cap mb-1">Owners</h3>
              <ul className="divide-y divide-divider">{owners.map(renderRow)}</ul>
            </div>
          )}
          {others.length > 0 && (
            <div>
              <h3 className="label-cap mb-1">Staff</h3>
              <ul className="divide-y divide-divider">{others.map(renderRow)}</ul>
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
    <form onSubmit={save} className="mt-3 rounded-[var(--radius)] border border-divider bg-surface-2/40 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <p className="mt-3 text-[12px] text-muted">Owners have full access to every surface. Per-surface permissions do not apply.</p>
      ) : (
        <div className="mt-4">
          <p className="label-cap mb-2">Surface permissions</p>
          {enabledCaps.length === 0 ? (
            <p className="text-[12px] text-muted">No surfaces are enabled for this client yet.</p>
          ) : (
            <div className="space-y-1.5">
              {enabledCaps.map((c) => (
                <div key={c.key} className="flex items-center justify-between rounded-[var(--radius)] border border-border px-3 py-2">
                  <span className="text-sm text-text">{c.label}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-[12px] text-muted">
                      <input type="checkbox" className="accent-[var(--brand-primary)]" checked={grants[c.key].view} onChange={() => toggle(c.key, "view")} /> View
                    </label>
                    {c.hasEdit && (
                      <label className="flex items-center gap-1.5 text-[12px] text-muted">
                        <input type="checkbox" className="accent-[var(--brand-primary)]" checked={grants[c.key].edit} onChange={() => toggle(c.key, "edit")} /> Edit
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" variant="primary" loading={busy}>
          {busy ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
