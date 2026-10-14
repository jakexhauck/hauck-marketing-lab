import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { demoMode } from "../demo/demoMode";
import { buildChatWidget, CHAT_LEADS } from "../lib/chatWidget";
import type { InboxDataset } from "../lib/leadInbox";

// The Chat Widget surface reads its data through this hook so the page stays
// source-agnostic. Demo/preview returns the hand-authored inbox instantly; a
// real session fetches the live Organic-pipeline submissions (source =
// "chat widget") from GET /api/forms/submissions?source=chat-widget.
export function useChatWidget(): InboxDataset {
  const demo = demoMode();
  const { data } = useQuery({
    queryKey: ["forms", "chat-widget"],
    enabled: !demo,
    staleTime: 30_000,
    queryFn: () =>
      api<{ submissions: unknown[] }>("/api/forms/submissions?source=chat-widget"),
  });
  const raw = demo ? CHAT_LEADS : data?.submissions;
  return useMemo(() => buildChatWidget(demo, raw), [demo, raw]);
}
