import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { buildChatWidget } from "../lib/chatWidget";
import type { InboxDataset } from "../lib/leadInbox";

// The Chat Widget surface reads its data through this hook so the page stays
// source-agnostic. Today it returns a hand-authored demo inbox in demo/preview
// mode and an empty set in a real session (no GoHighLevel chat feed yet). When
// the live source lands, swap the body for a query (e.g. `useQuery(["chat-
// widget"], () => api("/api/forms/submissions?source=chat-widget"))`) and keep
// the return shape: nothing downstream changes.
export function useChatWidget(): InboxDataset {
  const demo = demoMode();
  return useMemo(() => buildChatWidget(demo), [demo]);
}
