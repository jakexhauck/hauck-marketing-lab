/**
 * ClientDashboard — per-client surface with sub-nav.
 *
 * Tab order (status-aware):
 *   pre-launch → Onboarding · Service Delivery · Recordings · Profile · Memory*
 *   live/paused → Dashboard · Service Delivery · Recordings · Profile · Memory*
 *
 * The Onboarding tab is the unified surface: it tracks task completion AND
 * houses the per-task form buttons that used to live in a separate Sequence
 * tab (form opens inline, saving auto-ticks the matching task).
 *
 * Memory tab only shows when vault/Clients/<name>/Memory.md actually has content.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentSummary,
  ClientEntry,
  DashboardState,
  FathomRecording,
  OpsClientRow,
  VaultNote,
} from "../../lib/types";
import type { ClientSection } from "../../lib/navigation";
import type { FormSurfaceId } from "../../lib/formConfigs";
import { api } from "../../lib/tauri";
import {
  driveNodeUrl,
  parseDriveFolders,
  parseDriveTree,
  type DriveFolder,
  type DriveNode,
} from "../../lib/driveIndex";
import {
  buildProfileBody,
  buildProfileFront,
  emptyProfileFormValues,
  parseProfileBody,
  profilePathFor,
  type ProfileFormValues,
} from "../../lib/clientProfile";
import { ClientMediaBuying } from "./ClientMediaBuying";
import { WebDesignerPage } from "./WebDesignerPage";
import { recordingsPageCSS, openFathomInApp } from "./RecordingsPage";
import { OnboardingChecklist } from "../OnboardingChecklist";
import { ClientServiceDelivery } from "./ClientServiceDelivery";
import { AdsManagerPage } from "./AdsManagerPage";
import {
  IconBarChart,
  IconChevronRight,
  IconDashboard,
  IconExternalLink,
  IconFile,
  IconFolder,
  IconMore,
  IconPen,
  IconRecordings,
  IconTasks,
  IconUser,
} from "../icons";

interface ClientDashboardProps {
  client: ClientEntry;
  section: ClientSection;
  root: string | null;
  agents: AgentSummary[];
  onSelectSection: (section: ClientSection) => void;
  onOpenForm: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
  onOpenDrive?: () => void;
}

type TabDef = { id: ClientSection; label: string; Icon: typeof IconUser };

/** Build the ordered tab list given client status + whether memory has content.
 *  Pre-launch clients see a single Onboarding tab (checklist + per-task forms,
 *  unified). It disappears once the client goes live. */
function buildTabs(status: ClientEntry["status"], hasMemory: boolean): TabDef[] {
  const tabs: TabDef[] = [];
  if (status === "pre-launch") {
    tabs.push({ id: "onboarding", label: "Onboarding", Icon: IconTasks });
  } else {
    tabs.push({ id: "dashboard", label: "Dashboard", Icon: IconDashboard });
  }

  tabs.push(
    { id: "ads", label: "Ads", Icon: IconBarChart },
    { id: "service-delivery", label: "Fulfillment", Icon: IconBarChart },
    { id: "profile", label: "Profile", Icon: IconUser },
  );
  if (hasMemory) {
    tabs.push({ id: "memory", label: "Memory", Icon: IconPen });
  }
  return tabs;
}

function clientPill(status: ClientEntry["status"]) {
  switch (status) {
    case "live":
      return { className: "hml-green", label: "Live" };
    case "pre-launch":
      return { className: "hml-amber", label: "Pre-launch" };
    case "paused":
      return { className: "hml-neutral", label: "Paused" };
  }
}

function avatarChar(name: string): string {
  return name?.charAt(0)?.toUpperCase() ?? "•";
}

export function ClientDashboard({
  client,
  section,
  root,
  agents,
  onSelectSection,
  onOpenForm,
  onOpenDrive,
}: ClientDashboardProps) {
  const pill = clientPill(client.status);

  // Memory tab visibility — async probe for any non-empty Memory.md
  const [hasMemory, setHasMemory] = useState(false);
  useEffect(() => {
    if (!root) {
      setHasMemory(false);
      return;
    }
    let cancelled = false;
    api
      .readClientNotes(root, client.slug)
      .then((notes) => {
        if (cancelled) return;
        const mem = notes.find((n) => {
          const lower = n.path.toLowerCase();
          return lower.endsWith("/memory.md") || lower.endsWith("\\memory.md");
        });
        setHasMemory(!!mem && mem.body.trim().length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasMemory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  const tabs = useMemo(() => buildTabs(client.status, hasMemory), [client.status, hasMemory]);

  // If the active section is no longer in the visible tab set (e.g. status
  // flipped, or memory was emptied), bounce to the first tab.
  useEffect(() => {
    if (!tabs.some((t) => t.id === section)) {
      onSelectSection(tabs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, section]);

  return (
    <div className="hml-content">
      <section className="hml-client-header">
        <div className="hml-client-header-top">
          <div className="hml-client-avatar">{avatarChar(client.name)}</div>
          <div className="hml-client-name-block">
            <h1 className="hml-client-name">{client.name}</h1>
            <span className={`hml-pill ${pill.className}`}>
              <span className="hml-pill-dot" />
              {pill.label}
            </span>
          </div>
          <div className="hml-client-actions">
            {client.drive_folder_url && onOpenDrive && (
              <button type="button" className="hml-btn" onClick={onOpenDrive}>
                <IconFolder size={13} />
                Open Drive
              </button>
            )}
            <button type="button" className="hml-icon-btn" aria-label="More">
              <IconMore size={14} />
            </button>
          </div>
        </div>
        <div className="hml-client-meta-row">
          {client.created_at && (
            <>
              <div className="hml-item">
                <span className="hml-label">Started</span>
                <span className="hml-v">
                  {new Date(client.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <span className="hml-sep">·</span>
            </>
          )}
          <div className="hml-item">
            <span className="hml-label">Slug</span>
            <span className="hml-v">{client.slug}</span>
          </div>
          {client.benchmarks && (
            <>
              <span className="hml-sep">·</span>
              <div className="hml-item">
                <span className="hml-label">Benchmarks</span>
                <span className="hml-v">{client.benchmarks}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <nav className="hml-subnav">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`hml-subnav-item${section === id ? " hml-active" : ""}`}
            onClick={() => onSelectSection(id)}
          >
            <Icon className="hml-nav-icon" />
            {label}
          </button>
        ))}
      </nav>

      <div>
        {section === "dashboard" && (
          <ClientOverviewPanel client={client} root={root} />
        )}
        {section === "onboarding" && (
          <OnboardingChecklist
            root={root}
            clientSlug={client.slug}
            clientName={client.name}
            agents={agents}
            onComplete={() => {
              // Switch to Dashboard if the client has graduated out of
              // pre-launch (otherwise Dashboard isn't in the tab list and
              // the tab bounce-back would land us back here anyway).
              if (client.status !== "pre-launch") onSelectSection("dashboard");
            }}
          />
        )}
        {section === "ads" && (
          <AdsManagerPage
            mode="client"
            clients={[client]}
            activeClientSlug={client.slug}
          />
        )}
        {section === "profile" && (
          <ClientProfileInlineEditor client={client} root={root} />
        )}
        {section === "memory" && (
          <ClientNoteView root={root} clientSlug={client.slug} match="memory" emptyLabel="No Memory.md found yet." />
        )}
        {section === "service-delivery" && (
          <ClientServiceDelivery clientName={client.name}>
            {(active) => {
              if (active === "forms") {
                return (
                  <ClientMediaBuying
                    clientName={client.name}
                    onOpenForm={(id) => onOpenForm(id, client.slug, client.name)}
                  />
                );
              }
              if (active === "recordings") {
                return (
                  <ClientRecordingsView
                    root={root}
                    clientSlug={client.slug}
                    clientName={client.name}
                  />
                );
              }
              if (active === "websites") {
                return (
                  <WebDesignerPage
                    root={root}
                    clientSlug={client.slug}
                    clientName={client.name}
                  />
                );
              }
              return (
                <ClientDriveView
                  root={root}
                  clientSlug={client.slug}
                  driveUrl={client.drive_folder_url ?? null}
                />
              );
            }}
          </ClientServiceDelivery>
        )}
      </div>
    </div>
  );
}

/** Per-client overview surface — status snapshot, ops row stats, latest activity. */
function ClientOverviewPanel({
  client,
  root,
}: {
  client: ClientEntry;
  root: string | null;
}) {
  const [opsRow, setOpsRow] = useState<OpsClientRow | null>(null);
  const [recCount, setRecCount] = useState<number | null>(null);
  const [latestRec, setLatestRec] = useState<FathomRecording | null>(null);

  useEffect(() => {
    if (!root) {
      setOpsRow(null);
      setRecCount(null);
      setLatestRec(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ops = await api.readOpsClients(root);
        if (!cancelled) setOpsRow(ops.rows[client.slug] ?? null);
      } catch {
        if (!cancelled) setOpsRow(null);
      }
      try {
        const state = await api.readDashboardState(root);
        if (cancelled) return;
        const mine = (state.recordings ?? []).filter(
          (r) => r.clientSlug === client.slug,
        );
        setRecCount(mine.length);
        mine.sort((a, b) => b.createdAt - a.createdAt);
        setLatestRec(mine[0] ?? null);
      } catch {
        if (!cancelled) {
          setRecCount(null);
          setLatestRec(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  const fmtMoney = (n: number | null | undefined) =>
    n == null ? "—" : `$${n.toLocaleString()}`;
  const fmtDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // Patch a partial OpsClientRow into ops/clients.json and reflect in local
  // state. When `invoicePaidAt` is set for the first time, retainer
  // `startDate` is auto-filled to the same date — the engagement officially
  // begins when the first invoice clears.
  async function patchOpsRow(patch: Partial<OpsClientRow>) {
    if (!root) return;
    try {
      const ops = await api.readOpsClients(root);
      const existing = ops.rows[client.slug] ?? {};
      const next: OpsClientRow = { ...existing, ...patch };
      if (patch.invoicePaidAt && !next.startDate) {
        next.startDate = patch.invoicePaidAt;
      }
      await api.writeOpsClients(root, {
        rows: { ...ops.rows, [client.slug]: next },
      });
      setOpsRow(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("patchOpsRow failed", err);
    }
  }

  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const markContractSigned = () => patchOpsRow({ contractSignedAt: today() });
  const markInvoicePaid = () => patchOpsRow({ invoicePaidAt: today() });
  const clearContract = () => patchOpsRow({ contractSignedAt: null });
  const clearInvoice = () => patchOpsRow({ invoicePaidAt: null });

  return (
    <div>
      <section className="hml-stat-row">
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconBarChart className="hml-icon" />
            Retainer
          </div>
          <div className="hml-stat-value">
            {fmtMoney(opsRow?.retainer ?? null)}
            <span className="hml-stat-delta hml-flat">monthly</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconBarChart className="hml-icon" />
            Ad spend
          </div>
          <div className="hml-stat-value">
            {fmtMoney(opsRow?.adSpend ?? null)}
            <span className="hml-stat-delta hml-flat">monthly</span>
          </div>
        </div>
        <div className="hml-stat-card">
          <div className="hml-stat-label">
            <IconRecordings className="hml-icon" />
            Recordings
          </div>
          <div className="hml-stat-value">
            {recCount ?? 0}
            <span className="hml-stat-delta hml-flat">
              {recCount && recCount > 0 ? "on file" : "— none yet"}
            </span>
          </div>
        </div>
      </section>

      <section className="hml-panel" style={{ marginBottom: 16 }}>
        <div className="hml-panel-header">
          <div className="hml-panel-title">
            <span
              className="hml-dot"
              style={{
                background:
                  opsRow?.contractSignedAt && opsRow?.invoicePaidAt
                    ? "var(--hml-green)"
                    : "var(--hml-amber)",
              }}
            />
            Account status
          </div>
        </div>
        <div className="hml-panel-body" style={{ padding: "14px 20px" }}>
          <StatusRow
            label="Contract"
            date={opsRow?.contractSignedAt}
            onMark={markContractSigned}
            onClear={clearContract}
            doneLabel="Signed"
            dueLabel="Contract due"
            actionLabel="Mark as signed"
            fmtDate={fmtDate}
          />
          <StatusRow
            label="Invoice"
            date={opsRow?.invoicePaidAt}
            onMark={markInvoicePaid}
            onClear={clearInvoice}
            doneLabel="Paid"
            dueLabel="Invoice due"
            actionLabel="Mark as paid"
            fmtDate={fmtDate}
          />
        </div>
      </section>

      <section className="hml-col-2">
        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Key dates
            </div>
          </div>
          <div className="hml-panel-body" style={{ padding: "14px 20px" }}>
            <KvRow label="Retainer start" value={fmtDate(opsRow?.startDate)} />
            <KvRow label="Ads launched" value={fmtDate(opsRow?.adsLaunchedAt)} />
            <KvRow label="Last weekly report" value={fmtDate(opsRow?.weeklyReportSentAt)} />
            <KvRow label="Last monthly report" value={fmtDate(opsRow?.monthlyReportSentAt)} />
            <KvRow label="Next call" value={fmtDate(opsRow?.nextCall)} />
          </div>
        </div>

        <div className="hml-panel">
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
              Latest recording
            </div>
          </div>
          <div className="hml-panel-body" style={{ padding: "14px 20px" }}>
            {latestRec ? (
              <div>
                <button
                  type="button"
                  className="hml-link"
                  onClick={() => openFathomInApp(latestRec.url, latestRec.title)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    color: "var(--hml-text)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {latestRec.title}
                </button>
                {latestRec.description && (
                  <div
                    style={{
                      marginTop: 6,
                      color: "var(--hml-text-secondary)",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  >
                    {latestRec.description}
                  </div>
                )}
                <div className="hml-activity-meta" style={{ marginTop: 8 }}>
                  <span>
                    {new Date(latestRec.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="hml-empty" style={{ padding: "8px 0" }}>
                <div className="hml-empty-sub">No recordings on file for {client.name}.</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {opsRow?.notes && (
        <section className="hml-panel" style={{ marginTop: 18 }}>
          <div className="hml-panel-header">
            <div className="hml-panel-title">
              <span className="hml-dot" />
              Ops notes
            </div>
          </div>
          <div
            className="hml-panel-body"
            style={{
              padding: "14px 20px",
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.6,
              color: "var(--hml-text-secondary)",
            }}
          >
            {opsRow.notes}
          </div>
        </section>
      )}
    </div>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "7px 0",
        borderBottom: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.05))",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--hml-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--hml-text)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

/** One row of the Account Status panel — Contract or Invoice.
 *  Shows an amber "due" pill + action button when undated; flips to a green
 *  done pill with the date and a small clear/undo affordance once marked. */
function StatusRow({
  label,
  date,
  onMark,
  onClear,
  doneLabel,
  dueLabel,
  actionLabel,
  fmtDate,
}: {
  label: string;
  date: string | null | undefined;
  onMark: () => void;
  onClear: () => void;
  doneLabel: string;
  dueLabel: string;
  actionLabel: string;
  fmtDate: (iso: string | null | undefined) => string;
}) {
  const isDone = !!date;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "10px 0",
        borderBottom: "1px solid var(--hml-border-subtle, rgba(255,255,255,0.05))",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            color: "var(--hml-text-secondary)",
            minWidth: 72,
            display: "inline-block",
          }}
        >
          {label}
        </span>
        <span className={`hml-pill ${isDone ? "hml-green" : "hml-amber"}`}>
          <span className="hml-pill-dot" />
          {isDone ? `${doneLabel} · ${fmtDate(date)}` : dueLabel}
        </span>
      </div>
      {isDone ? (
        <button
          type="button"
          onClick={onClear}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--hml-text-tertiary)",
            fontSize: 12,
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 4,
          }}
          title="Clear — mark as not yet completed"
        >
          Clear
        </button>
      ) : (
        <button
          type="button"
          onClick={onMark}
          style={{
            background: "var(--hml-bg-elev-2)",
            border: "1px solid var(--hml-border)",
            color: "var(--hml-text-primary)",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            padding: "6px 12px",
            borderRadius: 5,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Profile.md editor — embedded form for in-place edits. Mirrors the standalone
 *  ClientProfileForm but without the modal chrome. */
function ClientProfileInlineEditor({
  client,
  root,
}: {
  client: ClientEntry;
  root: string | null;
}) {
  const [values, setValues] = useState<ProfileFormValues>(() => emptyProfileFormValues());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!root) {
      setLoading(false);
      setValues(emptyProfileFormValues());
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    (async () => {
      try {
        const notes = await api.readClientNotes(root, client.slug);
        const profileNote =
          notes.find((n) => n.front?.type === "profile") ??
          notes.find((n) => n.rel_path.replace(/\\/g, "/").endsWith("/Profile.md"));
        if (profileNote) {
          const parsed = parseProfileBody(profileNote.body);
          if (!cancelled) setValues(parsed);
        } else if (!cancelled) {
          setValues(emptyProfileFormValues());
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, client.slug]);

  const update = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!root) {
      setError("Pick a media-buying folder first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildProfileBody(client, values);
      const front = buildProfileFront(client);
      const vaultRoot = await api.vaultRootPath(root);
      const path = profilePathFor(vaultRoot, client);
      await api.writeVaultNote(root, path, front, body);
      setSavedAt(Date.now());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading profile…</div></div>;
  }

  return (
    <section className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          Profile
        </div>
        <span className="hml-panel-action">
          vault/Clients/{client.name}/Profile.md
        </span>
      </div>
      <div className="hml-panel-body" style={{ padding: "18px 22px 22px" }}>
        {error && (
          <div
            className="hml-error-banner"
            style={{ marginBottom: 14 }}
          >
            {error}
          </div>
        )}

        <Field label="What they do" hint='One sentence. Becomes the "Business" section.'>
          <input
            className="hml-form-input"
            placeholder="e.g. Residential window cleaning company serving the north suburbs."
            value={values.business}
            onChange={(e) => update("business", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Services" hint="One service per line. Saved as bullets.">
          <textarea
            className="hml-form-textarea"
            rows={4}
            placeholder={"Residential window cleaning\nGutter cleaning\nScreen repair"}
            value={values.services}
            onChange={(e) => update("services", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field
          label="Target customer"
          hint="Homeowner profile, age, income, neighborhoods, pain points."
        >
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder="Homeowners 35–65, $120k+ HHI, neighborhoods with HOA pressure to keep curb appeal up."
            value={values.target}
            onChange={(e) => update("target", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Offers" hint="Intro pricing, packages, seasonal promos. One per line.">
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder={"$99 first-time clean\nSpring bundle: windows + gutters"}
            value={values.offers}
            onChange={(e) => update("offers", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Voice / brand notes" hint="How they want to be talked about.">
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder="Friendly, local, never corporate. We sound like a neighbor, not a chain."
            value={values.voice}
            onChange={(e) => update("voice", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="What to avoid" hint="No-gos. One item per line.">
          <textarea
            className="hml-form-textarea"
            rows={3}
            placeholder={"Fake urgency claims\nDiscounts above 30%"}
            value={values.avoid}
            onChange={(e) => update("avoid", e.target.value)}
            disabled={busy}
          />
        </Field>

        <Field label="Geography" hint="Service area, ZIP codes, radius.">
          <input
            className="hml-form-input"
            placeholder="e.g. North suburbs of Chicago — 20 mi radius from 60062"
            value={values.geography}
            onChange={(e) => update("geography", e.target.value)}
            disabled={busy}
          />
        </Field>

        <div className="hml-form-footer">
          {savedAt && (
            <span className="hml-dim" style={{ fontSize: 12 }}>
              Saved {new Date(savedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            className="hml-btn hml-accent"
            onClick={handleSave}
            disabled={busy || !root}
            style={{ marginLeft: "auto" }}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hml-form-field">
      <label className="hml-form-label">{label}</label>
      {children}
      {hint && <div className="hml-form-help">{hint}</div>}
    </div>
  );
}

/** Lightweight vault-note display for the Memory tab — read-only for now. */
function ClientNoteView({
  root,
  clientSlug,
  match,
  emptyLabel,
}: {
  root: string | null;
  clientSlug: string;
  match: "profile" | "memory";
  emptyLabel: string;
}) {
  const [notes, setNotes] = useState<VaultNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotes(null);
    setError(null);
    api
      .readClientNotes(root, clientSlug)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (notes === null) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading…</div></div>;
  }

  const note = notes.find((n) => {
    const lower = n.path.toLowerCase();
    return lower.endsWith(`/${match}.md`) || lower.endsWith(`\\${match}.md`);
  });

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load notes</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">{emptyLabel}</div>
        <div className="hml-empty-sub">
          Create it at vault/Clients/{clientSlug}/{match.charAt(0).toUpperCase() + match.slice(1)}.md.
        </div>
      </div>
    );
  }

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          {match === "profile" ? "Profile" : "Memory"}
        </div>
        <span className="hml-panel-action">
          {note.path.split(/[/\\]/).slice(-3).join(" / ")}
        </span>
      </div>
      <pre
        style={{
          padding: "18px 22px",
          margin: 0,
          fontFamily: "var(--hml-font-sans)",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--hml-text-secondary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {note.body}
      </pre>
    </div>
  );
}

const CLIENT_RECORDINGS_KEY_PREFIX = "hml.recordings.client.";
const FATHOM_SHARE_RE_CLIENT =
  /^https?:\/\/(?:[\w-]+\.)?fathom\.video\/(?:share|calls)\/([\w-]+)/i;

function recUid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseFathomUrl(input: string): { url: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!FATHOM_SHARE_RE_CLIENT.test(trimmed)) return null;
  return { url: trimmed };
}

function formatRecStamp(ts: number): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`.toUpperCase();
}

function ClientRecordingsView({
  root,
  clientSlug,
  clientName,
}: {
  root: string | null;
  clientSlug: string;
  clientName: string;
}) {
  const [recordings, setRecordings] = useState<FathomRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const skipSave = useRef(true);
  const saveTimer = useRef<number | null>(null);

  const [recUrl, setRecUrl] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recDescription, setRecDescription] = useState("");
  const [recError, setRecError] = useState<string | null>(null);

  const lsKey = `${CLIENT_RECORDINGS_KEY_PREFIX}${clientSlug}`;

  useEffect(() => {
    let cancelled = false;
    skipSave.current = true;
    setLoading(true);

    const run = async () => {
      if (root) {
        try {
          const state = await api.readDashboardState(root);
          if (cancelled) return;
          const all = Array.isArray(state.recordings) ? state.recordings : [];
          setRecordings(all.filter((r) => r.clientSlug === clientSlug));
        } catch (err) {
          console.warn("Failed to read dashboard state for client recordings:", err);
          if (!cancelled) {
            try {
              const raw = localStorage.getItem(lsKey);
              setRecordings(raw ? JSON.parse(raw) : []);
            } catch {
              setRecordings([]);
            }
          }
        }
      } else {
        try {
          const raw = localStorage.getItem(lsKey);
          if (!cancelled) setRecordings(raw ? JSON.parse(raw) : []);
        } catch {
          if (!cancelled) setRecordings([]);
        }
      }
      if (!cancelled) setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug, lsKey]);

  useEffect(() => {
    if (loading) return;
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const persist = async () => {
        if (root) {
          try {
            const current = await api.readDashboardState(root);
            const others = (current.recordings ?? []).filter(
              (r) => r.clientSlug !== clientSlug,
            );
            const next: DashboardState = {
              tasks: Array.isArray(current.tasks) ? current.tasks : [],
              notes: Array.isArray(current.notes) ? current.notes : [],
              calendar: current.calendar ?? null,
              recordings: [...others, ...recordings],
            };
            await api.writeDashboardState(root, next);
          } catch (err) {
            console.warn("Failed to write client recordings:", err);
          }
        } else {
          try {
            localStorage.setItem(lsKey, JSON.stringify(recordings));
          } catch (err) {
            console.warn("Failed to write client recordings to localStorage:", err);
          }
        }
      };
      void persist();
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [recordings, root, loading, clientSlug, lsKey]);

  const sortedRecordings = useMemo(
    () => [...recordings].sort((a, b) => b.createdAt - a.createdAt),
    [recordings],
  );

  const recUrlValid = !recUrl.trim() || parseFathomUrl(recUrl) !== null;

  const addRecording = () => {
    const parsed = parseFathomUrl(recUrl);
    if (!parsed) {
      setRecError("Paste a fathom.video share link.");
      return;
    }
    const title = recTitle.trim();
    if (!title) {
      setRecError("Add a title before saving.");
      return;
    }
    const description = recDescription.trim();
    const rec: FathomRecording = {
      id: recUid(),
      url: parsed.url,
      title,
      description: description || undefined,
      createdAt: Date.now(),
      clientSlug,
    };
    setRecordings((prev) => [rec, ...prev]);
    setRecUrl("");
    setRecTitle("");
    setRecDescription("");
    setRecError(null);
  };

  const removeRecording = (id: string) => {
    const rec = recordings.find((r) => r.id === id);
    const label = rec?.title || "this recording";
    if (!window.confirm(`Delete "${label}"?`)) return;
    setRecordings((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRecordingTitle = (id: string, title: string) => {
    setRecordings((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  };

  const updateRecordingDescription = (id: string, description: string) => {
    setRecordings((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, description: description || undefined } : r,
      ),
    );
  };

  return (
    <div className="md-recordings-page">
      <style>{recordingsPageCSS}</style>

      <div className="md-panel md-recordings-panel">
        <div className="md-panel-head">
          <span className="md-panel-title">▸ New Recording — {clientName}</span>
          <span className="md-panel-meta">{recordings.length} SAVED</span>
        </div>

        <div className="md-rec-form">
          <input
            className={`md-rec-input ${recUrl && !recUrlValid ? "is-invalid" : ""}`}
            type="url"
            placeholder="Paste fathom.video link…"
            value={recUrl}
            onChange={(e) => {
              setRecUrl(e.target.value);
              if (recError) setRecError(null);
            }}
          />
          <input
            className="md-rec-input"
            type="text"
            placeholder="Title"
            value={recTitle}
            onChange={(e) => {
              setRecTitle(e.target.value);
              if (recError) setRecError(null);
            }}
          />
          <textarea
            className="md-rec-description"
            placeholder="Description (optional)"
            value={recDescription}
            onChange={(e) => setRecDescription(e.target.value)}
            rows={2}
          />
          <div className="md-rec-form-actions">
            {recError ? <span className="md-rec-error">{recError}</span> : <span />}
            <button
              type="button"
              className="md-rec-add"
              onClick={addRecording}
              disabled={!recUrl.trim() || !recTitle.trim()}
            >
              Save recording
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="md-rec-empty">Loading…</div>
      ) : sortedRecordings.length === 0 ? (
        <div className="md-rec-empty">No recordings for {clientName} yet, Sir.</div>
      ) : (
        <ul className="md-rec-list">
          {sortedRecordings.map((r) => {
            const parsed = parseFathomUrl(r.url);
            return (
              <li key={r.id} className="md-rec-item md-panel">
                {parsed ? (
                  <button
                    type="button"
                    className="md-rec-card"
                    onClick={() => openFathomInApp(r.url, r.title)}
                    title="Play recording"
                  >
                    <span className="md-rec-card-play" aria-hidden="true">▶</span>
                    <span className="md-rec-card-label">Play recording</span>
                  </button>
                ) : (
                  <div className="md-rec-card md-rec-card-invalid">
                    <span className="md-rec-card-label">
                      Invalid Fathom URL —{" "}
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.url}
                      </a>
                    </span>
                  </div>
                )}
                <div className="md-rec-body">
                  <input
                    className="md-rec-title-input"
                    type="text"
                    value={r.title}
                    onChange={(e) => updateRecordingTitle(r.id, e.target.value)}
                    placeholder="Title"
                  />
                  <textarea
                    className="md-rec-description-input"
                    value={r.description ?? ""}
                    onChange={(e) =>
                      updateRecordingDescription(r.id, e.target.value)
                    }
                    placeholder="Description (optional)"
                    rows={2}
                  />
                  <div className="md-rec-meta-row">
                    <a
                      className="md-rec-link"
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Fathom ↗
                    </a>
                    <span className="md-panel-meta">{formatRecStamp(r.createdAt)}</span>
                    <button
                      type="button"
                      className="md-rec-delete"
                      onClick={() => removeRecording(r.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ClientDriveView({
  root,
  clientSlug,
  driveUrl,
}: {
  root: string | null;
  clientSlug: string;
  driveUrl: string | null;
}) {
  const [tree, setTree] = useState<DriveNode | null | undefined>(undefined);
  const [folders, setFolders] = useState<DriveFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Stack of folder IDs descended into from the root. Empty = at root.
  const [path, setPath] = useState<string[]>([]);

  useEffect(() => {
    if (!root) {
      setFolders([]);
      setTree(null);
      return;
    }
    let cancelled = false;
    setFolders(null);
    setTree(undefined);
    setError(null);
    setPath([]);
    api
      .readDriveIndex(root, clientSlug)
      .then((idx) => {
        if (cancelled) return;
        if (!idx) {
          setFolders([]);
          setTree(null);
          return;
        }
        setFolders(parseDriveFolders(idx.body));
        setTree(parseDriveTree(idx.body));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setFolders([]);
        setTree(null);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (folders === null || tree === undefined) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading Drive index…</div></div>;
  }

  if (!driveUrl && (!folders || folders.length === 0)) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">No Drive folder linked</div>
        <div className="hml-empty-sub">
          Link a Drive folder from Settings, then refresh the index here.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load Drive index</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  // Tree path: array of nodes from root down to the currently viewed folder.
  // Empty when the index has no `## Tree` block — we fall back to the flat
  // folder list (older clients that haven't been re-indexed yet).
  const trail: DriveNode[] = [];
  if (tree) {
    trail.push(tree);
    let cursor: DriveNode | undefined = tree;
    for (const id of path) {
      const next: DriveNode | undefined = cursor?.children?.find(
        (c) => c.id === id && c.type === "folder",
      );
      if (!next) break;
      trail.push(next);
      cursor = next;
    }
  }
  const current = trail.length > 0 ? trail[trail.length - 1] : null;
  const children = current?.children ?? [];

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
          {trail.length > 1 ? (
            <DriveBreadcrumb trail={trail} onJump={(depth) => setPath(path.slice(0, depth))} />
          ) : (
            "Drive folders"
          )}
        </div>
        {current && current.id ? (
          <a
            href={driveNodeUrl(current)}
            target="_blank"
            rel="noreferrer"
            className="hml-panel-action"
            onClick={(e) => {
              e.preventDefault();
              window.open(driveNodeUrl(current), "_blank", "noopener,noreferrer");
            }}
          >
            Open in Drive ↗
          </a>
        ) : driveUrl ? (
          <a
            href={driveUrl}
            target="_blank"
            rel="noreferrer"
            className="hml-panel-action"
            onClick={(e) => {
              e.preventDefault();
              window.open(driveUrl, "_blank", "noopener,noreferrer");
            }}
          >
            Open in Drive ↗
          </a>
        ) : null}
      </div>
      <div className="hml-panel-body">
        {tree ? (
          children.length === 0 ? (
            <div className="hml-empty">
              <div className="hml-empty-sub">This folder is empty.</div>
            </div>
          ) : (
            <DriveChildren
              nodes={children}
              onOpenFolder={(id) => setPath([...path, id])}
            />
          )
        ) : folders.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-sub">
              No folders indexed yet. Run the Drive index refresh from Settings.
            </div>
          </div>
        ) : (
          <>
            <div className="hml-empty" style={{ paddingBottom: 8 }}>
              <div className="hml-empty-sub">
                This index is from before in-app browsing — refresh it from Settings to enable drill-down.
              </div>
            </div>
            {folders.map((f) => (
              <a
                key={f.id}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="hml-activity"
                style={{ textDecoration: "none" }}
                onClick={(e) => {
                  e.preventDefault();
                  window.open(f.url, "_blank", "noopener,noreferrer");
                }}
              >
                <div className="hml-activity-icon hml-blue">
                  <IconFolder size={13} />
                </div>
                <div className="hml-activity-body">
                  <div className="hml-activity-title">
                    <span className="hml-em">{f.name}</span>
                  </div>
                </div>
              </a>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function DriveBreadcrumb({
  trail,
  onJump,
}: {
  trail: DriveNode[];
  onJump: (depth: number) => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {trail.map((node, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={node.id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {isLast ? (
              <span>{node.name}</span>
            ) : (
              <button
                type="button"
                onClick={() => onJump(i)}
                className="hml-link"
                style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
              >
                {node.name}
              </button>
            )}
            {!isLast && (
              <span style={{ opacity: 0.5, display: "inline-flex" }}>
                <IconChevronRight size={12} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

function DriveChildren({
  nodes,
  onOpenFolder,
}: {
  nodes: DriveNode[];
  onOpenFolder: (id: string) => void;
}) {
  // Folders first, then files; each group alphabetized.
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return (
    <>
      {sorted.map((node) => {
        if (node.type === "folder") {
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onOpenFolder(node.id)}
              className="hml-activity"
              style={{
                textDecoration: "none",
                background: "none",
                border: 0,
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div className="hml-activity-icon hml-blue">
                <IconFolder size={13} />
              </div>
              <div className="hml-activity-body">
                <div className="hml-activity-title">
                  <span className="hml-em">{node.name}</span>
                </div>
              </div>
              <div style={{ opacity: 0.5, display: "inline-flex", alignItems: "center" }}>
                <IconChevronRight size={14} />
              </div>
            </button>
          );
        }
        const url = driveNodeUrl(node);
        return (
          <a
            key={node.id}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="hml-activity"
            style={{ textDecoration: "none" }}
            onClick={(e) => {
              e.preventDefault();
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            <div className="hml-activity-icon">
              <IconFile size={13} />
            </div>
            <div className="hml-activity-body">
              <div className="hml-activity-title">{node.name}</div>
            </div>
            <div style={{ opacity: 0.5, display: "inline-flex", alignItems: "center" }}>
              <IconExternalLink size={13} />
            </div>
          </a>
        );
      })}
    </>
  );
}
