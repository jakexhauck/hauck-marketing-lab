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
  type AdminHauckThread,
  type AttachmentUpload,
} from "../lib/api";
import type { ChatConfig } from "../lib/chatClient";
import { validateAttachment } from "../lib/chatLogic";

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

// ---- Get-or-create the Hauck DM channel (Phase 07). No-op-safe before the
// endpoint is live: the mutation rejects and the caller surfaces the error. ----
export function useOpenHauck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ channel: ChatChannel }>("/api/chat/hauck", {
        method: "GET",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "channels"] });
    },
  });
}

// ---- Admin: the Hauck inbox (all threads across all tenants). ----
export function useAdminThreads() {
  return useQuery({
    queryKey: ["admin", "messages"],
    queryFn: () =>
      api<{ threads: AdminHauckThread[] }>("/api/admin/messages").then((r) => r.threads),
  });
}

// ---- Admin: messages for one Hauck thread. Opening marks it read server-side. ----
export function useAdminThreadMessages(channelId: string | null) {
  return useQuery({
    queryKey: ["admin", "message", channelId],
    enabled: Boolean(channelId),
    queryFn: () =>
      api<{ messages: ChatMessageDTO[] }>(
        `/api/admin/messages/${channelId}/messages`,
      ).then((r) => r.messages),
  });
}

// ---- Admin: send a reply into a Hauck thread. ----
export function useAdminSendMessage(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<{ message: ChatMessageDTO }>(`/api/admin/messages/${channelId}/send`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }).then((r) => r.message),
    onSuccess: () => {
      // Refresh the open thread and the inbox row order/unread count.
      void qc.invalidateQueries({ queryKey: ["admin", "message", channelId] });
      void qc.invalidateQueries({ queryKey: ["admin", "messages"] });
    },
  });
}

// ---- Register an attachment, then PUT the bytes to the pre-signed Storage URL.
// Returns the attachmentId to attach to the outgoing message. Validates client
// side first (same rule the server re-checks) so we fail fast before the round trip. ----
export function useUploadAttachment() {
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const check = validateAttachment(file.type, file.size);
      if (!check.ok) {
        throw new Error(
          check.reason === "too_large"
            ? "File is over the 25MB limit"
            : "That file type is not supported",
        );
      }
      const reg = await api<AttachmentUpload>("/api/chat/attachments", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      // Supabase signed upload URL accepts a direct PUT of the raw bytes.
      const put = await fetch(reg.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!put.ok) {
        throw new Error(`Upload failed (${put.status})`);
      }
      return reg.attachmentId;
    },
  });
}

// ---- Resolve a signed download URL for one attachment. Cached just under the 5min
// server lifetime so the img / link does not expire mid-view; refetched after. ----
export function useAttachmentUrl(attachmentId: string | null) {
  return useQuery({
    queryKey: ["chat", "attachment", attachmentId],
    enabled: Boolean(attachmentId),
    staleTime: 4 * 60 * 1000,
    queryFn: () =>
      api<{ url: string }>(`/api/chat/attachments/${attachmentId}`),
  });
}
