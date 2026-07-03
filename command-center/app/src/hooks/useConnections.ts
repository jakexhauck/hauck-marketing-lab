import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ConnectionStatus } from "../lib/connectionsModel";

// Live connection status for the signed-in client. In a demo session api()
// short-circuits to the demo handler, so the shape is identical either way.
// staleTime is short and refetchOnWindowFocus stays on so the card flips to
// "Connected" the moment the client returns from the provider consent tab.
export function useConnections(enabled: boolean) {
  return useQuery({
    queryKey: ["connections", "status"],
    enabled,
    staleTime: 10_000,
    queryFn: () =>
      api<{ connections: ConnectionStatus[] }>("/api/connections/status"),
  });
}

// Ask our endpoint for the provider's consent URL, then open it in a new tab so
// the app stays put. The client consents on Facebook/Google's own page; on
// return, the status query refetches (window focus) and the card updates.
// Returns an error message on failure for the caller to toast, or null on
// success.
export async function startConnect(id: string): Promise<string | null> {
  const FAIL = "Could not start the connection. Please try again.";
  try {
    const { url } = await api<{ url: string }>(
      `/api/connections/oauth/${id}/start`,
    );
    if (!url) return FAIL;
    window.open(url, "_blank", "noopener,noreferrer");
    return null;
  } catch {
    return FAIL;
  }
}
