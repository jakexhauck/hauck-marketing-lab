import { useCallback, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "./useApi";
import {
  buildUnreadIndex,
  leadUnreadCount,
  type SeenMap,
} from "../lib/leadChat";

const SEEN_KEY = "lead-chat-seen-v1";

function loadSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

// Unread badge state for lead cards. Joins the conversations feed (per-contact
// unread + lastMessageAt) to a locally-persisted "seen" map so opening a chat
// clears the badge immediately and it only re-lights on a newer inbound. Purely
// client-side: no read-state is written back to the messaging backend.
export function useLeadUnread() {
  const { session } = useAuth();
  const { data } = useConversationsQuery(Boolean(session));
  const [seen, setSeen] = useState<SeenMap>(loadSeen);

  const index = useMemo(
    () => buildUnreadIndex(data?.conversations ?? []),
    [data?.conversations],
  );

  const unreadFor = useCallback(
    (contactId: string | null | undefined) =>
      leadUnreadCount(index, contactId, seen),
    [index, seen],
  );

  const markSeen = useCallback(
    (contactId: string | null | undefined) => {
      if (!contactId) return;
      const info = index.get(contactId);
      if (!info) return;
      setSeen((prev) => {
        if (prev[contactId] === info.lastMessageAt) return prev;
        const next = { ...prev, [contactId]: info.lastMessageAt };
        try {
          localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage failures; badge simply falls back to feed state.
        }
        return next;
      });
    },
    [index],
  );

  return { unreadFor, markSeen };
}
