import type { DemoRoute } from "./index";

// Demo Connections status: everything already connected, so the hub shows its
// all-set state in a preview. Matches only the status path; the OAuth-start path
// is never called in demo (the hub short-circuits connect to a toast).
export const route: DemoRoute = {
  match: (clean) => clean === "/api/connections/status",
  respond: () => ({
    connections: [
      { id: "facebook", state: "connected" },
      { id: "instagram", state: "connected" },
      { id: "google", state: "connected" },
    ],
  }),
};
