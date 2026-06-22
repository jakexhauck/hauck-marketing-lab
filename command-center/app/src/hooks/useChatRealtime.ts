import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  buildChatClient,
  personTopic,
  tenantPresenceTopic,
  type ChatConfig,
} from "../lib/chatClient";

// Notify-only payload broadcast to a person topic. Mirrors the server
// ChatRealtimeEvent in functions/lib/chatRealtime.ts. Never carries content.
interface ChatRealtimeEvent {
  kind: "message" | "read" | "channel" | "presence_dirty";
  channelId?: string;
}

interface Me {
  kind: "staff" | "admin";
  id: string;
  name: string;
}

interface UseChatRealtimeArgs {
  config: ChatConfig | null;
  me: Me | null;
  tenantId: string | null;
  // Called whenever the live presence set changes (set of "kind:id" strings).
  onPresenceChange: (presentIds: Set<string>) => void;
}

const HEARTBEAT_MS = 60_000;

export function useChatRealtime({
  config,
  me,
  tenantId,
  onPresenceChange,
}: UseChatRealtimeArgs): void {
  const qc = useQueryClient();

  useEffect(() => {
    // Nothing to subscribe to until we have connect info and an identity.
    if (!config || !me) return;

    const supa = buildChatClient(config);

    // ---- 1. Person topic: notify-only broadcasts -> targeted invalidation. ----
    const personCh = supa.channel(personTopic(me.kind, me.id));
    personCh
      .on("broadcast", { event: "chat" }, (msg) => {
        const payload = msg.payload as ChatRealtimeEvent | undefined;
        if (!payload) return;
        if (payload.kind === "message" && payload.channelId) {
          qc.invalidateQueries({
            queryKey: ["chat", "channel", payload.channelId, "messages"],
          });
          qc.invalidateQueries({ queryKey: ["chat", "channels"] });
        } else if (payload.kind === "read") {
          qc.invalidateQueries({ queryKey: ["chat", "channels"] });
        } else if (payload.kind === "channel") {
          qc.invalidateQueries({ queryKey: ["chat", "channels"] });
        } else if (payload.kind === "presence_dirty") {
          qc.invalidateQueries({ queryKey: ["chat", "roster"] });
        }
      })
      .subscribe();

    // ---- 2. Tenant presence channel: track self, maintain the live id set. ----
    // Only meaningful for a tenant-scoped person; admins (Jake) have no tenant
    // presence channel, so skip presence when tenantId is null.
    let presenceCh: ReturnType<typeof supa.channel> | null = null;
    if (tenantId) {
      const key = `${me.kind}:${me.id}`;
      presenceCh = supa.channel(tenantPresenceTopic(tenantId), {
        config: { presence: { key } },
      });
      const emit = () => {
        const state = presenceCh!.presenceState();
        onPresenceChange(new Set(Object.keys(state)));
      };
      presenceCh
        .on("presence", { event: "sync" }, emit)
        .on("presence", { event: "join" }, emit)
        .on("presence", { event: "leave" }, emit)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await presenceCh!.track({ name: me.name });
          }
        });
    }

    // ---- 3. Heartbeat so chat_presence.last_seen stays fresh. ----
    const beat = () => {
      void api<{ ok: true }>("/api/chat/presence/heartbeat", {
        method: "POST",
      }).catch(() => {
        // Best-effort: a missed heartbeat only delays a "last seen" label.
      });
    };
    beat();
    const heartbeat = window.setInterval(beat, HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      void supa.removeChannel(personCh);
      if (presenceCh) void supa.removeChannel(presenceCh);
      // A torn-down presence channel means we are no longer online anywhere.
      onPresenceChange(new Set());
    };
  }, [config, me, tenantId, qc, onPresenceChange]);
}
