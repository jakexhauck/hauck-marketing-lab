import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ScrollText,
  Plug,
  RefreshCw,
  ChevronRight,
  KeyRound,
  LayoutList,
  Users,
  AlertTriangle,
  ExternalLink,
  KeySquare,
} from "lucide-react";
import { useConnectionHealth, useAgencySecrets } from "../../hooks/useApi";
import {
  CONNECTIONS,
  CRED_HOME_LABEL,
  credentialIndex,
  surfaceIndex,
  type ConnectionDef,
} from "../../lib/connectionRegistry";
import {
  deriveState,
  stateReason,
  needsAttention,
  clientRowState,
  CONN_STATE_LABEL,
  type ConnState,
  type ConnectionHealth,
  type ClientConnectionHealth,
} from "../../lib/connectionHealth";
import { ConnectionsStyle } from "../../components/admin/settings/ConnectionsStyle";
import { SecretsTab } from "../../components/admin/settings/SecretsTab";
import { ActionBoard } from "../../components/admin/settings/ActionBoard";
import { buildActionBoard, type ActionItem } from "../../lib/settingsActions";
import AdminPage from "../../components/admin/AdminPage";

// /admin/settings: the connection control room.
//
// Built to answer the two questions that used to have no home. "Did something
// break and how long ago" (every row carries a live probe, not a hand-kept
// note), and "what goes dark if this dies" (the registry declares the edges in
// both directions, so a red credential names its casualties and an empty page
// names its requirements).
//
// The Secrets tab adds editing, split by how each kind actually behaves:
// per-client credentials live on the tenants row and are live the moment they
// save, while agency-wide ones write to Doppler and stay drifted from the
// running deploy until it is rebound. That split is not cosmetic, it is the
// difference between a page that tells the truth and one that implies a change
// took effect when it did not.
//
// What it still refuses to hold is a Cloudflare API token. Deploying from here
// would turn an admin session into full control of the Cloudflare account, so
// the drift banner hands over a command to run instead.
//
// PillarStyle is mounted once by AdminLayout, so this page renders .pk-root and
// reads the Modern Motion tokens like every other admin page.

type Tab = "connections" | "surfaces" | "secrets" | "credentials" | "clients";

const TABS: { id: Tab; label: string; icon: typeof Plug }[] = [
  { id: "connections", label: "Connections", icon: Plug },
  { id: "surfaces", label: "By surface", icon: LayoutList },
  { id: "secrets", label: "Secrets", icon: KeySquare },
  { id: "credentials", label: "Credentials", icon: KeyRound },
  { id: "clients", label: "Per client", icon: Users },
];

function StatePill({ state }: { state: ConnState }) {
  return (
    <span className={`cx-pill cx-pill-${state}`}>
      <span className="cx-dot" aria-hidden />
      {CONN_STATE_LABEL[state]}
    </span>
  );
}

export default function AdminSettings() {
  // Details start CLOSED. The split screen is the page; everything below it is
  // reference material you open on purpose, not five tabs to wade through.
  const [tab, setTab] = useState<Tab | null>(null);
  const { data, isLoading, isFetching, error, refetch } = useConnectionHealth();
  // Drift is part of "what needs to happen", so the board waits on it too. It
  // fails soft: no Doppler token just means no drift rows.
  const { data: secrets } = useAgencySecrets();

  const byId = useMemo(
    () => new Map((data?.connections ?? []).map((c) => [c.id, c])),
    [data?.connections],
  );
  const board = useMemo(
    () =>
      buildActionBoard({
        connections: data?.connections ?? [],
        clients: data?.clients ?? [],
        agencySecrets: secrets?.rows,
      }),
    [data?.connections, data?.clients, secrets?.rows],
  );

  // A job's button opens the panel that does that job, and nothing else.
  function act(item: ActionItem) {
    setTab(
      item.target === "connection"
        ? "connections"
        : item.target === "secrets-client"
          ? "clients"
          : "secrets",
    );
    // The panel renders below the fold, so move to it rather than leaving the
    // click looking like it did nothing.
    requestAnimationFrame(() => {
      document.getElementById("cx-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Broken first, then never-set-up, then unverified, then live. The rows that
  // need a human float to the top on their own rather than needing a filter.
  const ordered = useMemo(() => {
    const rank: Record<ConnState, number> = { down: 0, unconfigured: 1, unverified: 2, live: 3 };
    return [...CONNECTIONS].sort(
      (a, b) => rank[deriveState(byId.get(a.id))] - rank[deriveState(byId.get(b.id))],
    );
  }, [byId]);

  return (
    <div className="pk-root">
      <AdminPage
        section="Agency Settings"
        actions={
          <button
            type="button"
            className="cx-refresh"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? "cx-spin" : ""} aria-hidden />
            {isFetching ? "Checking" : "Re-check"}
          </button>
        }
      />

      {data?.environment === "local" && (
        <div className="cx-note cx-note-warn">
          <AlertTriangle size={16} aria-hidden />
          <span>
            Running on localhost, which reads <code>.dev.vars</code> rather than the production
            environment. A missing credential here is not proof it is missing in production. Trust
            this page fully only on the live URL.
          </span>
        </div>
      )}

      {error && (
        <div className="cx-note cx-note-bad">
          <AlertTriangle size={16} aria-hidden />
          <span>
            Could not read connection health. The API may not be running: this page needs the Pages
            Functions dev server, not the Vite server alone.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="pk-empty">Checking every connection.</div>
      ) : (
        <ActionBoard board={board} onAct={act} />
      )}

      <div id="cx-details" className="cx-details">
        <div className="cx-detailbar">
          <span className="cx-detaillabel">Details</span>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cx-detailtab ${tab === t.id ? "on" : ""}`}
              onClick={() => setTab(tab === t.id ? null : t.id)}
            >
              <t.icon size={13} aria-hidden />
              {t.label}
            </button>
          ))}
          <Link to="/admin/audit" className="cx-detailtab">
            <ScrollText size={13} aria-hidden />
            Audit log
          </Link>
          <span className="cx-score-when">
            {data ? `Checked ${new Date(data.checkedAt).toLocaleTimeString()}` : ""}
          </span>
        </div>

        {tab && (
          <div className="cx-detailbody">
            {tab === "connections" && <ConnectionsTab defs={ordered} byId={byId} />}
            {tab === "surfaces" && <SurfacesTab byId={byId} />}
            {tab === "secrets" && <SecretsTab clients={data?.clients ?? []} />}
            {tab === "credentials" && <CredentialsTab />}
            {tab === "clients" && <ClientsTab clients={data?.clients ?? []} loading={isLoading} />}
          </div>
        )}
      </div>
      <p className="cx-footnote">
        Secret values are never shown back to you, only their last four characters. Doppler stays
        the source of truth for agency-wide keys; per-client credentials live on the client&apos;s
        own row and take effect immediately.
      </p>

      <ConnectionsStyle />
    </div>
  );
}

// ---------- Connections: the forward view ----------

function ConnectionsTab({
  defs,
  byId,
}: {
  defs: ConnectionDef[];
  byId: Map<string, ConnectionHealth>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="cx-list">
      {defs.map((def) => {
        const health = byId.get(def.id);
        const state = deriveState(health);
        const isOpen = open === def.id;
        return (
          <div key={def.id} className={`cx-row ${needsAttention(state) ? "cx-row-attention" : ""}`}>
            <button
              type="button"
              className="cx-rowhead"
              onClick={() => setOpen(isOpen ? null : def.id)}
              aria-expanded={isOpen}
            >
              <ChevronRight size={16} className={`cx-chev ${isOpen ? "on" : ""}`} aria-hidden />
              <div className="cx-rowmain">
                <div className="cx-rowtitle">
                  {def.label}
                  <span className="cx-scope">{def.scope === "client" ? "per client" : "agency"}</span>
                </div>
                <div className="cx-rowreason">{stateReason(health)}</div>
              </div>
              <StatePill state={state} />
            </button>

            {isOpen && (
              <div className="cx-body">
                <p className="cx-purpose">{def.purpose}</p>

                <div className="cx-grid">
                  <section>
                    <h4 className="cx-h4">Credentials</h4>
                    <ul className="cx-creds">
                      {def.credentials.map((c) => {
                        const cred = health?.credentials.find((x) => x.name === c.name);
                        return (
                          <li key={c.name}>
                            <div className="cx-credtop">
                              <code>{c.name}</code>
                              {c.optional && <span className="cx-opt">optional</span>}
                              {cred && (
                                <span
                                  className={`cx-present ${cred.present ? "yes" : "no"}`}
                                  title={cred.present ? "Value is set" : "No value set"}
                                >
                                  {cred.present ? "set" : "not set"}
                                </span>
                              )}
                            </div>
                            <div className="cx-credhome">
                              {CRED_HOME_LABEL[c.home]}
                              {c.inDoppler && <span className="cx-doppler">mirrored in Doppler</span>}
                            </div>
                            {c.note && <div className="cx-note-sm">{c.note}</div>}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section>
                    <h4 className="cx-h4">Goes dark without it</h4>
                    <ul className="cx-surfaces">
                      {def.surfaces.map((s) => (
                        <li key={s.label}>
                          <span className={`cx-aud cx-aud-${s.audience}`}>{s.audience}</span>
                          {s.to ? (
                            <Link to={s.to}>
                              {s.label}
                              <ExternalLink size={11} aria-hidden />
                            </Link>
                          ) : (
                            <span>{s.label}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>

                <div className="cx-fix">
                  <h4 className="cx-h4">If it goes red</h4>
                  <p>{def.remediation}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- By surface: the reverse view (the live Willis audit) ----------

function SurfacesTab({ byId }: { byId: Map<string, ConnectionHealth> }) {
  const groups = useMemo(() => {
    const all = surfaceIndex();
    // Worst requirement first: the surfaces actually broken right now lead.
    const rank: Record<ConnState, number> = { down: 0, unconfigured: 1, unverified: 2, live: 3 };
    const worst = (g: (typeof all)[number]) =>
      Math.min(...g.requires.map((d) => rank[deriveState(byId.get(d.id))]));
    return [...all].sort((a, b) => worst(a) - worst(b));
  }, [byId]);

  return (
    <>
      <p className="cx-tabintro">
        Read this one when a page is empty and you need to know why. Every surface lists what it
        needs to work, so "the client says Paid Ads is blank" stops being a hunt.
      </p>
      <div className="cx-list">
        {groups.map((g) => {
          const states = g.requires.map((d) => deriveState(byId.get(d.id)));
          const broken = g.requires.filter((_, i) => needsAttention(states[i]));
          return (
            <div
              key={g.surface.label}
              className={`cx-srow ${broken.length ? "cx-row-attention" : ""}`}
            >
              <div className="cx-rowmain">
                <div className="cx-rowtitle">
                  {g.surface.to ? (
                    <Link to={g.surface.to}>{g.surface.label}</Link>
                  ) : (
                    g.surface.label
                  )}
                  <span className={`cx-aud cx-aud-${g.surface.audience}`}>
                    {g.surface.audience}
                  </span>
                </div>
                <div className="cx-reqs">
                  {g.requires.map((d, i) => (
                    <span key={d.id} className={`cx-req cx-req-${states[i]}`}>
                      <span className="cx-dot" aria-hidden />
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
              {broken.length > 0 && (
                <span className="cx-blame">
                  blocked by {broken.map((d) => d.label).join(", ")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Credentials: the flat A-Z lookup ----------

function CredentialsTab() {
  const [q, setQ] = useState("");
  const entries = useMemo(() => {
    const all = credentialIndex();
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.connectionLabel.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <>
      <p className="cx-tabintro">
        Every credential the app reads, and which system holds it. This is the list that replaces
        checking Doppler, then Cloudflare, then a Supabase row.
      </p>
      <input
        className="cx-search"
        placeholder="Filter by key or integration"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <table className="cx-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Lives in</th>
            <th>Used by</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((c) => (
            <tr key={`${c.connectionId}-${c.name}`}>
              <td>
                <code>{c.name}</code>
                {c.optional && <span className="cx-opt">optional</span>}
              </td>
              <td>
                {CRED_HOME_LABEL[c.home]}
                {c.inDoppler && <span className="cx-doppler">Doppler</span>}
              </td>
              <td>{c.connectionLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <div className="pk-empty">No credential matches that.</div>}
    </>
  );
}

// ---------- Per client ----------

// Column headings for the per-client credentials. The columns themselves are
// derived from the response, so a credential added server-side shows up here
// without an edit; this map only makes the heading readable.
const CLIENT_COL_LABEL: Record<string, string> = {
  ghl: "GoHighLevel",
  "meta-ads": "Meta ad account",
  ga4: "GA4 property",
  "google-places": "Place id",
};

function clientColumnLabel(id: string): string {
  return CLIENT_COL_LABEL[id] ?? CONNECTIONS.find((c) => c.id === id)?.label ?? id;
}

function ClientsTab({
  clients,
  loading,
}: {
  clients: ClientConnectionHealth[];
  loading: boolean;
}) {
  if (loading) return <div className="pk-empty">Probing each client&apos;s token.</div>;
  if (!clients.length) return <div className="pk-empty">No clients found.</div>;

  const columns = Object.keys(clients[0].set);

  return (
    <>
      <p className="cx-tabintro">
        The credentials that differ per client. A blank cell is a client who is not using that
        channel yet, not a fault. Only a red cell needs you.
      </p>
      <table className="cx-table">
        <thead>
          <tr>
            <th>Client</th>
            {columns.map((id) => (
              <th key={id}>{clientColumnLabel(id)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const row = clientRowState(client);
            return (
              <tr key={client.tenantId} className={row.attention ? "cx-tr-attention" : ""}>
                <td>
                  <div className="cx-cname">{client.name}</div>
                  <div className="cx-cslug">{client.slug}</div>
                </td>
                {columns.map((id) => {
                  const state = row.states[id] ?? "unverified";
                  return (
                    <td key={id}>
                      <StatePill state={state} />
                      {id === "ghl" && client.ghlProbe.state !== "skipped" && (
                        <div className="cx-note-sm">{client.ghlProbe.detail}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
