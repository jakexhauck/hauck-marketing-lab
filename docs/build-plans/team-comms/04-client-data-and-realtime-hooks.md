# Phase 04 - Client Data and Realtime Hooks

**Read `00-INDEX.md` first.** Address Jake as **"Sir"**. **No em dashes.**

## Goal
Build the typed client-side data + realtime layer that Phase 05's UI consumes. After
this phase the app has: chat types on `api.ts`, a full set of TanStack Query hooks for
every `/api/chat/*` endpoint, a lazily-built browser Supabase client with the exact
topic helpers the server uses, a realtime hook that turns notify-only broadcasts and
presence sync into query invalidations + a live presence set, and a `ChatContext` that
exposes the caller's participant identity and the present-id set to the rest of the app.

No content travels over Realtime (notify-then-fetch, per the INDEX architecture): a
"chat" broadcast only tells the client which queries to invalidate, and the data is
re-fetched through `api<T>()`. Polling is therefore unnecessary: these hooks set NO
`refetchInterval` and rely on invalidation from `useChatRealtime`.

## Files
- Modify: `command-center/app/src/lib/api.ts` (add the six chat interfaces)
- Create: `command-center/app/src/hooks/useChat.ts`
- Create: `command-center/app/src/lib/chatClient.ts`
- Create: `command-center/app/src/lib/chatClient.test.ts`
- Create: `command-center/app/src/hooks/useChatRealtime.ts`
- Create: `command-center/app/src/context/ChatContext.tsx`
- Modify: `command-center/app/src/App.tsx` (mount `<ChatProvider>` in the provider stack)

## Work

### 1. Add the client chat types to `api.ts`

Append these to the end of `src/lib/api.ts`. Copy verbatim from the INDEX "Client
types" section; do not rename any field. They sit alongside the existing `ApiLead`,
`AdminClient`, etc. interfaces.

```ts
// ===== Team comms (Phase 04) =====
// A participant is a staff_accounts row (owner included) or an admin_accounts row.
// senderKind / member kinds are always "staff" or "admin"; the id is the matching
// account id. Content is fetched through api<T>(); Realtime only signals "refetch".

export interface ChatRole {
  id: string;
  name: string;
  color: string;
  isPreset: boolean;
  sortOrder: number;
}

export interface ChatMember {
  id: string;
  name: string;
  roles: ChatRole[];
  online: boolean;
  lastSeen: string | null;
  canContactHauck: boolean;
}

export interface ChatChannel {
  id: string;
  kind: "channel" | "dm" | "hauck";
  name: string;
  memberIds: string[];
  unread: number;
  lastMessageAt: string | null;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface ChatMessageDTO {
  id: string;
  channelId: string;
  senderKind: "staff" | "admin";
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: ChatAttachment[];
}

export interface AdminHauckThread {
  channelId: string;
  tenantId: string;
  tenantName: string;
  personName: string;
  unread: number;
  lastMessageAt: string | null;
}
```

### 2. Create `src/lib/chatClient.ts` (browser Supabase client + topic helpers)

This is the first browser-side Supabase client in the repo. It is built lazily from
`GET /api/chat/config` (Phase 02 returns `{ url, anonKey }`) and reused. The topic
helpers MUST produce the exact strings `functions/lib/chatRealtime.ts` uses
(`personTopic` -> `chat:person:${kind}:${id}`, `tenantPresenceTopic` ->
`chat:presence:${tenantId}`); they are duplicated here, not imported, because Functions
and the browser bundle do not share a module.

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface ChatConfig {
  url: string;
  anonKey: string;
  // The caller's tenant id for the presence channel; null for admin sessions.
  tenantId: string | null;
}

// Person topic a browser subscribes to for its own notify-only broadcasts.
// MUST match functions/lib/chatRealtime.ts personTopic() exactly.
export function personTopic(kind: string, id: string): string {
  return `chat:person:${kind}:${id}`;
}

// Tenant-wide presence channel. MUST match functions/lib/chatRealtime.ts
// tenantPresenceTopic() exactly.
export function tenantPresenceTopic(tenantId: string): string {
  return `chat:presence:${tenantId}`;
}

// A presence id is the channel key tracked on the presence channel: "kind:id".
// chatLogic.isOnline() and the roster check membership against this exact shape.
export function presenceId(kind: string, id: string): string {
  return `${kind}:${id}`;
}

// One realtime socket per tab. Built lazily from /api/chat/config the first time
// realtime is needed, then reused. eventsPerSecond is capped low: we only send
// presence + tiny notify broadcasts, never message bodies.
let cached: SupabaseClient | null = null;

export function buildChatClient(cfg: ChatConfig): SupabaseClient {
  if (cached) return cached;
  cached = createClient(cfg.url, cfg.anonKey, {
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return cached;
}

// Test hook: drop the cached client so a fresh config can rebuild it.
export function resetChatClient(): void {
  cached = null;
}
```

### 3. Test the topic helpers (`src/lib/chatClient.test.ts`)

Pure-string helpers, so they get a vitest (per the INDEX testing strategy). Everything
else in this phase is I/O-bound and verified by running the app in Phase 05.

```ts
import { describe, it, expect } from "vitest";
import { personTopic, tenantPresenceTopic, presenceId } from "./chatClient";

describe("personTopic", () => {
  it("formats a staff person topic", () => {
    expect(personTopic("staff", "abc")).toBe("chat:person:staff:abc");
  });
  it("formats an admin person topic", () => {
    expect(personTopic("admin", "jake")).toBe("chat:person:admin:jake");
  });
});

describe("tenantPresenceTopic", () => {
  it("formats the tenant presence topic", () => {
    expect(tenantPresenceTopic("t1")).toBe("chat:presence:t1");
  });
});

describe("presenceId", () => {
  it("joins kind and id with a colon", () => {
    expect(presenceId("staff", "abc")).toBe("staff:abc");
  });
});
```

Run `cd command-center/app && npm run test` -> these pass alongside the Phase 01
`chatLogic` tests.

### 4. Create `src/hooks/useChat.ts` (all chat queries + mutations)

Mirror `src/hooks/useApi.ts` exactly: `useQuery`/`useMutation`/`useQueryClient` from
`@tanstack/react-query`, every call through `api<T>()`, query keys verbatim from the
INDEX. No `refetchInterval` anywhere; `useChatRealtime` drives freshness. `useChatConfig`
uses `staleTime: Infinity` (Realtime connect info never changes within a session).

```ts
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  api,
  type ChatRole,
  type ChatMember,
  type ChatChannel,
  type ChatMessageDTO,
} from "../lib/api";
import type { ChatConfig } from "../lib/chatClient";

// ---- Realtime connect info (url + anon key). Stable for the session. ----
export function useChatConfig(enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "config"],
    enabled,
    staleTime: Infinity,
    queryFn: () => api<ChatConfig>("/api/chat/config"),
  });
}

// ---- Roster: every member with roles, online flag, last seen, hauck gate. ----
export function useRoster(enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "roster"],
    enabled,
    staleTime: 30_000,
    queryFn: () => api<{ members: ChatMember[] }>("/api/chat/roster"),
  });
}

// ---- Cosmetic roles for the tenant. ----
export function useChatRoles(enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "roles"],
    enabled,
    staleTime: 60_000,
    queryFn: () => api<{ roles: ChatRole[] }>("/api/chat/roles"),
  });
}

// ---- Channels the caller belongs to (channels + DMs + hauck). ----
export function useChannels(enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "channels"],
    enabled,
    staleTime: 15_000,
    queryFn: () => api<{ channels: ChatChannel[] }>("/api/chat/channels"),
  });
}

// ---- Messages for one channel. `before` paginates older messages (Phase 05). ----
export function useChannelMessages(channelId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["chat", "channel", channelId, "messages"],
    enabled: enabled && !!channelId,
    staleTime: 0,
    queryFn: () =>
      api<{ messages: ChatMessageDTO[] }>(
        `/api/chat/channels/${channelId}/messages`,
      ),
  });
}

interface SendMessageInput {
  channelId: string;
  body: string;
  attachmentIds?: string[];
}

// ---- Send a message. Invalidate the channel thread + the channel list (preview
// + lastMessageAt). Realtime also nudges the recipients; this covers the sender. ----
export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      api<{ message: ChatMessageDTO }>(
        `/api/chat/channels/${input.channelId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            body: input.body,
            attachmentIds: input.attachmentIds,
          }),
        },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["chat", "channel", vars.channelId, "messages"],
      });
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

// ---- Mark a channel read (clears its unread badge). ----
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { channelId: string }) =>
      api<{ ok: true }>(`/api/chat/channels/${input.channelId}/read`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

interface CreateChannelInput {
  name: string;
  memberIds: string[];
}

// ---- Owner: create a channel with an explicit member list. ----
export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChannelInput) =>
      api<{ channel: ChatChannel }>("/api/chat/channels", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

interface PatchChannelInput {
  channelId: string;
  name?: string;
  archived?: boolean;
  memberIds?: string[];
}

// ---- Owner: rename / archive / re-member a channel. ----
export function usePatchChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchChannelInput) => {
      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.archived !== undefined) body.archived = input.archived;
      if (input.memberIds !== undefined) body.memberIds = input.memberIds;
      return api<{ channel: ChatChannel }>(
        `/api/chat/channels/${input.channelId}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

// ---- Get-or-create a 1:1 DM with another member. ----
export function useOpenDm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { memberId: string }) =>
      api<{ channel: ChatChannel }>("/api/chat/dm", {
        method: "POST",
        body: JSON.stringify({ memberId: input.memberId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

interface EditMessageInput {
  messageId: string;
  channelId: string;
  body: string;
}

// ---- Author edits their own message. channelId is carried for invalidation only. ----
export function useEditMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EditMessageInput) =>
      api<{ message: ChatMessageDTO }>(`/api/chat/messages/${input.messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ body: input.body }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["chat", "channel", vars.channelId, "messages"],
      });
    },
  });
}

interface DeleteMessageInput {
  messageId: string;
  channelId: string;
}

// ---- Soft-delete a message (author, or tenant owner moderation). ----
export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeleteMessageInput) =>
      api<{ ok: true }>(`/api/chat/messages/${input.messageId}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["chat", "channel", vars.channelId, "messages"],
      });
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

interface CreateRoleInput {
  name: string;
  color: string;
}

// ---- Owner: create a cosmetic role. ----
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) =>
      api<{ role: ChatRole }>("/api/chat/roles", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "roles"] });
      qc.invalidateQueries({ queryKey: ["chat", "roster"] });
    },
  });
}

interface PatchRoleInput {
  roleId: string;
  name?: string;
  color?: string;
  sortOrder?: number;
}

// ---- Owner: rename / recolor / reorder a role. ----
export function usePatchRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchRoleInput) => {
      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.color !== undefined) body.color = input.color;
      if (input.sortOrder !== undefined) body.sortOrder = input.sortOrder;
      return api<{ role: ChatRole }>(`/api/chat/roles/${input.roleId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "roles"] });
      qc.invalidateQueries({ queryKey: ["chat", "roster"] });
    },
  });
}

// ---- Owner: delete a role (preset roles are refused server-side). ----
export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { roleId: string }) =>
      api<{ ok: true }>(`/api/chat/roles/${input.roleId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "roles"] });
      qc.invalidateQueries({ queryKey: ["chat", "roster"] });
    },
  });
}
```

### 5. Commit the typed data layer

```bash
git add command-center/app/src/lib/api.ts \
  command-center/app/src/lib/chatClient.ts \
  command-center/app/src/lib/chatClient.test.ts \
  command-center/app/src/hooks/useChat.ts
git commit -m "feat(comms): chat client types, query hooks, browser supabase client"
```

### 6. Create `src/hooks/useChatRealtime.ts` (notify + presence -> invalidation)

This hook is mounted once, inside `ChatProvider`, after `me` and `tenantId` resolve. It
owns two Supabase channels and a presence heartbeat:

1. The caller's **person topic** (`personTopic(me.kind, me.id)`). On a "chat" broadcast
   it reads `msg.payload` (a `ChatRealtimeEvent`: `{ kind, channelId? }`) and invalidates
   only the affected queries. Bodies are never in the payload (notify-then-fetch).
2. The **tenant presence channel** (`tenantPresenceTopic(tenantId)`), keyed by
   `presenceId(me.kind, me.id)`. On `presence` `sync` it rebuilds the live id set from
   `presenceState()` keys and reports it up via `onPresenceChange`. On subscribe it
   `track()`s the caller so others see them online.
3. A **heartbeat**: `POST /api/chat/presence/heartbeat` every 60s so
   `chat_presence.last_seen` stays fresh for "last seen Xm ago" labels on offline members.

All three are torn down in the effect cleanup (channel removal, interval clear). The hook
returns nothing; presence flows out through the `onPresenceChange` callback.

```ts
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
```

### 7. Create `src/context/ChatContext.tsx` (`<ChatProvider>`)

The provider resolves the caller into a chat `me` from `useAuth()`, pulls the Realtime
config, owns the `presentIds` state, and mounts `useChatRealtime`. It exposes
`{ me, presentIds }` and always renders its children (even unauthenticated): when the
session is not authenticated, `me` is null and nothing subscribes.

Identity mapping (per the INDEX participant model):
- `isAdmin` -> `{ kind: "admin", id: currentUser.id, name: currentUser.name }`.
- staff / owner session -> `{ kind: "staff", id: currentUser.id, name: currentUser.name }`.
- `currentUser.id` is the account id in both cases.

`onPresenceChange` is wrapped in `useCallback` so the realtime effect does not re-run on
every render. `tenantId` for the presence channel is not on the client auth context, so
it is derived from the loaded config-gated session: the browser does not know its own
tenant id directly, so we read it off the roster query is overkill; instead Phase 02's
`/api/chat/config` is extended only if needed. For this phase the presence channel keys
on the tenant the server already scopes the socket to: we pass the tenant id surfaced by
the config when present, else null (admins). The config shape stays `{ url, anonKey }`;
if a `tenantId` is needed for presence and is not yet returned, Phase 05 will surface it
through the roster. To keep this phase self-contained, derive `tenantId` from the first
loaded channel (all of a caller's channels share their tenant) and fall back to null.

```tsx
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

  const authed = status === "authenticated";

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
```

Note on `tenantId`: the presence channel needs the caller's tenant id, which the browser
auth context does not carry. Phase 02's `/api/chat/config` returns it (`{ url; anonKey;
tenantId: string | null }`), so type `ChatConfig` in `chatClient.ts` accordingly and read
`config.tenantId` as shown above. Admins get `null` (no tenant presence channel); they
still receive their own notifications via the person topic.

### 8. Mount `<ChatProvider>` in `src/App.tsx`

`ChatProvider` needs `useAuth()` (so it sits inside `AuthProvider`) and the
`QueryClientProvider` that wraps the app (the existing hooks already run under it). Place
it just inside `ToastProvider`, wrapping everything that renders the routes, so any chat
surface mounted later (the right rail in Phase 05, the mobile `/comms` route, the admin
inbox) can call `useChat()`.

Add the import near the other context imports:

```tsx
import { ChatProvider } from "./context/ChatContext";
```

Then wrap the existing inner tree. Change:

```tsx
          <ToastProvider>
            <ServiceWorkerMessages />
            <OfflineBanner />
            <PreviewBanner />
            <ScrollToTop />
            <Routes>
```

to:

```tsx
          <ToastProvider>
            <ChatProvider>
            <ServiceWorkerMessages />
            <OfflineBanner />
            <PreviewBanner />
            <ScrollToTop />
            <Routes>
```

and add the matching close tag before `</ToastProvider>`. Change:

```tsx
            </Routes>
          </ToastProvider>
```

to:

```tsx
            </Routes>
            </ChatProvider>
          </ToastProvider>
```

### 9. Verify the build and commit

```bash
cd command-center/app && npm run test && npx tsc --noEmit
git add command-center/app/src/hooks/useChatRealtime.ts \
  command-center/app/src/context/ChatContext.tsx \
  command-center/app/src/App.tsx
git commit -m "feat(comms): realtime hook, ChatProvider, mount in App"
```

## Tests
- `src/lib/chatClient.test.ts`: `personTopic`, `tenantPresenceTopic`, `presenceId`
  produce the exact strings the server uses. Run with `npm run test` (alongside the
  Phase 01 `chatLogic` tests).
- Everything I/O-bound (the query hooks, the Realtime subscription, presence sync,
  heartbeat, the provider) is verified by running the app in Phase 05: `npm run dev`,
  open two sessions, confirm presence dots flip and a message in one tab invalidates and
  re-fetches in the other. No "should work" claims; show evidence (Spine: Verify).
- `npx tsc --noEmit` passes (no type errors from the new types/hooks/context).

## Definition of done
- The six chat interfaces exist on `src/lib/api.ts`, verbatim from the INDEX.
- `useChat.ts` exports all sixteen hooks (`useChatConfig`, `useRoster`, `useChatRoles`,
  `useChannels`, `useChannelMessages`, `useSendMessage`, `useMarkRead`,
  `useCreateChannel`, `usePatchChannel`, `useOpenDm`, `useEditMessage`,
  `useDeleteMessage`, `useCreateRole`, `usePatchRole`, `useDeleteRole`), each on the
  INDEX query keys, none with a `refetchInterval`.
- `chatClient.ts` builds the browser Supabase client lazily and exposes
  `personTopic` / `tenantPresenceTopic` / `presenceId` matching the Phase 02 server
  values; its tests pass.
- `useChatRealtime.ts` subscribes to the person topic (invalidating affected queries on
  a "chat" broadcast), tracks presence on the tenant channel, posts a 60s heartbeat, and
  cleans up all of it on unmount.
- `ChatContext` exposes `{ me, presentIds }`, maps admins to `kind:"admin"` and
  staff/owner to `kind:"staff"`, renders children with `me=null` (no subscription) when
  unauthenticated, and is mounted inside `AuthProvider` in `App.tsx`.
- `npm run test` and `npx tsc --noEmit` both pass.

## MANUAL ACTIONS - JAKE
None for this phase. (The `SUPABASE_ANON_KEY` Cloudflare env var and Realtime-enabled
confirmation are already covered by the INDEX rollout list, item 2, and are exercised
end-to-end when Phase 05 runs the app.)
