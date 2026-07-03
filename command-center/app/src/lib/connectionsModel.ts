// The Connections catalog and pure status helpers for the client hub. Kept free
// of React so it can be unit-tested. Client copy is white-label: it names the
// providers (Facebook, Instagram, Google) but never the backend that brokers
// the connection.

export type ConnState = "connected" | "action_needed" | "unknown";

export type ConnectionId = "facebook" | "instagram" | "google";

export interface ConnectionMeta {
  id: ConnectionId;
  label: string;
  // Plain-English "what connecting this unlocks", shown under the label.
  unlocks: string;
  // Brand glyph + background for the card icon, reused from the social palette.
  glyph: string;
  bg: string;
}

export const CONNECTIONS: ConnectionMeta[] = [
  {
    id: "facebook",
    label: "Facebook",
    unlocks: "Post to your page and capture leads from your ads.",
    glyph: "f",
    bg: "#1877f2",
  },
  {
    id: "instagram",
    label: "Instagram",
    unlocks: "Schedule and publish your Instagram posts.",
    glyph: "IG",
    bg: "linear-gradient(135deg,#feda75,#d62976,#962fbf)",
  },
  {
    id: "google",
    label: "Google Business Profile",
    unlocks: "Collect reviews and post updates to Google.",
    glyph: "G",
    bg: "#1a73e8",
  },
];

export interface ConnectionStatus {
  id: ConnectionId;
  state: ConnState;
}

// Merge the live status list onto the catalog, defaulting any platform the
// status endpoint did not return to "unknown".
export function mergeStatus(
  statuses: ConnectionStatus[] | undefined,
): Record<ConnectionId, ConnState> {
  const byId = new Map((statuses ?? []).map((s) => [s.id, s.state]));
  return {
    facebook: byId.get("facebook") ?? "unknown",
    instagram: byId.get("instagram") ?? "unknown",
    google: byId.get("google") ?? "unknown",
  };
}

export function allConnected(m: Record<ConnectionId, ConnState>): boolean {
  return CONNECTIONS.every((c) => m[c.id] === "connected");
}
