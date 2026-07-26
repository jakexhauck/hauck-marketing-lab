// Turns raw health into a work list.
//
// The control room's first job is not to inventory the estate, it is to answer
// "what needs to happen". That means one ordered list of jobs on the left and a
// quiet reassurance column on the right, and it means every item has to carry
// its own consequence: "Meta Ads is not connected" is a fact, "Paid Ads goes
// blank without it" is the reason to care. The consequence is generated from
// the registry's surface edges, so it can never drift from reality.
//
// Pure on purpose. The page renders what this returns and decides nothing.

import { CONNECTIONS, type ConnectionDef } from "./connectionRegistry";
import {
  deriveState,
  clientRowState,
  type ConnectionHealth,
  type ClientConnectionHealth,
} from "./connectionHealth";
import type { AgencySecretRow } from "./secretsApi";

export type Severity = "client-down" | "down" | "drift" | "setup";

/** Lower sorts first. A live client being down outranks everything. */
const SEVERITY_RANK: Record<Severity, number> = {
  "client-down": 0,
  down: 1,
  drift: 2,
  setup: 3,
};

export interface ActionItem {
  id: string;
  severity: Severity;
  /** What is wrong, in plain words. */
  title: string;
  /** What it costs us, drawn from the registry's surface edges. */
  why: string;
  /** The button label. Says the job, not "view". */
  actionLabel: string;
  /** Which detail panel the button opens. */
  target: "secrets-client" | "secrets-agency" | "connection" | "redeploy";
  connectionId?: string;
  tenantId?: string;
  credentialName?: string;
}

export interface CalmItem {
  id: string;
  label: string;
  detail: string;
}

export interface ActionBoard {
  needs: ActionItem[];
  working: CalmItem[];
  /** Present but untestable from here. Kept apart so it is never called working. */
  unverified: CalmItem[];
}

/**
 * The consequence line. Client-facing surfaces lead because those are the ones a
 * client phones about; admin-only ones are named only when nothing else applies.
 */
export function consequenceOf(def: ConnectionDef): string {
  const client = def.surfaces.filter((s) => s.audience === "client");
  const source = client.length ? client : def.surfaces;

  // Collapse to the parent page. Three tabs of one page is still one page going
  // dark, and "Paid Ads > Lead Tracker, Paid Ads > Meta Data, Paid Ads > Media"
  // is three times the words for none of the meaning.
  const pages: string[] = [];
  for (const s of source) {
    const page = s.label.split(">")[0].trim();
    if (!pages.includes(page)) pages.push(page);
  }
  if (!pages.length) return "Nothing else depends on it.";

  const pick = pages.slice(0, 3);
  const rest = pages.length - pick.length;
  const tail = rest > 0 ? ` and ${rest} more` : "";
  const verb = pick.length === 1 && rest === 0 ? "goes" : "go";
  return `${pick.join(", ")}${tail} ${verb} dark.`;
}

export function buildActionBoard(input: {
  connections: ConnectionHealth[];
  clients: ClientConnectionHealth[];
  agencySecrets?: AgencySecretRow[];
  defs?: ConnectionDef[];
}): ActionBoard {
  const defs = input.defs ?? CONNECTIONS;
  const byId = new Map(input.connections.map((c) => [c.id, c]));

  const needs: ActionItem[] = [];
  const working: CalmItem[] = [];
  const unverified: CalmItem[] = [];

  for (const def of defs) {
    const health = byId.get(def.id);
    const state = deriveState(health);

    if (state === "live") {
      working.push({ id: def.id, label: def.label, detail: health?.probe.detail ?? "" });
      continue;
    }
    if (state === "unverified") {
      unverified.push({
        id: def.id,
        label: def.label,
        detail: health?.probe.detail ?? "Not checked",
      });
      continue;
    }

    const broken = state === "down";
    const missing = health?.missing ?? [];
    needs.push({
      id: `conn:${def.id}`,
      severity: broken ? "down" : "setup",
      title: broken ? `${def.label} stopped working` : `${def.label} is not set up`,
      why: consequenceOf(def),
      // An integration whose credential simply is not there is a paste job.
      // One that is there and being rejected needs a look, not a form.
      actionLabel: broken ? "See how to fix" : "Add credential",
      target: broken ? "connection" : "secrets-agency",
      connectionId: def.id,
      credentialName: missing[0],
    });
  }

  // A live client's own token being rejected is the worst thing on this page:
  // their whole app is down and only they notice.
  for (const client of input.clients) {
    const row = clientRowState(client);
    if (row.states.ghl === "down") {
      needs.push({
        id: `client:${client.tenantId}`,
        severity: "client-down",
        title: `${client.name}'s connection was rejected`,
        why: `Their inbox, contacts, jobs and pipeline are all dark. ${client.ghlProbe.detail}`,
        actionLabel: "Replace token",
        target: "secrets-client",
        tenantId: client.tenantId,
      });
    }
  }

  // Doppler holds a newer value than the running deploy. Silent until someone
  // looks, which is exactly why it belongs in the work list.
  for (const row of input.agencySecrets ?? []) {
    if (row.drift !== true) continue;
    needs.push({
      id: `drift:${row.name}`,
      severity: "drift",
      title: `${row.name} changed in Doppler`,
      why: `The running app still has the old value. Affects ${row.usedBy.join(", ") || "nothing"}.`,
      actionLabel: "How to apply it",
      target: "redeploy",
      credentialName: row.name,
    });
  }

  needs.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return { needs, working, unverified };
}
