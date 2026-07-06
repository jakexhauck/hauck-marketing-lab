// command-center/app/src/hooks/useIncomingCall.ts
import { useMemo, useState } from "react";
import { useNotificationsQuery } from "./useApi";
import type { ApiNotification } from "../lib/api";

export interface IncomingCall {
  contactId: string;
  phone: string;
  name?: string;
  at: string;
  key: string;
}

// Only pop for calls that arrived in the last few minutes, so a stale row in
// the notifications feed does not re-open the console on a fresh page load.
const FRESH_MS = 5 * 60 * 1000;

// Surface the freshest inbound call from the notifications feed the webhook
// writes (action "call_inbound"). Deduped by row id via a local dismiss so a
// dismissed call does not re-pop while the tab stays open; the feed is polled
// by TanStack Query and nudged by the push service worker.
export function useIncomingCall() {
  const q = useNotificationsQuery(true);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const call = useMemo<IncomingCall | null>(() => {
    const items = (q.data?.notifications ?? []) as ApiNotification[];
    const now = Date.now();
    const hit = items.find(
      (n) =>
        n.action === "call_inbound" &&
        now - new Date(n.created_at).getTime() < FRESH_MS,
    );
    if (!hit) return null;
    const key = String(hit.id);
    if (key === dismissed) return null;
    const raw = (hit.payload?.raw ?? {}) as {
      contactId?: string;
      phone?: string;
      firstName?: string;
      lastName?: string;
    };
    const name = [raw.firstName, raw.lastName].filter(Boolean).join(" ").trim();
    return {
      contactId: hit.payload?.contact_id ?? raw.contactId ?? "",
      phone: raw.phone ?? "",
      name: name || undefined,
      at: hit.created_at,
      key,
    };
  }, [q.data, dismissed]);

  const dismiss = () => {
    if (call) setDismissed(call.key);
  };

  return { call, dismiss };
}
