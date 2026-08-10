import { useMemo, useState } from "react";
import { cn } from "../../../../lib/cn";
import { SectionLabel } from "../paidads/adBuilderShared";
import {
  useCrmConnectionAction,
  useCrmConnectionQuery,
  type CrmEventRow,
  type CrmStage,
} from "../../../../hooks/useApi";

// Fulfillment > GHL > Connection.
//
// The reporting wiring for one client, as a screen you can look at instead of a
// thing you hope is true.
//
// The shape of the problem: GoHighLevel's API cannot create workflows. There is
// no POST /workflows, so no button here can go and build the automations. What
// replaces them is a private Marketplace app, installed once across every
// sub-account, streaming native events to /api/crm/app-webhook. This screen is
// how you confirm that is actually happening for THIS client, and how you cut
// them over without their phone buzzing twice for one lead.

const DAY = 86_400_000;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// green: seen in the last day. amber: seen, but not recently. red: never.
function health(lastSeen: string | null): "live" | "quiet" | "silent" {
  if (!lastSeen) return "silent";
  return Date.now() - Date.parse(lastSeen) < DAY ? "live" : "quiet";
}

function Dot({ state }: { state: "live" | "quiet" | "silent" }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        state === "live" && "bg-success",
        state === "quiet" && "bg-warning",
        state === "silent" && "bg-border",
      )}
    />
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="shrink-0 rounded-lg border border-border bg-surface p-5">
      {children}
    </section>
  );
}

export default function ConnectionPanel({
  tenantId,
  clientName,
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
}) {
  const { data, isLoading, error } = useCrmConnectionQuery(tenantId);
  const act = useCrmConnectionAction(tenantId);

  // Unsaved stage overrides, keyed "<pipelineId>:<stageId>". Held locally so a
  // whole pipeline can be corrected in one save rather than a request per
  // dropdown.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [provisioned, setProvisioned] = useState<
    { kind: string; name: string; outcome: string }[] | null
  >(null);

  const appLive = useMemo(
    () => (data?.events ?? []).some((e) => e.app && health(e.app.last_seen_at) !== "silent"),
    [data],
  );

  if (isLoading) return <div className="pk-empty">Loading.</div>;
  if (error || !data) {
    return <div className="pk-empty">{(error as Error)?.message ?? "Unavailable."}</div>;
  }

  const { install, stages, source } = data;

  const saveStages = () => {
    const entries = Object.entries(draft).map(([key, lead_status]) => {
      const [pipeline_id, stage_id] = key.split(":");
      const pipeline = stages.pipelines.find((p) => p.id === pipeline_id);
      const stage = pipeline?.stages.find((s) => s.id === stage_id);
      return {
        pipeline_id,
        stage_id,
        pipeline_name: pipeline?.name ?? null,
        stage_name: stage?.name ?? null,
        // "" clears the override and puts the stage back on name matching.
        lead_status,
      };
    });
    act.mutate({ action: "stage-map", entries }, { onSuccess: () => setDraft({}) });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Install ------------------------------------------------------ */}
      <Card>
        <SectionLabel>Install</SectionLabel>
        {!install.configured ? (
          <p className="text-[13px] text-faint">
            GHL_APP_CLIENT_ID and GHL_APP_CLIENT_SECRET are not set.
          </p>
        ) : install.agencyInstalled ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
            <span className="flex items-center gap-2">
              <Dot state={install.revokedAt ? "silent" : "live"} />
              <span className="text-text">
                {install.revokedAt ? "Uninstalled" : "Installed"}
              </span>
            </span>
            <span className="font-data text-[12px] text-faint">
              agency {install.companyId}
            </span>
            <span className="font-data text-[12px] text-faint">
              location {data.locationId || "not set"}
            </span>
            <span className="text-[12px] text-faint">{ago(install.installedAt)}</span>
          </div>
        ) : (
          <a
            href={install.url ?? "#"}
            className="inline-flex rounded-[var(--radius)] bg-brand px-4 py-2 text-[13px] font-semibold text-brand-fg transition-opacity hover:opacity-90"
          >
            Install on the agency
          </a>
        )}
      </Card>

      {/* 2. Events ------------------------------------------------------- */}
      <Card>
        <SectionLabel>Events</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                <th className="pb-2 font-semibold">Event</th>
                <th className="pb-2 font-semibold">App</th>
                <th className="pb-2 font-semibold">Workflow</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e: CrmEventRow) => (
                <tr key={e.type} className="border-t border-border">
                  <td className="py-1.5 pr-4">
                    <span className="text-faint">{e.group}</span>{" "}
                    <span className="text-text">
                      {e.type.replace(e.group, "") || e.type}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4">
                    <span className="flex items-center gap-2">
                      <Dot state={health(e.app?.last_seen_at ?? null)} />
                      <span className="text-faint">
                        {e.app ? `${ago(e.app.last_seen_at)} · ${e.app.total}` : "never"}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5">
                    <span className="flex items-center gap-2">
                      <Dot state={health(e.workflow?.last_seen_at ?? null)} />
                      <span className="text-faint">
                        {e.workflow
                          ? `${ago(e.workflow.last_seen_at)} · ${e.workflow.total}`
                          : "never"}
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
              {data.extras.map((x) => (
                <tr key={`${x.event_type}:${x.source}`} className="border-t border-border">
                  <td className="py-1.5 pr-4 text-text">{x.event_type}</td>
                  <td className="py-1.5 pr-4 text-faint" colSpan={2}>
                    {x.source} · {ago(x.last_seen_at)} · {x.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 3. Stages ------------------------------------------------------- */}
      <Card>
        <div className="flex items-baseline justify-between">
          <SectionLabel>Stages</SectionLabel>
          {Object.keys(draft).length > 0 ? (
            <button
              type="button"
              onClick={saveStages}
              disabled={act.isPending}
              className="rounded-[var(--radius)] bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Save {Object.keys(draft).length}
            </button>
          ) : null}
        </div>

        {stages.error ? (
          <p className="text-[13px] text-faint">{stages.error}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {stages.pipelines.map((p) => (
              <div key={p.id}>
                <p className="mb-1 text-[12px] font-semibold text-muted">{p.name}</p>
                <div className="flex flex-col gap-1">
                  {p.stages.map((s: CrmStage) => {
                    const key = `${p.id}:${s.id}`;
                    const current = draft[key] ?? s.override ?? "";
                    return (
                      <div key={s.id} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                          {s.name}
                        </span>
                        <span className="w-40 shrink-0 text-right font-data text-[11.5px] text-faint">
                          {s.derived}
                        </span>
                        <select
                          value={current}
                          onChange={(ev) =>
                            setDraft((d) => ({ ...d, [key]: ev.target.value }))
                          }
                          className="w-44 shrink-0 rounded-[var(--radius)] border border-border bg-surface px-2 py-1 text-[12.5px] text-text focus:border-brand focus:outline-none"
                        >
                          <option value="">by name</option>
                          {data.statusModel.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 4. Provision ---------------------------------------------------- */}
      <Card>
        <div className="flex items-baseline justify-between">
          <SectionLabel>Provision</SectionLabel>
          <button
            type="button"
            disabled={act.isPending}
            onClick={() =>
              act.mutate(
                { action: "provision" },
                {
                  onSuccess: (res) =>
                    setProvisioned(
                      (res.items ?? []) as { kind: string; name: string; outcome: string }[],
                    ),
                },
              )
            }
            className="rounded-[var(--radius)] border border-border bg-surface px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand disabled:opacity-60"
          >
            Run
          </button>
        </div>
        {provisioned ? (
          <ul className="flex flex-col gap-1">
            {provisioned.map((i) => (
              <li key={`${i.kind}:${i.name}`} className="flex items-center gap-3 text-[13px]">
                <span className="flex-1 truncate text-text">{i.name}</span>
                <span
                  className={cn(
                    "font-data text-[11.5px]",
                    i.outcome.startsWith("failed") ? "text-danger" : "text-faint",
                  )}
                >
                  {i.outcome}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* 5. Statuses (the workflows that stay yours) --------------------- */}
      <Card>
        <SectionLabel>Statuses received</SectionLabel>
        {data.statuses.length === 0 ? (
          <p className="text-[13px] text-faint">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.statuses.map((s) => (
              <li key={s.summary} className="flex items-center gap-3 text-[13px]">
                <Dot state={health(s.lastSeenAt)} />
                <span className="flex-1 truncate text-text">{s.summary}</span>
                <span className="font-data text-[11.5px] text-faint">
                  {ago(s.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 6. Cutover ------------------------------------------------------ */}
      <Card>
        <SectionLabel>Source</SectionLabel>
        <div className="flex flex-wrap items-center gap-3">
          {(["workflow", "app"] as const).map((value) => (
            <button
              key={value}
              type="button"
              // Cutting over before the app has delivered anything for this
              // client silences the working source and replaces it with one
              // that has never been seen to fire.
              disabled={act.isPending || (value === "app" && !appLive)}
              onClick={() => act.mutate({ action: "source", value })}
              className={cn(
                "rounded-[var(--radius)] border px-4 py-2 text-[13px] font-semibold transition-colors",
                source === value
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-border bg-surface text-text hover:border-brand",
                value === "app" && !appLive && "cursor-not-allowed opacity-50",
              )}
            >
              {value}
            </button>
          ))}
          <span className="text-[12px] text-faint">{clientName}</span>
        </div>
      </Card>
    </div>
  );
}
