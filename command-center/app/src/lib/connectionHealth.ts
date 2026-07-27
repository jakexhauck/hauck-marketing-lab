// Shared shape and pure logic for the connection control room.
//
// Both sides import this one module: the probe endpoint
// (functions/api/admin/connections/health.ts) produces these types, the admin
// page consumes them, and the status derivation below is the single place that
// decides what colour a row is. Keeping that decision out of the component is
// what makes it testable, and this is logic worth testing: a status page that
// calls a dead credential green is worse than having no status page.

import { CONNECTIONS, type ConnectionDef } from "./connectionRegistry";

export type ProbeState = "ok" | "failed" | "skipped";

export interface CredentialState {
  name: string;
  present: boolean;
  optional: boolean;
}

export interface Probe {
  state: ProbeState;
  detail: string;
}

export interface ConnectionHealth {
  id: string;
  /** Every required credential is present. Says nothing about whether it works. */
  configured: boolean;
  /** Required credentials that are missing, named exactly. */
  missing: string[];
  credentials: CredentialState[];
  probe: Probe;
}

export interface ClientConnectionHealth {
  tenantId: string;
  name: string;
  slug: string;
  /** Per client-scoped connection id: is that client's own credential set. */
  set: Record<string, boolean>;
  ghlProbe: Probe;
}

export interface HealthResponse {
  /** local runs off .dev.vars, which carries only some production secrets. */
  environment: "local" | "production";
  checkedAt: string;
  connections: ConnectionHealth[];
  clients: ClientConnectionHealth[];
}

/**
 * The four honest states. "unverified" exists so a credential we cannot test is
 * never dressed up as working: the whole failure mode this page prevents is a
 * green dot over a dead token.
 */
export type ConnState = "live" | "down" | "unverified" | "unconfigured";

export const CONN_STATE_LABEL: Record<ConnState, string> = {
  live: "Live",
  down: "Down",
  unverified: "Set, not verified",
  unconfigured: "Not set up",
};

export function deriveState(health: ConnectionHealth | undefined): ConnState {
  // No health entry at all means the probe never ran, which is not the same as
  // working. Treat it as unverified rather than inventing a verdict.
  if (!health) return "unverified";
  // A missing required credential outranks the probe: the probe was necessarily
  // skipped or failed for that reason, and the missing name is the actionable part.
  if (!health.configured) return "unconfigured";
  if (health.probe.state === "failed") return "down";
  if (health.probe.state === "ok") return "live";
  return "unverified";
}

/** One line explaining the state, drawn from whichever signal actually decided it. */
export function stateReason(health: ConnectionHealth | undefined): string {
  if (!health) return "Not checked";
  if (!health.configured) return `Missing: ${health.missing.join(", ")}`;
  return health.probe.detail;
}

/** Needs a human: either broken or never set up. Drives the alert and the count. */
export function needsAttention(state: ConnState): boolean {
  return state === "down" || state === "unconfigured";
}

export interface HealthSummary {
  live: number;
  down: number;
  unverified: number;
  unconfigured: number;
  attention: number;
  total: number;
}

export function summarize(
  connections: ConnectionHealth[],
  defs: ConnectionDef[] = CONNECTIONS,
): HealthSummary {
  const byId = new Map(connections.map((c) => [c.id, c]));
  const summary: HealthSummary = {
    live: 0,
    down: 0,
    unverified: 0,
    unconfigured: 0,
    attention: 0,
    total: defs.length,
  };
  for (const def of defs) {
    const state = deriveState(byId.get(def.id));
    summary[state] += 1;
    if (needsAttention(state)) summary.attention += 1;
  }
  return summary;
}

export interface ClientRowState {
  client: ClientConnectionHealth;
  /** Per client-scoped connection: the state of that client's own credential. */
  states: Record<string, ConnState>;
  attention: number;
}

/**
 * Per-client states. A client-scoped credential that is not set reads as
 * "unconfigured" rather than broken: a client with no ad account has nothing
 * wrong with them, they simply are not running ads yet.
 */
export function clientRowState(client: ClientConnectionHealth): ClientRowState {
  const states: Record<string, ConnState> = {};
  for (const [id, isSet] of Object.entries(client.set)) {
    if (!isSet) {
      states[id] = "unconfigured";
      continue;
    }
    // GHL is the only per-client credential we probe live. The rest are ids
    // rather than secrets: present means usable.
    if (id === "ghl") {
      states[id] =
        client.ghlProbe.state === "ok"
          ? "live"
          : client.ghlProbe.state === "failed"
            ? "down"
            : "unverified";
    } else {
      states[id] = "unverified";
    }
  }
  const attention = Object.values(states).filter((s) => s === "down").length;
  return { client, states, attention };
}
