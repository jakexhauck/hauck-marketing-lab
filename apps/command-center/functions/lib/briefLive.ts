import type { AnswerGroup } from "../../src/lib/briefClientSeed";
import type { BriefLive, BriefLiveGhl, BriefLiveLink } from "../../src/lib/agentWire";
import type { DriveImage } from "./clientDriveImages";
import type { MirrorValue } from "./customValuesMirror";

// The Mission Control brief's live parts (docs/build-plans/mission-control-brief.md):
// Client Information (links, onboarding answers, Drive images) and the GHL
// page (custom values, pipelines, calendars, workflows), read fresh on every
// open so they are never out of date. Each part is its own read: a client with
// no GHL or no Drive folder still gets the rest. The reads are injected, so the
// shaping and the failure handling are testable without GHL or Composio.

type Row = Record<string, unknown>;

export interface BriefLiveDeps {
  answers(): Promise<{ groups: AnswerGroup[]; website: string | null }>;
  tenant(): Promise<{ metaAdAccountId: string | null; ghlLocationId: string | null }>;
  folder(): Promise<{ folderId: string; url: string } | null>;
  images(folderId: string): Promise<DriveImage[]>;
  ghl(): Promise<{ values: MirrorValue[]; pipelines: unknown; calendars: unknown; workflows: unknown }>;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown, key: string): Row[] => {
  const arr = Array.isArray(v) ? v : v && typeof v === "object" ? (v as Row)[key] : null;
  return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === "object") as Row[]) : [];
};

/** GHL's workflows list as name and status, drafts included. */
export function shapeWorkflows(raw: unknown): BriefLiveGhl["workflows"] {
  return list(raw, "workflows")
    .filter((w) => str(w.name))
    .map((w) => ({ name: str(w.name), status: str(w.status) || "draft" }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Pipelines with their stages in GHL's own order. */
export function shapePipelines(raw: unknown): BriefLiveGhl["pipelines"] {
  return list(raw, "pipelines")
    .filter((p) => str(p.name))
    .map((p) => ({
      name: str(p.name),
      stages: list(p.stages, "stages")
        .slice()
        .sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0))
        .map((s) => str(s.name))
        .filter(Boolean),
    }));
}

export function shapeCalendars(raw: unknown): BriefLiveGhl["calendars"] {
  return list(raw, "calendars")
    .filter((c) => str(c.name))
    .map((c) => ({ name: str(c.name), active: c.isActive !== false }));
}

export function ghlLocationUrl(locationId: string): string {
  return `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/dashboard`;
}

export function adsManagerUrl(accountId: string): string {
  const id = accountId.trim().replace(/^act_/, "");
  return `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(id)}`;
}

const OPEN_LEAD = /open\s*lead/i;
const reason = (r: PromiseSettledResult<unknown>): string | null =>
  r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null;

export async function buildBriefLive(d: BriefLiveDeps): Promise<BriefLive> {
  const [answers, tenant, folder, ghl] = await Promise.allSettled([d.answers(), d.tenant(), d.folder(), d.ghl()]);
  const a = answers.status === "fulfilled" ? answers.value : { groups: [], website: null };
  const t = tenant.status === "fulfilled" ? tenant.value : { metaAdAccountId: null, ghlLocationId: null };
  const f = folder.status === "fulfilled" ? folder.value : null;
  const g = ghl.status === "fulfilled" ? ghl.value : null;

  let assets: BriefLive["assets"] = null;
  let assetsError = reason(folder);
  if (f) {
    try {
      assets = (await d.images(f.folderId)).map((i) => ({ name: i.name, url: `https://drive.google.com/file/d/${encodeURIComponent(i.id)}/view`, thumbUrl: i.thumbnailLink, folder: i.folder }));
    } catch (err) {
      assetsError = (err as Error).message;
    }
  }

  const openLead = g?.values.find((v) => OPEN_LEAD.test(v.name))?.value || null;
  const links: BriefLiveLink[] = [
    { id: "drive", label: "Drive folder", url: f?.url ?? null },
    { id: "ads", label: "Ads Manager", url: t.metaAdAccountId ? adsManagerUrl(t.metaAdAccountId) : null },
    { id: "ghl", label: "Sub-account", url: t.ghlLocationId ? ghlLocationUrl(t.ghlLocationId) : null },
    { id: "website", label: "Website", url: a.website },
    { id: "outcome", label: "Outcome link", url: openLead },
  ];

  return {
    links,
    answers: a.groups,
    answersError: reason(answers),
    assets,
    assetsError,
    ghl: g
      ? {
          customValues: g.values.map((v) => ({ name: v.name, key: v.merge, value: v.value })),
          pipelines: shapePipelines(g.pipelines),
          calendars: shapeCalendars(g.calendars),
          workflows: shapeWorkflows(g.workflows),
        }
      : null,
    ghlError: reason(ghl),
  };
}
