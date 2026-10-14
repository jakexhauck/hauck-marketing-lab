import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useChatConfig, useChannels } from "../hooks/useChat";
import { useChatRealtime } from "../hooks/useChatRealtime";

// The signed-in caller as a chat participant. Null until authenticated.
export interface ChatMe {
  kind: "staff" | "admin";
  id: string;
  name: string;
}

interface ChatContextValue {
  // The caller as a chat participant, or null when not authenticated.
  me: ChatMe | null;
  // Live set of presence ids ("kind:id") currently online in the tenant.
  presentIds: Set<string>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { status, currentUser, isAdmin } = useAuth();
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());

  // Mirror the pattern AuthContext uses: both authenticated states count.
  const authed =
    status === "authenticated" || status === "authenticated-offline";

  // Map the signed-in user to a chat participant. Admins are "admin"; everyone
  // else (owner + staff) is "staff". currentUser.id is the account id.
  const me = useMemo<ChatMe | null>(() => {
    if (!authed || !currentUser) return null;
    return {
      kind: isAdmin ? "admin" : "staff",
      id: currentUser.id,
      name: currentUser.name,
    };
  }, [authed, currentUser, isAdmin]);

  // Realtime connect info + the caller's channels (the channels also tell us
  // which tenant to open the presence channel against; all share one tenant).
  const configQuery = useChatConfig(!!me);
  const channelsQuery = useChannels(!!me);
  const config = configQuery.data ?? null;

  // /api/chat/config returns the caller's tenant id (null for admins, who have no
  // tenant presence channel). useChatRealtime skips the presence channel when null.
  const tenantId = config?.tenantId ?? null;
  // channelsQuery is loaded so the channel list is warm before the rail mounts;
  // it has no further use in this provider.
  void channelsQuery;

  const onPresenceChange = useCallback((ids: Set<string>) => {
    setPresentIds(ids);
  }, []);

  useChatRealtime({ config, me, tenantId, onPresenceChange });

  const value = useMemo<ChatContextValue>(
    () => ({ me, presentIds }),
    [me, presentIds],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}
